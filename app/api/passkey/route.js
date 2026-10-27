import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { mismoId, redis } from '@/lib/redis';
import { crearSesion, desbloqueo, opcionesCookie, opcionesDesbloqueo, usuarioActual } from '@/lib/auth';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { MUCHOS, ipDe, pasado } from '@/lib/limite';
import { auditar } from '@/lib/auditoria';
import { apuntarAcceso } from '@/lib/accesos';

// Face ID / Touch ID con llaves de acceso (passkeys). La cara nunca sale del móvil:
// el iPhone firma un reto y aquí se comprueba la firma con la clave pública guardada al activarlo.
// passkeys:<usuario> → id de llave → { publicKey, counter, transports, nombre, creada } · passkey-usuario: id de llave → usuario
export const dynamic = 'force-dynamic';

const b64 = (u8) => Buffer.from(u8).toString('base64url');
// En producción, solo los dominios de Fisquo (informe de seguridad m4): el sitio no lo decide la propia petición.
// La app de iOS carga www.fisquo.com (mobile/capacitor.config.json). Fuera de producción, el de la petición (local, e2e).
const DOMINIOS = ['www.fisquo.com', 'fisquo.com'];
const permitidos = () => [...DOMINIOS, ...[process.env.APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
  .filter(Boolean).map((x) => URL.parse(x)?.hostname).filter(Boolean)];
const sitio = (req) => {
  const origin = req.headers.get('origin') || new URL(req.url).origin;
  const rpID = URL.parse(origin)?.hostname;
  if (process.env.VERCEL_ENV === 'production' && !permitidos().includes(rpID)) return null;
  return { origin, rpID };
};

async function guardarReto(challenge) {
  const id = randomBytes(12).toString('base64url');
  await redis.set(`reto:${id}`, challenge, { ex: 300 });
  (await cookies()).set('reto', id, { ...opcionesCookie, maxAge: 300 });
}
async function leerReto() {
  const id = (await cookies()).get('reto')?.value;
  const r = id && (await redis.get(`reto:${id}`));
  if (id) await redis.del(`reto:${id}`);
  return r;
}

export async function POST(req) {
  if (!redis) return error('Base de datos no conectada', 503);
  const b = await cuerpo(req);
  const web = sitio(req);
  if (!web) return error('Face ID solo funciona en www.fisquo.com', 403);
  const { origin, rpID } = web;
  const u = await usuarioActual();

  // Activar Face ID en este dispositivo (con la sesión ya abierta).
  if (b.accion === 'registro-opciones' || b.accion === 'registro') {
    const { res } = await usuarioApi();
    if (res) return res;
    const mias = (await redis.hgetall(`passkeys:${u.id}`)) || {};
    if (b.accion === 'registro-opciones') {
      const opciones = await generateRegistrationOptions({
        rpName: 'Fisquo', rpID, userName: u.email, userDisplayName: u.nombre, userID: new TextEncoder().encode(u.id),
        attestationType: 'none',
        excludeCredentials: Object.entries(mias).map(([id, k]) => ({ id, transports: k.transports })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      });
      await guardarReto(opciones.challenge);
      return Response.json(opciones);
    }
    const reto = await leerReto();
    if (!reto) return error('Ha tardado demasiado. Vuelve a intentarlo.');
    try {
      const v = await verifyRegistrationResponse({ response: b.respuesta, expectedChallenge: reto, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
      if (!v.verified) return error('No se ha podido activar Face ID');
      const c = v.registrationInfo.credential;
      // Una llave ya asociada a otra persona no se reasigna (si no, conociendo su id se le quitaría Face ID).
      const ya = await redis.hget('passkey-usuario', c.id);
      if (ya && !mismoId(ya, u.id)) return error('No se ha podido activar Face ID en este dispositivo');
      const nombre = String(b.nombre || 'Este dispositivo').slice(0, 60);
      await redis.hset(`passkeys:${u.id}`, { [c.id]: { publicKey: b64(c.publicKey), counter: c.counter, transports: c.transports || [], nombre, creada: new Date().toISOString() } });
      await redis.hset('passkey-usuario', { [c.id]: u.id });
      await auditar(u, 'Face ID activado', nombre);
      return Response.json({ ok: true, id: c.id });
    } catch (e) { console.warn('[passkey] registro:', e.message); return error('No se ha podido activar Face ID. Vuelve a intentarlo.'); }
  }

  // Entrar (o desbloquear la app) con Face ID. Como mucho 60 llamadas (30 intentos) por IP cada 15 min.
  if ((b.accion === 'entrar-opciones' || b.accion === 'entrar') && (await pasado('passkey', ipDe(req), 60, 900))) return error(MUCHOS, 429);
  if (b.accion === 'entrar-opciones') {
    // Sin lista de llaves: el navegador ofrece las que tenga para esta web, de la cuenta que sea (como en cualquier login).
    const opciones = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    await guardarReto(opciones.challenge);
    return Response.json(opciones);
  }
  if (b.accion === 'entrar') {
    const reto = await leerReto();
    if (!reto) return error('Ha tardado demasiado. Vuelve a intentarlo.');
    const id = b.respuesta?.id;
    const dueno = id && (await redis.hget('passkey-usuario', id));
    const k = dueno && (await redis.hget(`passkeys:${dueno}`, id));
    if (!k) return error('Este Face ID ya no está activado. Entra con tu contraseña y vuelve a activarlo en Ajustes.');
    try {
      const v = await verifyAuthenticationResponse({
        response: b.respuesta, expectedChallenge: reto, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id, publicKey: Buffer.from(k.publicKey, 'base64url'), counter: k.counter, transports: k.transports },
      });
      if (!v.verified) return error('Face ID no válido');
      await redis.hset(`passkeys:${dueno}`, { [id]: { ...k, counter: v.authenticationInfo.newCounter, usada: new Date().toISOString() } });
    } catch (e) { console.warn('[passkey] entrar:', e.message); return error('Face ID no válido. Vuelve a intentarlo o entra con tu contraseña.'); }
    if (!(await redis.hget('usuarios', dueno))) return error('Esta cuenta ya no existe');
    // Si no había sesión, o era de otra cuenta, se entra con la de esta llave.
    const cambio = Boolean(u && u.id !== dueno);
    const c = await cookies();
    const token = !u || cambio ? await crearSesion(dueno) : c.get('t')?.value;
    // Sin sesión: la cuenta ya no existe o cambió su contraseña justo ahora.
    if (!token) return error('No se ha podido entrar. Vuelve a intentarlo.', 401);
    if (!u || cambio) { c.set('t', token, opcionesCookie); await apuntarAcceso(dueno, req, 'Face ID o huella'); }
    c.set('d', await desbloqueo(token), opcionesDesbloqueo);
    return Response.json({ ok: true, cambio });
  }
  return error('Acción no válida');
}

// Desactivar Face ID en un dispositivo.
export async function DELETE(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id') || '';
  await redis.hdel(`passkeys:${u.id}`, id);
  if (mismoId(await redis.hget('passkey-usuario', id), u.id)) await redis.hdel('passkey-usuario', id);
  await auditar(u, 'Face ID desactivado en un dispositivo');
  return Response.json({ ok: true });
}
