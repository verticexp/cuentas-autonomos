import { NextResponse } from 'next/server';
import { crearSesion, crearUsuario, desbloqueo, hayUsuarios, opcionesCookie, opcionesDesbloqueo, tokenEmail } from '@/lib/auth';
import { enviarConfirmacion } from '@/lib/invitacion';
import { ipDe, MUCHOS, pasado } from '@/lib/limite';
import { fiscalDeTipo, nuevoPlan } from '@/lib/prueba';
import { redis } from '@/lib/redis';

// Alta de una cuenta con su empresa. La primera de todas es la del administrador de Netto (formulario de app/login);
// las demás llegan desde /registro con tipo de negocio y plan, y empiezan el mes de prueba (lib/prueba.js).
// Con Accept: application/json responde en JSON (app/registro); si no, redirige como un formulario normal.
export async function POST(req) {
  const json = req.headers.get('accept') === 'application/json';
  const fallo = (error, status = 400) => (json
    ? NextResponse.json({ error }, { status })
    : NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, req.url), 303));
  if (!redis) return fallo('Base de datos no conectada', 503);

  const form = await req.formData().catch(() => null);
  if (!form) return fallo('Faltan datos');
  if (form.get('web')) return json ? NextResponse.json({ ok: true }) : NextResponse.redirect(new URL('/login', req.url), 303); // trampa para bots
  if (await pasado('registro', ipDe(req), 5, 3600)) return fallo(MUCHOS, 429);

  const primera = !(await hayUsuarios());
  const plan = primera ? null : nuevoPlan(String(form.get('tipo') || ''), String(form.get('plan') || ''));
  if (!primera && !plan) return fallo('Elige tu tipo de negocio y un plan');
  const empresaNombre = String(form.get('empresa') || '').trim();
  const r = await crearUsuario({
    nombre: form.get('nombre'),
    email: form.get('email'),
    password: String(form.get('password') || ''),
    admin: primera,
    empresaNombre: empresaNombre || undefined,
    empresaDatos: plan ? { plan, fiscal: { tipo: fiscalDeTipo(plan.tipo) } } : {},
  });
  if (r.error) return fallo(r.error);

  await enviarConfirmacion({ para: r.usuario.email, nombre: r.usuario.nombre, url: new URL(`/api/confirmar?t=${await tokenEmail(r.usuario.id)}`, req.url).toString() });
  const token = await crearSesion(r.usuario.id);
  const res = json ? NextResponse.json({ ok: true }) : NextResponse.redirect(new URL(primera ? '/ajustes' : '/', req.url), 303);
  res.cookies.set('t', token, opcionesCookie);
  res.cookies.set('d', await desbloqueo(token), opcionesDesbloqueo);
  return res;
}
