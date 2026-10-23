import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { cambiarUsuario, usuarioActual } from '@/lib/auth';
import { cambiarDespacho } from '@/lib/despachos';

export const dynamic = 'force-dynamic';

// Enlace del email que recibe quien ya tenía cuenta al ser invitado a un despacho (api/despacho/equipo). Solo lo acepta
// esa persona, con su sesión, y una sola vez.
export async function GET(req) {
  const ir = (q) => NextResponse.redirect(new URL(q, req.url), 303);
  const codigo = String(req.nextUrl.searchParams.get('c') || '');
  if (!redis || !codigo) return ir('/');
  const u = await usuarioActual();
  if (!u) return ir('/login?error=' + encodeURIComponent('Entra con tu cuenta y vuelve a abrir el enlace de la invitación.'));
  const inv = await redis.get(`union-despacho:${codigo}`);
  if (!inv || inv.usuario !== u.id) return ir('/?invitacion=caducada');
  if (!(await redis.del(`union-despacho:${codigo}`))) return ir('/?invitacion=caducada');
  const o = await cambiarUsuario(u.id, (x) => (x.despacho && x.despacho !== inv.despacho ? null : { ...x, despacho: inv.despacho }));
  if (!o) return ir('/?invitacion=caducada');
  const r = await cambiarDespacho(inv.despacho, (d) => ({ despacho: { ...d, miembros: { ...d.miembros, [u.id]: d.miembros?.[u.id] || { rol: inv.rol === 'titular' ? 'titular' : 'gestor', desde: new Date().toISOString() } } } }));
  return ir(r.error ? '/?invitacion=caducada' : '/despacho');
}
