import { usuarioApi } from '../../../../lib/api.js';
import { auditar } from '../../../../lib/auditoria.js';
import { pasado, respuesta429 } from '../../../../lib/limite.js';
import { alcancesDe, clavesDe, crearClave, revocarClave, cuerpoPublico, respuestaPublica, errorPublico, jsonPublico } from '../../../../lib/apiPublica.js';
import { crearWebhook, revocarWebhook, webhooksDe } from '../../../../lib/webhooks.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const datos = async (u) => {
  const [claves, webhooks] = await Promise.all([clavesDe(u), webhooksDe(u)]);
  return { claves, webhooks, alcances: alcancesDe(u) };
};
export const GET = () => respuestaPublica(async () => {
  const { u, res } = await usuarioApi({ permiso: 'empresa' });
  return res || jsonPublico(await datos(u));
});
export const POST = (req) => respuestaPublica(async () => {
  const { u, res } = await usuarioApi({ permiso: 'empresa', escritura: true });
  if (res) return res;
  if (await pasado('crear-integracion', u.id, 20, 60)) return respuesta429(60);
  const b = await cuerpoPublico(req);
  if (b.accion === 'clave') {
    const nueva = await crearClave(u, b);
    await auditar(u, 'Clave de API creada', nueva.id);
    return jsonPublico(nueva, 201);
  }
  if (b.accion === 'webhook') {
    const nuevo = await crearWebhook(u, b);
    await auditar(u, 'Webhook creado', nuevo.id);
    return jsonPublico(nuevo, 201);
  }
  return errorPublico('Acción no válida');
});
export const DELETE = (req) => respuestaPublica(async () => {
  const { u, res } = await usuarioApi({ permiso: 'empresa' });
  if (res) return res;
  const q = new URL(req.url).searchParams, id = q.get('clave') || q.get('webhook');
  if (!id || !/^[a-f0-9-]{36}$/.test(id) || q.has('clave') === q.has('webhook')) return errorPublico('Indica una clave o un webhook');
  const esClave = q.has('clave');
  const quitado = await (esClave ? revocarClave(u, id) : revocarWebhook(u, id));
  if (!quitado) return errorPublico('No se ha encontrado la conexión', 404);
  await auditar(u, esClave ? 'Clave de API revocada' : 'Webhook revocado', id);
  return jsonPublico({ ok: true });
});
