import { firmaValida } from '@/lib/stripe';
import { marcarPagada } from '@/lib/cobros';

export const dynamic = 'force-dynamic';

// Aviso de Stripe (webhook) cuando un cliente paga: la factura pasa a cobrada aunque no vuelva a la página.
export async function POST(req) {
  const cuerpo = await req.text();
  if (!firmaValida(cuerpo, req.headers.get('stripe-signature'))) return Response.json({ error: 'Firma no válida' }, { status: 400 });
  const ev = JSON.parse(cuerpo);
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type)) await marcarPagada(ev.data.object);
  return Response.json({ ok: true });
}
