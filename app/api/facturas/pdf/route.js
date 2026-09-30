import { leerUno } from '@/lib/redis';
import { error, usuarioApi } from '@/lib/api';
import { numeroFactura } from '@/lib/calculos';
import { facturaPdf } from '@/lib/pdf';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const f = await leerUno(u, 'facturas', req.nextUrl.searchParams.get('id') || '');
  if (!f) return error('Esa factura no existe', 404);
  const e = u.emisor || {};
  if (!e.nif || !e.iban) return error('Rellena tus datos de facturación en Ajustes', 400);
  const nombre = `${numeroFactura(f)} ${f.cliente.nombre.toUpperCase().replace(/[^A-Z0-9 ]+/g, '')}.pdf`;
  return new Response(await facturaPdf(f, e), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(nombre)}"; filename*=UTF-8''${encodeURIComponent(nombre)}` },
  });
}
