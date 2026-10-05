// Movimientos y cuentas del banco de cada empresa: banco:<empresa> (id → movimiento) y bancos:<empresa> (id → cuenta).
// El saldo real (la suma de las cuentas) se guarda en saldo:<empresa>, de donde parte la previsión de tesorería.
import { clave, guardar, leer, leerUno, redis } from './redis.js';
import { deEnableBanking, saldoDeEnableBanking, saldoTotal } from './banco.js';
import { movimientos as movimientosEB, saldos } from './enableBanking.js';
import { puede } from './permisos.js';
import { subirFactura } from './drive.js';
import { hoy } from './formato.js';

const SEIS_HORAS = 6 * 3600e3;

// Guarda los que no estaban (los repetidos se dejan como están, con su emparejamiento).
export async function guardarMovimientos(u, lista) {
  const ya = new Set(Object.keys((await redis.hgetall(clave(u, 'banco'))) || {}));
  const nuevos = lista.filter((m) => !ya.has(m.id)).map((m) => ({ ...m, estado: 'pendiente' }));
  for (let i = 0; i < nuevos.length; i += 200) await redis.hset(clave(u, 'banco'), Object.fromEntries(nuevos.slice(i, i + 200).map((m) => [m.id, m])));
  return { nuevos: nuevos.length, repetidos: lista.length - nuevos.length };
}

export async function actualizarSaldo(u) {
  const s = saldoTotal((await leer(u, 'bancos')) || []);
  const antes = await redis.get(clave(u, 'saldo'));
  if (s) await redis.set(clave(u, 'saldo'), s);
  else if (antes?.banco) await redis.del(clave(u, 'saldo'));
  return s;
}

const menosDias = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

// Trae saldo y movimientos de las cuentas conectadas (si hace más de 6 horas de la última vez, o siempre con «forzar»).
export async function sincronizar(u, { forzar = false } = {}) {
  const cuentas = ((await leer(u, 'bancos')) || []).filter((c) => c.origen === 'enable');
  let nuevos = 0;
  for (const c of cuentas) {
    if (!forzar && c.sincronizada && Date.now() - Date.parse(c.sincronizada) < SEIS_HORAS) continue;
    if (c.valida && Date.parse(c.valida) < Date.now()) { await guardar(u, 'bancos', { ...c, caducada: true }); continue; }
    try {
      const desde = c.sincronizada ? menosDias(c.sincronizada.slice(0, 10), 5) : menosDias(hoy(), 90);
      const [b, t] = await Promise.all([saldos(c.uid), movimientosEB(c.uid, desde)]);
      nuevos += (await guardarMovimientos(u, t.map((x) => deEnableBanking(c.id, x)).filter(Boolean))).nuevos;
      const saldo = saldoDeEnableBanking(b);
      await guardar(u, 'bancos', { ...c, ...(saldo !== null ? { saldo, fechaSaldo: hoy() } : {}), sincronizada: new Date().toISOString(), error: undefined });
    } catch (e) {
      await guardar(u, 'bancos', { ...c, error: e.status === 401 || e.status === 403 ? 'El permiso del banco ha caducado: vuelve a conectarlo' : e.message });
    }
  }
  if (cuentas.length) await actualizarSaldo(u);
  return { nuevos };
}

const permisoDe = (tipo) => (tipo === 'factura' ? 'facturar' : 'gastar');

// Empareja un movimiento con su factura (queda cobrada) o su gasto (queda pagado). Lo confirma el usuario.
export async function emparejar(u, movId, tipo, id) {
  if (!['factura', 'gasto'].includes(tipo)) return { error: 'Elige una factura o un gasto' };
  if (!puede(u, permisoDe(tipo))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  const m = await leerUno(u, 'banco', movId);
  if (!m) return { error: 'Ese movimiento ya no existe', status: 404 };
  if (m.estado === 'emparejado') return { error: 'Ese movimiento ya está emparejado' };
  if ((tipo === 'factura') !== (m.importe > 0)) return { error: tipo === 'factura' ? 'Un cargo no puede cobrar una factura' : 'Un ingreso no puede pagar un gasto' };
  if (tipo === 'factura') {
    const f = await leerUno(u, 'facturas', id);
    if (!f) return { error: 'Esa factura ya no existe', status: 404 };
    if (f.cobrada) return { error: 'Esa factura ya está cobrada' };
    const nueva = { ...f, cobrada: true, cobro: { fecha: m.fecha, banco: m.id } };
    await guardar(u, 'facturas', nueva);
    await subirFactura(u, nueva);
  } else {
    const g = await leerUno(u, 'gastos', id);
    if (!g) return { error: 'Ese gasto ya no existe', status: 404 };
    if (g.banco) return { error: 'Ese gasto ya está emparejado con otro movimiento' };
    await guardar(u, 'gastos', { ...g, pendiente: undefined, banco: m.id, pagado: m.fecha });
    m.antes = { pendiente: Boolean(g.pendiente) };
  }
  await guardar(u, 'banco', { ...m, estado: 'emparejado', enlace: { tipo, id }, por: u.id });
  return { ok: true };
}

// Deshace un emparejamiento: la factura vuelve a estar sin cobrar o el gasto como estaba.
export async function deshacer(u, movId) {
  const m = await leerUno(u, 'banco', movId);
  if (!m) return { error: 'Ese movimiento ya no existe', status: 404 };
  if (m.estado === 'ignorado') { if (!puede(u, permisoDe(m.importe > 0 ? 'factura' : 'gasto'))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 }; await guardar(u, 'banco', { ...m, estado: 'pendiente' }); return { ok: true }; }
  if (m.estado !== 'emparejado') return { ok: true };
  const { tipo, id } = m.enlace;
  if (!puede(u, permisoDe(tipo))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  if (tipo === 'factura') {
    const f = await leerUno(u, 'facturas', id);
    if (f?.cobro?.banco === m.id) { const nueva = { ...f, cobrada: false, cobro: undefined }; await guardar(u, 'facturas', nueva); await subirFactura(u, nueva); }
  } else {
    const g = await leerUno(u, 'gastos', id);
    if (g?.banco === m.id) await guardar(u, 'gastos', { ...g, banco: undefined, pagado: undefined, pendiente: m.antes?.pendiente ? true : undefined });
  }
  await guardar(u, 'banco', { ...m, estado: 'pendiente', enlace: undefined, antes: undefined, por: undefined });
  return { ok: true };
}

export async function ignorar(u, movId) {
  const m = await leerUno(u, 'banco', movId);
  if (!m) return { error: 'Ese movimiento ya no existe', status: 404 };
  if (m.estado === 'emparejado') return { error: 'Primero deshaz el emparejamiento' };
  if (!puede(u, permisoDe(m.importe > 0 ? 'factura' : 'gasto'))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  await guardar(u, 'banco', { ...m, estado: 'ignorado' });
  return { ok: true };
}
