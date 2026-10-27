// Cobros con Stripe Checkout (tarjeta y, si está activado en el panel de Stripe, Bizum).
// Hace falta STRIPE_SECRET_KEY en Vercel; STRIPE_WEBHOOK_SECRET para que el aviso de pago llegue aunque el cliente cierre la página.
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { pasado } from './limite.js';
import { proveedorJSON } from './llamadas.js';
import { redis, leerUno } from './redis.js';
import { conCerrojo, Ocupado } from './cerrojo.js';
import { cerrojoFactura } from './actualizarFactura.js';
import { numeroFactura, saldoDe } from './calculos.js';

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
export async function stripe(ruta, datos, { cuenta, idempotencia } = {}) {
  try {
    const { d } = await proveedorJSON('Stripe', `${API()}/v1/${ruta}`, {
      method: datos ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(cuenta ? { 'Stripe-Account': cuenta } : {}), ...(idempotencia ? { 'Idempotency-Key': idempotencia } : {}), ...(datos ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
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
export const crearPago = ({ importe, concepto, email, volver, datos, cuenta, idempotencia }) => stripe('checkout/sessions', {
  mode: 'payment',
  line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(importe * 100), product_data: { name: concepto } } } },
  ...(email ? { customer_email: email } : {}),
  success_url: `${volver}?sesion={CHECKOUT_SESSION_ID}`,
  cancel_url: volver,
  metadata: datos,
  payment_intent_data: { metadata: datos },
}, { cuenta, idempotencia });

export const sesionPagoValida = (id) => typeof id === 'string' && /^cs_[A-Za-z0-9_]{1,197}$/.test(id);
export const leerPago = (id, cuenta) => sesionPagoValida(id)
  ? stripe(`checkout/sessions/${encodeURIComponent(id)}`, undefined, { cuenta })
  : Promise.resolve({ error: 'El enlace de pago no es válido. Vuelve a la factura.' });

// Checkout caduca como mucho a las 24 horas: el intento guardado no hace falta más allá.
const DOS_DIAS = 2 * 86400;
// Una sola sesión abierta por factura. publico: el error se puede enseñar tal cual al cliente. El intento se guarda antes de llamar a Stripe: si se corta la respuesta,
// el reintento usa la misma clave de idempotencia y recupera la sesión que ya se creó.
export async function prepararPago(d, { token, volver }) {
  try {
    return await conCerrojo(cerrojoFactura(d.e, d.f.id), async ({ quedaMs }) => {
      const comprobar = () => { if (quedaMs() <= 0) throw new Ocupado('La operación ha tardado demasiado: inténtalo de nuevo.'); };
      const f = await leerUno(d.e, 'facturas', d.f.id);
      const enlace = await redis.hget('factura-pagos', token);
      const empresa = await redis.hget('empresas', d.e.empresa);
      if (!f || !enlace || enlace.anulado || enlace.empresa !== d.e.empresa || enlace.id !== f.id || empresa?.baja || !cobroFacturasListo(empresa)) return { error: 'Este enlace ya no está disponible.', publico: true };
      const importe = Math.round(saldoDe(f) * 100);
      const cuenta = empresa.stripeConnect.cuenta;
      const k = `checkout:${d.e.empresa}:${f.id}`;
      let activa = await redis.get(k);
      const completar = async (intento) => {
        comprobar();
        const s = await crearPago({ ...intento.solicitud, idempotencia: intento.idempotencia });
        if (s.error || !s.id || !s.url || !s.expires_at) return { error: s.error || 'Stripe no ha devuelto el enlace de pago.' };
        comprobar();
        activa = { ...intento, id: s.id, url: s.url, caduca: s.expires_at };
        await redis.set(k, activa, { ex: DOS_DIAS });
        return s;
      };
      if (activa) {
        if (!activa.id) {
          const recuperada = await completar(activa);
          if (recuperada.error) return recuperada;
        }
        // La respuesta idempotente de creación puede ser antigua: se consulta el estado actual.
        const s = await leerPago(activa.id, activa.cuenta);
        if (s.error) return s;
        // Un pago confirmado pendiente del webhook no permite abrir otro Checkout; uno ya apuntado en la factura, sí.
        const aplicada = (f.pagos || []).some((p) => p.ref === activa.id);
        if (!aplicada && (s.status === 'complete' || s.payment_status === 'paid')) return { error: 'El pago se está confirmando. Vuelve a la factura en unos segundos.', publico: true };
        if (s.status === 'open') {
          if (importe > 0 && activa.importe === importe && activa.cuenta === cuenta && activa.token === token && activa.caduca * 1000 > Date.now()) return { id: activa.id, url: activa.url };
          comprobar();
          const cerrado = await stripe(`checkout/sessions/${encodeURIComponent(activa.id)}/expire`, {}, { cuenta: activa.cuenta });
          if (cerrado.error || cerrado.status !== 'expired') return { error: cerrado.error || 'No se ha podido cerrar el pago anterior.' };
        } else if (s.status !== 'expired' && !aplicada) return { error: 'No se ha podido comprobar el pago anterior.' };
      }
      if (importe <= 0) return { error: 'Esta factura no tiene nada que pagar.', publico: true };
      const intento = { importe, cuenta, token, idempotencia: randomUUID(), solicitud: {
        importe: importe / 100,
        concepto: `Factura ${numeroFactura(f)} · ${empresa.emisor?.nombre || empresa.nombre || ''}`.trim(),
        email: f.cliente?.email, volver, cuenta,
        datos: { token, factura: f.id, empresa: d.e.empresa, importe: String(importe) },
      } };
      comprobar();
      await redis.set(k, intento, { ex: DOS_DIAS });
      return completar(intento);
    });
  } catch (e) {
    if (e instanceof Ocupado) return { error: e.message, publico: true };
    throw e;
  }
}

// Vuelta pública de Checkout: se limita antes de consultar al proveedor, aunque cambie el id de sesión.
export async function leerPagoPublico(id, cuenta, { token, ip }) {
  if (!sesionPagoValida(id)) return { error: 'El enlace de pago no es válido. Vuelve a la factura.' };
  const [porToken, porIp] = await Promise.all([
    pasado('pago-vuelta-token', token, 10, 600),
    pasado('pago-vuelta-ip', ip, 30, 600),
  ]);
  if (porToken || porIp) return { error: 'Demasiadas consultas. Espera unos minutos.' };
  return leerPago(id, cuenta);
}

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
