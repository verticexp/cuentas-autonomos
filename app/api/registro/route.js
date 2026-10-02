import { NextResponse } from 'next/server';
import { crearSesion, crearUsuario, hayUsuarios, opcionesCookie } from '@/lib/auth';
import { redis } from '@/lib/redis';

// Solo funciona la primera vez: crea la cuenta de administrador.
export async function POST(req) {
  if (!redis || (await hayUsuarios())) return NextResponse.redirect(new URL('/login', req.url), 303);
  const form = await req.formData();
  const r = await crearUsuario({ nombre: form.get('nombre'), email: form.get('email'), password: String(form.get('password') || ''), admin: true });
  if (r.error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(r.error)}`, req.url), 303);
  const res = NextResponse.redirect(new URL('/ajustes', req.url), 303);
  res.cookies.set('t', await crearSesion(r.usuario.id), opcionesCookie);
  res.cookies.set('recien', '1', { path: '/', maxAge: 60, sameSite: 'lax' }); // acaba de entrar: sin pantalla de bloqueo
  return res;
}
