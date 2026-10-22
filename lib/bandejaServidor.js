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
import { conLoHabitual, habitualDe } from './proveedorHabitual.js';
import { posiblesDuplicados } from './duplicados.js';
import { candidatosDuplicados, crearGasto } from './gastosServidor.js';
import { nuevoGasto } from './gastoCuerpo.js';
import { sugerencias } from './banco.js';
import { emparejar } from './bancoServidor.js';
import { sinFuncion } from './planes.js';
import { hoy } from './formato.js';

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
export async function recibirArchivo(u, bytes, { nombre, origen = 'subida', por, correo, cuarentena = false } = {}) {
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
    propuesta = propuestaDeTicket(r.gasto);
  }
  await completar(u, d, propuesta);
  return { leido: true };
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
  const doc = { id: '__bandeja', fecha: p.fecha || hoy(), base: p.base, ivaPct: p.ivaPct, irpfPct: p.irpfPct || 0, ...(p.alquiler ? { alquiler: true } : {}),
    ...(p.desglose ? { porTipo: p.desglose } : {}), proveedor: p.proveedor, concepto: p.concepto, numero: p.numero, ...(p.pendiente ? { pendiente: true } : {}) };
  const s = sugerencias(cargos, [], [doc]);
  const m = cargos.find((x) => s[x.id]?.tipo === 'gasto' && s[x.id].id === '__bandeja' && !s[x.id].motivo);
  return m ? { id: m.id, fecha: m.fecha, importe: m.importe, concepto: String(m.contraparte || m.concepto || '').slice(0, 120) } : null;
}

// Aprobar: el gasto con los datos revisados (las mismas comprobaciones que /api/gastos) y el archivo del documento.
// → { gasto, aviso? } o { error, errores?, duplicados?, status }.
export async function aprobar(u, id, datos, { duplicadoConfirmado = false } = {}) {
  if (!idValido(id)) return { error: 'Esta factura ya no está en la bandeja', status: 404 };
  const d = await leerUno(u, 'bandeja', id);
  if (!d) return { error: 'Esta factura ya no está en la bandeja', status: 404 };
  if (d.estado === 'leyendo') return { error: 'Aún se está leyendo. Espera unos segundos.', status: 409 };
  if (d.estado === 'aprobado') return { error: 'Ya está aprobada', status: 409 };
  const { huella, banco, ...resto } = datos || {};
  const v = nuevoGasto(u, resto);
  if (v.error) return v;
  const g = { ...v.gasto, archivo: d.archivo };
  // Quien quita el documento de la bandeja es quien crea el gasto: dos aprobaciones a la vez no crean dos.
  if (!(await redis.hdel(clave(u, 'bandeja'), id))) return { error: 'Esta factura ya se ha aprobado', status: 409 };
  let alta;
  try { alta = await crearGasto(u, g, { duplicadoConfirmado: duplicadoConfirmado === true }); } catch (e) { await guardar(u, 'bandeja', d); throw e; }
  if (alta.error) { await guardar(u, 'bandeja', d); return { ...alta, status: 409 }; }
  const emp = banco && !sinFuncion(u.plan, 'revision') ? await emparejar(u, String(banco), 'gasto', alta.gasto.id) : null;
  await secundarios(u, { gastos: [alta.gasto.id], meses: [alta.gasto.fecha] });
  return { gasto: alta.gasto, ...(emp?.error ? { aviso: `Gasto guardado, pero sin emparejar con el banco: ${emp.error}` } : {}) };
}

// Los datos del formulario a partir de la propuesta, para aprobar sin abrir la factura.
export const datosDe = (d) => {
  const p = d.propuesta || {};
  const { cuadra: _c, avisos: _a, fechaDudosa: _f, desglose: _d, ...resto } = p;
  return { ...resto, base: String(p.base), irpfPct: p.irpfPct || 0, ...(d.banco ? { banco: d.banco.id } : {}) };
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
