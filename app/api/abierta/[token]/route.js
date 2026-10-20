import { pasado, ipDe } from '@/lib/limite';
import { redis, leerUno } from '@/lib/redis';
import { actualizarFactura } from '@/lib/actualizarFactura';

export const dynamic = 'force-dynamic';
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Público: la imagen de 1 px del email de la factura. La primera vez que se carga, marca el envío como abierto.
export async function GET(req, { params }) {
  const { token } = await params;
  try {
    if (await pasado('abierta-ip', ipDe(req), 120, 600)) return new Response(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' } });
    const enlace = redis && (await redis.hget('factura-envios', token));
    const e = enlace && { empresa: enlace.empresa };
    const emp = e && (await redis.hget('empresas', enlace.empresa));
    const f = emp && !emp.baja && (await leerUno(e, 'facturas', enlace.id));
    const envio = f?.envios?.find((x) => x.token === token);
    if (envio && !envio.abierta) {
      await actualizarFactura(e, enlace.id, (actual) => (actual.envios?.some((x) => x.token === token && !x.abierta)
        ? { nueva: { ...actual, envios: actual.envios.map((x) => (x.token === token ? { ...x, abierta: new Date().toISOString() } : x)) } } : null));
    }
  } catch { /* la imagen sale siempre */ }
  return new Response(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' } });
}
