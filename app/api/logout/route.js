import { NextResponse } from 'next/server';
import { borrarLlaves, cerrarSesion, cerrarSesiones, usuarioActual } from '@/lib/auth';

export async function POST(req) {
  // ?todas: «Cerrar sesión en todos los dispositivos» (Ajustes › Seguridad). También quita Face ID, las llaves y el
  // WhatsApp conectado, que entran sin contraseña: si alguien tuvo la sesión, no se queda con otra puerta.
  const u = req.nextUrl.searchParams.has('todas') && (await usuarioActual());
  if (u) { await cerrarSesiones(u.id); await borrarLlaves(u.id); }
  else await cerrarSesion(req.cookies.get('t')?.value);
  // ?salir: al volver al login no se lanza Face ID solo, porque se cerró la sesión a propósito.
  // ir=recuperar (pantalla de bloqueo, «¿Has olvidado la contraseña?»): sale y va a recuperarla.
  const form = req.headers.get('content-type')?.includes('form') ? await req.formData().catch(() => null) : null;
  const res = NextResponse.redirect(new URL(form?.get('ir') === 'recuperar' ? '/recuperar' : '/login?salir=1', req.url), 303);
  res.cookies.delete('t');
  return res;
}
