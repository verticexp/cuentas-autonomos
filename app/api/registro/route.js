import { validarContrasenaSegura } from '@/lib/contrasenaFiltrada';
import { emailReal } from '@/lib/emailReal';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { crearSesion, crearUsuario, desbloqueo, hayUsuarios, nuevaEmpresa, opcionesCookie, opcionesDesbloqueo, tokenEmail, usuarioActual } from '@/lib/auth';
import { enviarConfirmacion } from '@/lib/invitacion';
import { ipDe, MUCHOS, pasado } from '@/lib/limite';
import { datosFiscalesRegistro, fiscalDeTipo, normalizarNifRegistro, nuevoPlan, PRUEBA_DIAS, TIPOS_ALTA } from '@/lib/prueba';
import { comprobarNif } from '@/lib/censoAeat';
import { redis } from '@/lib/redis';
import { apuntarCliente, PRUEBA_GESTORIA_DIAS } from '@/lib/gestorias';
import { NO_VALIDO, resolverCodigo } from '@/lib/codigoPromocional';
import { apuntarRecomendada, empresaPorCodigo, normalizarRef, RECOMENDACION_DIAS } from '@/lib/recomendaciones';
import { enEmpresa } from '@/lib/membresias';
import { despachoPorCodigo, unirCliente } from '@/lib/despachos';

// Alta de una cuenta con su empresa. La primera de todas es la del administrador de Fisquo (formulario de app/login);
// las demás llegan desde /registro con tipo de negocio y plan, y empiezan el mes de prueba (lib/prueba.js).
// Con sesión iniciada (/registro?nueva=1) da de alta otra empresa para esa cuenta, con su plan y su prueba, sin crear
// otra cuenta: queda como administradora y pasa a trabajar con ella.
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

  const sesion = await usuarioActual();
  // Base vacía: la primera cuenta es la del administrador de Fisquo. En Vercel (producción o una vista previa con una base
  // nueva) solo si es el email de ADMIN_EMAIL; si no, cualquiera que llegase antes se quedaría con el panel de /admin.
  const enVercel = Boolean(process.env.VERCEL_ENV);
  const primera = !sesion && !(await hayUsuarios())
    && (!enVercel || (Boolean(process.env.ADMIN_EMAIL) && String(form.get('email') || '').trim().toLowerCase() === process.env.ADMIN_EMAIL.trim().toLowerCase()));
  const cuenta = { nombre: form.get('nombre'), email: form.get('email'), password: String(form.get('password') || ''), admin: primera };
  if (!sesion) {
    const seguridad = await validarContrasenaSegura(cuenta.password, cuenta);
    if (!seguridad.ok) return fallo(seguridad.error, 400, 4);
    const correo = await emailReal(cuenta.email);
    if (!correo.ok) return fallo(correo.error, 400, 4);
  }
  let r, empresaNueva;
  if (primera) {
    r = await crearUsuario({ ...cuenta, empresaNombre: String(form.get('empresa') || '').trim() || undefined });
  } else {
    // Código promocional (lib/codigoPromocional.js): el de una gestoría o el de una empresa que recomienda Fisquo.
    const codigo = String(form.get('codigo') || form.get('gestoria') || '').trim();
    const promo = codigo ? await resolverCodigo(codigo) : null;
    if (codigo && !promo) return fallo(NO_VALIDO, 400, 3);
    const gestoria = promo?.tipo === 'gestoria' ? promo.gestoria : null;
    // Enlace de recomendación (lib/recomendaciones.js): un mes más de prueba; no se suma al código de una gestoría.
    const enlace = String(form.get('ref') || '').trim();
    const recomiendaEnlace = enlace ? await empresaPorCodigo(enlace) : null;
    if (enlace && !recomiendaEnlace) return fallo('Ese enlace de recomendación ya no es válido. Puedes registrarte sin él.', 400, 1);
    if (recomiendaEnlace && promo && !(promo.tipo === 'recomendacion' && promo.empresa.id === recomiendaEnlace.id)) return fallo('Usa el código promocional o el enlace de recomendación, no los dos.', 400, 3);
    const ref = enlace || (promo?.tipo === 'recomendacion' ? promo.codigo : '');
    const recomienda = recomiendaEnlace || (promo?.tipo === 'recomendacion' ? promo.empresa : null);
    if (recomienda && sesion && enEmpresa(sesion, recomienda.id)) return fallo(`No puedes usar ${enlace ? 'el enlace' : 'el código'} de recomendación de una empresa tuya.`, 400, enlace ? 1 : 3);
    if (!sesion && (typeof cuenta.nombre !== 'string' || !cuenta.nombre.trim() || cuenta.nombre.trim().length > 60)) return fallo('Escribe tu nombre (máximo 60 caracteres).', 400, 4);
    if (!sesion && (typeof cuenta.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cuenta.email.trim()))) return fallo('Escribe un email válido.', 400, 4);
    if (form.get('acepto') !== '1') return fallo('Acepta las condiciones y la política de privacidad para crear tu cuenta.', 400, 5);
    const periodo = String(form.get('periodo') || 'mes');
    if (!['mes', 'anio'].includes(periodo)) return fallo('Elige un periodo mensual o anual.', 400, 3);
    if (!Object.hasOwn(TIPOS_ALTA, String(form.get('tipo') || ''))) return fallo('Elige tu tipo de negocio.', 400, 1);
    const plan = nuevoPlan(String(form.get('tipo') || ''), String(form.get('plan') || ''), new Date(), periodo, gestoria ? PRUEBA_GESTORIA_DIAS : recomienda ? PRUEBA_DIAS + RECOMENDACION_DIAS : undefined);
    if (!plan) return fallo('Elige un plan.', 400, 3);
    if (gestoria) plan.gestoria = gestoria.codigo;
    if (recomienda) plan.recomendacion = { codigo: normalizarRef(ref), empresa: recomienda.id };
    const datos = datosFiscalesRegistro({ ...Object.fromEntries(form), tipo: plan.tipo });
    if (datos.error) return fallo(datos.error, 400, 2);
    const emisor = datos.emisor;
    const repetido = 'Ya hay una cuenta con ese NIF. Entra con ella o escríbenos a corporate@fisquo.com.';
    const cerrojo = `registro-nif:${emisor.nif}`, propietario = randomUUID();
    if (!(await redis.set(cerrojo, propietario, { nx: true, ex: 120 }))) return fallo('Ya se está creando una cuenta con ese NIF. Espera un momento e inténtalo de nuevo.', 409, 2);
    try {
      if (await redis.hget('empresa-nif', emisor.nif)) return fallo(repetido, 400, 2);
      // Incluye las empresas anteriores al índice, sin dejarles repetir la prueba.
      const anterior = Object.values((await redis.hgetall('empresas')) || {}).find((e) => normalizarNifRegistro(e.emisor?.nif) === emisor.nif);
      if (anterior) {
        await redis.hset('empresa-nif', { [emisor.nif]: anterior.id });
        return fallo(repetido, 400, 2);
      }
      const censo = await comprobarNif({ nif: emisor.nif, nombre: emisor.nombre });
      if (censo.estado === 'no') return fallo('Hacienda no reconoce ese NIF con ese nombre. Escríbelo exactamente como aparece en tus datos fiscales.', 400, 2);
      if (censo.estado === 'baja') return fallo('Ese NIF figura de baja en Hacienda.', 400, 2);
      const empresaDatos = { nombre: emisor.nombre, emisor, plan, fiscal: { tipo: fiscalDeTipo(plan.tipo) }, censo: { estado: censo.estado === 'ok' ? 'ok' : 'pendiente', fecha: new Date().toISOString() } };
      r = sesion ? await nuevaEmpresa(sesion.id, emisor.nombre, empresaDatos) : await crearUsuario({ ...cuenta, empresaNombre: emisor.nombre, empresaDatos });
      empresaNueva = sesion ? r.id : r.usuario?.empresa;
      if (!r.error) await redis.hset('empresa-nif', { [emisor.nif]: empresaNueva });
      if (!r.error && gestoria) await apuntarCliente(gestoria.codigo, empresaNueva);
      // Si el código es de un despacho asociado (lib/despachos.js), el despacho lleva sus cuentas desde el primer día: el
      // registro lo avisa y el cliente puede quitarle el acceso en Ajustes › Tu gestoría.
      if (!r.error && gestoria) {
        const d = await despachoPorCodigo(gestoria.codigo);
        if (d) await unirCliente(empresaNueva, d, 'codigo').catch((e) => console.warn('[registro] despacho', e.message));
      }
      if (!r.error && plan.recomendacion) await apuntarRecomendada(plan.recomendacion.codigo, empresaNueva);
    } finally {
      await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", [cerrojo], [propietario]).catch(() => {});
    }
  }
  if (r.error) return fallo(r.error, 400, sesion ? 2 : 4);
  if (sesion) {
    const res = json ? NextResponse.json({ ok: true }) : NextResponse.redirect(new URL('/', req.url), 303);
    res.cookies.set('e', empresaNueva, opcionesCookie);
    return res;
  }

  await enviarConfirmacion({ para: r.usuario.email, nombre: r.usuario.nombre, url: new URL(`/api/confirmar?t=${await tokenEmail(r.usuario.id)}`, req.url).toString() });
  const token = await crearSesion(r.usuario.id);
  const res = json ? NextResponse.json({ ok: true }) : NextResponse.redirect(new URL(primera ? '/ajustes' : '/', req.url), 303);
  res.cookies.set('t', token, opcionesCookie);
  res.cookies.set('d', await desbloqueo(token), opcionesDesbloqueo);
  return res;
}
