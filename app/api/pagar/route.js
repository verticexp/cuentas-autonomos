import { pasado, ipDe, MUCHOS } from '@/lib/limite';
import { NextResponse } from 'next/server';
import { facturaDePago } from '@/lib/cobros';
import { cobroFacturasListo, prepararPago } from '@/lib/stripe';
import { actualizarEstado } from '@/lib/stripeConnect';

export const dynamic = 'force-dynamic';

// Público: desde /pagar/<token>, lleva al cliente a la página de pago de Stripe.
export async function POST(req) {
  // Un formulario que no se puede leer no viene de la página de pago: 400 (sin token no hay página a la que volver).
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'No se ha podido leer el formulario. Abre de nuevo el enlace de pago e inténtalo otra vez.' }, { status: 400 });
  const token = String(form.get('token') || '');
  const volver = `${req.nextUrl.origin}/pagar/${token}`;
  const atras = (msg) => NextResponse.redirect(`${volver}?error=${encodeURIComponent(msg)}`, 303);
  if (await pasado('pagar-ip', ipDe(req), 20, 600)) return atras(MUCHOS);
  if (await pasado('pagar-token', token, 10, 3600)) return atras(MUCHOS);
  const d = await facturaDePago(token);
  if (!d) return NextResponse.json({ error: 'Este enlace ya no es válido' }, { status: 404 });
  if (d.f.cobrada) return NextResponse.redirect(volver, 303);
  // Solo en la cuenta de Stripe de la empresa, y comprobando antes que puede cobrar (puede haber cambiado en Stripe).
  if (!cobroFacturasListo(d.empresa)) return atras('El pago con tarjeta no está disponible: paga por transferencia.');
  const est = await actualizarEstado({ empresa: d.e.empresa, stripeConnect: d.empresa.stripeConnect });
  if (est.estado !== 'activa') return atras('El pago con tarjeta no está disponible ahora: paga por transferencia.');
  const s = await prepararPago(d, { token, volver });
  if (s.error) { console.error('Stripe:', s.error); return atras(s.publico ? s.error : 'No se ha podido abrir el pago. Inténtalo de nuevo o paga por transferencia.'); }
  return NextResponse.redirect(s.url, 303);
}
