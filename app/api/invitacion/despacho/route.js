import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { cambiarUsuario, usuarioActual } from '@/lib/auth';
import { aceptarInvitacionDespacho } from '@/lib/despachos';

export const dynamic = 'force-dynamic';

// Invitación a un despacho para quien ya tenía cuenta (api/despacho/equipo). Abrir el enlace no cambia nada: lleva a la
// página que la enseña (app/invitacion/despacho), y solo se acepta con su botón (POST, con la protección de origen de
// proxy.js), con la sesión de esa misma persona y una sola vez. Va bajo api/invitacion (pública) para que sin sesión
// lleve a entrar.
export async function GET(req) {
  const c = String(req.nextUrl.searchParams.get('c') || '');
  return NextResponse.redirect(new URL(`/invitacion/despacho?c=${encodeURIComponent(c)}`, req.url), 303);
}

export async function POST(req) {
  const ir = (q) => NextResponse.redirect(new URL(q, req.url), 303);
  const form = await req.formData().catch(() => null);
  const codigo = String(form?.get('c') || '');
  if (!redis || !codigo) return ir('/');
  const u = await usuarioActual();
  if (!u) return ir('/login?error=' + encodeURIComponent('Entra con tu cuenta y vuelve a abrir el enlace de la invitación.'));
  const r = await aceptarInvitacionDespacho(codigo, u.id, cambiarUsuario);
  return ir(r.error ? `/invitacion/despacho?c=${encodeURIComponent(codigo)}&error=1` : '/despacho');
}
