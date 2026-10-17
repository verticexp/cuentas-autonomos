// Suscripción a Netto con Stripe Billing: Checkout para contratar, portal del cliente para tarjeta, facturas y baja,
// y el aviso de Stripe (app/api/stripe) para dejar empresa.plan al día. No tiene que ver con lib/cobros.js, que son
// los cobros de las facturas de cada empresa a sus clientes (Checkout en modo pago, metadata.token).
// IVA: el 21 % de ivaDe(), sumado al precio (los precios de la web van sin IVA).
// Los precios no se crean a mano en Stripe: se buscan por lookup_key y, si no existen, se crean (lib/planes.js importe).
import { redis } from './redis.js';
import { stripe } from './stripe.js';
import { importe, PERIODOS } from './planes.js';
import { planDe, TIPOS } from './prueba.js';

const DIA = 86400000;
const fallo = (d) => d?.error?.message || d?.error || null;

// Clave del precio: cambia sola si cambia el importe en components/web/datos.js.
export const claveDePrecio = (tipo, nombre, periodo) => `netto_${tipo}_${nombre}_${periodo}_${importe(tipo, nombre, periodo)}`.toLowerCase();

export async function precioDe(tipo, nombre, periodo) {
  const centimos = importe(tipo, nombre, periodo);
  if (!centimos) return { error: 'Plan no válido' };
  const clave = claveDePrecio(tipo, nombre, periodo);
  const hay = await stripe(`prices?active=true&lookup_keys[]=${encodeURIComponent(clave)}`);
  if (fallo(hay)) return { error: fallo(hay) };
  if (hay.data?.[0]?.id) return { id: hay.data[0].id };
  const nuevo = await stripe('prices', {
    currency: 'eur', unit_amount: centimos, lookup_key: clave, tax_behavior: 'exclusive',
    recurring: { interval: periodo === 'anio' ? 'year' : 'month' },
    product_data: { name: `Netto ${TIPOS[tipo]} ${nombre}` },
  });
  return fallo(nuevo) ? { error: fallo(nuevo) } : { id: nuevo.id };
}

// IVA del 21 % que se suma al precio: STRIPE_IVA (txr_…) si está; si no, el que ya haya en Stripe o uno nuevo.
export async function ivaDe() {
  if (process.env.STRIPE_IVA) return { id: process.env.STRIPE_IVA };
  const hay = await stripe('tax_rates?active=true&inclusive=false&limit=100');
  if (fallo(hay)) return { error: fallo(hay) };
  const ya = hay.data?.find((t) => Number(t.percentage) === 21 && t.country === 'ES' && !t.inclusive);
  if (ya) return { id: ya.id };
  const nuevo = await stripe('tax_rates', { display_name: 'IVA', percentage: 21, inclusive: false, country: 'ES', jurisdiction: 'ES', description: 'IVA 21 % España (suscripciones Netto)', tax_type: 'vat' });
  return fallo(nuevo) ? { error: fallo(nuevo) } : { id: nuevo.id };
}

// Datos que viajan con la suscripción para saber de qué empresa y plan es.
const datosDe = (empresa, tipo, nombre, periodo) => ({ empresa, tipo, nombre, periodo });

// Página de pago. Si quedan al menos 2 días de prueba, Stripe no cobra hasta que acabe (trial_end).
export async function crearCheckout({ empresa, plan, tipo, nombre, periodo, email, volver, hoy = new Date() }) {
  const [precio, iva] = await Promise.all([precioDe(tipo, nombre, periodo), ivaDe()]);
  if (precio.error) return precio;
  if (iva.error) return iva;
  const fin = plan?.hasta && !plan.pagado ? Date.parse(`${plan.hasta}T23:59:59Z`) : 0;
  const datos = datosDe(empresa, tipo, nombre, periodo);
  const s = await stripe('checkout/sessions', {
    mode: 'subscription',
    line_items: { 0: { price: precio.id, quantity: 1, tax_rates: { 0: iva.id } } },
    client_reference_id: empresa,
    ...(plan?.cliente ? { customer: plan.cliente, customer_update: { name: 'auto', address: 'auto' } } : email ? { customer_email: email } : {}),
    success_url: `${volver}?sesion={CHECKOUT_SESSION_ID}`,
    cancel_url: volver,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    allow_promotion_codes: true,
    metadata: datos,
    subscription_data: { metadata: datos, ...(fin - hoy.getTime() > 2 * DIA ? { trial_end: Math.floor(fin / 1000) } : {}) },
  });
  return fallo(s) ? { error: fallo(s) } : { url: s.url };
}

// Cambio de plan de una suscripción que ya existe: Stripe prorratea la diferencia.
export async function cambiarPlan({ plan, tipo, nombre, periodo, empresa }) {
  const sub = await stripe(`subscriptions/${encodeURIComponent(plan.suscripcion)}`);
  if (fallo(sub)) return { error: fallo(sub) };
  const precio = await precioDe(tipo, nombre, periodo);
  if (precio.error) return precio;
  const r = await stripe(`subscriptions/${encodeURIComponent(plan.suscripcion)}`, {
    items: { 0: { id: sub.items?.data?.[0]?.id, price: precio.id } }, // el IVA del Checkout se queda en la línea
    proration_behavior: 'create_prorations',
    metadata: datosDe(empresa, tipo, nombre, periodo),
  });
  if (fallo(r)) return { error: fallo(r) };
  return { plan: await aplicarSuscripcion(r) };
}

export async function portal({ plan, volver }) {
  if (!plan?.cliente) return { error: 'Aún no tienes una suscripción' };
  const s = await stripe('billing_portal/sessions', { customer: plan.cliente, return_url: volver });
  return fallo(s) ? { error: fallo(s) } : { url: s.url };
}

// Al volver del Checkout: no espera al aviso de Stripe.
export async function confirmarCheckout(id, empresa) {
  const s = await stripe(`checkout/sessions/${encodeURIComponent(id)}?expand[]=subscription`);
  if (fallo(s)) return { error: fallo(s) };
  if (s.mode !== 'subscription' || s.metadata?.empresa !== empresa || !s.subscription?.id) return { error: 'Ese pago no es de esta empresa' };
  return { plan: await aplicarSuscripcion(s.subscription) };
}

// Estados de Stripe con los que se sigue pudiendo usar todo (past_due: Stripe reintenta el cobro unos días).
const VIVA = ['active', 'trialing', 'past_due'];

// El plan que queda en la empresa según la suscripción. Si se da de baja o deja de pagar, solo lectura desde hoy.
export function planTrasSuscripcion(antes, sub, hoy = new Date()) {
  const m = sub.metadata || {};
  const tipo = planDe(m.tipo, m.nombre) ? m.tipo : antes?.tipo;
  const nombre = planDe(m.tipo, m.nombre) ? m.nombre : antes?.nombre;
  const base = { ...antes, tipo, nombre, periodo: PERIODOS[m.periodo] ? m.periodo : antes?.periodo, cliente: sub.customer?.id || sub.customer, suscripcion: sub.id, estado: sub.status };
  if (VIVA.includes(sub.status)) return { ...base, pagado: true };
  const ayer = new Date(hoy.getTime() - DIA).toISOString().slice(0, 10);
  return { ...base, pagado: false, hasta: antes?.hasta && antes.hasta < ayer ? antes.hasta : ayer };
}

// Guarda en la empresa lo que dice Stripe. Ignora suscripciones de otra empresa o antiguas (si ya tiene otra).
export async function aplicarSuscripcion(sub) {
  const id = sub?.metadata?.empresa;
  const e = id && (await redis.hget('empresas', id));
  if (!e) return null;
  if (e.plan?.suscripcion && e.plan.suscripcion !== sub.id && VIVA.includes(e.plan.estado) && !VIVA.includes(sub.status)) return e.plan;
  const plan = planTrasSuscripcion(e.plan, sub);
  await redis.hset('empresas', { [id]: { ...e, plan } });
  return plan;
}
