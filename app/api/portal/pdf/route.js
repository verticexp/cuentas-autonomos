import { numeroFactura } from '@/lib/calculos';
import { facturaPdf } from '@/lib/pdf';
import { portalDe } from '@/lib/portal';
import { identidadDoc } from '@/lib/documento';

export const dynamic = 'force-dynamic';

// Público: el PDF de una factura o un presupuesto, solo si es de ese cliente.
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const d = await portalDe(q.get('t'));
  if (!d) return Response.json({ error: 'Este enlace ya no es válido' }, { status: 404 });
  const presupuesto = q.get('tipo') === 'presupuesto';
  const doc = (presupuesto ? d.presupuestos : d.facturas).find((x) => x.id === q.get('id'));
  if (!doc) return Response.json({ error: 'Ese documento no existe' }, { status: 404 });
  // Las facturas, con el emisor y la marca de cuando se emitieron; los presupuestos, con los de hoy.
  const { emisor: e, marca } = presupuesto ? { emisor: d.empresa.emisor || {}, marca: d.empresa.marca } : await identidadDoc({ ...d.empresa, empresa: d.empresa.id }, doc);
  if (!e.nif || !e.iban) return Response.json({ error: 'El PDF no está disponible' }, { status: 400 });
  const nombre = `${presupuesto ? 'Presupuesto ' : ''}${numeroFactura(doc)} ${doc.cliente.nombre.toUpperCase().replace(/[^A-Z0-9 ]+/g, '')}.pdf`;
  return new Response(await facturaPdf(doc, e, marca, { presupuesto }), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${encodeURIComponent(nombre)}"; filename*=UTF-8''${encodeURIComponent(nombre)}` },
  });
}
