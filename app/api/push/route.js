import { redis } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { clavePublica, enviarPush, pushListo } from '@/lib/push';
import { pasado, respuesta429 } from '@/lib/limite';
import { conCerrojo } from '@/lib/cerrojo';
import { esToken } from '@/lib/apns';
import { esApp } from '@/lib/app';

export const dynamic = 'force-dynamic';
const SERVICIOS = /(^|\.)(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
const MAX_SUSCRIPCIONES = 10;

// GET: clave pública. POST { sub }: guarda la suscripción de este móvil. POST { prueba: true }: aviso de prueba. DELETE { endpoint }: la quita.
// App de iOS (lib/avisosNativos.js): POST { apns, nombre } guarda el token de APNs de este iPhone; DELETE { apns } lo quita.
export async function GET() {
  const { res } = await usuarioApi();
  if (res) return res;
  return Response.json({ clave: clavePublica() });
}

export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (!pushListo()) return error('Los avisos aún no están configurados', 503);
  const b = await cuerpo(req);
  if (b.prueba) {
    if (await pasado('push-prueba', u.id, 5, 600)) return respuesta429(600, 'Has enviado demasiados avisos de prueba. Espera 10 minutos antes de enviar otro.');
    return Response.json({ ok: true, enviados: await enviarPush(u.id, { titulo: 'Avisos activados', cuerpo: 'Así te llegarán los plazos de Hacienda y las facturas vencidas.', url: '/ajustes/avisos' }) });
  }
  if (b.apns !== undefined) {
    if (!esApp(req.headers.get('user-agent')) || !esToken(b.apns)) return error('Dispositivo no válido');
    return conCerrojo(`push:${u.id}`, async () => {
      const clave = `apns:${u.id}`;
      const existe = await redis.hget(clave, b.apns);
      if (!existe && Number(await redis.hlen(clave)) + Number(await redis.hlen(`push:${u.id}`)) >= MAX_SUSCRIPCIONES) return error('Ya tienes avisos en 10 dispositivos. Desactívalos en uno antes de añadir otro.');
      // Un iPhone, una cuenta: si antes entró otra persona en este iPhone, deja de recibir aquí sus avisos.
      const antes = await redis.hget('apns-usuario', b.apns);
      if (antes && String(antes) !== String(u.id)) await redis.hdel(`apns:${antes}`, b.apns);
      await redis.hset(clave, { [b.apns]: { nombre: String(b.nombre || 'iPhone').slice(0, 60), creado: existe?.creado || new Date().toISOString() } });
      await redis.hset('apns-usuario', { [b.apns]: u.id });
      return Response.json({ ok: true });
    });
  }
  const s = b.sub;
  // Solo los servicios push de los navegadores (Chrome, Safari, Firefox, Edge): el servidor no hace peticiones a
  // cualquier dirección que le pasen. PUSH_PRUEBAS: el simulador local de las pruebas e2e.
  const url = URL.parse(s?.endpoint || '');
  const local = process.env.PUSH_PRUEBAS && url?.host === '127.0.0.1:8075';
  if (url?.protocol !== 'https:' || (!local && !SERVICIOS.test(url.hostname))) return error('Suscripción no válida');
  if (!s.keys?.p256dh || !s.keys?.auth) return error('Suscripción no válida');
  // Actualizar un móvil ya registrado no consume otra plaza.
  return conCerrojo(`push:${u.id}`, async () => {
    const clave = `push:${u.id}`;
    const existe = await redis.hget(clave, s.endpoint);
    if (!existe && await redis.hlen(clave) >= MAX_SUSCRIPCIONES) return error('Ya tienes avisos en 10 dispositivos. Desactívalos en uno antes de añadir otro.');
    await redis.hset(clave, { [s.endpoint]: { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } } });
    return Response.json({ ok: true });
  });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const { endpoint, apns } = await cuerpo(req);
  if (endpoint) await redis.hdel(`push:${u.id}`, endpoint);
  if (typeof apns === 'string' && apns) await redis.hdel(`apns:${u.id}`, apns);
  return Response.json({ ok: true });
}
