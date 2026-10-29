// Documentos de los clientes «solo documentos» en el servidor (el modelo, en lib/documentos.js). Como la bandeja de
// facturas (lib/bandejaServidor.js): el archivo va al almacén de justificantes desde que llega y la lectura con IA va por
// la cola de trabajos (tarea 'leer-documento'), con el tope de páginas del cliente (lib/cuotasIA.js, plan 'doc').
// u: el cliente (su sesión, la de la cola o el contexto de la gestoría, lib/panelDespacho.js contextoCliente).
import { randomBytes, randomUUID } from 'node:crypto';
import { redis, leer, leerUno, guardar, borrar } from './redis.js';
import { borrarJustificantes, huellaDe, leerJustificante, subirJustificante, tipoReal } from './justificantes.js';
import { encolar, procesarLuego } from './trabajos.js';
import { leerConCupo } from './lecturaIA.js';
import { MAX_BYTES_IA } from './cuotasIA.js';
import { hoy } from './formato.js';
import { conCerrojo } from './cerrojo.js';
import { cambiarUsuario, crearUsuario, limpiarEmail } from './auth.js';
import { conMembresia } from './membresias.js';
import { crearBuzon, recordar } from './buzon.js';
import { despachoDe, MAX_CLIENTES } from './despachos.js';
import { nuevoPlan } from './prueba.js';
import { gratisDe, panelActivo } from './panelDocumentos.js';
import { generarAsientos } from './asientos.js';
import { exportarDiario } from './contabilidad.js';
import { nombreDiario } from './diarioContable.js';
import { aContabilidad, avisosDe, delTrimestre, documentoDeLectura, esSoloDocumentos, idValido, limpiarDatos, MAX_DOCUMENTOS, TIPOS } from './documentos.js';
import { nombreArchivo } from './bandeja.js';

export const nuevoId = () => `d${randomBytes(8).toString('hex')}`;
const ahora = () => new Date().toISOString();
const LECTURA_CORTADA_MS = 3 * 60e3;
const EN_COLA_MS = 30 * 60e3;
export const LECTURA = 'Tu gestoría ha pausado la recepción de documentos en Fisquo. Puedes ver lo que ya enviaste, pero no subir nada nuevo.';

// ¿Puede el cliente subir documentos? Si sigue con su despacho y el despacho tiene el panel de pago activo (o en prueba),
// o si es de sus GRATIS primeros clientes (lib/tarifasDocumentos.js). Si no, solo lectura: la gestoría sigue viendo y
// exportando lo que hay.
export async function abiertoPara(e) {
  if (!esSoloDocumentos(e) || e.baja || e.despachoCliente?.id !== e.documentos.despacho) return false;
  const d = await despachoDe(e.documentos.despacho);
  if (!d) return false;
  return panelActivo(d) || (await gratisDe(d)).includes(e.id);
}

// Los documentos con sus avisos al día (los duplicados dependen de los demás). De paso, da por fallidas las lecturas
// que se quedaron colgadas, como la bandeja.
export async function documentosDe(u, t = Date.now()) {
  const docs = (await leer(u, 'documentos')) || [];
  for (const d of docs) {
    if (d.estado !== 'leyendo') continue;
    const cortada = d.leyendoDesde && t - Date.parse(d.leyendoDesde) > LECTURA_CORTADA_MS;
    const olvidada = !d.leyendoDesde && t - Date.parse(d.recibido) > EN_COLA_MS;
    if (!cortada && !olvidada) continue;
    Object.assign(d, { estado: 'error', error: cortada ? 'La lectura se interrumpió. Vuelve a leerlo o complétalo a mano.' : 'No se ha podido leer todavía. Vuelve a intentarlo o complétalo a mano.', leyendoDesde: undefined });
    await guardar(u, 'documentos', d);
  }
  return docs.map((d) => ({ ...d, avisos: avisosDe(d, docs) }));
}

export async function encolarLectura(u, id) {
  await encolar(u, { id: `leer-documento:${id}`, tipo: 'leer-documento', datos: { doc: id } });
  procesarLuego(u);
}
export async function adelantarLecturas(u, docs) {
  if (!docs.some((d) => d.estado === 'leyendo')) return;
  if (await redis.set(`documentos-tanda:${u.empresa}`, '1', { nx: true, ex: 15 })) procesarLuego(u);
}

// Entra un archivo (subido o reenviado por correo) → { doc, repetido? } o { error, status }. Solo fotos y PDF.
export async function recibirDocumento(u, bytes, { nombre, origen = 'subida', por, correo, cuarentena = false } = {}) {
  if (!tipoReal(bytes)) return { error: 'Sube una foto (JPG, PNG o WebP) o un PDF.', status: 400 };
  return conCerrojo(`documentos:${u.empresa}`, async () => {
    const docs = (await leer(u, 'documentos')) || [];
    const huella = huellaDe(bytes);
    const igual = docs.find((d) => d.archivo?.huella === huella);
    if (igual) return { doc: igual, repetido: true };
    if (docs.length >= MAX_DOCUMENTOS) return { error: 'Ya hay demasiados documentos guardados. Pide a tu gestoría que revise los antiguos.', status: 409 };
    const id = nuevoId();
    const s = await subirJustificante(u, id, bytes);
    if (s.error) return s;
    const doc = { id, recibido: ahora(), origen, nombre: nombreArchivo(nombre), archivo: s.archivo, estado: cuarentena ? 'cuarentena' : 'leyendo', ...(por ? { por } : {}), ...(correo ? { correo } : {}) };
    await guardar(u, 'documentos', doc);
    return { doc, nuevo: true };
  }, { caduca: 15000, espera: 10000 }).then(async (r) => {
    if (r.nuevo && r.doc.estado === 'leyendo') await encolarLectura(u, r.doc.id);
    return r;
  });
}

const fallo = (u, d, error) => guardar(u, 'documentos', { ...d, estado: 'error', error, leyendoDesde: undefined });

// La tarea de la cola: lee el documento con IA y lo deja «por revisar» con lo leído, ya clasificado.
export async function leerDocumento(u, id) {
  const d = await leerUno(u, 'documentos', id);
  if (!d || d.estado !== 'leyendo') return { nada: true };
  if (d.leyendoDesde) { await fallo(u, d, 'La lectura se interrumpió. Vuelve a leerlo o complétalo a mano.'); return { cortada: true }; }
  const bytes = await leerJustificante(u, d.archivo);
  if (!bytes) { await fallo(u, d, 'No se encuentra el archivo. Vuelve a subirlo.'); return { error: true }; }
  if (bytes.length > MAX_BYTES_IA) { await fallo(u, d, 'Es demasiado grande para leerlo con IA (máx. 3 MB): complétalo a mano.'); return { error: true }; }
  await guardar(u, 'documentos', { ...d, leyendoDesde: ahora() });
  const r = await leerConCupo(u, bytes.toString('base64'), d.archivo.tipo, { documento: true });
  if (r.ocupado) { await guardar(u, 'documentos', d); throw new Error(r.error); }
  if (r.error) { await fallo(u, d, r.sinCupo ? 'Se han acabado las lecturas con IA de este mes: complétalo a mano.' : r.error); return { error: true }; }
  const leido = documentoDeLectura(r.gasto, r.documento, u);
  const actual = await leerUno(u, 'documentos', id);
  if (!actual) return { nada: true };
  await guardar(u, 'documentos', { ...actual, estado: 'revisar', ...leido, leyendoDesde: undefined, error: undefined, paginas: r.paginas });
  return { leido: true };
}

// Cambios en un documento, releído bajo su cerrojo: fn(doc) → doc nuevo o { error }.
async function cambiar(u, id, fn) {
  if (!idValido(id)) return { error: 'Ese documento no existe', status: 404 };
  return conCerrojo(`documento:${u.empresa}:${id}`, async () => {
    const d = await leerUno(u, 'documentos', id);
    if (!d) return { error: 'Ese documento no existe', status: 404 };
    const r = await fn(d);
    if (r.error || r.errores) return r;
    await guardar(u, 'documentos', r);
    return { doc: r };
  }, { caduca: 15000, espera: 10000 });
}

// La gestoría corrige lo leído (o lo completa a mano si no se pudo leer). tipo: 'gasto' | 'ingreso'.
export const corregir = (u, id, b, quien) => cambiar(u, id, (d) => {
  if (d.estado === 'leyendo' || d.estado === 'cuarentena') return { error: 'Espera a que se lea el documento', status: 409 };
  const tipo = TIPOS[b.tipo] ? b.tipo : d.tipo || 'gasto';
  const base = d.datos || { tercero: '', nif: '', fecha: '', numero: '', concepto: '', base: null, ivaPct: 21, cuota: null, irpf: null, irpfPct: 0, total: null, categoria: tipo === 'ingreso' ? '705' : '629' };
  const cambioTipo = tipo !== d.tipo && b.categoria === undefined;
  const r = limpiarDatos({ ...b, ...(cambioTipo ? { categoria: tipo === 'ingreso' ? '705' : '629' } : {}) }, base);
  if (r.errores) return { errores: r.errores, error: 'Revisa los datos marcados' };
  return { ...d, tipo, datos: r.datos, corregido: { fecha: ahora(), por: quien.id, nombre: quien.nombre }, estado: d.estado === 'error' ? 'revisar' : d.estado, error: undefined };
});

export const marcarRevisado = (u, id, quien, si = true) => cambiar(u, id, (d) => {
  if (!d.datos) return { error: 'Completa antes sus datos', status: 409 };
  return si ? { ...d, estado: 'revisado', revisado: { fecha: ahora(), por: quien.id, nombre: quien.nombre } } : { ...d, estado: 'revisar', revisado: undefined };
});

export async function releer(u, id) {
  const r = await cambiar(u, id, (d) => (['error', 'revisar', 'cuarentena'].includes(d.estado) ? { ...d, estado: 'leyendo', leyendoDesde: undefined, error: undefined } : { error: 'Este documento no se puede volver a leer', status: 409 }));
  if (r.doc) await encolarLectura(u, id);
  return r;
}

// Por correo de alguien desconocido: se lee y su remitente queda como conocido.
export async function permitir(u, id) {
  const r = await cambiar(u, id, (d) => (d.estado === 'cuarentena' ? { ...d, estado: 'leyendo' } : { error: 'Este documento ya está permitido', status: 409 }));
  if (r.doc) {
    if (r.doc.correo?.de) await recordar(u, r.doc.correo.de);
    await encolarLectura(u, id);
  }
  return r;
}

// Borrar un documento (y su archivo). soloSiSinRevisar: el cliente puede quitar lo que subió mientras la gestoría no lo
// ha revisado.
export async function descartar(u, id, { soloSiSinRevisar = false } = {}) {
  if (!idValido(id)) return { error: 'Ese documento no existe', status: 404 };
  return conCerrojo(`documento:${u.empresa}:${id}`, async () => {
    const d = await leerUno(u, 'documentos', id);
    if (!d) return { error: 'Ese documento no existe', status: 404 };
    if (soloSiSinRevisar && d.estado === 'revisado') return { error: 'Tu gestoría ya lo ha revisado: pídele que lo quite ella.', status: 409 };
    await borrar(u, 'documentos', id);
    if (d.archivo?.clave) await borrarJustificantes(u, [d.archivo]).catch(() => {});
    return { ok: true, doc: d };
  }, { caduca: 15000, espera: 10000 });
}

export async function archivoDe(u, id) {
  const d = idValido(id) && (await leerUno(u, 'documentos', id));
  if (!d?.archivo?.clave) return null;
  const datos = await leerJustificante(u, d.archivo);
  return datos ? { datos, doc: d } : null;
}

// ---- Exportación del trimestre: los revisados, en el formato del programa de la gestoría (como app/api/despacho/contable).
export function diarioDocumentos(u, docs, { anio, t, formato, codigo = 1, digitos = 8, fecha = hoy() }) {
  const revisados = delTrimestre(docs, anio, t).filter((d) => d.estado === 'revisado');
  const { facturas, gastos } = aContabilidad(revisados);
  const fiscal = u.fiscal || {};
  const asientos = generarAsientos({ facturas, gastos, fiscal }, fecha);
  // El nombre del archivo es el que espera cada programa (SUENLACE.DAT, APU.ods…).
  return { nombre: nombreDiario(formato, anio), contenido: exportarDiario(asientos, { anio, formato, codigo, digitos, fecha, sinCierre: true, iva: { facturas, gastos, fiscal, productos: [] } }), n: revisados.length };
}

// ---- Alta (la hace el despacho, con la suscripción del panel activa: lo comprueba la ruta).
// → { empresa, usuario, codigo } o { error, status }. El cliente entra con la invitación (app/invitacion/[codigo]).
export async function altaSoloDocumentos(d, quien, { nombre, nif = '', email, contacto, tipo = 'autonomo' }) {
  nombre = String(nombre || '').trim().slice(0, 80);
  const correo = limpiarEmail(email);
  if (!nombre) return { error: 'Falta el nombre del cliente' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: 'Escribe un email válido' };
  if (await redis.hget('emails', correo)) return { error: 'Ese email ya tiene cuenta en Fisquo. Si lleva sus cuentas en Fisquo, pídele que te dé acceso con tu código de despacho.', status: 409 };
  if ((await redis.scard(`despacho-clientes:${d.id}`)) >= MAX_CLIENTES) return { error: 'Tu despacho ya no admite más clientes', status: 409 };
  const id = randomUUID().slice(0, 8);
  const desde = ahora();
  const r = await crearUsuario({ nombre: String(contacto || nombre).trim().slice(0, 60), email: correo, empresa: id, rol: 'miembro', permisos: [] });
  if (r.error) return { error: r.error, status: 409 };
  const empresa = {
    id, nombre, creada: desde, emisor: { nombre, nif: String(nif || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) },
    fiscal: { tipo: tipo === 'sociedad' ? 'sociedad' : 'autonomo' }, plan: { tipo: 'doc', nombre: 'Documentos' },
    documentos: { despacho: d.id, desde, usuario: r.usuario.id, por: quien.id },
    despachoCliente: { id: d.id, nombre: d.nombre, desde, por: 'despacho', aceptado: desde, soloDocumentos: true },
  };
  await redis.multi().hset('empresas', { [id]: empresa }).sadd(`despacho-clientes:${d.id}`, id).exec();
  // Su dirección para reenviar facturas, con su propio email ya como remitente conocido.
  const ctx = { empresa: id, id: r.usuario.id, empresaNombre: nombre };
  await crearBuzon(ctx).then(() => recordar(ctx, correo)).catch((e) => console.warn('[documentos] buzón', e.message));
  return { empresa: (await redis.hget('empresas', id)) || empresa, usuario: r.usuario, codigo: r.codigo };
}

// Pasa a Fisquo completo: deja de ser «solo documentos» (y de contar para el tramo del panel) y empieza su prueba con el
// cuestionario, con su persona de administradora. Sus documentos se quedan donde están: los sigue viendo en /documentos y
// la gestoría en su ficha.
export async function pasarACompleto(empresaId, despachoId) {
  const r = await conCerrojo(`despacho-cliente:${empresaId}`, async () => {
    const e = await redis.hget('empresas', String(empresaId));
    if (!esSoloDocumentos(e) || e.documentos.despacho !== despachoId) return { error: 'Ese cliente no es «solo documentos» de tu despacho', status: 404 };
    const { documentos: doc, ...resto } = e;
    const { soloDocumentos: _s, ...vinculo } = e.despachoCliente || {};
    const tipo = e.fiscal?.tipo === 'sociedad' ? 'pym' : 'aut';
    const nueva = { ...resto, despachoCliente: vinculo, plan: nuevoPlan(tipo, 'Plus'), pendiente: true, documentosAntes: { desde: doc.desde, hasta: ahora() } };
    await redis.hset('empresas', { [e.id]: nueva });
    return { empresa: nueva, usuario: doc.usuario };
  }, { caduca: 15000, espera: 10000 });
  if (r.error) return r;
  if (r.usuario) await cambiarUsuario(r.usuario, (x) => conMembresia(x, empresaId, { rol: 'admin' }));
  return r;
}

// Invitación nueva para quien aún no ha elegido su contraseña (la anterior deja de valer). → código o null.
export async function nuevaInvitacion(uid) {
  const codigo = randomBytes(18).toString('base64url');
  const sigue = await cambiarUsuario(uid, async (x) => {
    if (x.pass) return null;
    const todas = (await redis.hgetall('invitaciones')) || {};
    const viejas = Object.keys(todas).filter((c) => String(todas[c]) === String(uid));
    if (viejas.length) await redis.hdel('invitaciones', ...viejas);
    await redis.hset('invitaciones', { [codigo]: uid });
    return { ...x, creado: new Date().toISOString() };
  });
  return sigue ? codigo : null;
}

// Los clientes «solo documentos» del despacho para su pantalla: con si ya entraron y cuántos documentos tienen.
export async function clientesDocumentos(d, visibles) {
  const lista = visibles.filter((x) => esSoloDocumentos(x.empresa) && x.empresa.documentos.despacho === d.id);
  if (!lista.length) return [];
  const uids = lista.map((x) => x.empresa.documentos.usuario).filter(Boolean);
  const usuarios = uids.length ? await redis.hmget('usuarios', ...uids) : [];
  const porId = Object.fromEntries((Array.isArray(usuarios) ? usuarios : uids.map((id) => usuarios?.[id])).filter(Boolean).map((x) => [x.id, x]));
  const cuentas = await Promise.all(lista.map((x) => redis.hlen(`documentos:${x.id}`).catch(() => 0)));
  return lista.map((x, i) => {
    const p = porId[x.empresa.documentos.usuario];
    return { id: x.id, nombre: x.empresa.nombre, nif: x.empresa.emisor?.nif || '', desde: x.empresa.documentos.desde, documentos: Number(cuentas[i]) || 0, contacto: p ? { nombre: p.nombre, email: p.email, pendiente: !p.pass && !p.social } : null };
  });
}
