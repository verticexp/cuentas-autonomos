import { leerUno } from '@/lib/redis';
import { error, usuarioApi } from '@/lib/api';
import { numeroFactura } from '@/lib/calculos';
import { facturaPdf } from '@/lib/pdf';
import { identidadDoc } from '@/lib/documento';
import { pasado, respuesta429 } from '@/lib/limite';
import { nombreArchivoDoc } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturas' });
  if (res) return res;
  if (await pasado('pdf', u.id, 120, 600)) return respuesta429(600, 'Has descargado demasiados PDF. Espera 10 minutos antes de descargar más.');
  const f = await leerUno(u, 'facturas', req.nextUrl.searchParams.get('id') || '');
  if (!f) return error('Esa factura no existe', 404);
  const { emisor: e, marca } = await identidadDoc(u, f);
  if (!e.nif || !e.iban) return error('Rellena tus datos de facturación en Ajustes', 400);
  const nombre = `${nombreArchivoDoc(numeroFactura(f), f.cliente.nombre)}.pdf`;
  return new Response(await facturaPdf(f, e, marca), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(nombre)}"; filename*=UTF-8''${encodeURIComponent(nombre)}` },
  });
}
