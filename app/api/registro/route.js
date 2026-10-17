import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { crearSesion, crearUsuario, desbloqueo, hayUsuarios, opcionesCookie, opcionesDesbloqueo, tokenEmail } from '@/lib/auth';
import { enviarConfirmacion } from '@/lib/invitacion';
import { ipDe, MUCHOS, pasado } from '@/lib/limite';
import { datosFiscalesRegistro, fiscalDeTipo, normalizarNifRegistro, nuevoPlan } from '@/lib/prueba';
import { comprobarNif } from '@/lib/censoAeat';
import { redis } from '@/lib/redis';

// Alta de una cuenta con su empresa. La primera de todas es la del administrador de Netto (formulario de app/login);
// las demás llegan desde /registro con tipo de negocio y plan, y empiezan el mes de prueba (lib/prueba.js).
// Con Accept: application/json responde en JSON (app/registro); si no, redirige como un formulario normal.
export async function POST(req) {
  const json = req.headers.get('accept') === 'application/json';
  const fallo = (error, status = 400, paso) => (json
    ? NextResponse.json({ error, ...(paso ? { paso } : {}) }, { status })
    : NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, req.url), 303));
  if (!redis) return fallo('Base de datos no conectada', 503);

  const form = await req.formData().catch(() => null);
  if (!form) return fallo('Faltan datos');
  if (form.get('web')) return json ? NextResponse.json({ ok: true }) : NextResponse.redirect(new URL('/login', req.url), 303); // trampa para bots
  if (await pasado('registro', ipDe(req), 5, 3600)) return fallo(MUCHOS, 429);

  const primera = !(await hayUsuarios());
  const cuenta = { nombre: form.get('nombre'), email: form.get('email'), password: String(form.get('password') || ''), admin: primera };
  let r;
  if (primera) {
    r = await crearUsuario({ ...cuenta, empresaNombre: String(form.get('empresa') || '').trim() || undefined });
  } else {
    if (typeof cuenta.nombre !== 'string' || !cuenta.nombre.trim() || cuenta.nombre.trim().length > 60) return fallo('Escribe tu nombre (máximo 60 caracteres).', 400, 1);
    if (typeof cuenta.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cuenta.email.trim())) return fallo('Escribe un email válido.', 400, 1);
    if (cuenta.password.length < 8) return fallo('La contraseña debe tener al menos 8 caracteres', 400, 1);
    if (form.get('acepto') !== '1') return fallo('Acepta las condiciones y la política de privacidad para crear tu cuenta.', 400, 5);
    const periodo = String(form.get('periodo') || 'mes');
    if (!['mes', 'anio'].includes(periodo)) return fallo('Elige un periodo mensual o anual.', 400, 4);
    const plan = nuevoPlan(String(form.get('tipo') || ''), String(form.get('plan') || ''), new Date(), periodo);
    if (!plan) return fallo('Elige tu tipo de negocio y un plan', 400, 2);
    const datos = datosFiscalesRegistro({ ...Object.fromEntries(form), tipo: plan.tipo });
    if (datos.error) return fallo(datos.error, 400, 3);
    const emisor = datos.emisor;
    const repetido = 'Ya hay una cuenta con ese NIF. Entra con ella o escríbenos a corporate@nettohq.com.';
    const cerrojo = `registro-nif:${emisor.nif}`, propietario = randomUUID();
    if (!(await redis.set(cerrojo, propietario, { nx: true, ex: 120 }))) return fallo('Ya se está creando una cuenta con ese NIF. Espera un momento e inténtalo de nuevo.', 409, 3);
    try {
      if (await redis.hget('empresa-nif', emisor.nif)) return fallo(repetido, 400, 3);
      // Incluye las empresas anteriores al índice, sin dejarles repetir la prueba.
      const anterior = Object.values((await redis.hgetall('empresas')) || {}).find((e) => normalizarNifRegistro(e.emisor?.nif) === emisor.nif);
      if (anterior) {
        await redis.hset('empresa-nif', { [emisor.nif]: anterior.id });
        return fallo(repetido, 400, 3);
      }
      const censo = await comprobarNif({ nif: emisor.nif, nombre: emisor.nombre });
      if (censo.estado === 'no') return fallo('Hacienda no reconoce ese NIF con ese nombre. Escríbelo exactamente como aparece en tus datos fiscales.', 400, 3);
      if (censo.estado === 'baja') return fallo('Ese NIF figura de baja en Hacienda.', 400, 3);
      r = await crearUsuario({
        ...cuenta, empresaNombre: emisor.nombre,
        empresaDatos: { nombre: emisor.nombre, emisor, plan, fiscal: { tipo: fiscalDeTipo(plan.tipo) }, censo: { estado: censo.estado === 'ok' ? 'ok' : 'pendiente', fecha: new Date().toISOString() } },
      });
      if (!r.error) await redis.hset('empresa-nif', { [emisor.nif]: r.usuario.empresa });
    } finally {
      await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", [cerrojo], [propietario]).catch(() => {});
    }
  }
  if (r.error) return fallo(r.error, 400, 1);

  await enviarConfirmacion({ para: r.usuario.email, nombre: r.usuario.nombre, url: new URL(`/api/confirmar?t=${await tokenEmail(r.usuario.id)}`, req.url).toString() });
  const token = await crearSesion(r.usuario.id);
  const res = json ? NextResponse.json({ ok: true }) : NextResponse.redirect(new URL(primera ? '/ajustes' : '/', req.url), 303);
  res.cookies.set('t', token, opcionesCookie);
  res.cookies.set('d', await desbloqueo(token), opcionesDesbloqueo);
  return res;
}
