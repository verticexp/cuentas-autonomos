import { calendarioDe } from '@/lib/calendarioDespacho';
import { clientesVisibles } from '@/lib/despachos';
import { plazosDespacho } from '@/lib/plazosDespacho';
import { icsPlazos } from '@/lib/calendarioIcs';
import { hoy } from '@/lib/formato';
import { pasado, ipDe, respuesta429 } from '@/lib/limite';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (await pasado('calendario-ip', ipDe(req), 60, 600)) return respuesta429(600);
  const enlace = await calendarioDe(req.nextUrl.searchParams.get('t'));
  if (!enlace) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const { d, uid } = enlace;
  const clientes = (await clientesVisibles(d, uid)).map(({ id, empresa: e }) => ({ id, nombre: e.nombre || e.emisor?.nombre, fiscal: e.fiscal || {}, pres: { pres303: e.pres303, pagos130: e.pagos130, pres111: e.pres111, pres115: e.pres115, pres123: e.pres123 } }));
  const dia = hoy();
  const plazos = plazosDespacho(clientes, { hoy: dia, dias: 400, atraso: 0 });
  return new Response(icsPlazos(plazos, { nombre: d.nombre, hoy: dia }), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=3600' },
  });
}
