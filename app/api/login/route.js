import { respuesta429 } from '@/lib/limite';
import { NextResponse } from 'next/server';
import { desbloqueo, entrar, limpiarEmail, opcionesCookie, opcionesDesbloqueo } from '@/lib/auth';
import { redis } from '@/lib/redis';

export async function POST(req) {
  let form;
  try { form = await req.formData(); }
  catch {
    if (req.headers.get('accept')?.includes('application/json')) return NextResponse.json({ error: 'No se ha podido leer el formulario. Vuelve a escribir tu email y contraseña.' }, { status: 400 });
    return NextResponse.redirect(new URL('/login?error=1', req.url), 303);
  }
  const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim();
  const r = await entrar(form.get('email'), form.get('password'), ip);
  if (r?.bloqueado) return respuesta429(15 * 60, 'Demasiados intentos de acceso. Espera 15 minutos antes de volver a intentarlo.');
  // Desde la pantalla de bloqueo: responde en JSON y no cambia de página.
  if (req.headers.get('accept')?.includes('application/json')) {
    if (!r?.token) return NextResponse.json({ error: r?.bloqueado ? 'Demasiados intentos. Espera 15 minutos.' : 'Email o contraseña incorrectos.' }, { status: 401 });
    const res = NextResponse.json({ ok: true });
    res.cookies.set('t', r.token, opcionesCookie);
    res.cookies.set('d', await desbloqueo(r.token), opcionesDesbloqueo);
    return res;
  }
  if (!r?.token) return NextResponse.redirect(new URL(`/login?error=${r?.bloqueado ? 'bloqueado' : 1}`, req.url), 303);
  // La gente de un despacho entra a su panel (Mi despacho), con su propia empresa en este dispositivo.
  const cuenta = await redis.hget('usuarios', String((await redis.hget('emails', limpiarEmail(form.get('email')))) || ''));
  const res = NextResponse.redirect(new URL(cuenta?.despacho ? '/despacho' : '/', req.url), 303);
  if (cuenta?.despacho) res.cookies.set('e', String(cuenta.empresa || cuenta.id), opcionesCookie);
  res.cookies.set('t', r.token, opcionesCookie);
  res.cookies.set('d', await desbloqueo(r.token), opcionesDesbloqueo);
  res.cookies.set('recien', '1', { path: '/', maxAge: 60, sameSite: 'lax' }); // acaba de entrar: sin pantalla de bloqueo
  return res;
}
