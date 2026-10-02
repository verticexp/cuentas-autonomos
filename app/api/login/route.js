import { NextResponse } from 'next/server';
import { entrar, opcionesCookie } from '@/lib/auth';

export async function POST(req) {
  const form = await req.formData();
  const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim();
  const r = await entrar(form.get('email'), form.get('password'), ip);
  // Desde la pantalla de bloqueo: responde en JSON y no cambia de página.
  if (req.headers.get('accept') === 'application/json') {
    if (!r?.token) return NextResponse.json({ error: r?.bloqueado ? 'Demasiados intentos. Espera 15 minutos.' : 'Contraseña incorrecta.' }, { status: 401 });
    const res = NextResponse.json({ ok: true });
    res.cookies.set('t', r.token, opcionesCookie);
    return res;
  }
  if (!r?.token) return NextResponse.redirect(new URL(`/login?error=${r?.bloqueado ? 'bloqueado' : 1}`, req.url), 303);
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set('t', r.token, opcionesCookie);
  res.cookies.set('recien', '1', { path: '/', maxAge: 60, sameSite: 'lax' }); // acaba de entrar: sin pantalla de bloqueo
  return res;
}
