import { firmaValida, stripe } from '@/lib/stripe';
import { marcarPagada } from '@/lib/cobros';
import { aplicarSuscripcion } from '@/lib/suscripcion';

export const dynamic = 'force-dynamic';

// Avisos de Stripe (webhook). Dos cosas distintas en la misma cuenta de Stripe:
// - cobros de facturas a clientes (Checkout en modo pago, lib/cobros.js): la factura pasa a cobrada aunque no vuelva a la página;
// - la suscripción de la empresa a Netto (modo suscripción, lib/suscripcion.js): empresa.plan.
const SUSCRIPCION = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];

export async function POST(req) {
  const cuerpo = await req.text();
  if (!firmaValida(cuerpo, req.headers.get('stripe-signature'))) return Response.json({ error: 'Firma no válida' }, { status: 400 });
  const ev = JSON.parse(cuerpo);
  const o = ev.data?.object;
  if (SUSCRIPCION.includes(ev.type)) await aplicarSuscripcion(o);
  else if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type)) {
    if (o?.mode === 'subscription') {
      const sub = o.subscription && (await stripe(`subscriptions/${encodeURIComponent(o.subscription)}`));
      if (sub?.id) await aplicarSuscripcion(sub);
    } else await marcarPagada(o);
  }
  return Response.json({ ok: true });
}
