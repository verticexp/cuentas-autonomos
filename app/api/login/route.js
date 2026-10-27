import { respuesta429 } from '@/lib/limite';
import { NextResponse } from 'next/server';
import { RETO_DOS_PASOS, entrar, limpiarEmail, opcionesCookie } from '@/lib/auth';
import { apuntarAcceso } from '@/lib/accesos';
import { ponerEntrada } from '@/lib/entrada';
import { redis } from '@/lib/redis';

export async function POST(req) {
  let form;
  try { form = await req.formData(); }
  catch {
    if (req.headers.get('accept')?.includes('application/json')) return NextResponse.json({ error: 'No se ha podido leer el formulario. Vuelve a escribir tu email y contraseña.' }, { status: 400 });
    return NextResponse.redirect(new URL('/login?error=1', req.url), 303);
  }
  const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim();
  const json = req.headers.get('accept')?.includes('application/json');
  // Desde la pantalla de inicio de sesión (inicio=1, components/FormEntrar.js), la gente de un despacho empieza en su
  // propia empresa, no en el último cliente que abrió (desde la de bloqueo se sigue donde se estaba).
  const inicio = !json || form.get('inicio') === '1';
  // Desde la pantalla de bloqueo, quien ya tiene sesión en este dispositivo no repite el segundo paso.
  const sesion = !inicio && req.cookies.get('t')?.value;
  const yaDentro = sesion ? await redis.get(`sesion:${sesion}`) : null;
  const r = await entrar(form.get('email'), form.get('password'), ip, { yaDentro });
  if (r?.bloqueado) return respuesta429(15 * 60, 'Demasiados intentos de acceso. Espera 15 minutos antes de volver a intentarlo.');
  // Con la verificación en dos pasos activada (lib/dosPasos.js), falta el código: el reto va en una cookie de 5 minutos.
  if (r?.segundoPaso) {
    const res = json ? NextResponse.json({ segundoPaso: true }) : NextResponse.redirect(new URL('/login/dos-pasos', req.url), 303);
    res.cookies.set('reto', r.segundoPaso, { ...opcionesCookie, maxAge: RETO_DOS_PASOS });
    return res;
  }
  if (!r?.token) {
    if (json) return NextResponse.json({ error: 'Email o contraseña incorrectos.' }, { status: 401 });
    return NextResponse.redirect(new URL('/login?error=1', req.url), 303);
  }
  await apuntarAcceso(r.id, req, 'Contraseña');
  const cuenta = inicio ? await redis.hget('usuarios', String((await redis.hget('emails', limpiarEmail(form.get('email')))) || '')) : null;
  // Desde la pantalla de bloqueo: responde en JSON y no cambia de página.
  if (json) return ponerEntrada(NextResponse.json({ ok: true }), r.token, cuenta, { inicio });
  // La gente de un despacho entra a su panel (Mi despacho), con su propia empresa en este dispositivo.
  return ponerEntrada(NextResponse.redirect(new URL(cuenta?.despacho ? '/despacho' : '/', req.url), 303), r.token, cuenta, { recien: true });
}
