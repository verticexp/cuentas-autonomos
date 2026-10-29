import { cuerpo, error } from '@/lib/api';
import { stripe, stripeListo } from '@/lib/stripe';
import { miDespacho } from '@/lib/despachoApi';
import { portal } from '@/lib/suscripcion';
import { aplicarSuscripcionPanel, checkoutPanel, panelActivo, soloDocumentosDe } from '@/lib/panelDocumentos';

export const dynamic = 'force-dynamic';

// Suscripción del panel «solo documentos» (lib/panelDocumentos.js): activarla (Checkout de Stripe, con la prueba gratis la
// primera vez) o abrir el portal de facturación. { portal?: true }. Solo el titular.
export async function POST(req) {
  const { u, d, res } = await miDespacho({ titular: true });
  if (res) return res;
  if (d.demo) return error('Es un despacho de demostración: el cobro no se activa.', 403);
  if (!stripeListo()) return error('El cobro con tarjeta aún no está activado en Fisquo. Escríbenos y lo activamos a mano.', 503);
  const b = await cuerpo(req);
  const volver = new URL('/despacho/solo-documentos', req.url).toString();
  if (b.portal) {
    const r = await portal({ plan: { cliente: d.panel?.cliente || d.cobro?.cliente }, volver });
    return r.error ? error(r.error) : Response.json(r);
  }
  if (panelActivo(d)) return error('La suscripción del panel ya está activa.');
  const r = await checkoutPanel(d, await soloDocumentosDe(d), { email: d.email || u.email, volver });
  return r.error ? error(r.error) : Response.json(r);
}

// Al volver del Checkout (?sesion=cs_…): no espera al aviso de Stripe.
export async function GET(req) {
  const { d, res } = await miDespacho({ titular: true });
  if (res) return res;
  const id = String(req.nextUrl.searchParams.get('sesion') || '');
  if (!/^cs_[A-Za-z0-9_]{1,197}$/.test(id)) return error('Sesión no válida');
  const s = await stripe(`checkout/sessions/${encodeURIComponent(id)}?expand[]=subscription`);
  if (s?.error || s?.metadata?.despacho !== d.id || s?.metadata?.tipo !== 'panel' || !s.subscription?.id) return error('Ese pago no es del panel de este despacho');
  return Response.json({ panel: await aplicarSuscripcionPanel(s.subscription) });
}
