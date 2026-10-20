import { pasado, ipDe, MUCHOS } from '@/lib/limite';
import { NextResponse } from 'next/server';
import { numeroFactura, saldoDe } from '@/lib/calculos';
import { facturaDePago } from '@/lib/cobros';
import { cobroFacturasListo, crearPago } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// Público: desde /pagar/<token>, lleva al cliente a la página de pago de Stripe.
export async function POST(req) {
  const token = String((await req.formData()).get('token') || '');
  const volver = `${req.nextUrl.origin}/pagar/${token}`;
  const atras = (msg) => NextResponse.redirect(`${volver}?error=${encodeURIComponent(msg)}`, 303);
  if (await pasado('pagar-ip', ipDe(req), 20, 600)) return atras(MUCHOS);
  if (await pasado('pagar-token', token, 10, 3600)) return atras(MUCHOS);
  const d = await facturaDePago(token);
  if (!d) return NextResponse.json({ error: 'Este enlace ya no es válido' }, { status: 404 });
  if (d.f.cobrada) return NextResponse.redirect(volver, 303);
  if (!cobroFacturasListo()) return atras('El pago con tarjeta no está disponible: paga por transferencia.');
  // Lo que queda por pagar (si ya hubo un pago parcial, solo el resto).
  const total = saldoDe(d.f);
  if (total <= 0) return atras('Esta factura no tiene nada que pagar.');
  const s = await crearPago({
    importe: total,
    concepto: `Factura ${numeroFactura(d.f)} · ${d.empresa.emisor?.nombre || d.empresa.nombre || ''}`.trim(),
    email: d.f.cliente.email,
    volver,
    datos: { token, factura: d.f.id, empresa: d.e.empresa, importe: String(Math.round(total * 100)) },
  });
  if (s.error) { console.error('Stripe:', s.error); return atras('No se pudo abrir el pago. Inténtalo de nuevo o paga por transferencia.'); }
  return NextResponse.redirect(s.url, 303);
}
