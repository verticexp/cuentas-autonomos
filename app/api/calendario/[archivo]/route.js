import { redis } from '@/lib/redis';
import { calendarioIcs } from '@/lib/calendarioFiscal';
import { fiscalDe } from '@/lib/empresa';
import { ipDe, pasado } from '@/lib/limite';
import { hoy } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Calendario de plazos de una empresa, para suscribirse desde el móvil o el ordenador: /api/calendario/<token>.ics (pública
// en lib/rutasPublicas.js; el token, de 48 caracteres, es el permiso). Un enlace cambiado o quitado, o una empresa de baja,
// responde 404.
export async function GET(req, { params }) {
  const { archivo } = await params;
  const token = String(archivo || '').replace(/\.ics$/, '');
  const noHay = () => new Response('No encontrado', { status: 404 });
  if (!redis || !/^[0-9a-f]{48}$/.test(token)) return noHay();
  if (await pasado('calendario-ip', ipDe(req), 120, 3600)) return new Response('Demasiadas peticiones', { status: 429 });
  const id = await redis.hget('calendarios', token);
  const e = id && (await redis.hget('empresas', id));
  if (!e || e.baja || e.calendario !== token) return noHay();
  const ics = calendarioIcs(fiscalDe(e), { anio: Number(hoy().slice(0, 4)), cuotaIS: e.cuotaIS, nombre: e.emisor?.nombre || e.nombre || '', url: `${req.nextUrl.origin}/modelos` });
  return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="plazos-hacienda.ics"', 'Cache-Control': 'private, max-age=3600' } });
}
