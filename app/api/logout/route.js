import { NextResponse } from 'next/server';
import { cerrarSesion } from '@/lib/auth';

export async function POST(req) {
  await cerrarSesion(req.cookies.get('t')?.value);
  // ?salir: al volver al login no se lanza Face ID solo, porque se cerró la sesión a propósito.
  const res = NextResponse.redirect(new URL('/login?salir=1', req.url), 303);
  res.cookies.delete('t');
  return res;
}
