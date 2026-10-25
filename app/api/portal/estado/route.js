import { NextResponse } from 'next/server';
import { portalDe } from '@/lib/portal';
import { actualizarFactura } from '@/lib/actualizarFactura';

export const dynamic = 'force-dynamic';

// Público, desde el portal: el cliente dice si acepta o rechaza una factura (estados de la factura electrónica entre
// empresas de la Ley 18/2022, «Crea y Crece»: aceptación, rechazo y, aparte, el pago). Se guarda en la factura
// (estadoCliente: { estado, fecha, motivo? }) y la empresa lo ve en su ficha. Una factura ya pagada no cambia de estado.
const ESTADOS = ['aceptada', 'rechazada'];

export async function POST(req) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'No se ha podido leer el formulario. Abre de nuevo el portal e inténtalo otra vez.' }, { status: 400 });
  const t = String(form.get('t') || '');
  const volver = `${req.nextUrl.origin}/portal/${t}`;
  const d = await portalDe(t, req);
  if (d instanceof Response) return d;
  const id = String(form.get('id') || '');
  if (!d?.facturas.some((x) => x.id === id)) return NextResponse.json({ error: 'Ese documento no existe' }, { status: 404 });
  const estado = String(form.get('estado') || '');
  const motivo = String(form.get('motivo') || '').trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!ESTADOS.includes(estado)) return NextResponse.json({ error: 'Estado no válido' }, { status: 400 });
  if (estado === 'rechazada' && !motivo) return NextResponse.redirect(`${volver}?error=${encodeURIComponent('Di por qué la rechazas, para que la empresa pueda corregirla.')}`, 303);
  const r = await actualizarFactura(d.e, id, (f) => (f.cobrada ? null : { nueva: { ...f, estadoCliente: { estado, fecha: new Date().toISOString(), ...(estado === 'rechazada' ? { motivo } : {}) } } }));
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status || 400 });
  return NextResponse.redirect(`${volver}?hecho=${estado}`, 303);
}
