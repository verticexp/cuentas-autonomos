import { cuerpo, error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { stripe, stripeListo } from '@/lib/stripe';
import { miDespacho } from '@/lib/despachoApi';
import { aplicarSuscripcionDespacho, checkoutDespacho, licenciasDe } from '@/lib/licencias';
import { portal } from '@/lib/suscripcion';

export const dynamic = 'force-dynamic';

// Activar el cobro de las licencias (Checkout de Stripe) o abrir el portal de facturación. { portal?: true }
export async function POST(req) {
  const { u, d, res } = await miDespacho({ titular: true });
  if (res) return res;
  if (d.demo) return error('Es un despacho de demostración: el cobro no se activa.', 403);
  if (!stripeListo()) return error('El cobro con tarjeta aún no está activado en Fisquo. Escríbenos y lo activamos a mano.', 503);
  const b = await cuerpo(req);
  const volver = new URL('/despacho/ajustes', req.url).toString();
  if (b.portal) {
    const r = await portal({ plan: { cliente: d.cobro?.cliente }, volver });
    return r.error ? error(r.error) : Response.json(r);
  }
  if (d.cobro?.activo) return error('El cobro ya está activo: las licencias se ajustan solas cada día.');
  const r = await checkoutDespacho(d, await licenciasDe(d, hoy()), { email: d.email || u.email, volver });
  return r.error ? error(r.error) : Response.json(r);
}

// Al volver del Checkout (?sesion=cs_…): no espera al aviso de Stripe.
export async function GET(req) {
  const { d, res } = await miDespacho({ titular: true });
  if (res) return res;
  const id = String(req.nextUrl.searchParams.get('sesion') || '');
  if (!/^cs_[A-Za-z0-9_]{1,197}$/.test(id)) return error('Sesión no válida');
  const s = await stripe(`checkout/sessions/${encodeURIComponent(id)}?expand[]=subscription`);
  if (s?.error || s?.metadata?.despacho !== d.id || !s.subscription?.id) return error('Ese pago no es de este despacho');
  return Response.json({ cobro: await aplicarSuscripcionDespacho(s.subscription) });
}
