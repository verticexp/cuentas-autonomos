import { leerUno } from '@/lib/redis';
import { error, usuarioApi } from '@/lib/api';
import { facturae, ubl } from '@/lib/facturae';
import { emisorDe, numeroFactura, vencimiento } from '@/lib/calculos';
import { fiscalDe } from '@/lib/empresa';

export const dynamic = 'force-dynamic';

// Factura electrónica B2B (Ley 18/2022 «Crea y Crece»): ?id=…&formato=facturae (Facturae 3.2.2, sin firmar) | ubl (UBL 2.1, Peppol BIS 3).
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturas' });
  if (res) return res;
  const sp = req.nextUrl.searchParams;
  const f = await leerUno(u, 'facturas', sp.get('id') || '');
  if (!f) return error('Esa factura ya no existe', 404);
  if (f.caja) return error('Un cierre de caja no se emite como factura electrónica');
  const e = { ...emisorDe(f, u), plazo: u.emisor?.plazo };
  if (!e.nif || !e.nombre) return error('Rellena tus datos de facturación (nombre y NIF) en Ajustes');
  const formato = sp.get('formato') === 'ubl' ? 'ubl' : 'facturae';
  const opciones = { sociedad: fiscalDe(u).tipo === 'sociedad', vencimiento: vencimiento(f, e.plazo) };
  let xml;
  try { xml = formato === 'ubl' ? ubl(f, e, opciones) : facturae(f, e, opciones); } catch (err) { return error(`${err.message} (revisa el NIF del cliente)`); }
  const nombre = `${numeroFactura(f).replace(/[^\w-]+/g, '_')}${formato === 'ubl' ? '-ubl' : ''}.xml`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}"` } });
}
