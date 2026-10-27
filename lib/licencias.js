// Licencias que paga el despacho: el despacho incluye Fisquo en la cuota que cobra a su cliente y nos paga a nosotros.
// El cliente queda con el plan Pro de su tipo, «incluido por» su despacho, sin pagar nada a Fisquo. Cada cliente nuevo
// tiene DIAS_GRATIS antes de contar; después se factura al despacho cada mes por volumen (todas las licencias de un tipo
// al precio de su tramo), con Stripe Billing: una suscripción por despacho con una línea por tipo y su cantidad.
// Si el despacho deja de incluirla (o el cliente se va), el cliente tiene MARGEN_DIAS de prueba para elegir su plan.
// Oferta de lanzamiento: los OFERTA.plazas primeros despachos que activan el cobro pagan TARIFA_LANZAMIENTO durante
// OFERTA.anios (despacho.oferta = { desde, hasta }); después, la TARIFA normal. Se avisa AVISO_OFERTA_DIAS antes.
import { redis } from './redis.js';
import { stripe } from './stripe.js';
import { fiscalDe } from './empresa.js';
import { esFundador, VERSION_PLAN } from './prueba.js';
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
export const TARIFA_LANZAMIENTO = {
  aut: [{ hasta: 24, cent: 600 }, { hasta: 99, cent: 500 }, { hasta: Infinity, cent: 400 }],
  pym: [{ hasta: 24, cent: 1200 }, { hasta: 99, cent: 1100 }, { hasta: Infinity, cent: 1000 }],
};
export const OFERTA = { plazas: 30, anios: 2 };
export const AVISO_OFERTA_DIAS = 60;
const PLAZAS = 'oferta-despachos';
export const NOMBRES_LICENCIA = { aut: 'Autónomo Pro', pym: 'Pyme Pro' };
const fallo = (d) => d?.error?.message || d?.error || null;
const VIVA = ['active', 'trialing', 'past_due'];
const dia = (d) => d.toISOString().slice(0, 10);
const mas = (fecha, dias) => dia(new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * DIA));

export const tipoLicencia = (e) => (fiscalDe(e).tipo === 'sociedad' ? 'pym' : 'aut');
export const precioUnidad = (tipo, n, tarifa = TARIFA) => (tarifa[tipo].find((x) => n <= x.hasta) || tarifa[tipo].at(-1)).cent;

// ---- Oferta de lanzamiento. Las plazas son un conjunto de ids de despacho en Redis (tomar la misma dos veces no cuenta).
export const finOferta = (desde) => mas(`${Number(desde.slice(0, 4)) + OFERTA.anios}${desde.slice(4)}`, -1);
export const enOferta = (d, hoy) => Boolean(d?.oferta && hoy <= d.oferta.hasta);
export async function plazasLibres() {
  if (!redis) return null;
  return Math.max(0, OFERTA.plazas - Number(await redis.scard(PLAZAS)));
}
// La tarifa que paga el despacho: la de lanzamiento si tiene la oferta, o si aún no cobra y quedan plazas (la tendrá
// al activar el cobro).
export async function tarifaDe(d, hoy) {
  if (d?.oferta) return enOferta(d, hoy) ? TARIFA_LANZAMIENTO : TARIFA;
  if (!d?.cobro?.activo && !d?.demo && (await plazasLibres()) > 0) return TARIFA_LANZAMIENTO;
  return TARIFA;
}
// Con el cobro activo, el despacho toma su plaza (si quedan). Los de demostración no ocupan.
export async function tomarPlaza(d, hoy) {
  if (d.oferta || d.demo || !redis) return d;
  if (!(await redis.sismember(PLAZAS, d.id)) && Number(await redis.scard(PLAZAS)) >= OFERTA.plazas) return d;
  await redis.sadd(PLAZAS, d.id);
  if (Number(await redis.scard(PLAZAS)) > OFERTA.plazas) { await redis.srem(PLAZAS, d.id); return d; }
  return { ...d, oferta: { desde: hoy, hasta: finOferta(hoy) } };
}
// Paga su plan con tarjeta: hasta que lo cancele, no se le puede incluir (se le cobraría dos veces).
export const pagaSuPlan = (plan) => Boolean(plan?.pagado && plan.suscripcion && VIVA.includes(plan.estado) && !plan.porDespacho);

// El plan del cliente con la licencia del despacho, y el que le queda al quitársela.
// hastaPrueba: el último día de la prueba que tenía (si estaba en ella): al quitar la licencia no pierde esos días.
// licenciaPrimera: la primera vez que un despacho incluyó a esta empresa; se queda en el plan para siempre y de ella cuentan
// los días gratis (quitar y volver a incluir no los reinicia).
export function planConLicencia(antes, tipo, d, hoy) {
  const { descuento: _d, hasta, estado: _e, suscripcion: _s, ...resto } = antes || {};
  const hastaPrueba = !antes?.pagado && hasta && hasta >= hoy ? hasta : null;
  return { ...resto, licenciaPrimera: antes?.licenciaPrimera || hoy, tipo, nombre: 'Pro', version: VERSION_PLAN, periodo: 'mes', pagado: true, porDespacho: { id: d.id, nombre: d.nombre, desde: hoy, ...(hastaPrueba ? { hastaPrueba } : {}) } };
}
// Sin cobro activo, una licencia solo dura sus días gratis y RETIRAR_DIAS más (para activar el cobro): después se retira.
export const RETIRAR_DIAS = 15;
const cobra = (d) => Boolean(d?.cobro?.activo || d?.demo);
export function planSinLicencia(plan, hoy) {
  if (!plan?.porDespacho) return plan;
  const { porDespacho, ...resto } = plan;
  const margen = mas(hoy, MARGEN_DIAS - 1);
  return { ...resto, pagado: false, hasta: porDespacho.hastaPrueba > margen ? porDespacho.hastaPrueba : margen };
}

export async function incluirLicencia(empresaId, d, hoy) {
  return cambiarVinculo(empresaId, d.id, (v, e) => {
    if (v.licencia) return { vinculo: v };
    if (pagaSuPlan(e.plan)) return { error: 'Este cliente paga su plan con tarjeta. Cuando lo cancele en Ajustes › Tu plan, podrás incluirlo en tu cuota.', status: 409 };
    // Sin plan (cuentas de antes) o Fundador: ya lo tiene gratis y sin límites.
    if (esFundador(e.plan)) return { error: 'Este cliente ya tiene Fisquo gratis', status: 409 };
    const desde = e.plan?.licenciaPrimera || hoy;
    if (!cobra(d) && mas(desde, DIAS_GRATIS) <= hoy) return { error: `Sus ${DIAS_GRATIS} días gratis ya pasaron: activa el cobro en Ajustes para incluirlo.`, status: 409 };
    return { vinculo: { ...v, licencia: { desde } }, plan: planConLicencia(e.plan, tipoLicencia(e), d, hoy) };
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
export function cuentaLicencias(empresas, hoy, tarifa = TARIFA) {
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
    r[tipo].precio = precioUnidad(tipo, n || 1, tarifa);
    r[tipo].importe = n * precioUnidad(tipo, n || 1, tarifa);
  }
  return { ...r, importe: r.aut.importe + r.pym.importe, lanzamiento: tarifa === TARIFA_LANZAMIENTO };
}
export async function licenciasDe(d, hoy) {
  const ids = await clientesDe(d.id);
  const empresas = ids.length ? await redis.hmget('empresas', ...ids) : [];
  const lista = Array.isArray(empresas) ? empresas : ids.map((id) => empresas?.[id]);
  return cuentaLicencias(lista.filter((e) => e?.despachoCliente?.id === d.id && !e.baja), hoy, await tarifaDe(d, hoy));
}

// ---- Stripe: un precio por tipo con tramos de volumen, que se crea solo la primera vez (como lib/suscripcion.js).

export const claveLicencia = (tipo, tarifa = TARIFA) => `fisquo_despacho_${tipo}_${tarifa[tipo].map((x) => x.cent).join('-')}`;
export async function precioLicencia(tipo, tarifa = TARIFA) {
  const clave = claveLicencia(tipo, tarifa);
  const hay = await stripe(`prices?active=true&lookup_keys[]=${encodeURIComponent(clave)}`);
  if (fallo(hay)) return { error: fallo(hay) };
  if (hay.data?.[0]?.id) return { id: hay.data[0].id };
  const tiers = Object.fromEntries(tarifa[tipo].map((x, i) => [i, { up_to: x.hasta === Infinity ? 'inf' : x.hasta, unit_amount: x.cent }]));
  const nuevo = await stripe('prices', {
    currency: 'eur', lookup_key: clave, tax_behavior: 'exclusive', billing_scheme: 'tiered', tiers_mode: 'volume', tiers,
    recurring: { interval: 'month' }, product_data: { name: `Fisquo para despachos · ${NOMBRES_LICENCIA[tipo]}${tarifa === TARIFA_LANZAMIENTO ? ' (lanzamiento)' : ''}` },
  });
  return fallo(nuevo) ? { error: fallo(nuevo) } : { id: nuevo.id };
}

// Página de pago del despacho con las licencias que ya cuentan (al menos una).
export async function checkoutDespacho(d, cuenta, { email, volver }) {
  const tipos = ['aut', 'pym'].filter((t) => cuenta[t].facturables > 0);
  if (!tipos.length) return { error: 'Aún no tienes licencias que pagar: los clientes nuevos tienen 90 días gratis.' };
  const tarifa = cuenta.lanzamiento ? TARIFA_LANZAMIENTO : TARIFA;
  const [iva, ...precios] = await Promise.all([ivaDe(), ...tipos.map((t) => precioLicencia(t, tarifa))]);
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
  const cliente = sub.customer?.id || sub.customer;
  const r = await cambiarDespacho(id, async (d) => {
    if (d.cobro?.suscripcion && d.cobro.suscripcion !== sub.id && VIVA.includes(d.cobro.estado) && !VIVA.includes(sub.status)) return null;
    // Refuerzo: si el despacho ya tiene cliente en Stripe, solo vale una suscripción de ese mismo cliente.
    if (d.cobro?.cliente && cliente && d.cobro.cliente !== cliente) return null;
    const activo = VIVA.includes(sub.status);
    const con = { ...d, cobro: { cliente, suscripcion: sub.id, estado: sub.status, activo } };
    return { despacho: activo ? await tomarPlaza(con, dia(new Date())) : con };
  });
  return r?.despacho?.cobro || null;
}

// Pone las cantidades de la suscripción al día (al incluir o quitar una licencia y cada mañana, cuando acaban los días
// gratis de algún cliente). Sin suscripción viva, nada: el panel pide activar el cobro.
export async function sincronizarLicencias(despachoId, hoy) {
  const d = await despachoDe(despachoId);
  if (!d?.cobro?.activo || !d.cobro.suscripcion || !process.env.STRIPE_SECRET_KEY) return { sincronizado: false };
  const cuenta = await licenciasDe(d, hoy);
  const tarifa = cuenta.lanzamiento ? TARIFA_LANZAMIENTO : TARIFA;
  const sub = await stripe(`subscriptions/${encodeURIComponent(d.cobro.suscripcion)}`);
  if (fallo(sub)) return { error: fallo(sub) };
  const items = sub.items?.data || [];
  const cambios = {};
  let i = 0;
  for (const tipo of ['aut', 'pym']) {
    const precio = await precioLicencia(tipo, tarifa);
    if (precio.error) return precio;
    // Cualquier precio de licencia de este tipo (el de lanzamiento o el normal): al acabar la oferta se cambia de precio.
    const item = items.find((x) => x.price?.id === precio.id || x.price?.lookup_key?.startsWith(`fisquo_despacho_${tipo}_`));
    const n = cuenta[tipo].facturables;
    if (item && item.price?.id !== precio.id) {
      cambios[i++] = { id: item.id, deleted: 'true' };
      if (n) cambios[i++] = { price: precio.id, quantity: n };
    } else if (item && Number(item.quantity) !== n) cambios[i++] = n ? { id: item.id, quantity: n } : { id: item.id, deleted: 'true' };
    else if (!item && n) cambios[i++] = { price: precio.id, quantity: n };
  }
  if (!i) return { sincronizado: true, cuenta };
  const r = await stripe(`subscriptions/${encodeURIComponent(d.cobro.suscripcion)}`, { items: cambios, proration_behavior: 'create_prorations' });
  return fallo(r) ? { error: fallo(r) } : { sincronizado: true, cuenta };
}

// Sin cobro activo: retira las licencias cuyos días gratis acabaron hace más de RETIRAR_DIAS (el cliente tiene su margen).
export async function retirarSinCobro(d, hoy) {
  if (cobra(d)) return 0;
  let n = 0;
  const ids = await clientesDe(d.id);
  const empresas = ids.length ? await redis.hmget('empresas', ...ids) : [];
  const lista = Array.isArray(empresas) ? empresas : ids.map((id) => empresas?.[id]);
  for (const e of lista) {
    const l = e?.despachoCliente?.id === d.id && e.despachoCliente.licencia;
    if (l && mas(l.desde, DIAS_GRATIS + RETIRAR_DIAS) <= hoy && !(await quitarLicencia(e.id, d.id, hoy)).error) n++;
  }
  return n;
}

// Cada mañana (app/api/recordatorios): las cantidades de los despachos con cobro activo y, en los que no lo tienen, se
// retiran las licencias que ya no están en sus días gratis. Los que cobraban antes de la oferta toman plaza si queda, y
// a los que les acaba en AVISO_OFERTA_DIAS se les avisa (una vez). Un fallo no para a los demás.
export async function sincronizarTodas(hoy, { avisar } = {}) {
  let n = 0;
  for (let d of await listarDespachos()) {
    if (!d.cobro?.activo) { await retirarSinCobro(d, hoy).catch((e) => console.warn('[licencias]', d.id, e.message)); continue; }
    if (!d.oferta && !d.demo) d = (await cambiarDespacho(d.id, async (x) => ({ despacho: await tomarPlaza(x, hoy) })).catch(() => null))?.despacho || d;
    if (avisar && enOferta(d, hoy) && mas(hoy, AVISO_OFERTA_DIAS) >= d.oferta.hasta) await avisar(d).catch((e) => console.warn('[licencias]', d.id, e.message));
    const r = await sincronizarLicencias(d.id, hoy).catch((e) => ({ error: e.message }));
    if (r.error) console.warn('[licencias]', d.id, r.error);
    else n++;
  }
  return n;
}
