import { firmaStripe, stripe } from '@/lib/stripe';
import { marcarPagada } from '@/lib/cobros';
import { aplicarSuscripcion } from '@/lib/suscripcion';
import { aplicarSuscripcionDespacho } from '@/lib/licencias';
import { aplicarSuscripcionPanel, esPanel } from '@/lib/panelDocumentos';

// La de un despacho (licencias de sus clientes, lib/licencias.js) lleva metadata.despacho; la de una empresa, metadata.empresa.
// La del panel «solo documentos» (lib/panelDocumentos.js) lleva además metadata.tipo = 'panel': va antes, para que no
// pise la de las licencias del mismo despacho.
const aplicar = (sub) => (esPanel(sub) ? aplicarSuscripcionPanel(sub) : sub?.metadata?.despacho ? aplicarSuscripcionDespacho(sub) : aplicarSuscripcion(sub));

export const dynamic = 'force-dynamic';

// Avisos de Stripe (webhook). Dos cosas distintas en la misma cuenta de Stripe:
// - cobros de facturas a clientes en la cuenta de Stripe de cada empresa (Connect: el aviso trae ev.account; Checkout en
//   modo pago, lib/cobros.js): la factura pasa a cobrada aunque no vuelva a la página;
// - la suscripción de la empresa a Fisquo (modo suscripción, lib/suscripcion.js): empresa.plan.
const SUSCRIPCION = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];

export async function POST(req) {
  const cuerpo = await req.text();
  // El de Fisquo y el de las cuentas conectadas de las empresas (Stripe Connect): cada uno con su secreto.
  if (!firmaStripe(cuerpo, req.headers.get('stripe-signature'))) return Response.json({ error: 'Firma no válida' }, { status: 400 });
  const ev = JSON.parse(cuerpo);
  const o = ev.data?.object;
  // Billing pertenece a Fisquo; una cuenta conectada no puede cambiar los planes.
  if (ev.account && (ev.type?.startsWith('customer.subscription.') || ev.type?.startsWith('invoice.'))) return Response.json({ ok: true });
  if (SUSCRIPCION.includes(ev.type)) await aplicar(o);
  else if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type)) {
    if (o?.mode === 'subscription' && !ev.account) {
      const sub = o.subscription && (await stripe(`subscriptions/${encodeURIComponent(o.subscription)}`));
      if (sub?.id) await aplicar(sub);
    } else await marcarPagada(o, { cuenta: ev.account });
  }
  return Response.json({ ok: true });
}
