// Licencias que paga el despacho: el despacho incluye Fisquo en la cuota que cobra a su cliente y nos paga a nosotros.
// El cliente queda con el plan Pro de su tipo, «incluido por» su despacho, sin pagar nada a Fisquo. Cada cliente nuevo
// tiene DIAS_GRATIS antes de contar; después se factura al despacho cada mes por volumen (todas las licencias de un tipo
// al precio de su tramo), con Stripe Billing: una suscripción por despacho con una línea por tipo y su cantidad.
// Si el despacho deja de incluirla (o el cliente se va), el cliente tiene MARGEN_DIAS de prueba para elegir su plan.
import { redis } from './redis.js';
import { stripe } from './stripe.js';
import { fiscalDe } from './empresa.js';
import { VERSION_PLAN } from './prueba.js';
import { cambiarDespacho, cambiarVinculo, clientesDe, despachoDe, listarDespachos } from './despachos.js';
import { ivaDe } from './suscripcion.js';

export const DIAS_GRATIS = 90;
export const MARGEN_DIAS = 30;
const DIA = 86400000;
// Céntimos al mes por licencia (sin IVA), por tramos de volumen: hasta 24, de 25 a 99 y 100 o más.
export const TARIFA = {
  aut: [{ hasta: 24, cent: 700 }, { hasta: 99, cent: 600 }, { hasta: Infinity, cent: 500 }],
  pym: [{ hasta: 24, cent: 2000 }, { hasta: 99, cent: 1800 }, { hasta: Infinity, cent: 1600 }],
};
export const NOMBRES_LICENCIA = { aut: 'Autónomo Pro', pym: 'Pyme Pro' };
const fallo = (d) => d?.error?.message || d?.error || null;
const VIVA = ['active', 'trialing', 'past_due'];
const dia = (d) => d.toISOString().slice(0, 10);
const mas = (fecha, dias) => dia(new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * DIA));

export const tipoLicencia = (e) => (fiscalDe(e).tipo === 'sociedad' ? 'pym' : 'aut');
export const precioUnidad = (tipo, n) => (TARIFA[tipo].find((x) => n <= x.hasta) || TARIFA[tipo].at(-1)).cent;
// Paga su plan con tarjeta: hasta que lo cancele, no se le puede incluir (se le cobraría dos veces).
export const pagaSuPlan = (plan) => Boolean(plan?.pagado && plan.suscripcion && VIVA.includes(plan.estado) && !plan.porDespacho);

// El plan del cliente con la licencia del despacho, y el que le queda al quitársela.
export function planConLicencia(antes, tipo, d, hoy) {
  const { descuento: _d, hasta: _h, estado: _e, suscripcion: _s, ...resto } = antes || {};
  return { ...resto, tipo, nombre: 'Pro', version: VERSION_PLAN, periodo: 'mes', pagado: true, porDespacho: { id: d.id, nombre: d.nombre, desde: hoy } };
}
export function planSinLicencia(plan, hoy) {
  if (!plan?.porDespacho) return plan;
  const { porDespacho: _, ...resto } = plan;
  return { ...resto, pagado: false, hasta: mas(hoy, MARGEN_DIAS - 1) };
}

export async function incluirLicencia(empresaId, d, hoy) {
  return cambiarVinculo(empresaId, d.id, (v, e) => {
    if (v.licencia) return { vinculo: v };
    if (pagaSuPlan(e.plan)) return { error: 'Este cliente paga su plan con tarjeta. Cuando lo cancele en Ajustes › Tu plan, podrás incluirlo en tu cuota.', status: 409 };
    if (e.plan?.fundador) return { error: 'Este cliente ya tiene Fisquo gratis', status: 409 };
    return { vinculo: { ...v, licencia: { desde: hoy } }, plan: planConLicencia(e.plan, tipoLicencia(e), d, hoy) };
  });
}
export async function quitarLicencia(empresaId, despachoId, hoy) {
  return cambiarVinculo(empresaId, despachoId, (v, e) => {
    if (!v.licencia) return { vinculo: v };
    const { licencia: _, ...sin } = v;
    return { vinculo: sin, plan: planSinLicencia(e.plan, hoy) };
  });
}

// Licencias del despacho: cuántas hay de cada tipo, cuántas están aún en sus días gratis y cuánto sale al mes.
export function cuentaLicencias(empresas, hoy) {
  const r = { aut: { total: 0, gratis: 0 }, pym: { total: 0, gratis: 0 } };
  for (const e of empresas) {
    const l = e?.despachoCliente?.licencia;
    if (!l) continue;
    const tipo = tipoLicencia(e);
    r[tipo].total++;
    if (mas(l.desde, DIAS_GRATIS) > hoy) r[tipo].gratis++;
  }
  for (const tipo of Object.keys(r)) {
    const n = r[tipo].total - r[tipo].gratis;
    r[tipo].facturables = n;
    r[tipo].precio = n ? precioUnidad(tipo, n) : precioUnidad(tipo, 1);
    r[tipo].importe = n * (n ? precioUnidad(tipo, n) : 0);
  }
  return { ...r, importe: r.aut.importe + r.pym.importe };
}
export async function licenciasDe(d, hoy) {
  const ids = await clientesDe(d.id);
  const empresas = ids.length ? await redis.hmget('empresas', ...ids) : [];
  const lista = Array.isArray(empresas) ? empresas : ids.map((id) => empresas?.[id]);
  return cuentaLicencias(lista.filter((e) => e?.despachoCliente?.id === d.id), hoy);
}

// ---- Stripe: un precio por tipo con tramos de volumen, que se crea solo la primera vez (como lib/suscripcion.js).

export const claveLicencia = (tipo) => `fisquo_despacho_${tipo}_${TARIFA[tipo].map((x) => x.cent).join('-')}`;
export async function precioLicencia(tipo) {
  const clave = claveLicencia(tipo);
  const hay = await stripe(`prices?active=true&lookup_keys[]=${encodeURIComponent(clave)}`);
  if (fallo(hay)) return { error: fallo(hay) };
  if (hay.data?.[0]?.id) return { id: hay.data[0].id };
  const tiers = Object.fromEntries(TARIFA[tipo].map((x, i) => [i, { up_to: x.hasta === Infinity ? 'inf' : x.hasta, unit_amount: x.cent }]));
  const nuevo = await stripe('prices', {
    currency: 'eur', lookup_key: clave, tax_behavior: 'exclusive', billing_scheme: 'tiered', tiers_mode: 'volume', tiers,
    recurring: { interval: 'month' }, product_data: { name: `Fisquo para despachos · ${NOMBRES_LICENCIA[tipo]}` },
  });
  return fallo(nuevo) ? { error: fallo(nuevo) } : { id: nuevo.id };
}

// Página de pago del despacho con las licencias que ya cuentan (al menos una).
export async function checkoutDespacho(d, cuenta, { email, volver }) {
  const tipos = ['aut', 'pym'].filter((t) => cuenta[t].facturables > 0);
  if (!tipos.length) return { error: 'Aún no tienes licencias que pagar: los clientes nuevos tienen 90 días gratis.' };
  const [iva, ...precios] = await Promise.all([ivaDe(), ...tipos.map(precioLicencia)]);
  if (iva.error) return iva;
  const malo = precios.find((p) => p.error);
  if (malo) return malo;
  const s = await stripe('checkout/sessions', {
    mode: 'subscription',
    line_items: Object.fromEntries(tipos.map((t, i) => [i, { price: precios[i].id, quantity: cuenta[t].facturables, tax_rates: { 0: iva.id } }])),
    client_reference_id: `despacho:${d.id}`,
    ...(d.cobro?.cliente ? { customer: d.cobro.cliente, customer_update: { name: 'auto', address: 'auto' } } : email ? { customer_email: email } : {}),
    success_url: `${volver}?sesion={CHECKOUT_SESSION_ID}`, cancel_url: volver,
    billing_address_collection: 'required', tax_id_collection: { enabled: true },
    metadata: { despacho: d.id }, subscription_data: { metadata: { despacho: d.id } },
  });
  return fallo(s) ? { error: fallo(s) } : { url: s.url };
}

// Lo que dice Stripe de la suscripción del despacho, guardado en despacho.cobro.
export async function aplicarSuscripcionDespacho(sub) {
  const id = sub?.metadata?.despacho;
  if (!id || !(await despachoDe(id))) return null;
  const r = await cambiarDespacho(id, (d) => {
    if (d.cobro?.suscripcion && d.cobro.suscripcion !== sub.id && VIVA.includes(d.cobro.estado) && !VIVA.includes(sub.status)) return null;
    return { despacho: { ...d, cobro: { cliente: sub.customer?.id || sub.customer, suscripcion: sub.id, estado: sub.status, activo: VIVA.includes(sub.status) } } };
  });
  return r?.despacho?.cobro || null;
}

// Pone las cantidades de la suscripción al día (al incluir o quitar una licencia y cada mañana, cuando acaban los días
// gratis de algún cliente). Sin suscripción viva, nada: el panel pide activar el cobro.
export async function sincronizarLicencias(despachoId, hoy) {
  const d = await despachoDe(despachoId);
  if (!d?.cobro?.activo || !d.cobro.suscripcion || !process.env.STRIPE_SECRET_KEY) return { sincronizado: false };
  const cuenta = await licenciasDe(d, hoy);
  const sub = await stripe(`subscriptions/${encodeURIComponent(d.cobro.suscripcion)}`);
  if (fallo(sub)) return { error: fallo(sub) };
  const items = sub.items?.data || [];
  const cambios = {};
  let i = 0;
  for (const tipo of ['aut', 'pym']) {
    const precio = await precioLicencia(tipo);
    if (precio.error) return precio;
    const item = items.find((x) => x.price?.lookup_key === claveLicencia(tipo) || x.price?.id === precio.id);
    const n = cuenta[tipo].facturables;
    if (item && Number(item.quantity) !== n) cambios[i++] = n ? { id: item.id, quantity: n } : { id: item.id, deleted: 'true' };
    else if (!item && n) cambios[i++] = { price: precio.id, quantity: n };
  }
  if (!i) return { sincronizado: true, cuenta };
  const r = await stripe(`subscriptions/${encodeURIComponent(d.cobro.suscripcion)}`, { items: cambios, proration_behavior: 'create_prorations' });
  return fallo(r) ? { error: fallo(r) } : { sincronizado: true, cuenta };
}

// Cada mañana (app/api/recordatorios): todos los despachos con cobro activo. Un fallo no para a los demás.
export async function sincronizarTodas(hoy) {
  let n = 0;
  for (const d of await listarDespachos()) {
    if (!d.cobro?.activo) continue;
    const r = await sincronizarLicencias(d.id, hoy).catch((e) => ({ error: e.message }));
    if (r.error) console.warn('[licencias]', d.id, r.error);
    else n++;
  }
  return n;
}
