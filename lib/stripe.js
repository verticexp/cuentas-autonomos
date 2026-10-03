// Cobros con Stripe Checkout (tarjeta y, si está activado en el panel de Stripe, Bizum).
// Hace falta STRIPE_SECRET_KEY en Vercel; STRIPE_WEBHOOK_SECRET para que el aviso de pago llegue aunque el cliente cierre la página.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const stripeListo = () => Boolean(process.env.STRIPE_SECRET_KEY);
const API = () => process.env.STRIPE_URL || 'https://api.stripe.com';

// Stripe recibe los datos como formulario: { a: { b: 1 } } → a[b]=1
function formulario(obj, prefijo = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const clave = prefijo ? `${prefijo}[${k}]` : k;
    if (v && typeof v === 'object') formulario(v, clave, out);
    else if (v !== undefined) out.append(clave, String(v));
  }
  return out;
}

async function stripe(ruta, datos) {
  const r = await fetch(`${API()}/v1/${ruta}`, {
    method: datos ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(datos ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: datos ? formulario(datos) : undefined,
  }).catch(() => null);
  const d = await r?.json().catch(() => ({}));
  if (!r?.ok) return { error: d?.error?.message || 'Stripe no responde' };
  return d;
}

// Página de pago de Stripe para lo que queda por cobrar de una factura.
export const crearPago = ({ importe, concepto, email, volver, datos }) => stripe('checkout/sessions', {
  mode: 'payment',
  line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(importe * 100), product_data: { name: concepto } } } },
  ...(email ? { customer_email: email } : {}),
  success_url: `${volver}?sesion={CHECKOUT_SESSION_ID}`,
  cancel_url: volver,
  metadata: datos,
  payment_intent_data: { metadata: datos },
});

export const leerPago = (id) => stripe(`checkout/sessions/${encodeURIComponent(id)}`);

// Firma de los avisos de Stripe: cabecera «t=…,v1=…» con HMAC-SHA256 de «t.cuerpo». Caduca a los 5 minutos.
export function firmaValida(cuerpo, cabecera, secreto = process.env.STRIPE_WEBHOOK_SECRET, ahora = Date.now()) {
  if (!secreto || !cabecera) return false;
  const p = Object.fromEntries(cabecera.split(',').map((x) => x.split('=')));
  if (!p.t || !p.v1 || Math.abs(ahora / 1000 - Number(p.t)) > 300) return false;
  const esperada = createHmac('sha256', secreto).update(`${p.t}.${cuerpo}`).digest('hex');
  return esperada.length === p.v1.length && timingSafeEqual(Buffer.from(esperada), Buffer.from(p.v1));
}
