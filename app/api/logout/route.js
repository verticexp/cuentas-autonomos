import { NextResponse } from 'next/server';
import { cerrarSesion, cerrarSesiones, usuarioActual } from '@/lib/auth';

export async function POST(req) {
  // ?todas: «Cerrar sesión en todos los dispositivos» (Ajustes › Face ID y contraseña).
  const u = req.nextUrl.searchParams.has('todas') && (await usuarioActual());
  if (u) await cerrarSesiones(u.id);
  else await cerrarSesion(req.cookies.get('t')?.value);
  // ?salir: al volver al login no se lanza Face ID solo, porque se cerró la sesión a propósito.
  const res = NextResponse.redirect(new URL('/login?salir=1', req.url), 303);
  res.cookies.delete('t');
  return res;
}
