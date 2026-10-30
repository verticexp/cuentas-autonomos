// Movimientos y cuentas del banco de cada empresa: banco:<empresa> (id → movimiento) y bancos:<empresa> (id → cuenta).
// El saldo real (la suma de las cuentas) se guarda en saldo:<empresa>, de donde parte la previsión de tesorería.
import { randomUUID } from 'node:crypto';
import { comprobarCierre } from './cierres.js';
import { idCuota } from './cuotas.js';
import { clave, guardar, leer, leerUno, redis } from './redis.js';
import { CLASES, centimos, cobradoSinBanco, cobrosExternos, deEnableBanking, desliquidar, enlacesPorFactura, esAutomatica, importeExacto, liquidacion, liquidar, saldoDeEnableBanking, saldoTotal, sugerencias, tieneEnlaceAntiguo } from './banco.js';
import { importes, pagadoDe, pagosDe, r2, saldoDe } from './calculos.js';
import { actividadesDe } from './empresa.js';
import { bancoDirectoPermitido, movimientos as movimientosEB, saldos } from './enableBanking.js';
import { gastosQueVe, veSueldos } from './nominas.js';
import { puede } from './permisos.js';
import { sinFuncion } from './planes.js';
import { cerrojoFactura } from './actualizarFactura.js';
import { conCerrojo as conCerrojoComun, Ocupado } from './cerrojo.js';
import { totalDe } from './proveedores.js';
import { hoy } from './formato.js';
import { documentos, leerMarcados, leerRango, unir } from './indices.js';
import { COMISION_MAX, COMISION_MAX_MANUAL, comisionValida } from './caja.js';
import { secundarios } from './trabajos.js';
import { borrarJustificantes } from './justificantes.js';
import { aplicarReglas, conReglas, limpiarRegla, MAX_REGLAS, permisosDeRegla, pendiente, proveedorCoincide, sinResolver } from './reglasBanco.js';

const masDias = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// Lo que puede casar con los movimientos pendientes (informe de capacidad E01/E02), sin leer el histórico: las facturas
// sin cobrar, los cobros externos aún sin liquidar de ±45 días y los gastos sin pagar o cercanos a los cargos pendientes.
export async function candidatosConciliacion(u, movs) {
  const cargos = (movs || []).filter((m) => (!m.estado || m.estado === 'pendiente') && m.importe < 0).map((m) => m.fecha).sort();
  const ingresos = (movs || []).filter((m) => (!m.estado || m.estado === 'pendiente') && m.importe > 0).map((m) => m.fecha).sort();
  const enlaces = enlacesPorFactura(movs || []);
  const [fPend, fRango, gPend, gRango] = await Promise.all([
    leerMarcados(u, 'facturas', 'p'),
    ingresos.length ? leerRango(u, 'facturas', masDias(ingresos[0], -45), masDias(ingresos.at(-1), 45)) : [],
    leerMarcados(u, 'gastos', 'p'),
    cargos.length ? leerRango(u, 'gastos', masDias(cargos[0], -61), masDias(cargos.at(-1), 61)) : [],
  ]);
  return { facturas: unir(fPend, fRango.filter((f) => cobradoSinBanco(f) > 0 && !tieneEnlaceAntiguo(f, enlaces))), gastos: gastosQueVe(u, unir(gPend, gRango)).filter((g) => !g.agrupado) };
}

const SEIS_HORAS = 6 * 3600e3;

// Reglas del banco de cada empresa: bancoReglas:<empresa> (id → regla, lib/reglasBanco.js). Las crea, edita y borra quien
// podría ignorar o emparejar lo que cubren (lib/permisos.js: gastar para los cargos, facturar para los abonos).
export const leerReglas = async (u) => (await leer(u, 'bancoReglas')) || [];
const SIN_PERMISO = { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };

export async function crearRegla(u, b) {
  const { regla, error } = limpiarRegla(b);
  if (error) return { error };
  if (!puede(u, permisosDeRegla(regla))) return SIN_PERMISO;
  if (Number(await redis.hlen(clave(u, 'bancoReglas'))) >= MAX_REGLAS) return { error: `Tienes ya ${MAX_REGLAS} reglas: borra alguna antes de crear otra` };
  const nueva = { id: `rg-${randomUUID().slice(0, 12)}`, ...regla, creada: new Date().toISOString(), por: u.id };
  await guardar(u, 'bancoReglas', nueva);
  return { ok: true, regla: nueva };
}

export async function editarRegla(u, id, b) {
  const antes = await leerUno(u, 'bancoReglas', id);
  if (!antes) return { error: 'Esa regla ya no existe', status: 404 };
  const { regla, error } = limpiarRegla(b);
  if (error) return { error };
  // Hay que poder con lo que cubría y con lo que cubrirá.
  if (!puede(u, permisosDeRegla(antes)) || !puede(u, permisosDeRegla(regla))) return SIN_PERMISO;
  const nueva = { id: antes.id, ...regla, creada: antes.creada, por: antes.por, editada: new Date().toISOString() };
  await guardar(u, 'bancoReglas', nueva);
  return { ok: true, regla: nueva };
}

export async function borrarRegla(u, id) {
  const antes = await leerUno(u, 'bancoReglas', id);
  if (!antes) return { ok: true };
  if (!puede(u, permisosDeRegla(antes))) return SIN_PERMISO;
  await redis.hdel(clave(u, 'bancoReglas'), id);
  return { ok: true };
}

// Cerrojo para emparejar, deshacer e ignorar: dos clics a la vez (o dos personas) no pueden emparejar dos veces el mismo
// movimiento ni cobrar dos veces la misma factura. SET NX con caducidad por si algo falla a medias.
const OCUPADO = { error: 'Otra persona está cambiando esto ahora mismo. Vuelve a intentarlo en unos segundos.', status: 409 };
async function conCerrojo(u, partes, fn, comprobarPadre = () => {}) {
  const tomar = (i, comprobar) => i === partes.length ? fn(comprobar)
    : conCerrojoComun(clave(u, partes[i]), ({ quedaMs }) => tomar(i + 1, () => {
      comprobar();
      if (quedaMs() <= 0) throw new Ocupado('La operación ha tardado demasiado: inténtalo de nuevo.');
    }), { caduca: 20000, espera: 0 });
  // Siempre movimiento antes que documento; deshacer adquiere el gasto tras leer el enlace.
  try { return await tomar(0, comprobarPadre); } catch (e) {
    if (e instanceof Ocupado) return OCUPADO;
    throw e;
  }
}

// HSETNX decide en Redis: ninguna importación pisa un movimiento ya conciliado. De 200 en 200, cada tanda en una sola
// petición (MULTI/EXEC) y no en 200 a la vez.
export async function guardarMovimientos(u, lista) {
  let nuevos = 0;
  for (let i = 0; i < lista.length; i += 200) {
    const tx = redis.multi();
    for (const m of lista.slice(i, i + 200)) tx.hsetnx(clave(u, 'banco'), m.id, { ...m, estado: 'pendiente' });
    nuevos += (await tx.exec()).reduce((s, n) => s + Number(n), 0);
  }
  return { nuevos, repetidos: lista.length - nuevos };
}

export async function actualizarSaldo(u) {
  const t = saldoTotal((await leer(u, 'bancos')) || []);
  const s = t && { ...t, en: new Date().toISOString() };
  const antes = await redis.get(clave(u, 'saldo'));
  if (s) await redis.set(clave(u, 'saldo'), s);
  else if (antes?.banco) await redis.del(clave(u, 'saldo'));
  return s;
}

const menosDias = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

// Trae saldo y movimientos de las cuentas conectadas (si hace más de 6 horas de la última vez, o siempre con «forzar»).
export async function sincronizar(u, { forzar = false } = {}) {
  if (!bancoDirectoPermitido(u)) return { nuevos: 0, auto: 0 };
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
  let auto = 0;
  if (nuevos) { try { auto = (await autoconciliar(u)).hechos; } catch { /* La sincronización ya se ha guardado. */ } }
  return { nuevos, auto };
}

const permisoDe = (tipo) => (tipo === 'factura' ? 'facturar' : 'gastar');

// Factura y movimiento se guardan juntos (MULTI/EXEC) bajo el cerrojo común de la factura (lib/actualizarFactura.js), el
// mismo de Stripe y las remesas: o queda todo emparejado o nada, y ningún otro cobro se pierde entre medias.
async function conFactura(u, id, fn, comprobar) {
  return conCerrojoComun(cerrojoFactura(u, id), async ({ quedaMs }) => {
    const f = await leerUno(u, 'facturas', id);
    if (!f) return { error: 'Esa factura ya no existe', status: 404 };
    const r = await fn(f);
    if (r.soloEnlace) {
      if (quedaMs() <= 0) throw new Ocupado('La operación ha tardado demasiado: inténtalo de nuevo.');
      comprobar();
      await guardar(u, 'banco', r.movimiento);
      return { ok: true, factura: f, soloEnlace: true };
    }
    if (r.error || !r.nueva) return r;
    if (quedaMs() <= 0) throw new Ocupado('La operación ha tardado demasiado: inténtalo de nuevo.');
    comprobar();
    await redis.multi().hset(clave(u, 'facturas'), { [id]: r.nueva }).hset(clave(u, 'banco'), { [r.movimiento.id]: r.movimiento }).exec();
    return { ok: true, factura: r.nueva, liquidacion: Boolean(r.movimiento.enlace?.yaCobrada) };
  });
}

// Informe R01: el movimiento es un pago de la factura por su importe real (puede ser parcial), como los de Stripe o las
// remesas; la factura queda cobrada cuando sus pagos cubren el total. Un ingreso mayor que lo pendiente no se acepta.
const pagoDe = (m) => ({ fecha: m.fecha, importe: r2(m.importe), metodo: 'banco', banco: m.id });
function cobrarConMovimiento(f, m) {
  if ((f.pagos || []).some((p) => p.banco === m.id) || f.cobro?.banco === m.id) return { yaEstaba: true };
  if (f.cobrada) return { error: 'Esa factura ya está cobrada' };
  const pendiente = saldoDe(f);
  if (centimos(m.importe) > centimos(pendiente)) return { error: `El ingreso (${r2(m.importe)} €) supera lo que falta por cobrar de esa factura (${pendiente} €)` };
  const nueva = { ...f, pagos: [...(f.pagos || []), pagoDe(m)] };
  if (saldoDe(nueva) <= 0) Object.assign(nueva, { cobrada: true, cobro: { fecha: m.fecha, importe: pagadoDe(nueva), metodo: 'banco', banco: m.id } });
  return { nueva };
}

// Lo contrario: se quita solo el pago de ese movimiento. Si con lo que queda ya no está cubierta, vuelve a estar pendiente.
// Un emparejamiento de antes (cobrada con cobro.banco y sin pago apuntado) vuelve entera a sin cobrar, como siempre.
// Lo cobrado a mano después de un pago parcial del banco (cobro implícito, sin pago apuntado) no es de este movimiento:
// se apunta como pago para que deshacer el banco no lo borre también (auditoría 10-2026).
function quitarMovimiento(f, movId) {
  const pagos = (f.pagos || []).filter((p) => p.banco !== movId);
  if (pagos.length === (f.pagos || []).length && f.cobro?.banco !== movId) return null;
  // Si ese cobro ya estaba liquidado por otro ingreso del banco, la marca pasa con él al pago.
  const implicitos = f.cobro?.banco === movId ? [] : pagosDe(f).filter((p) => p.implicito)
    .map(({ implicito: _i, ...p }) => ({ ...p, ...(f.cobro?.liquidado ? { liquidado: f.cobro.liquidado } : {}) }));
  const todos = [...pagos, ...implicitos];
  const nueva = { ...f, pagos: todos.length ? todos : undefined };
  if (f.cobro?.banco === movId || saldoDe({ ...nueva, cobrada: false }) > 0) Object.assign(nueva, { cobrada: false, cobro: undefined });
  return nueva;
}

// Un gasto no tiene pagos parciales: el cargo tiene que ser su importe (con o sin la retención que se ingresa aparte).
const casaConGasto = (g, importe) => [totalDe(g), importes(g).total].some((t) => importeExacto(t, -importe));

// Empareja un movimiento con su factura (un cobro por su importe) o su gasto (queda pagado). Lo confirma el usuario.
async function emparejarSin(u, movId, tipo, id, opciones = {}, comprobar) {
  if (!['factura', 'gasto'].includes(tipo)) return { error: 'Elige una factura o un gasto' };
  if (!puede(u, permisoDe(tipo))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  const m = await leerUno(u, 'banco', movId);
  if (!m) return { error: 'Ese movimiento ya no existe', status: 404 };
  if (m.estado === 'emparejado') return { error: 'Ese movimiento ya está emparejado' };
  if (opciones.auto && (m.autoDescartada || (m.estado && m.estado !== 'pendiente'))) return { error: 'La conciliación automática de este movimiento se ha descartado' };
  if ((tipo === 'factura') !== (m.importe > 0)) return { error: tipo === 'factura' ? 'Un cargo no puede cobrar una factura' : 'Un ingreso no puede pagar un gasto' };
  const emparejado = { ...m, estado: 'emparejado', enlace: { tipo, id }, por: u.id, ...(opciones.auto ? { auto: true } : {}) };
  // Las reglas del banco (lib/reglasBanco.js) solo cuentan para los gastos: prestan su proveedor al cargo y su categoría al gasto sin ella.
  const reglas = tipo === 'gasto' ? (opciones.reglas || await leerReglas(u)) : [];
  const sigueSegura = (doc) => {
    const s = sugerencias(conReglas([m], reglas), tipo === 'factura' ? [doc] : [], tipo === 'gasto' ? [doc] : [], u)[m.id];
    return opciones.auto ? esAutomatica(s, m) : Boolean(s?.segura && !s.motivo);
  };
  if (tipo === 'factura') {
    const r = await conFactura(u, id, async (f) => {
      if ((opciones.auto || opciones.segura) && !sigueSegura(f)) return { error: 'Ese movimiento ya no tiene una sugerencia segura' };
      const liquida = { ...emparejado, enlace: { tipo, id, yaCobrada: true } };
      // Un reintento tras un corte: la liquidación ya estaba marcada, solo falta el movimiento.
      if (cobrosExternos(f).some((x) => x.liquidado === movId)) return { nueva: f, movimiento: liquida };
      // La liquidación de un cobro externo (Stripe, remesa, a mano) solo se enlaza: se marca en ese cobro qué movimiento
      // lo liquida y lo cobrado no cambia. Aunque la factura tenga pagos del banco (auditoría 10-2026).
      const cuales = liquidacion(f, m.importe);
      const enlazada = { error: 'Esa factura ya está enlazada con otro movimiento bancario' };
      if (cuales) {
        // Un enlace de antes, sin marca en la factura, liquidaba todo lo externo. Se comprueba bajo ambos cerrojos.
        if (tieneEnlaceAntiguo(f, enlacesPorFactura((await leer(u, 'banco')) || []), movId)) return enlazada;
        return { nueva: liquidar(f, cuales, movId), movimiento: liquida };
      }
      const cobrado = cobradoSinBanco(f);
      if (!cobrado && saldoDe(f) <= 0 && cobrosExternos(f).some((x) => x.liquidado)) return enlazada;
      if (cobrado > 0 && (f.cobrada || f.cobro || saldoDe(f) <= 0)) return { error: centimos(m.importe) > centimos(cobrado)
        ? `El ingreso (${r2(m.importe)} €) supera el importe ya cobrado de esa factura (${cobrado} €)`
        : `El ingreso (${r2(m.importe)} €) no coincide con el importe ya cobrado de esa factura (${cobrado} €)` };
      const c = cobrarConMovimiento(f, m);
      // Un reintento tras un corte: el pago ya estaba, solo falta el movimiento.
      return c.yaEstaba ? { nueva: f, movimiento: emparejado } : c.error ? c : { nueva: c.nueva, movimiento: emparejado };
    }, comprobar);
    if (r.error) return r;
    // Marcar una liquidación no cambia lo cobrado: no hay nada que volver a enviar.
    if (!r.liquidacion) await secundarios(u, { facturas: [r.factura.id] });
    return { ok: true };
  }
  const g = await leerUno(u, 'gastos', id);
  if (!g) return { error: 'Ese gasto ya no existe', status: 404 };
  if (g.nomina && !veSueldos(u)) return { error: 'Pide el permiso de nóminas al administrador', status: 403 };
  if (g.banco) return { error: 'Ese gasto ya está emparejado con otro movimiento' };
  if ((opciones.auto || opciones.segura) && !sigueSegura(g)) return { error: 'Ese movimiento ya no tiene una sugerencia segura' };
  if (!casaConGasto(g, m.importe)) return { error: `El cargo (${r2(-m.importe)} €) no coincide con el importe del gasto (${totalDe(g)} €)` };
  // La regla que lo ha propuesto (si el gasto es del proveedor que ella dice) queda anotada en el movimiento; su categoría
  // solo se pone si el gasto no tiene una, y deshacer la quita.
  const regla = reglas.length ? aplicarReglas([m], reglas).gasto.get(m.id) : null;
  const deRegla = regla && proveedorCoincide(regla, g) ? regla : null;
  const categoria = deRegla?.categoria && !g.categoria ? deRegla.categoria : null;
  comprobar();
  await redis.multi().hset(clave(u, 'gastos'), { [g.id]: { ...g, pendiente: undefined, banco: m.id, pagado: m.fecha, ...(categoria ? { categoria } : {}) } })
    .hset(clave(u, 'banco'), { [m.id]: { ...emparejado, ...(deRegla ? { regla: deRegla.id } : {}), antes: { pendiente: g.pendiente, pagado: g.pagado, ...(categoria ? { categoriaRegla: categoria } : {}) } } }).exec();
  return { ok: true };
}

// Deshace un emparejamiento: la factura pierde ese cobro o el gasto vuelve a estar como estaba.
async function deshacerSin(u, movId, comprobar) {
  const m = await leerUno(u, 'banco', movId);
  if (!m) return { error: 'Ese movimiento ya no existe', status: 404 };
  if (m.estado === 'ignorado') { if (!puede(u, permisoDe(m.importe > 0 ? 'factura' : 'gasto'))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 }; comprobar(); await guardar(u, 'banco', { ...m, estado: 'pendiente', auto: undefined, regla: undefined, autoDescartada: true }); return { ok: true }; }
  if (m.estado !== 'emparejado') return { ok: true };
  const { tipo, id } = m.enlace;
  if (tipo === 'tpv') return deshacerTarjeta(u, m, { ...m, estado: 'pendiente', enlace: undefined, por: undefined, auto: undefined, autoDescartada: true }, comprobar);
  if (!puede(u, permisoDe(tipo))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  const libre = { ...m, estado: 'pendiente', enlace: undefined, antes: undefined, por: undefined, auto: undefined, regla: undefined, autoDescartada: true };
  if (tipo === 'factura') {
    // Una liquidación: se quita la marca del cobro externo y los pagos se quedan como estaban. Las de antes, sin marca,
    // solo liberan el movimiento.
    if (m.enlace.yaCobrada) {
      const r = await conFactura(u, id, (f) => {
        const nueva = desliquidar(f, m.id);
        return nueva ? { nueva, movimiento: libre } : { soloEnlace: true, movimiento: libre };
      }, comprobar);
      if (r.status === 404) { comprobar(); await guardar(u, 'banco', libre); return { ok: true }; }
      return r.error ? r : { ok: true };
    }
    const r = await conFactura(u, id, (f) => ({ nueva: quitarMovimiento(f, m.id) || f, movimiento: libre }), comprobar);
    if (r.status === 404) { comprobar(); await guardar(u, 'banco', libre); return { ok: true }; }
    if (r.error) return r;
    await secundarios(u, { facturas: [r.factura.id] });
    return { ok: true };
  }
  if (tipo === 'asiento') {
    if (!puede(u, 'contabilidad')) return { error: 'Pide el permiso de contabilidad al administrador', status: 403 };
    comprobar();
    await redis.multi().hdel(clave(u, 'asientos'), id).hset(clave(u, 'banco'), { [m.id]: libre }).exec();
    return { ok: true };
  } else if (tipo === 'gasto') {
    // El movimiento está bloqueado antes de leer el enlace; el gasto usa el mismo cerrojo que emparejar.
    return conCerrojo(u, [`gasto-${id}`], async (comprobarGasto) => {
      const g = await leerUno(u, 'gastos', id);
      if (g?.nomina && !veSueldos(u)) return { error: 'Pide el permiso de nóminas al administrador', status: 403 };
      // Deshacer borra el gasto que se creó desde el movimiento: no en un trimestre cerrado por la gestoría.
      const cerrado = g?.banco === m.id && g.deBanco && (await comprobarCierre(u, g.fecha));
      if (cerrado) return { error: cerrado, status: 409 };
      const tx = redis.multi();
      // El gasto creado desde el movimiento se borra; el resto recupera sus valores previos.
      if (g?.banco === m.id && g.deBanco) tx.hdel(clave(u, 'gastos'), id);
      else if (g?.banco === m.id) tx.hset(clave(u, 'gastos'), { [id]: { ...g, banco: undefined, pagado: m.antes?.pagado, pendiente: m.antes?.pendiente, ...(m.antes?.categoriaRegla && g.categoria === m.antes.categoriaRegla ? { categoria: undefined } : {}) } });
      comprobarGasto();
      await tx.hset(clave(u, 'banco'), { [m.id]: libre }).exec();
      if (g?.banco === m.id && g.deBanco && g.archivo) await borrarJustificantes(u, [g.archivo]);
      return { ok: true };
    }, comprobar);
  } // 'auto': lo contabiliza Fisquo solo, no hay nada que borrar
  comprobar();
  await guardar(u, 'banco', libre);
  return { ok: true };
}

// regla: el id de la regla que lo propone (lib/reglasBanco.js). Solo aparta un movimiento pendiente que esa regla encaje
// ahora mismo; nunca pisa lo ya emparejado, ignorado o devuelto a pendiente a mano. auto: lo ha hecho Fisquo solo.
async function ignorarSin(u, movId, comprobar, { regla, auto, reglas } = {}) {
  const m = await leerUno(u, 'banco', movId);
  if (!m) return { error: 'Ese movimiento ya no existe', status: 404 };
  if (m.estado === 'emparejado') return { error: 'Primero deshaz el emparejamiento' };
  if (!puede(u, permisoDe(m.importe > 0 ? 'factura' : 'gasto'))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  if (regla) {
    if (!(auto ? sinResolver(m) : pendiente(m))) return { error: 'Ese movimiento ya no está pendiente' };
    const r = aplicarReglas([m], reglas || await leerReglas(u)).ignorar.get(m.id);
    if (!r || r.id !== regla) return { error: 'Esa regla ya no encaja con este movimiento' };
  }
  comprobar();
  await guardar(u, 'banco', { ...m, estado: 'ignorado', ...(regla ? { regla, ...(auto ? { auto: true } : {}) } : {}) });
  return { ok: true };
}

// Un movimiento sin factura ni gasto, según lo que es (CLASES de lib/banco.js):
//   comisión y cuota de autónomos → un gasto sin IVA ya pagado; Hacienda, Seguridad Social y nóminas → nada, porque esos
//   pagos ya los contabiliza Fisquo (liquidaciones y nóminas); préstamo, socios y otros ingresos → un asiento contra el banco;
//   traspaso → se ignora. intereses: la parte de la cuota de un préstamo que son intereses.
async function contabilizarSin(u, movId, clase, { intereses = 0 } = {}, comprobar) {
  const m = await leerUno(u, 'banco', movId);
  if (!m) return { error: 'Ese movimiento ya no existe', status: 404 };
  if (m.estado === 'emparejado') return { error: 'Ese movimiento ya está emparejado' };
  if (!CLASES[clase] || (CLASES[clase].signo && CLASES[clase].signo !== Math.sign(m.importe))) return { error: 'Elige qué es este movimiento' };
  if (!puede(u, permisoDe(m.importe > 0 ? 'factura' : 'gasto'))) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  const total = r2(Math.abs(m.importe));
  const quien = m.contraparte || m.concepto;
  if (clase === 'traspaso') { comprobar(); await guardar(u, 'banco', { ...m, estado: 'ignorado', clase }); return { ok: true }; }
  if (['hacienda', 'seguridad', 'nomina'].includes(clase)) {
    comprobar();
    await guardar(u, 'banco', { ...m, estado: 'emparejado', enlace: { tipo: 'auto', id: clase }, clase, por: u.id });
    return { ok: true };
  }
  if (['comision', 'cuota'].includes(clase)) {
    // Un cargo de un trimestre cerrado por la gestoría (lib/cierres.js) no se convierte en gasto: que lo reabra.
    const cerrado = await comprobarCierre(u, m.fecha);
    if (cerrado) return { error: cerrado, status: 409 };
    const id = clase === 'cuota' ? idCuota(m.fecha.slice(0, 7)) : `banco-${m.id}`;
    return conCerrojo(u, [`gasto-${id}`], async (comprobarGasto) => {
      // La cuota va al id de su mes (lib/cuotas.js): si ya estaba (del formulario de Gastos), se actualiza con el cargo real.
      const antes = clase === 'cuota' ? await leerUno(u, 'gastos', idCuota(m.fecha.slice(0, 7))) : null;
      const g = { ...(antes || {}), id, fecha: m.fecha, actividad: actividadesDe(u)[0].id, concepto: clase === 'cuota' ? 'Cuota de autónomos' : `Comisión bancaria${m.concepto ? `: ${m.concepto}` : ''}`.slice(0, 140),
        base: total, ivaPct: 0, categoria: clase === 'cuota' ? '642' : '626', ...(m.contraparte ? { proveedor: m.contraparte.slice(0, 80) } : {}), banco: m.id, pagado: m.fecha, pendiente: undefined, ...(antes ? {} : { deBanco: true }) };
      // Si la cuota ya estaba, deshacer no la borra: recupera su pago anterior (como al emparejar).
      comprobarGasto();
      await redis.multi().hset(clave(u, 'gastos'), { [g.id]: g })
        .hset(clave(u, 'banco'), { [m.id]: { ...m, estado: 'emparejado', enlace: { tipo: 'gasto', id: g.id }, clase, por: u.id, ...(antes ? { antes: { pagado: antes.pagado, pendiente: antes.pendiente } } : {}) } }).exec();
      return { ok: true };
    }, comprobar);
  }
  if (!puede(u, 'contabilidad')) return { error: 'Pide el permiso de contabilidad al administrador', status: 403 };
  const int = Math.min(total, r2(Math.abs(Number(intereses) || 0)));
  const L = (cuenta, debe, haber) => ({ cuenta, debe: r2(debe), haber: r2(haber) });
  const entra = m.importe > 0;
  const lineas = clase === 'prestamo'
    ? (entra ? [L('572', total, 0), L('170', 0, total)] : [L('520', total - int, 0), ...(int ? [L('662', int, 0)] : []), L('572', 0, total)])
    : clase === 'socio' ? (entra ? [L('572', total, 0), L('551', 0, total)] : [L('551', total, 0), L('572', 0, total)])
      : [L('572', total, 0), L('759', 0, total)];
  const a = { id: `banco-${m.id}`, fecha: m.fecha, concepto: `${CLASES[clase].t}: ${quien}`.slice(0, 140), lineas: lineas.filter((l) => l.debe || l.haber), banco: m.id, por: u.id, creado: new Date().toISOString() };
  comprobar();
  await redis.multi().hset(clave(u, 'asientos'), { [a.id]: a })
    .hset(clave(u, 'banco'), { [m.id]: { ...m, estado: 'emparejado', enlace: { tipo: 'asiento', id: a.id }, clase, por: u.id } }).exec();
  return { ok: true };
}

// Liquidación de la tarjeta de uno o varios cierres de caja (lib/caja.js propuestasTarjeta): el ingreso del banco queda
// emparejado con ellos (enlace tpv), cada cierre guarda qué movimiento lo liquida (caja.liquidacion) y la comisión del TPV
// (la tarjeta menos lo ingresado) es un gasto de comisiones bancarias pagado ese día. Todo en una transacción.
// manual: elegido a mano en Caja (admite más comisión que una propuesta).
async function liquidarTarjetaSin(u, movId, ids, comprobar, { manual = false } = {}) {
  if (!puede(u, 'facturar') || !puede(u, 'gastar')) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  const m = await leerUno(u, 'banco', movId);
  if (!m) return { error: 'Ese movimiento ya no existe', status: 404 };
  if (m.estado && m.estado !== 'pendiente') return { error: 'Ese movimiento ya está emparejado' };
  if (!(m.importe > 0)) return { error: 'Solo un ingreso puede liquidar la tarjeta' };
  const lista = [...new Set(ids.map(String))].slice(0, 31);
  const cierres = await documentos(u, 'facturas', lista);
  if (!lista.length || cierres.length !== lista.length) return { error: 'Alguno de esos cierres ya no existe', status: 404 };
  if (cierres.some((f) => !f.caja || !(f.caja.tarjeta > 0) || f.rectifica)) return { error: 'Elige cierres de caja con cobros con tarjeta' };
  if (cierres.some((f) => f.caja.liquidacion)) return { error: 'Alguno de esos cierres ya está cuadrado con otro ingreso' };
  if (cierres.some((f) => f.fecha > m.fecha)) return { error: 'El ingreso no puede ser anterior a los cierres que liquida' };
  const tarjeta = r2(cierres.reduce((s, f) => s + f.caja.tarjeta, 0));
  const max = manual ? COMISION_MAX_MANUAL : COMISION_MAX;
  const comision = comisionValida(tarjeta, m.importe, max);
  if (comision === null) return { error: m.importe > tarjeta + 0.01
    ? `El ingreso (${r2(m.importe)} €) es mayor que la tarjeta de esos días (${tarjeta} €): añade el cierre que falta`
    : `La tarjeta de esos días (${tarjeta} €) no casa con el ingreso (${r2(m.importe)} €): la comisión tiene que estar entre 0 y el ${max * 100} %` };
  const gid = `tpv-${m.id}`;
  if (comision) {
    const cerrado = await comprobarCierre(u, m.fecha);
    if (cerrado) return { error: cerrado, status: 409 };
  }
  const ultimo = [...cierres].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const g = comision ? { id: gid, fecha: m.fecha, actividad: ultimo.actividad || actividadesDe(u)[0].id, concepto: `Comisión del TPV (${cierres.length === 1 ? `tarjeta del ${ultimo.fecha}` : `tarjeta de ${cierres.length} días`})`,
    base: comision, ivaPct: 0, categoria: '626', ...(m.contraparte ? { proveedor: m.contraparte.slice(0, 80) } : {}), pagado: m.fecha, tpv: m.id } : null;
  comprobar();
  const tx = redis.multi();
  tx.hset(clave(u, 'facturas'), Object.fromEntries(cierres.map((f) => [f.id, { ...f, caja: { ...f.caja, liquidacion: { mov: m.id, fecha: m.fecha } } }])));
  if (g) tx.hset(clave(u, 'gastos'), { [g.id]: g });
  tx.hset(clave(u, 'banco'), { [m.id]: { ...m, estado: 'emparejado', enlace: { tipo: 'tpv', id: ultimo.id, cierres: cierres.map((f) => f.id), tarjeta, comision, ...(g ? { gasto: g.id } : {}) }, por: u.id } });
  await tx.exec();
  return { ok: true, comision };
}
export const liquidarTarjeta = (u, movId, ids, opciones) => conCerrojo(u, [`banco-${movId}`, ...ids.map((id) => `caja-${id}`)], (comprobar) => liquidarTarjetaSin(u, movId, ids, comprobar, opciones));

// Deshace una liquidación de la tarjeta: los cierres vuelven a estar sin liquidar y la comisión se borra.
async function deshacerTarjeta(u, m, libre, comprobar) {
  if (!puede(u, 'facturar') || !puede(u, 'gastar')) return { error: 'No tienes permiso para esto. Pídeselo al administrador de tu empresa.', status: 403 };
  if (m.enlace.gasto) {
    const cerrado = await comprobarCierre(u, m.fecha);
    if (cerrado) return { error: cerrado, status: 409 };
  }
  const cierres = await documentos(u, 'facturas', m.enlace.cierres || []);
  comprobar();
  const tx = redis.multi();
  const sueltos = cierres.filter((f) => f.caja?.liquidacion?.mov === m.id).map((f) => { const { liquidacion: _l, ...caja } = f.caja; return [f.id, { ...f, caja }]; });
  if (sueltos.length) tx.hset(clave(u, 'facturas'), Object.fromEntries(sueltos));
  if (m.enlace.gasto) tx.hdel(clave(u, 'gastos'), m.enlace.gasto);
  await tx.hset(clave(u, 'banco'), { [m.id]: libre }).exec();
  return { ok: true };
}

export const contabilizar = (u, movId, clase, op) => conCerrojo(u, [`banco-${movId}`], (comprobar) => contabilizarSin(u, movId, clase, op, comprobar));
export const emparejar = (u, movId, tipo, id, opciones) => conCerrojo(u, [`banco-${movId}`, `${tipo}-${id}`], (comprobar) => emparejarSin(u, movId, tipo, id, opciones, comprobar));
export const deshacer = (u, movId) => conCerrojo(u, [`banco-${movId}`], (comprobar) => deshacerSin(u, movId, comprobar));
export const ignorar = (u, movId, opciones) => conCerrojo(u, [`banco-${movId}`], (comprobar) => ignorarSin(u, movId, comprobar, opciones));

export async function autoconciliar(u) {
  // Importar y sincronizar guardan el extracto, pero solo concilian si el plan incluye esta función.
  if (sinFuncion(u.plan, 'conciliacion')) return { hechos: 0, rechazados: [] };
  const movs = (await leer(u, 'banco')) || [];
  const reglas = await leerReglas(u);
  const { facturas, gastos } = await candidatosConciliacion(u, movs);
  const s = sugerencias(conReglas(movs, reglas), facturas, gastos, u);
  const rechazados = [];
  let hechos = 0, intentados = 0;
  // Se sugieren sobre todos los pendientes: recortar antes ocultaría conflictos fuera del lote.
  for (const m of movs) {
    const x = s[m.id];
    if (!esAutomatica(x, m) || !puede(u, permisoDe(x.tipo))) continue;
    if (intentados++ >= 200) break;
    try {
      const r = await emparejar(u, m.id, x.tipo, x.id, { auto: true, reglas });
      if (r.ok) hechos++;
      else rechazados.push({ id: m.id, error: r.error || 'No se ha podido conciliar el movimiento' });
    } catch (e) { rechazados.push({ id: m.id, error: e.message || 'No se ha podido conciliar el movimiento' }); }
  }
  // Después, las reglas de ignorar sobre lo que sigue pendiente. Un movimiento con una sugerencia segura (factura o gasto)
  // espera a su pareja: la regla no se la quita. ignorarSin vuelve a comprobarlo todo al leer el movimiento.
  let apartados = 0;
  const porId = new Map(movs.map((m) => [m.id, m]));
  for (const [id, regla] of aplicarReglas(movs, reglas).ignorar) {
    const m = porId.get(id);
    if (s[id]?.segura || !puede(u, permisoDe(m.importe > 0 ? 'factura' : 'gasto'))) continue;
    if (apartados >= 200) break;
    try {
      const r = await ignorar(u, id, { regla: regla.id, auto: true, reglas });
      if (r.ok) { apartados++; hechos++; } else rechazados.push({ id, error: r.error || 'No se ha podido apartar el movimiento' });
    } catch (e) { rechazados.push({ id, error: e.message || 'No se ha podido apartar el movimiento' }); }
  }
  return { hechos, rechazados };
}
