// Cuota mensual del panel solo documentos, independiente de las licencias del despacho.
import { redis } from './redis.js';
import { stripe } from './stripe.js';
import { ivaDe } from './suscripcion.js';
import { cambiarDespacho, clientesDe, despachoDe, listarDespachos } from './despachos.js';
import { TRAMOS, PRUEBA_DIAS, tramoDe, textoTramo } from './tarifasDocumentos.js';

const VIVA = ['active', 'trialing', 'past_due'];
const PREFIJO = 'fisquo_panel_documentos_';
const fallo = (d) => d?.error?.message || d?.error || null;

export const panelActivo = (d) => Boolean(d?.demo || d?.panel?.activo);
export const esPanel = (sub) => sub?.metadata?.tipo === 'panel' && Boolean(sub?.metadata?.despacho);
export const claveTramo = (i) => `${PREFIJO}${TRAMOS[i].hasta === Infinity ? 'inf' : TRAMOS[i].hasta}_${TRAMOS[i].cent}`;

// El precio se crea solo la primera vez; la clave cambia al cambiar la tarifa.
export async function precioTramo(i) {
  const clave = claveTramo(i);
  const hay = await stripe(`prices?active=true&lookup_keys[]=${encodeURIComponent(clave)}`);
  if (fallo(hay)) return { error: fallo(hay) };
  if (hay.data?.[0]?.id) return { id: hay.data[0].id };
  const nuevo = await stripe('prices', {
    currency: 'eur', unit_amount: TRAMOS[i].cent, lookup_key: clave, tax_behavior: 'exclusive',
    recurring: { interval: 'month' }, product_data: { name: `Fisquo para despachos · Panel solo documentos (${textoTramo(i)})` },
  });
  return fallo(nuevo) ? { error: fallo(nuevo) } : { id: nuevo.id };
}

export function datosCheckoutPanel(d, { precio, iva, email, volver }) {
  const cliente = d.panel?.cliente || d.cobro?.cliente;
  const metadata = { despacho: d.id, tipo: 'panel' };
  return {
    mode: 'subscription',
    line_items: { 0: { price: precio, quantity: 1, tax_rates: { 0: iva } } },
    client_reference_id: `panel:${d.id}`,
    ...(cliente ? { customer: cliente, customer_update: { name: 'auto', address: 'auto' } } : email ? { customer_email: email } : {}),
    success_url: `${volver}?panel={CHECKOUT_SESSION_ID}`, cancel_url: volver,
    billing_address_collection: 'required', tax_id_collection: { enabled: true },
    metadata, subscription_data: { metadata, ...(!d.panel?.pruebaUsada ? { trial_period_days: PRUEBA_DIAS } : {}) },
  };
}

export async function checkoutPanel(d, n, { email, volver }) {
  const [iva, precio] = await Promise.all([ivaDe(), precioTramo(tramoDe(n))]);
  if (iva.error) return iva;
  if (precio.error) return precio;
  const s = await stripe('checkout/sessions', datosCheckoutPanel(d, { precio: precio.id, iva: iva.id, email, volver }));
  return fallo(s) ? { error: fallo(s) } : { url: s.url };
}

// Un aviso antiguo de otra suscripción no desactiva la que sigue viva.
export function panelDeSuscripcion(d, sub, hoy) {
  const cliente = sub.customer?.id || sub.customer;
  if (d.panel?.suscripcion && d.panel.suscripcion !== sub.id && VIVA.includes(d.panel.estado) && !VIVA.includes(sub.status)) return null;
  if (d.panel?.cliente && d.panel.cliente !== cliente) return null;
  const clave = sub.items?.data?.find((x) => x.price?.lookup_key?.startsWith(PREFIJO))?.price.lookup_key;
  const tramo = TRAMOS.findIndex((_, i) => claveTramo(i) === clave);
  return {
    cliente, suscripcion: sub.id, estado: sub.status, activo: VIVA.includes(sub.status),
    tramo: tramo < 0 ? (d.panel?.tramo ?? 0) : tramo, pruebaUsada: true,
    ...(sub.trial_end ? { finPrueba: new Date(sub.trial_end * 1000).toISOString().slice(0, 10) } : {}),
  };
}

export async function aplicarSuscripcionPanel(sub) {
  if (!esPanel(sub) || !(await despachoDe(sub.metadata.despacho))) return null;
  const r = await cambiarDespacho(sub.metadata.despacho, (d) => {
    const panel = panelDeSuscripcion(d, sub);
    return panel ? { despacho: { ...d, panel } } : null;
  });
  return r?.despacho?.panel || null;
}

export function cambiosTramo(items, precioId) {
  const item = items.find((x) => x.price?.lookup_key?.startsWith(PREFIJO) || x.price?.id === precioId);
  if (item?.price?.id === precioId) return {};
  if (item) return { 0: { id: item.id, deleted: 'true' }, 1: { price: precioId, quantity: 1 } };
  return { 0: { price: precioId, quantity: 1 } };
}

export function cuentaSoloDocumentos(empresas, despachoId) {
  return empresas.filter((e) => e?.documentos?.despacho === despachoId && !e.baja).length;
}

export async function soloDocumentosDe(d) {
  const ids = await clientesDe(d.id);
  const empresas = ids.length ? await redis.hmget('empresas', ...ids) : [];
  const lista = Array.isArray(empresas) ? empresas : ids.map((id) => empresas?.[id]);
  return cuentaSoloDocumentos(lista, d.id);
}

// Stripe prorratea la diferencia al subir o bajar de tramo.
export async function sincronizarPanel(despachoId, n) {
  const d = await despachoDe(despachoId);
  if (!panelActivo(d) || !d.panel?.suscripcion || !process.env.STRIPE_SECRET_KEY) return { sincronizado: false };
  const id = d.panel.suscripcion;
  const sub = await stripe(`subscriptions/${encodeURIComponent(id)}`);
  if (fallo(sub)) return { error: fallo(sub) };
  const tramo = tramoDe(n);
  const precio = await precioTramo(tramo);
  if (precio.error) return precio;
  const cambios = cambiosTramo(sub.items?.data || [], precio.id);
  if (!Object.keys(cambios).length) return { sincronizado: true, tramo };
  const r = await stripe(`subscriptions/${encodeURIComponent(id)}`, { items: cambios, proration_behavior: 'create_prorations' });
  if (fallo(r)) return { error: fallo(r) };
  const guardado = await cambiarDespacho(despachoId, (actual) => actual.panel?.suscripcion === id
    ? { despacho: { ...actual, panel: { ...actual.panel, tramo } } } : null);
  if (guardado?.error) return { error: guardado.error };
  return { sincronizado: true, tramo };
}

// Un fallo no para los demás despachos.
export async function sincronizarPaneles() {
  let n = 0;
  for (const d of await listarDespachos()) {
    if (!panelActivo(d)) continue;
    try {
      const r = await sincronizarPanel(d.id, await soloDocumentosDe(d));
      if (r.error) console.warn('[panel]', d.id, r.error);
      else if (r.sincronizado) n++;
    } catch (e) { console.warn('[panel]', d.id, e.message); }
  }
  return n;
}
