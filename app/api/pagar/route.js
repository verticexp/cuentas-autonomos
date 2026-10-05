import { NextResponse } from 'next/server';
import { importes, numeroFactura } from '@/lib/calculos';
import { facturaDePago } from '@/lib/cobros';
import { crearPago, stripeListo } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// Público: desde /pagar/<token>, lleva al cliente a la página de pago de Stripe.
export async function POST(req) {
  const token = String((await req.formData()).get('token') || '');
  const volver = `${req.nextUrl.origin}/pagar/${token}`;
  const atras = (msg) => NextResponse.redirect(`${volver}?error=${encodeURIComponent(msg)}`, 303);
  const d = await facturaDePago(token);
  if (!d) return NextResponse.json({ error: 'Este enlace ya no es válido' }, { status: 404 });
  if (d.f.cobrada) return NextResponse.redirect(volver, 303);
  if (!stripeListo()) return atras('El pago con tarjeta no está disponible: paga por transferencia.');
  const total = importes(d.f).total;
  if (total <= 0) return atras('Esta factura no tiene nada que pagar.');
  const s = await crearPago({
    importe: total,
    concepto: `Factura ${numeroFactura(d.f)} · ${d.empresa.emisor?.nombre || d.empresa.nombre || ''}`.trim(),
    email: d.f.cliente.email,
    volver,
    datos: { token, factura: d.f.id, empresa: d.e.empresa },
  });
  if (s.error) { console.error('Stripe:', s.error); return atras('No se pudo abrir el pago. Inténtalo de nuevo o paga por transferencia.'); }
  return NextResponse.redirect(s.url, 303);
}
