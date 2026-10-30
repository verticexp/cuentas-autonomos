import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { redis, clave, mismoId } from './redis.js';
import { puede, permisosDe, VERSION_PERMISOS } from './permisos.js';
import { membresias } from './membresias.js';
import { soloLectura } from './planes.js';
import { contarVentana, respuesta429 } from './limite.js';
import { conCerrojo } from './cerrojo.js';

export const ALCANCES = Object.freeze({
  'facturas:leer': 'facturas', 'facturas:escribir': 'facturar',
  'gastos:leer': 'gastos', 'clientes:leer': 'facturas',
});
export const hashClave = (valor) => createHash('sha256').update(valor).digest('hex');
export const generarClave = () => `fsq_${randomBytes(32).toString('base64url')}`;
export const alcancesDe = (u) => Object.keys(ALCANCES).filter((a) => puede(u, ALCANCES[a]));

export class ErrorApiPublica extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const jsonPublico = (datos, status = 200, headers = {}) => Response.json(datos, {
  status, headers: { 'Cache-Control': 'no-store', ...headers },
});
export const errorPublico = (mensaje, status = 400, headers) => jsonPublico({ error: mensaje }, status, headers);
// Nunca devuelve excepciones de Redis, URLs de conexión ni datos de la factura en errores inesperados.
export async function respuestaPublica(fn) {
  try { return await fn(); } catch (e) {
    return errorPublico(e instanceof ErrorApiPublica ? e.message : 'No se ha podido completar la operación', e instanceof ErrorApiPublica ? e.status : 503);
  }
}

export async function cuerpoPublico(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') || '')) throw new ErrorApiPublica('Envía un cuerpo JSON', 415);
  if (Number(req.headers.get('content-length')) > 131072) throw new ErrorApiPublica('El cuerpo es demasiado grande', 413);
  if (!req.body) throw new ErrorApiPublica('Falta el cuerpo JSON');
  const lector = req.body.getReader(), bloques = [];
  let tamano = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      tamano += value.byteLength;
      if (tamano > 131072) { await lector.cancel(); throw new ErrorApiPublica('El cuerpo es demasiado grande', 413); }
      bloques.push(value);
    }
  } finally { lector.releaseLock(); }
  let b;
  try { b = JSON.parse(Buffer.concat(bloques).toString('utf8')); } catch { throw new ErrorApiPublica('El cuerpo JSON no es válido'); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new ErrorApiPublica('El cuerpo debe ser un objeto JSON');
  return b;
}

export async function crearClave(u, { nombre, alcances } = {}) {
  if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 80) throw new ErrorApiPublica('Pon un nombre de hasta 80 caracteres');
  if (!Array.isArray(alcances) || !alcances.length || alcances.length > 4 || alcances.some((a) => !Object.hasOwn(ALCANCES, a))) throw new ErrorApiPublica('Elige alcances válidos');
  if (alcances.some((a) => !puede(u, ALCANCES[a]))) throw new ErrorApiPublica('No puedes conceder permisos que no tienes', 403);
  if ((await redis.hlen(clave(u, 'apiclaves'))) >= 10) throw new ErrorApiPublica('Puedes tener hasta 10 claves por empresa: revoca alguna que ya no uses');
  const valor = generarClave(), hash = hashClave(valor);
  const dato = { id: randomUUID(), empresa: String(u.empresa), uid: String(u.id), nombre: nombre.trim(), alcances: [...new Set(alcances)], creada: new Date().toISOString() };
  const visible = { ...dato, prefijo: valor.slice(0, 12), ultimoUso: null };
  await redis.multi().hset('apiclaves', { [hash]: dato }).hset(clave(u, 'apiclaves'), { [dato.id]: visible })
    .hset(clave(u, 'apiclaves-indice'), { [dato.id]: hash }).exec();
  return { ...visible, clave: valor };
}

export async function clavesDe(u) {
  return Object.values((await redis.hgetall(clave(u, 'apiclaves'))) || {}).map(({ id, empresa, uid, nombre, alcances, creada, prefijo, ultimoUso }) => ({ id, empresa, uid, nombre, alcances, creada, prefijo, ultimoUso }));
}

export async function revocarClave(u, id) {
  return conCerrojo(`apiclave:${id}`, async () => {
    const hash = await redis.hget(clave(u, 'apiclaves-indice'), id);
    if (!hash) return false;
    const dato = await redis.hget('apiclaves', hash);
    if (!dato || !mismoId(dato.empresa, u.empresa) || dato.id !== id) return false;
    await redis.multi().hdel('apiclaves', hash).hdel(clave(u, 'apiclaves'), id).hdel(clave(u, 'apiclaves-indice'), id).exec();
    return true;
  });
}

// Autenticación exclusivamente Bearer: no llama a usuarioActual ni consulta cookies.
export async function usuarioClave(req, { alcance, escritura = false } = {}) {
  const no = () => ({ res: errorPublico('Clave de API no válida', 401, { 'WWW-Authenticate': 'Bearer' }) });
  const m = /^Bearer (fsq_[A-Za-z0-9_-]{43})$/i.exec(req.headers.get('authorization') || '');
  if (!m || !m[1].startsWith('fsq_')) return no();
  if (!redis) return { res: errorPublico('Base de datos no conectada', 503) };
  const hash = hashClave(m[1]), k = await redis.hget('apiclaves', hash);
  if (!k) return no();
  const [persona, empresa] = await Promise.all([redis.hget('usuarios', k.uid), redis.hget('empresas', k.empresa)]);
  if (!persona || persona.baja || !empresa || empresa.baja) return { res: errorPublico('El creador ya no pertenece a esta empresa', 403) };
  // La sesión admite varias empresas. Se resuelve la membresía guardada, nunca la cookie de empresa activa.
  // Sin membresías múltiples, solo vale persona.empresa (la pertenencia simple de las cuentas anteriores).
  const multiples = persona.empresas && Object.keys(persona.empresas).length;
  const membresia = multiples ? membresias(persona)[k.empresa] : mismoId(persona.empresa, k.empresa) ? persona : null;
  if (!membresia) return { res: errorPublico('Sin acceso a esta empresa', 403) };
  const u = { ...persona, rol: membresia.rol || 'miembro', permisos: membresia.permisos || [], pv: membresia.pv, id: persona.id, empresa: k.empresa, plan: empresa.plan, emisor: empresa.emisor || {}, fiscal: empresa.fiscal, actividades: empresa.actividades, verifactu: empresa.verifactu, marca: empresa.marca, drive: empresa.drive, controlat: empresa.controlat };
  // Cuotas obligatorias incluso si LIMITES está en modo de observación para el resto de la app.
  for (const [ventana, max, segundos] of [['minuto', 120, 60], ['dia', 5000, 86400]]) {
    const contador = `limite:api:${ventana}:${k.id}`;
    if (await contarVentana(contador, segundos) > max) {
      const res = respuesta429(Math.max(1, await redis.ttl(contador)), 'Has alcanzado el límite de peticiones de esta clave');
      res.headers.set('Cache-Control', 'no-store');
      return { res };
    }
  }
  if (!Object.hasOwn(ALCANCES, alcance) || !k.alcances.includes(alcance) || !puede(u, ALCANCES[alcance])) return { res: errorPublico('La clave o su creador no tienen este permiso', 403) };
  if (escritura && soloLectura(u.plan)) return { res: errorPublico('El plan de la empresa está en modo solo lectura', 402) };
  // El mismo cerrojo que la revocación impide resucitar la ficha con una actualización tardía.
  const visible = await redis.hget(clave(u, 'apiclaves'), k.id);
  if (!visible) return no();
  if (!visible.ultimoUso || Date.now() - Date.parse(visible.ultimoUso) >= 60000) {
    await conCerrojo(`apiclave:${k.id}`, async ({ quedaMs }) => {
      const actual = await redis.hget(clave(u, 'apiclaves'), k.id);
      if (quedaMs() > 0 && actual && (!actual.ultimoUso || Date.now() - Date.parse(actual.ultimoUso) >= 60000)) await redis.hset(clave(u, 'apiclaves'), { [k.id]: { ...actual, ultimoUso: new Date().toISOString() } });
    });
  }
  // Los permisos de la clave son la intersección de sus alcances y los permisos actuales del creador.
  const deAlcances = new Set(k.alcances.map((a) => ALCANCES[a]).filter(Boolean));
  const uClave = { ...u, rol: 'miembro', permisos: permisosDe(u).filter((p) => deAlcances.has(p)), pv: VERSION_PERMISOS };
  return { u: uClave, apiClave: k };
}
