import { redis, guardar, leerUno } from '@/lib/redis';

export const dynamic = 'force-dynamic';
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Público: la imagen de 1 px del email de la factura. La primera vez que se carga, marca el envío como abierto.
export async function GET(_req, { params }) {
  const { token } = await params;
  try {
    const enlace = redis && (await redis.hget('factura-envios', token));
    const e = enlace && { empresa: enlace.empresa };
    const f = e && (await leerUno(e, 'facturas', enlace.id));
    const envio = f?.envios?.find((x) => x.token === token);
    if (envio && !envio.abierta) {
      await guardar(e, 'facturas', { ...f, envios: f.envios.map((x) => (x.token === token ? { ...x, abierta: new Date().toISOString() } : x)) });
    }
  } catch { /* la imagen sale siempre */ }
  return new Response(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' } });
}
