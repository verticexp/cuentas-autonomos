// Cobros con Stripe Checkout (tarjeta y, si está activado en el panel de Stripe, Bizum).
// Hace falta STRIPE_SECRET_KEY en Vercel; STRIPE_WEBHOOK_SECRET para que el aviso de pago llegue aunque el cliente cierre la página.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { proveedorJSON } from './llamadas.js';

export const stripeListo = () => Boolean(process.env.STRIPE_SECRET_KEY);
// Cobro de facturas a clientes con tarjeta/Bizum: solo en la cuenta de Stripe de cada empresa (Stripe Connect,
// lib/stripeConnect.js), nunca en la de Fisquo. empresa: la de la factura; hace falta que su cuenta pueda cobrar.
export const cobroFacturasListo = (empresa) => stripeListo() && empresa?.stripeConnect?.estado === 'activa' && /^acct_\w+$/.test(empresa.stripeConnect.cuenta || '');
const API = () => process.env.STRIPE_URL || 'https://api.stripe.com';
// Versión de la API v2 (cuentas conectadas): la de las fechas de Stripe; se puede fijar con STRIPE_VERSION_V2.
export const VERSION_V2 = () => process.env.STRIPE_VERSION_V2 || '2026-09-30.endive';

// Stripe recibe los datos como formulario: { a: { b: 1 } } → a[b]=1
export function formulario(obj, prefijo = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const clave = prefijo ? `${prefijo}[${k}]` : k;
    if (v && typeof v === 'object') formulario(v, clave, out);
    else if (v !== undefined) out.append(clave, String(v));
  }
  return out;
}

// cuenta: la cuenta conectada de la empresa (cabecera Stripe-Account): el cobro es suyo (cargo directo), no de Fisquo.
export async function stripe(ruta, datos, { cuenta } = {}) {
  try {
    const { d } = await proveedorJSON('Stripe', `${API()}/v1/${ruta}`, {
      method: datos ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(cuenta ? { 'Stripe-Account': cuenta } : {}), ...(datos ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: datos ? formulario(datos) : undefined,
    }, { idempotente: !datos });
    return d;
  } catch (e) { return { error: e.message || 'Stripe no responde' }; }
}

// API v2 de Stripe (JSON): cuentas conectadas y sus enlaces de alta.
export async function stripeV2(ruta, datos) {
  try {
    const { d } = await proveedorJSON('Stripe', `${API()}/v2/${ruta}`, {
      method: datos ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Stripe-Version': VERSION_V2(), ...(datos ? { 'Content-Type': 'application/json' } : {}) },
      body: datos ? JSON.stringify(datos) : undefined,
    }, { idempotente: !datos });
    return d;
  } catch (e) { return { error: e.message || 'Stripe no responde' }; }
}

// Página de pago de Stripe para lo que queda por cobrar de una factura.
export const crearPago = ({ importe, concepto, email, volver, datos, cuenta }) => stripe('checkout/sessions', {
  mode: 'payment',
  line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(importe * 100), product_data: { name: concepto } } } },
  ...(email ? { customer_email: email } : {}),
  success_url: `${volver}?sesion={CHECKOUT_SESSION_ID}`,
  cancel_url: volver,
  metadata: datos,
  payment_intent_data: { metadata: datos },
}, { cuenta });

export const leerPago = (id, cuenta) => stripe(`checkout/sessions/${encodeURIComponent(id)}`, undefined, { cuenta });

// Firma de los avisos de Stripe: cabecera «t=…,v1=…» con HMAC-SHA256 de «t.cuerpo». Caduca a los 5 minutos.
// Los avisos de las cuentas conectadas llegan por su propio destino de webhook, con su secreto (STRIPE_WEBHOOK_SECRET_CONNECT).
export const firmaStripe = (cuerpo, cabecera) => [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET_CONNECT].some((x) => x && firmaValida(cuerpo, cabecera, x));
export function firmaValida(cuerpo, cabecera, secreto = process.env.STRIPE_WEBHOOK_SECRET, ahora = Date.now()) {
  if (!secreto || !cabecera) return false;
  const p = Object.fromEntries(cabecera.split(',').map((x) => x.split('=')));
  if (!p.t || !p.v1 || Math.abs(ahora / 1000 - Number(p.t)) > 300) return false;
  const esperada = createHmac('sha256', secreto).update(`${p.t}.${cuerpo}`).digest('hex');
  return esperada.length === p.v1.length && timingSafeEqual(Buffer.from(esperada), Buffer.from(p.v1));
}
