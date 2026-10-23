// Comprobaciones comunes de las rutas de Mi despacho (app/api/despacho): la persona tiene que ser del despacho y, para
// lo de un cliente, poder verlo (lib/despachos.js puedeVerCliente). Se mira en cada petición, contra lo guardado.
import { redis } from './redis.js';
import { error, usuarioApi } from './api.js';
import { despachoDe, puedeVerCliente, rolEn } from './despachos.js';
import { contextoCliente } from './panelDespacho.js';

// → { u, d, rol } o { res }. titular: solo quien dirige el despacho.
export async function miDespacho({ titular = false } = {}) {
  const { u, res } = await usuarioApi();
  if (res) return { res };
  const d = await despachoDe(u.despacho);
  const rol = rolEn(d, u.id);
  if (!rol) return { res: error('No perteneces a ningún despacho', 403) };
  if (titular && rol !== 'titular') return { res: error('Solo el titular del despacho puede hacer esto', 403) };
  return { u, d, rol, quien: { ...u, despachoNombre: d.nombre } };
}

// Un cliente del despacho que esta persona puede ver: → { u, d, rol, quien, e, ctx } o { res }.
export async function clienteDelDespacho(empresaId, opciones) {
  const r = await miDespacho(opciones);
  if (r.res) return r;
  const e = empresaId && (await redis.hget('empresas', String(empresaId)));
  if (!e || !puedeVerCliente(r.d, r.u.id, e)) return { res: error('Ese cliente no es de tu despacho o no lo tienes asignado', 404) };
  return { ...r, e, ctx: contextoCliente(r.u, r.d, e) };
}

export const periodoDe = (anio, t, hoy) => {
  const a = Number(anio), q = Number(t);
  if (Number.isInteger(a) && a >= 2000 && a <= 2100 && [1, 2, 3, 4].includes(q)) return { anio: a, t: q };
  // Por defecto, el último trimestre terminado (en enero, el 4T del año anterior).
  const y = Number(hoy.slice(0, 4)), actual = Math.ceil(Number(hoy.slice(5, 7)) / 3);
  return actual === 1 ? { anio: y - 1, t: 4 } : { anio: y, t: actual - 1 };
};
