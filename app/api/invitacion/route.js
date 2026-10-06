import { NextResponse } from 'next/server';
import { aceptarInvitacion, desbloqueo, opcionesCookie, opcionesDesbloqueo, tokenEmail } from '@/lib/auth';
import { enviarConfirmacion } from '@/lib/invitacion';

export async function POST(req) {
  const form = await req.formData();
  const codigo = String(form.get('codigo') || '');
  const r = await aceptarInvitacion(codigo, form.get('password'), form.get('v'));
  if (r.error) return NextResponse.redirect(new URL(`/invitacion/${codigo}?error=${encodeURIComponent(r.error)}`, req.url), 303);
  // Sin el enlace del email: se le manda uno para confirmarlo.
  if (!r.verificado) await enviarConfirmacion({ para: r.usuario.email, nombre: r.usuario.nombre, url: new URL(`/api/confirmar?t=${await tokenEmail(r.usuario.id)}`, req.url).toString() });
  const res = NextResponse.redirect(new URL('/ajustes', req.url), 303);
  res.cookies.set('t', r.token, opcionesCookie);
  res.cookies.set('d', await desbloqueo(r.token), opcionesDesbloqueo);
  res.cookies.set('recien', '1', { path: '/', maxAge: 60, sameSite: 'lax' }); // acaba de entrar: sin pantalla de bloqueo
  return res;
}
