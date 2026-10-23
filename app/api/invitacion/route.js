import { NextResponse } from 'next/server';
import { aceptarInvitacion, desbloqueo, opcionesCookie, opcionesDesbloqueo, tokenEmail } from '@/lib/auth';
import { enviarConfirmacion } from '@/lib/invitacion';
import { MUCHOS, ipDe, pasado } from '@/lib/limite';

export async function POST(req) {
  // Un formulario que no se puede leer no viene de la página de la invitación (el navegador siempre lo manda bien): 400.
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'No se ha podido leer el formulario. Abre de nuevo el enlace de invitación e inténtalo otra vez.' }, { status: 400 });
  const codigo = String(form.get('codigo') || '');
  // El límite, antes de comprobar el código; el aviso, en la misma invitación (sin el código no hay página a la que volver).
  if (await pasado('invitacion', ipDe(req), 30, 900)) return NextResponse.redirect(new URL(`/invitacion/${encodeURIComponent(codigo)}?error=${encodeURIComponent(MUCHOS)}`, req.url), 303);
  const r = await aceptarInvitacion(codigo, form.get('password'), form.get('v'));
  if (r.error) return NextResponse.redirect(new URL(`/invitacion/${encodeURIComponent(codigo)}?error=${encodeURIComponent(r.error)}`, req.url), 303);
  // Sin el enlace del email: se le manda uno para confirmarlo.
  if (!r.verificado) await enviarConfirmacion({ para: r.usuario.email, nombre: r.usuario.nombre, url: new URL(`/api/confirmar?t=${await tokenEmail(r.usuario.id)}`, req.url).toString() });
  // La gente de un despacho (lib/despachos.js) empieza en Mi despacho; el resto, en Ajustes.
  const res = NextResponse.redirect(new URL(r.usuario.despacho ? '/despacho' : '/ajustes', req.url), 303);
  res.cookies.set('t', r.token, opcionesCookie);
  res.cookies.set('d', await desbloqueo(r.token), opcionesDesbloqueo);
  res.cookies.set('recien', '1', { path: '/', maxAge: 60, sameSite: 'lax' }); // acaba de entrar: sin pantalla de bloqueo
  return res;
}
