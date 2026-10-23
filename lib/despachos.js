// Despachos: las gestorías asociadas que llevan a sus clientes desde «Mi despacho» (app/despacho). Un despacho tiene su
// titular y sus gestores (cuentas normales de Fisquo con usuario.despacho = id) y su propia empresa en Fisquo, gratis.
// Un cliente (empresa) se une a un solo despacho, siempre con su consentimiento: al registrarse con el código del
// despacho o aceptándolo en Ajustes › Tu gestoría. Puede quitarle el acceso cuando quiera y deja de verlo al momento.
// Dentro de un cliente, la gente del despacho entra con el perfil Gestoría (lib/permisos.js) sin ser miembro de la empresa
// (lib/auth.js conEmpresa): el acceso se comprueba en cada petición contra la empresa y el despacho, no se guarda en la cuenta.
import { randomUUID } from 'node:crypto';
import { redis } from './redis.js';
import { conCerrojo } from './cerrojo.js';
import { PERFILES, limpiarPermisos } from './permisos.js';
import { normalizarCodigo } from './gestorias.js';

export const ROLES_DESPACHO = { titular: 'Titular', gestor: 'Gestor' };
// Lo que ve y hace el despacho dentro de un cliente: el perfil Gestoría (resumen, contabilidad, facturas, gastos, nóminas).
export const PERMISOS_DESPACHO = limpiarPermisos(PERFILES.find((p) => p.id === 'gestoria').permisos);
// Clientes que se pueden llevar: de sobra para un despacho grande, con tope para que el panel no se vuelva inmanejable.
export const MAX_CLIENTES = 2000;
const MAX_ACCESOS = 300;

const texto = (v, max) => String(v ?? '').trim().slice(0, max);
export const despachoDe = async (id) => (id ? (await redis.hget('despachos', String(id))) || null : null);
export const listarDespachos = async () => Object.values((await redis.hgetall('despachos')) || {});
export async function despachoPorCodigo(codigo) {
  const c = normalizarCodigo(codigo);
  const id = c && (await redis.hget('despacho-codigos', c));
  return id ? despachoDe(id) : null;
}
// Rol de una persona en su despacho: 'titular', 'gestor' o null.
export const rolEn = (d, uid) => (d && uid && d.miembros?.[uid]?.rol) || null;
export const miembrosDe = (d) => Object.entries(d?.miembros || {}).map(([id, m]) => ({ id, ...m }));
// Personas del despacho con su nombre y email (de su cuenta).
export async function equipoDe(d) {
  const m = miembrosDe(d);
  if (!m.length) return [];
  const cuentas = await redis.hmget('usuarios', ...m.map((x) => x.id));
  const lista = Array.isArray(cuentas) ? cuentas : m.map((x) => cuentas?.[x.id]);
  return m.map((x, i) => ({ id: x.id, rol: x.rol, desde: x.desde, nombre: lista[i]?.nombre || '', email: lista[i]?.email || '', pendiente: Boolean(lista[i] && !lista[i].pass) }));
}


// Alta de un despacho (la hace el administrador de Fisquo desde /admin). empresa: la empresa propia del despacho en
// Fisquo; titular: la cuenta de quien lo dirige. El código es el de la gestoría (lib/gestorias.js) si ya tenía uno.
export async function crearDespacho({ nombre, nif = '', email = '', codigo, titular, empresa }) {
  nombre = texto(nombre, 120);
  if (!nombre) return { error: 'Falta el nombre del despacho' };
  const c = normalizarCodigo(codigo);
  if (!c) return { error: 'El código debe tener entre 4 y 20 caracteres: letras A-Z, números o guion.' };
  if (!titular || !empresa) return { error: 'Falta la cuenta del titular' };
  const id = randomUUID().slice(0, 8);
  if (!(await redis.hsetnx('despacho-codigos', c, id))) return { error: 'Ese código ya es de otro despacho.' };
  const d = { id, nombre, nif: texto(nif, 20).toUpperCase(), email: texto(email, 254).toLowerCase(), codigo: c, empresa, creado: new Date().toISOString(), miembros: { [titular]: { rol: 'titular', desde: new Date().toISOString() } }, soloAsignados: false };
  await redis.hset('despachos', { [id]: d });
  return { despacho: d };
}

// Cambios en la ficha del despacho, releída bajo su cerrojo (dos titulares a la vez no se pisan).
export async function cambiarDespacho(id, fn) {
  return conCerrojo(`despacho:${id}`, async () => {
    const d = await despachoDe(id);
    if (!d) return { error: 'Ese despacho ya no existe', status: 404 };
    const r = await fn(d);
    if (!r || r.error) return r || { despacho: d };
    await redis.hset('despachos', { [id]: r.despacho });
    return r;
  }, { caduca: 15000, espera: 10000 });
}

// Datos que el titular puede cambiar.
export function limpiarDatosDespacho(b = {}) {
  const out = {};
  if (b.nombre !== undefined) {
    out.nombre = texto(b.nombre, 120);
    if (!out.nombre) return { error: 'Falta el nombre del despacho' };
  }
  if (b.nif !== undefined) out.nif = texto(b.nif, 20).toUpperCase();
  if (b.email !== undefined) {
    out.email = texto(b.email, 254).toLowerCase();
    if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return { error: 'Escribe un email válido.' };
  }
  if (b.soloAsignados !== undefined) out.soloAsignados = b.soloAsignados === true;
  return { datos: out };
}

// ---- Clientes

export const clientesDe = async (despacho) => ((await redis.smembers(`despacho-clientes:${despacho}`)) || []).map(String);

// Lo que la empresa guarda de su despacho (empresa.despachoCliente). gestor: el de la cartera (si lo hay). licencia: el
// despacho paga su plan (lib/licencias.js).
const vinculo = (d, por) => ({ id: d.id, nombre: d.nombre, desde: new Date().toISOString(), por });

// Une una empresa a un despacho. por: 'codigo' (se registró con su código) o 'cliente' (lo aceptó en Ajustes).
// Una empresa tiene como mucho un despacho: para cambiar, antes quita el anterior.
export async function unirCliente(empresaId, despacho, por = 'cliente') {
  const d = typeof despacho === 'object' ? despacho : await despachoDe(despacho);
  if (!d) return { error: 'Ese despacho ya no existe', status: 404 };
  if (String(empresaId) === String(d.empresa)) return { error: 'Es la empresa del propio despacho' };
  return conCerrojo(`despacho-cliente:${empresaId}`, async () => {
    const e = await redis.hget('empresas', String(empresaId));
    if (!e || e.baja) return { error: 'Esa empresa ya no existe', status: 404 };
    if (e.despachoCliente?.id === d.id) return { empresa: e, ya: true };
    if (e.despachoCliente?.id) return { error: `Ya tienes como gestoría a ${e.despachoCliente.nombre}. Quítale antes el acceso.`, status: 409 };
    if ((await redis.scard(`despacho-clientes:${d.id}`)) >= MAX_CLIENTES) return { error: 'Este despacho ya no admite más clientes', status: 409 };
    const nueva = { ...e, despachoCliente: vinculo(d, por) };
    await redis.multi().hset('empresas', { [e.id]: nueva }).sadd(`despacho-clientes:${d.id}`, String(e.id)).exec();
    return { empresa: nueva };
  }, { caduca: 15000, espera: 10000 });
}

// Quita el acceso (lo hace el cliente o el despacho). ajustar(empresaSinVinculo, antes): lo que dependa del vínculo y
// cambie a la vez (el plan si el despacho pagaba la licencia: lib/licencias.js planSinLicencia).
export async function separarCliente(empresaId, despachoId, { ajustar = (x) => x } = {}) {
  return conCerrojo(`despacho-cliente:${empresaId}`, async () => {
    const e = await redis.hget('empresas', String(empresaId));
    const v = e?.despachoCliente;
    if (!v || (despachoId && v.id !== despachoId)) {
      if (despachoId) await redis.srem(`despacho-clientes:${despachoId}`, String(empresaId));
      return { error: 'Esa empresa no es cliente de este despacho', status: 404 };
    }
    const { despachoCliente: _, ...resto } = e;
    const sin = ajustar(resto, e);
    await redis.multi().hset('empresas', { [e.id]: sin }).srem(`despacho-clientes:${v.id}`, String(e.id)).exec();
    return { antes: e, empresa: sin };
  }, { caduca: 15000, espera: 10000 });
}

// Cambia algo del vínculo de un cliente (gestor de la cartera, licencia), bajo el mismo cerrojo que unir y separar.
// fn(vinculo, empresa) → { vinculo, plan? } o { error }.
export async function cambiarVinculo(empresaId, despachoId, fn) {
  return conCerrojo(`despacho-cliente:${empresaId}`, async () => {
    const e = await redis.hget('empresas', String(empresaId));
    if (!e?.despachoCliente || e.despachoCliente.id !== despachoId) return { error: 'Esa empresa no es cliente de este despacho', status: 404 };
    const r = await fn(e.despachoCliente, e);
    if (!r || r.error) return r || { empresa: e };
    const nueva = { ...e, despachoCliente: r.vinculo, ...(r.plan ? { plan: r.plan } : {}) };
    await redis.hset('empresas', { [e.id]: nueva });
    return { empresa: nueva, antes: e };
  }, { caduca: 15000, espera: 10000 });
}

// ¿Puede esta persona (cuenta con su despacho) entrar en esta empresa? Devuelve el despacho o null. Con soloAsignados,
// un gestor solo ve los clientes de su cartera; el titular, todos.
export function puedeVerCliente(d, uid, empresa) {
  const rol = rolEn(d, uid);
  if (!rol || !empresa || empresa.baja || empresa.despachoCliente?.id !== d.id) return false;
  return rol === 'titular' || !d.soloAsignados || empresa.despachoCliente.gestor === uid;
}
export async function accesoDespacho(u, empresa) {
  if (!u?.despacho || !empresa) return null;
  const d = await despachoDe(u.despacho);
  return d && puedeVerCliente(d, u.id, empresa) ? d : null;
}

// Los clientes que ve esta persona, con su empresa: [{ id, empresa }].
export async function clientesVisibles(d, uid) {
  const ids = await clientesDe(d.id);
  if (!ids.length) return [];
  const empresas = await redis.hmget('empresas', ...ids);
  const lista = Array.isArray(empresas) ? empresas : ids.map((id) => empresas?.[id]);
  return ids.map((id, i) => ({ id, empresa: lista[i] })).filter((x) => x.empresa && puedeVerCliente(d, uid, x.empresa));
}

// ---- Registro de accesos: lo que hace el despacho en las cuentas del cliente, para que el cliente lo vea en Ajustes ›
// Tu gestoría. Nunca bloquea la acción.

export async function registrarAcceso(empresaId, u, accion, detalle = '') {
  if (!redis || !empresaId) return;
  try {
    const k = `despacho-accesos:${empresaId}`;
    await redis.lpush(k, { fecha: new Date().toISOString(), quien: u?.id || '', nombre: texto(u?.nombre, 60), despacho: u?.despachoNombre || '', accion: texto(accion, 80), detalle: texto(detalle, 200) });
    await redis.ltrim(k, 0, MAX_ACCESOS - 1);
  } catch (e) { console.warn('[despacho]', e.message); }
}
// «Entró en tus cuentas» una vez al día por persona.
export async function registrarEntrada(empresaId, u, dia = new Date().toISOString().slice(0, 10)) {
  if (!redis || !empresaId || !u?.id) return;
  const nueva = await redis.set(`despacho-entrada:${empresaId}:${u.id}:${dia}`, 1, { nx: true, ex: 2 * 86400 }).catch(() => null);
  if (nueva) await registrarAcceso(empresaId, u, 'Entró en tus cuentas');
}
export const leerAccesos = async (empresaId, n = 100) => (redis ? (await redis.lrange(`despacho-accesos:${empresaId}`, 0, n - 1)) || [] : []);
