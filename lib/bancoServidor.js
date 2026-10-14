// Movimientos y cuentas del banco de cada empresa: banco:<empresa> (id → movimiento) y bancos:<empresa> (id → cuenta).
// El saldo real (la suma de las cuentas) se guarda en saldo:<empresa>, de donde parte la previsión de tesorería.
import { borrar, clave, guardar, leer, leerUno, redis } from './redis.js';
import { CLASES, deEnableBanking, saldoDeEnableBanking, saldoTotal } from './banco.js';
import { importes, pagadoDe, r2, saldoDe } from './calculos.js';
import { actividadesDe } from './empresa.js';
import { movimientos as movimientosEB, saldos } from './enableBanking.js';
import { puede } from './permisos.js';
import { subirFactura } from './drive.js';
import { cerrojoFactura } from './actualizarFactura.js';
import { conCerrojo as conCerrojoFactura } from './cerrojo.js';
import { totalDe } from './proveedores.js';
import { hoy } from './formato.js';

const SEIS_HORAS = 6 * 3600e3;

// Cerrojo para emparejar, deshacer e ignorar: dos clics a la vez (o dos personas) no pueden emparejar dos veces el mismo
// movimiento ni cobrar dos veces la misma factura. SET NX con caducidad por si algo falla a medias.
const OCUPADO = { error: 'Otra persona está cambiando esto ahora mismo. Vuelve a intentarlo en unos segundos.', status: 409 };
async function conCerrojo(u, partes, fn) {
  const claves = partes.map((p) => `cerrojo:${clave(u, p)}`);
  const cogidas = [];
  for (const k of claves) {
    if (await redis.set(k, '1', { nx: true, ex: 20 })) cogidas.push(k);
    else { if (cogidas.length) await redis.del(...cogidas); return OCUPADO; }
  }
  try { return await fn(); } finally { await redis.del(...cogidas); }
}

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

// Factura y movimiento se guardan juntos (MULTI/EXEC) bajo el cerrojo común de la factura (lib/actualizarFactura.js), el
// mismo de Stripe y las remesas: o queda todo emparejado o nada, y ningún otro cobro se pierde entre medias.
async function conFactura(u, id, fn) {
  return conCerrojoFactura(cerrojoFactura(u, id), async ({ quedaMs }) => {
    const f = await leerUno(u, 'facturas', id);
    if (!f) return { error: 'Esa factura ya no existe', status: 404 };
    const r = fn(f);
    if (r.error || !r.nueva) return r;
    if (quedaMs() <= 0) return { error: 'La operación ha tardado demasiado: inténtalo de nuevo.' };
    await redis.multi().hset(clave(u, 'facturas'), { [id]: r.nueva }).hset(clave(u, 'banco'), { [r.movimiento.id]: r.movimiento }).exec();
    return { ok: true, factura: r.nueva };
  });
}

// Informe R01: el movimiento es un pago de la factura por su importe real (puede ser parcial), como los de Stripe o las
// remesas; la factura queda cobrada cuando sus pagos cubren el total. Un ingreso mayor que lo pendiente no se acepta.
const pagoDe = (m) => ({ fecha: m.fecha, importe: r2(m.importe), metodo: 'banco', banco: m.id });
function cobrarConMovimiento(f, m) {
  if ((f.pagos || []).some((p) => p.banco === m.id) || f.cobro?.banco === m.id) return { yaEstaba: true };
  if (f.cobrada) return { error: 'Esa factura ya está cobrada' };
  const pendiente = saldoDe(f);
  if (r2(m.importe) - pendiente > 0.005) return { error: `El ingreso (${r2(m.importe)} €) supera lo que falta por cobrar de esa factura (${pendiente} €)` };
  const nueva = { ...f, pagos: [...(f.pagos || []), pagoDe(m)] };
  if (saldoDe(nueva) <= 0) Object.assign(nueva, { cobrada: true, cobro: { fecha: m.fecha, importe: pagadoDe(nueva), metodo: 'banco', banco: m.id } });
  return { nueva };
}

// Lo contrario: se quita solo el pago de ese movimiento. Si con lo que queda ya no está cubierta, vuelve a estar pendiente.
// Un emparejamiento de antes (cobrada con cobro.banco y sin pago apuntado) vuelve entera a sin cobrar, como siempre.
function quitarMovimiento(f, movId) {
  const pagos = (f.pagos || []).filter((p) => p.banco !== movId);
  if (pagos.length === (f.pagos || []).length && f.cobro?.banco !== movId) return null;
  const nueva = { ...f, pagos: pagos.length ? pagos : undefined };
  if (f.cobro?.banco === movId || saldoDe({ ...nueva, cobrada: false }) > 0) Object.assign(nueva, { cobrada: false, cobro: undefined });
  return nueva;
}

// Un gasto no tiene pagos parciales: el cargo tiene que ser su importe (con o sin la retención que se ingresa aparte).
const casaConGasto = (g, importe) => [totalDe(g), importes(g).total].some((t) => Math.abs(r2(t + importe)) <= 0.01);

// Empareja un movimiento con su factura (un cobro por su importe) o su gasto (queda pagado). Lo confirma el usuario.
async function emparejarSin(u, movId, tipo, id) {
  if (!['factura', 'gasto'].includes(tipo)) return { error: 'Elige una factura o un gasto' };
  if (!puede(u, permisoDe(tipo))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  const m = await leerUno(u, 'banco', movId);
  if (!m) return { error: 'Ese movimiento ya no existe', status: 404 };
  if (m.estado === 'emparejado') return { error: 'Ese movimiento ya está emparejado' };
  if ((tipo === 'factura') !== (m.importe > 0)) return { error: tipo === 'factura' ? 'Un cargo no puede cobrar una factura' : 'Un ingreso no puede pagar un gasto' };
  const emparejado = { ...m, estado: 'emparejado', enlace: { tipo, id }, por: u.id };
  if (tipo === 'factura') {
    const r = await conFactura(u, id, (f) => {
      const c = cobrarConMovimiento(f, m);
      // Un reintento tras un corte: el pago ya estaba, solo falta el movimiento.
      return c.yaEstaba ? { nueva: f, movimiento: emparejado } : c.error ? c : { nueva: c.nueva, movimiento: emparejado };
    });
    if (r.error) return r;
    await subirFactura(u, r.factura);
    return { ok: true };
  }
  const g = await leerUno(u, 'gastos', id);
  if (!g) return { error: 'Ese gasto ya no existe', status: 404 };
  if (g.banco) return { error: 'Ese gasto ya está emparejado con otro movimiento' };
  if (!casaConGasto(g, m.importe)) return { error: `El cargo (${r2(-m.importe)} €) no coincide con el importe del gasto (${totalDe(g)} €)` };
  await redis.multi().hset(clave(u, 'gastos'), { [g.id]: { ...g, pendiente: undefined, banco: m.id, pagado: m.fecha } })
    .hset(clave(u, 'banco'), { [m.id]: { ...emparejado, antes: { pendiente: Boolean(g.pendiente) } } }).exec();
  return { ok: true };
}

// Deshace un emparejamiento: la factura pierde ese cobro o el gasto vuelve a estar como estaba.
async function deshacerSin(u, movId) {
  const m = await leerUno(u, 'banco', movId);
  if (!m) return { error: 'Ese movimiento ya no existe', status: 404 };
  if (m.estado === 'ignorado') { if (!puede(u, permisoDe(m.importe > 0 ? 'factura' : 'gasto'))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 }; await guardar(u, 'banco', { ...m, estado: 'pendiente' }); return { ok: true }; }
  if (m.estado !== 'emparejado') return { ok: true };
  const { tipo, id } = m.enlace;
  if (!puede(u, permisoDe(tipo))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  const libre = { ...m, estado: 'pendiente', enlace: undefined, antes: undefined, por: undefined };
  if (tipo === 'factura') {
    const r = await conFactura(u, id, (f) => ({ nueva: quitarMovimiento(f, m.id) || f, movimiento: libre }));
    if (r.status === 404) { await guardar(u, 'banco', libre); return { ok: true }; }
    if (r.error) return r;
    await subirFactura(u, r.factura);
    return { ok: true };
  }
  if (tipo === 'asiento') await borrar(u, 'asientos', id);
  else if (tipo === 'gasto') {
    const g = await leerUno(u, 'gastos', id);
    // El gasto que se creó desde el propio movimiento (una comisión, la cuota de autónomos) se borra; el resto queda como estaba.
    if (g?.banco === m.id && g.deBanco) await borrar(u, 'gastos', id);
    else if (g?.banco === m.id) await guardar(u, 'gastos', { ...g, banco: undefined, pagado: undefined, pendiente: m.antes?.pendiente ? true : undefined });
  } // 'auto': lo contabiliza Netto solo, no hay nada que borrar
  await guardar(u, 'banco', libre);
  return { ok: true };
}

async function ignorarSin(u, movId) {
  const m = await leerUno(u, 'banco', movId);
  if (!m) return { error: 'Ese movimiento ya no existe', status: 404 };
  if (m.estado === 'emparejado') return { error: 'Primero deshaz el emparejamiento' };
  if (!puede(u, permisoDe(m.importe > 0 ? 'factura' : 'gasto'))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  await guardar(u, 'banco', { ...m, estado: 'ignorado' });
  return { ok: true };
}

// Un movimiento sin factura ni gasto, según lo que es (CLASES de lib/banco.js):
//   comisión y cuota de autónomos → un gasto sin IVA ya pagado; Hacienda, Seguridad Social y nóminas → nada, porque esos
//   pagos ya los contabiliza Netto (liquidaciones y nóminas); préstamo, socios y otros ingresos → un asiento contra el banco;
//   traspaso → se ignora. intereses: la parte de la cuota de un préstamo que son intereses.
async function contabilizarSin(u, movId, clase, { intereses = 0 } = {}) {
  const m = await leerUno(u, 'banco', movId);
  if (!m) return { error: 'Ese movimiento ya no existe', status: 404 };
  if (m.estado === 'emparejado') return { error: 'Ese movimiento ya está emparejado' };
  if (!CLASES[clase] || (CLASES[clase].signo && CLASES[clase].signo !== Math.sign(m.importe))) return { error: 'Elige qué es este movimiento' };
  if (!puede(u, permisoDe(m.importe > 0 ? 'factura' : 'gasto'))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  const total = r2(Math.abs(m.importe));
  const quien = m.contraparte || m.concepto;
  if (clase === 'traspaso') { await guardar(u, 'banco', { ...m, estado: 'ignorado', clase }); return { ok: true }; }
  if (['hacienda', 'seguridad', 'nomina'].includes(clase)) {
    await guardar(u, 'banco', { ...m, estado: 'emparejado', enlace: { tipo: 'auto', id: clase }, clase, por: u.id });
    return { ok: true };
  }
  if (['comision', 'cuota'].includes(clase)) {
    const g = { id: crypto.randomUUID(), fecha: m.fecha, actividad: actividadesDe(u)[0].id, concepto: clase === 'cuota' ? 'Cuota de autónomos' : `Comisión bancaria${m.concepto ? `: ${m.concepto}` : ''}`.slice(0, 140),
      base: total, ivaPct: 0, categoria: clase === 'cuota' ? '642' : '626', ...(m.contraparte ? { proveedor: m.contraparte.slice(0, 80) } : {}), banco: m.id, pagado: m.fecha, deBanco: true };
    await guardar(u, 'gastos', g);
    await guardar(u, 'banco', { ...m, estado: 'emparejado', enlace: { tipo: 'gasto', id: g.id }, clase, por: u.id });
    return { ok: true };
  }
  const int = Math.min(total, r2(Math.abs(Number(intereses) || 0)));
  const L = (cuenta, debe, haber) => ({ cuenta, debe: r2(debe), haber: r2(haber) });
  const entra = m.importe > 0;
  const lineas = clase === 'prestamo'
    ? (entra ? [L('572', total, 0), L('170', 0, total)] : [L('520', total - int, 0), ...(int ? [L('662', int, 0)] : []), L('572', 0, total)])
    : clase === 'socio' ? (entra ? [L('572', total, 0), L('551', 0, total)] : [L('551', total, 0), L('572', 0, total)])
      : [L('572', total, 0), L('759', 0, total)];
  const a = { id: crypto.randomUUID(), fecha: m.fecha, concepto: `${CLASES[clase].t}: ${quien}`.slice(0, 140), lineas: lineas.filter((l) => l.debe || l.haber), banco: m.id, por: u.id, creado: new Date().toISOString() };
  await guardar(u, 'asientos', a);
  await guardar(u, 'banco', { ...m, estado: 'emparejado', enlace: { tipo: 'asiento', id: a.id }, clase, por: u.id });
  return { ok: true };
}

export const contabilizar = (u, movId, clase, op) => conCerrojo(u, [`banco-${movId}`], () => contabilizarSin(u, movId, clase, op));
export const emparejar = (u, movId, tipo, id) => conCerrojo(u, [`banco-${movId}`, `${tipo}-${id}`], () => emparejarSin(u, movId, tipo, id));
export const deshacer = (u, movId) => conCerrojo(u, [`banco-${movId}`], () => deshacerSin(u, movId));
export const ignorar = (u, movId) => conCerrojo(u, [`banco-${movId}`], () => ignorarSin(u, movId));
