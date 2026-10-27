// Entrada a las pantallas de Mi despacho (app/despacho): como lib/auth.js requerir, sin mandar a la bienvenida de la
// empresa propia (el despacho trabaja aunque no la haya configurado). Sin despacho, a su primera pantalla.
import { redirect } from 'next/navigation';
import { redis } from './redis.js';
import { bloquearPorEmail, exigirDesbloqueo, usuarioActual } from './auth.js';
import { despachoDe, puedeVerCliente, rolEn } from './despachos.js';
import { inicioDe } from './permisos.js';
import { contextoCliente } from './panelDespacho.js';

export async function requerirDespacho({ titular = false } = {}) {
  const u = await usuarioActual();
  if (!u) redirect('/login');
  await exigirDesbloqueo(u);
  if (bloquearPorEmail(u)) redirect('/confirmar-email');
  const d = await despachoDe(u.despacho);
  const rol = rolEn(d, u.id);
  if (!rol) redirect(inicioDe({ ...u, despacho: null }));
  if (titular && rol !== 'titular') redirect('/despacho');
  return { u, d, rol, quien: { ...u, despachoNombre: d.nombre } };
}

// Un cliente que esta persona puede ver; si no, al panel.
export async function requerirCliente(empresaId) {
  const r = await requerirDespacho();
  const e = empresaId && (await redis.hget('empresas', String(empresaId)));
  if (!e || !puedeVerCliente(r.d, r.u.id, e)) redirect('/despacho');
  return { ...r, e, ctx: contextoCliente(r.u, r.d, e) };
}
