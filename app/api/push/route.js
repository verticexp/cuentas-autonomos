import { redis } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { clavePublica, enviarPush, pushListo } from '@/lib/push';

export const dynamic = 'force-dynamic';

// GET: clave pública. POST { sub }: guarda la suscripción de este móvil. POST { prueba: true }: aviso de prueba. DELETE { endpoint }: la quita.
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
  if (b.prueba) return Response.json({ ok: true, enviados: await enviarPush(u.id, { titulo: 'Avisos activados', cuerpo: 'Así te llegarán los plazos de Hacienda y las facturas vencidas.', url: '/ajustes/avisos' }) });
  const s = b.sub;
  // Solo servicios push reales: https y con nombre de dominio. PUSH_PRUEBAS: el simulador local de las pruebas e2e.
  const url = URL.parse(s?.endpoint || '');
  const local = process.env.PUSH_PRUEBAS && url?.host === '127.0.0.1:8075';
  if (url?.protocol !== 'https:' || (!local && !/[a-z]\.[a-z]+$/i.test(url.hostname))) return error('Suscripción no válida');
  if (!s.keys?.p256dh || !s.keys?.auth) return error('Suscripción no válida');
  await redis.hset(`push:${u.id}`, { [s.endpoint]: { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } } });
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const { endpoint } = await cuerpo(req);
  if (endpoint) await redis.hdel(`push:${u.id}`, endpoint);
  return Response.json({ ok: true });
}
