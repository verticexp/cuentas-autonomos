import { error, usuarioApi } from '@/lib/api';
import { cambioBce } from '@/lib/cambio';
import { pasado, respuesta429 } from '@/lib/limite';

export const dynamic = 'force-dynamic';

// Tipo de cambio del BCE para facturar en otra moneda: ?moneda=USD&fecha=2026-10-21 (lib/cambio.js).
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  if (await pasado('cambio', u.id, 120, 3600)) return respuesta429(3600, 'Has consultado demasiados tipos de cambio. Espera un rato o escríbelo a mano.');
  const q = req.nextUrl.searchParams;
  const r = await cambioBce(String(q.get('moneda') || '').toUpperCase(), String(q.get('fecha') || ''));
  return r.error ? error(r.error, r.error.startsWith('No se ha podido') ? 502 : 400) : Response.json({ ok: true, ...r });
}
