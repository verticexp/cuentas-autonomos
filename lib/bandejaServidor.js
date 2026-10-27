// Bandeja de facturas recibidas en el servidor (el modelo, en lib/bandeja.js). El archivo va al almacén de justificantes
// desde que llega (justificantes/<empresa>/<id del documento>-…): al aprobarlo, el gasto se queda con esa misma
// referencia, sin copiarlo. La lectura con IA va por la cola de trabajos (tarea 'leer-bandeja', lib/trabajosTareas.js).
import { randomBytes } from 'node:crypto';
import { redis, clave, leer, leerUno, guardar } from './redis.js';
import { borrarJustificantes, esXml, huellaDe, leerJustificante, subirJustificante } from './justificantes.js';
import { encolar, procesarLuego, secundarios } from './trabajos.js';
import { leerConCupo } from './lecturaIA.js';
import { MAX_BYTES_IA } from './cuotasIA.js';
import { leerFacturaElectronica } from './facturae.js';
import { caducado, cuadra, idValido, MAX_BANDEJA, nombreArchivo, propuestaDeEfactura, propuestaDeTicket } from './bandeja.js';
import { conLoHabitual, habitualDe, mismoProveedor } from './proveedorHabitual.js';
import { posiblesDuplicados } from './duplicados.js';
import { borrarGasto, candidatosDuplicados, crearGasto } from './gastosServidor.js';
import { nuevoGasto } from './gastoCuerpo.js';
import { conVencimiento } from './pagosServidor.js';
import { sugerencias } from './banco.js';
import { emparejar } from './bancoServidor.js';
import { sinFuncion } from './planes.js';
import { hoy } from './formato.js';
import { recordar } from './buzon.js';

export const nuevoId = () => `b${randomBytes(8).toString('hex')}`;
const ahora = () => new Date().toISOString();
// Una lectura sin terminar pasado este tiempo se da por cortada (la función acabó a medias).
const LECTURA_CORTADA_MS = 3 * 60e3;
// En la cola sin empezar tanto tiempo: algo ha ido mal (la cola se ha quedado sin reintentos).
const EN_COLA_MS = 30 * 60e3;

export async function encolarLectura(u, id) {
  await encolar(u, { id: `leer-bandeja:${id}`, tipo: 'leer-bandeja', datos: { doc: id } });
  procesarLuego(u);
}

// La pantalla pregunta cada pocos segundos mientras se lee: como mucho una tanda de la cola cada 15 s por empresa (cada
// tanda trabaja hasta ~20 s después de responder; más a la vez solo gastaría tiempo de función esperando turno).
export async function adelantarLecturas(u, docs) {
  if (!docs.some((d) => d.estado === 'leyendo')) return;
  if (await redis.set(`bandeja-tanda:${u.empresa || u.id}`, '1', { nx: true, ex: 15 })) procesarLuego(u);
}

// Los documentos de la bandeja. De paso: quita los aprobados solos hace más de un mes y da por fallidas las lecturas que
// se quedaron colgadas (para que se puedan volver a leer, sin repetir solas una lectura que quizá ya se cobró).
export async function documentosBandeja(u, t = Date.now()) {
  const docs = (await leer(u, 'bandeja')) || [];
  const viejos = docs.filter((d) => caducado(d, t));
  if (viejos.length) await redis.hdel(clave(u, 'bandeja'), ...viejos.map((d) => d.id));
  const vivos = docs.filter((d) => !caducado(d, t));
  for (const d of vivos) {
    if (d.estado !== 'leyendo') continue;
    const cortada = d.leyendoDesde && t - Date.parse(d.leyendoDesde) > LECTURA_CORTADA_MS;
    const olvidada = !d.leyendoDesde && t - Date.parse(d.recibido) > EN_COLA_MS;
    if (!cortada && !olvidada) continue;
    Object.assign(d, { estado: 'error', error: cortada ? 'La lectura se interrumpió. Vuelve a leerla o apúntala a mano.' : 'No se ha podido leer todavía. Vuelve a intentarlo o apúntala a mano.', leyendoDesde: undefined });
    await guardar(u, 'bandeja', d);
  }
  return vivos;
}

// Entra un archivo (subido, reenviado por correo o compartido) → { doc, repetido? } o { error, status }.
// cuarentena: de un remitente que la empresa no conoce; se guarda, pero no se lee (ni gasta lecturas) hasta que se pida.
// leerYa: se lee ahora mismo en vez de en la cola (Fisquo por WhatsApp contesta con lo leído en el mismo mensaje).
export async function recibirArchivo(u, bytes, { nombre, origen = 'subida', por, correo, cuarentena = false, leerYa = false } = {}) {
  const docs = (await leer(u, 'bandeja')) || [];
  const huella = huellaDe(bytes);
  // El mismo archivo dos veces (subido otra vez, o el mismo correo reenviado): no se duplica.
  const igual = docs.find((d) => d.archivo?.huella === huella && d.estado !== 'aprobado');
  if (igual) return { doc: igual, repetido: true };
  if (docs.length >= MAX_BANDEJA) return { error: `La bandeja ya tiene ${MAX_BANDEJA} facturas. Aprueba o descarta algunas antes de añadir más.`, status: 409 };
  const id = nuevoId();
  const s = await subirJustificante(u, id, bytes, { xml: true });
  if (s.error) return s;
  const doc = {
    id, recibido: ahora(), origen, nombre: nombreArchivo(nombre), archivo: s.archivo,
    estado: cuarentena ? 'cuarentena' : 'leyendo', ...(por ? { por } : {}), ...(correo ? { correo } : {}),
  };
  await guardar(u, 'bandeja', doc);
  // La factura electrónica se lee al momento (sin IA); lo demás, en la cola.
  if (!cuarentena) {
    if (esXml(doc.archivo)) await leerDocumento(u, id);
    // Lectura ocupada por otras de la empresa: entonces sí, a la cola, que la reintenta.
    else if (leerYa) await leerDocumento(u, id).catch(() => encolarLectura(u, id));
    else await encolarLectura(u, id);
  }
  return { doc: (await leerUno(u, 'bandeja', id)) || doc };
}

const fallo = (u, d, error) => guardar(u, 'bandeja', { ...d, estado: 'error', error, leyendoDesde: undefined });

// La tarea de la cola: lee el documento y lo deja «por revisar» con su propuesta de gasto.
export async function leerDocumento(u, id) {
  const d = await leerUno(u, 'bandeja', id);
  if (!d || d.estado !== 'leyendo') return { nada: true };
  // Un intento anterior empezó y no terminó: puede que ya gastara la lectura. No se repite solo.
  if (d.leyendoDesde) { await fallo(u, d, 'La lectura se interrumpió. Vuelve a leerla o apúntala a mano.'); return { cortada: true }; }
  const bytes = await leerJustificante(u, d.archivo);
  if (!bytes) { await fallo(u, d, 'No se encuentra el archivo. Vuelve a subirlo.'); return { error: true }; }
  let propuesta;
  if (esXml(d.archivo)) {
    const t = leerFacturaElectronica(bytes.toString('utf8'));
    if (t.error) { await fallo(u, d, t.error); return { error: true }; }
    propuesta = propuestaDeEfactura(t, hoy());
  } else {
    if (bytes.length > MAX_BYTES_IA) { await fallo(u, d, 'Es demasiado grande para leerla con IA (máx. 3 MB): apúntala a mano. El archivo queda guardado con el gasto.'); return { error: true }; }
    await guardar(u, 'bandeja', { ...d, leyendoDesde: ahora() });
    const r = await leerConCupo(u, bytes.toString('base64'), d.archivo.tipo);
    // Lectura ocupada por otras de la misma empresa: se deja como estaba y la cola lo reintenta en un rato.
    if (r.ocupado) { await guardar(u, 'bandeja', d); throw new Error(r.error); }
    if (r.error) { await fallo(u, d, r.error); return { error: true }; }
    propuesta = propuestaDeTicket(r.gasto, hoy());
  }
  await completar(u, d, propuesta);
  const auto = await aprobarSiConfianza(u, id).catch((e) => { console.error('[bandeja] aprobación automática', e.message); return null; });
  return auto ? { leido: true, aprobado: auto } : { leido: true };
}

// Lo que se añade a lo leído: lo habitual del proveedor, si ya está apuntado y con qué cargo del banco casa.
async function completar(u, d, leido) {
  const habitual = await habitualDe(u, leido).catch(() => null);
  const propuesta = conLoHabitual({ ...leido, fecha: leido.fecha || hoy() }, habitual);
  const comoGasto = { ...propuesta, base: propuesta.base || 0, archivo: { huella: d.archivo.huella } };
  const duplicados = posiblesDuplicados(comoGasto, await candidatosDuplicados(u, comoGasto)).slice(0, 3);
  const banco = await cargoQueCasa(u, propuesta).catch(() => null);
  const actual = await leerUno(u, 'bandeja', d.id);
  // Descartada mientras se leía: no se resucita.
  if (!actual) return;
  await guardar(u, 'bandeja', {
    ...actual, estado: 'revisar', propuesta, leyendoDesde: undefined, error: undefined,
    ...(habitual ? { habitual: { proveedor: habitual.proveedor, fecha: habitual.fecha } } : { habitual: undefined }),
    duplicados: duplicados.length ? duplicados : undefined, banco: banco || undefined,
  });
}

// El cargo del banco, sin emparejar, que casa con la factura (mismo importe y proveedor o número en el concepto).
export async function cargoQueCasa(u, p) {
  if (!(p?.base > 0) || sinFuncion(u.plan, 'revision')) return null;
  const cargos = ((await leer(u, 'banco')) || []).filter((m) => (!m.estado || m.estado === 'pendiente') && m.importe < 0);
  if (!cargos.length) return null;
  const doc = { id: '__bandeja', fecha: p.fecha || hoy(), base: p.base, ivaPct: p.ivaPct, irpfPct: p.irpfPct || 0, ...(p.alquiler ? { alquiler: true } : {}), ...(p.noResidente ? { noResidente: p.noResidente } : {}),
    ...(p.desglose ? { porTipo: p.desglose } : {}), proveedor: p.proveedor, concepto: p.concepto, numero: p.numero, ...(p.pendiente ? { pendiente: true } : {}) };
  const s = sugerencias(cargos, [], [doc]);
  const m = cargos.find((x) => s[x.id]?.tipo === 'gasto' && s[x.id].id === '__bandeja' && !s[x.id].motivo);
  return m ? { id: m.id, fecha: m.fecha, importe: m.importe, concepto: String(m.contraparte || m.concepto || '').slice(0, 120) } : null;
}

// Aprobar: el gasto con los datos revisados (las mismas comprobaciones que /api/gastos) y el archivo del documento.
// → { gasto, aviso? } o { error, errores?, duplicados?, status }. sola: lo aprueba la regla de confianza; el documento se
// queda en la bandeja como «aprobado» (para poder deshacerlo) en vez de quitarse.
export async function aprobar(u, id, datos, { duplicadoConfirmado = false, sola = false } = {}) {
  if (!idValido(id)) return { error: 'Esta factura ya no está en la bandeja', status: 404 };
  // Un cerrojo por documento: dos aprobaciones a la vez no crean dos gastos, y el documento no desaparece a medias.
  const cerrojo = `bandeja-aprobar:${u.empresa || u.id}:${id}`;
  if (!(await redis.set(cerrojo, '1', { nx: true, ex: 60 }))) return { error: 'Esta factura ya se está aprobando', status: 409 };
  try {
    const d = await leerUno(u, 'bandeja', id);
    if (!d) return { error: 'Esta factura ya no está en la bandeja', status: 404 };
    if (d.estado === 'leyendo') return { error: 'Aún se está leyendo. Espera unos segundos.', status: 409 };
    if (d.estado === 'aprobado') return { error: 'Ya está aprobada', status: 409 };
    const { huella, banco, ...resto } = datos || {};
    const v = await conVencimiento(u, nuevoGasto(u, resto));
    if (v.error) return v;
    const alta = await crearGasto(u, { ...v.gasto, archivo: d.archivo }, { duplicadoConfirmado: duplicadoConfirmado === true });
    if (alta.error) return { ...alta, status: 409 };
    if (sola) await guardar(u, 'bandeja', { ...d, estado: 'aprobado', gasto: alta.gasto.id });
    else await redis.hdel(clave(u, 'bandeja'), id);
    const emp = banco && !sinFuncion(u.plan, 'revision') ? await emparejar(u, String(banco), 'gasto', alta.gasto.id) : null;
    await secundarios(u, { gastos: [alta.gasto.id], meses: [alta.gasto.fecha] });
    // Quien manda una factura que se aprueba deja de ser desconocido: lo siguiente suyo ya no queda en cuarentena.
    if (d.correo?.de) await recordar(u, d.correo.de).catch(() => {});
    return { gasto: alta.gasto, ...(emp?.error ? { aviso: `Gasto guardado, pero sin emparejar con el banco: ${emp.error}` } : {}) };
  } finally {
    await redis.del(cerrojo).catch(() => {});
  }
}

// Los datos del formulario a partir de la propuesta, para aprobar sin abrir la factura.
export const datosDe = (d) => {
  const p = d.propuesta || {};
  const { cuadra: _c, avisos: _a, fechaDudosa: _f, desglose, ...resto } = p;
  return { ...resto, base: String(p.base), irpfPct: p.irpfPct || 0, ...(desglose?.length > 1 ? { porTipo: desglose } : {}), ...(d.banco ? { banco: d.banco.id } : {}) };
};

// «Aprobar las que cuadran»: solo las que cuadran (lib/bandeja.js cuadra), una a una; las demás se quedan.
export async function aprobarVarias(u, ids) {
  const hechas = [], fallidas = [];
  for (const id of [...new Set(ids)].filter(idValido).slice(0, MAX_BANDEJA)) {
    const d = await leerUno(u, 'bandeja', id);
    if (!cuadra(d)) continue;
    const r = await aprobar(u, id, datosDe(d));
    if (r.error) fallidas.push({ id, error: r.duplicados?.length ? 'Puede que ya esté apuntada' : r.error });
    else hechas.push(r.gasto.id);
  }
  return { hechas, fallidas };
}

export async function descartar(u, id) {
  const d = idValido(id) && (await leerUno(u, 'bandeja', id));
  if (!d) return { error: 'Esta factura ya no está en la bandeja', status: 404 };
  if (!(await redis.hdel(clave(u, 'bandeja'), id))) return { ok: true };
  // Una aprobada sola ya es de su gasto: se quita de la lista, pero el archivo se queda.
  if (d.estado !== 'aprobado') await borrarJustificantes(u, [d.archivo]);
  return { ok: true };
}

// Leer otra vez (tras un error) o leer una de cuarentena.
export async function releer(u, id) {
  const d = idValido(id) && (await leerUno(u, 'bandeja', id));
  if (!d) return { error: 'Esta factura ya no está en la bandeja', status: 404 };
  if (!['error', 'cuarentena', 'revisar'].includes(d.estado)) return { error: 'Ahora no se puede volver a leer', status: 409 };
  await guardar(u, 'bandeja', { ...d, estado: 'leyendo', leyendoDesde: undefined, error: undefined, recibido: d.recibido });
  if (esXml(d.archivo)) await leerDocumento(u, id);
  else await encolarLectura(u, id);
  return { ok: true };
}

// «Permitir siempre a este remitente»: se apunta como conocido y se leen todas sus facturas en cuarentena.
export async function permitir(u, id) {
  const d = idValido(id) && (await leerUno(u, 'bandeja', id));
  if (!d?.correo?.de) return { error: 'Esta factura no ha llegado por correo', status: 400 };
  await recordar(u, d.correo.de);
  const suyas = ((await leer(u, 'bandeja')) || []).filter((x) => x.estado === 'cuarentena' && x.correo?.de === d.correo.de);
  for (const x of suyas) await releer(u, x.id);
  return { ok: true, leidas: suyas.length };
}

// Proveedores de confianza (los marca cada empresa en la página del proveedor): sus facturas que cuadran se aprueban solas
// al leerlas y quedan un mes en la bandeja como «aprobadas solas», para poder deshacerlo.
//   proveedoresConfianza:<empresa>   hash clave del proveedor → { id, proveedor, proveedorNif, desde, por }
export async function deConfianza(u, p) {
  const lista = (await leer(u, 'proveedoresConfianza')) || [];
  return lista.find((c) => mismoProveedor(c, p)) || null;
}

export async function ponerConfianza(u, { clave: id, proveedor, proveedorNif }, activo) {
  const k = String(id || '').slice(0, 120);
  if (!k) return { error: 'Falta el proveedor' };
  if (!activo) { await redis.hdel(clave(u, 'proveedoresConfianza'), k); return { ok: true }; }
  await guardar(u, 'proveedoresConfianza', { id: k, proveedor: String(proveedor || '').slice(0, 80), proveedorNif: String(proveedorNif || '').toUpperCase().slice(0, 20), desde: ahora(), por: u.id });
  return { ok: true };
}

async function aprobarSiConfianza(u, id) {
  const d = await leerUno(u, 'bandeja', id);
  if (!cuadra(d) || !(await deConfianza(u, d.propuesta))) return null;
  const r = await aprobar(u, id, datosDe(d), { sola: true });
  return r.error ? null : r.gasto.id;
}

// Deshacer una aprobada sola: se borra el gasto (el archivo se queda) y la factura vuelve a «por revisar».
export async function deshacer(u, id) {
  const d = idValido(id) && (await leerUno(u, 'bandeja', id));
  if (!d || d.estado !== 'aprobado') return { error: 'Esta factura no se aprobó sola', status: 409 };
  const r = await borrarGasto(u, d.gasto);
  if (r.error) return r;
  // Si el gasto ya se había borrado (y con él su archivo), no queda nada que revisar.
  if (!r.antes) { await redis.hdel(clave(u, 'bandeja'), id); return { ok: true }; }
  await guardar(u, 'bandeja', { ...d, estado: 'revisar', gasto: undefined, banco: undefined });
  await secundarios(u, { meses: [r.antes.fecha] });
  return { ok: true };
}
