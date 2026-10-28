import { cuerpo, error } from '@/lib/api';
import { miDespacho } from '@/lib/despachoApi';
import { pasado, respuesta429 } from '@/lib/limite';
import { clientesVisibles } from '@/lib/despachos';
import { escribir, marcarLeido } from '@/lib/comentariosDespacho';
import { invalidarNoLeidos } from '@/lib/mensajesDespacho';
import { avisarCliente } from '@/lib/avisosDespacho';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const MAX = 300;

// Un mismo mensaje a varios clientes a la vez (cada uno lo recibe en su conversación, como si se le escribiera solo a él):
// { empresas: [id…], texto }. Solo a los clientes que esta persona ve.
export async function POST(req) {
  const { u, d, quien, res } = await miDespacho();
  if (res) return res;
  const b = await cuerpo(req);
  const texto = String(b.texto || '').trim();
  if (!texto) return error('Escribe el mensaje');
  const pedidas = new Set((Array.isArray(b.empresas) ? b.empresas : []).map(String).slice(0, MAX));
  if (!pedidas.size) return error('Elige al menos un cliente');
  if (await pasado('mensajes-varios', u.id, 10, 3600)) return respuesta429(3600, 'Has enviado muchos mensajes a varios clientes en la última hora. Espera un poco.');
  const clientes = (await clientesVisibles(d, u.id)).filter((c) => pedidas.has(c.id));
  let enviados = 0;
  for (const c of clientes) {
    const r = await escribir(c.id, quien, 'despacho', { texto, despacho: d.id });
    if (r.error) continue;
    await marcarLeido(c.id, 'despacho');
    avisarCliente(c.empresa, { titulo: d.nombre, cuerpo: texto, chat: true });
    enviados += 1;
  }
  await invalidarNoLeidos(d.id);
  return Response.json({ ok: true, enviados });
}
