// Suscripción a Fisquo con compras dentro de la app de iOS (StoreKit 2), por las normas 3.1.1 y 3.1.3 de Apple: en la app
// de iOS los planes se contratan con el App Store; en la web, con Stripe (lib/suscripcion.js). Son los mismos planes y los
// mismos límites (lib/planes.js): solo cambia quién cobra. El plan de la empresa (empresa.plan) lleva entonces `apple`
// (abajo, planTrasApple) en lugar de la `suscripcion` de Stripe.
// - Productos de App Store Connect: com.fisquo.app.<tipo>.<plan>.<periodo> (productoDe), los 12 en un mismo grupo de
//   suscripción: con un ID de Apple solo se puede tener uno, y subir o bajar de plan es cambiar de producto dentro del grupo.
// - Cada empresa tiene su appAccountToken (un UUID, tokenDe): la app lo pasa al comprar y Apple lo devuelve en cada
//   transacción firmada, así se sabe de qué empresa es aunque la compre otra persona o se renueve sola.
// - La app manda las transacciones firmadas (JWS) a app/api/suscripcion/apple al comprar, al restaurar y al abrirse
//   (mobile/ios/App/App/ComprasPlugin.swift, lib/comprasNativas.js); Apple avisa de renovaciones, cobros fallidos, bajas
//   y reembolsos en app/api/appstore (App Store Server Notifications V2, atenderAviso); y el cron del día repasa las que han
//   pasado su fecha sin noticias (revisarApple), con la App Store Server API si está su clave.
// Todo lo firmado se comprueba con la cadena de certificados de Apple (lib/appleFirma.js) antes de tocar ningún plan.
import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { PLANES } from '../components/web/datos.js';
import { redis } from './redis.js';
import { decodificarJws, RAIZ_APPLE_G3, verificarJwsApple } from './appleFirma.js';
import { appleVigente, PERIODOS } from './planes.js';
import { esFundador, TIPOS_ALTA, VERSION_PLAN } from './prueba.js';
import { avisarSuscripcion } from './avisosCorreo.js';
import { historialPagoTrasCambio, pagaParaBajas } from './admin.js';
import { iniciarBajasAdmin } from './adminServidor.js';
import { conCerrojo } from './cerrojo.js';

export const BUNDLE = 'com.fisquo.app';
const DIA = 86400000;
const env = (k) => process.env[k]?.trim() || '';

// --- Productos ---

export const productoDe = (tipo, nombre, periodo) => `${BUNDLE}.${tipo}.${String(nombre).toLowerCase()}.${periodo}`;
// { 'com.fisquo.app.aut.esencial.mes': { tipo: 'aut', nombre: 'Esencial', periodo: 'mes' }, … }: Autónomo y Pyme, cada
// plan en mensual y anual. Los de «Business (anterior)» no se venden en la app.
export const PRODUCTOS = Object.fromEntries(Object.keys(TIPOS_ALTA).flatMap((tipo) => PLANES[tipo].flatMap((p) =>
  Object.keys(PERIODOS).map((periodo) => [productoDe(tipo, p.n, periodo), { tipo, nombre: p.n, periodo }]))));
export const planDeProducto = (id) => (Object.hasOwn(PRODUCTOS, String(id)) ? PRODUCTOS[id] : null);
// Los productos de los tipos que puede contratar la empresa (lib/formaJuridica.js tiposContratables).
export const productosPara = (tipos) => Object.keys(PRODUCTOS).filter((id) => tipos.includes(PRODUCTOS[id].tipo));

// --- Empresa de cada compra ---

// appAccountToken de la empresa: se crea la primera vez y no cambia. apple-token: empresa → token; apple-empresa: token →
// empresa (para los avisos de Apple). Dos peticiones a la vez se quedan con el mismo (hsetnx).
const esUuid = (t) => typeof t === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
export async function tokenDe(empresa) {
  const hay = await redis.hget('apple-token', empresa);
  if (esUuid(hay)) return String(hay).toLowerCase();
  await redis.hsetnx('apple-token', empresa, randomUUID());
  const token = String(await redis.hget('apple-token', empresa)).toLowerCase();
  await redis.hset('apple-empresa', { [token]: empresa });
  return token;
}
const empresaDeToken = async (t) => (esUuid(t) ? redis.hget('apple-empresa', String(t).toLowerCase()) : null);

// --- Datos firmados ---

// Raíces de confianza: la de Apple y, solo fuera de Vercel (pruebas locales), APPLE_RAIZ_PRUEBAS. Con APPLE_XCODE=1, también
// fuera de Vercel, se aceptan sin firma las transacciones del entorno «Xcode» (StoreKit Testing de Xcode, que no firma con
// la cadena de Apple): para probar la app en el simulador contra una copia local. En Vercel (también en las vistas previas,
// que usan la base de datos de producción) no hay ninguna de las dos.
const local = () => !process.env.VERCEL;
const raices = () => [RAIZ_APPLE_G3, ...(local() && env('APPLE_RAIZ_PRUEBAS') ? [env('APPLE_RAIZ_PRUEBAS').replace(/\\n/g, '\n')] : [])];

export function verificar(jws, ahora = new Date()) {
  const v = verificarJwsApple(jws, { raices: raices(), ahora });
  if (v.ok) return v;
  const sinFirma = local() && env('APPLE_XCODE') === '1' ? decodificarJws(jws) : null;
  return sinFirma?.environment === 'Xcode' ? { ok: true, payload: sinFirma } : v;
}

// Una transacción de una suscripción de Fisquo, comprobada: { tx } o { error }.
export function verificarTransaccion(jws, ahora = new Date()) {
  const v = verificar(jws, ahora);
  if (!v.ok) return { error: v.error || 'Firma no válida' };
  const tx = v.payload;
  if (tx.bundleId !== BUNDLE) return { error: 'La compra es de otra app' };
  if (!planDeProducto(tx.productId)) return { error: 'Producto desconocido' };
  if (!tx.originalTransactionId || !tx.transactionId) return { error: 'Transacción incompleta' };
  return { tx };
}

// --- El plan según Apple ---

// Estados de Apple (apple.estado): active · grace (cobro fallido dentro del periodo de gracia, se sigue usando todo) ·
// expired (terminada: baja o cobros agotados) · revoked (reembolso o revocada) · moved (la misma suscripción pasó a otra
// empresa). En el plan, como con Stripe: active, past_due o canceled (lib/admin.js y los correos de lib/avisosCorreo.js).
export { appleVigente };
const ayerDe = (hoy) => new Date(hoy.getTime() - DIA).toISOString().slice(0, 10);
// Al terminar: solo lectura desde hoy, como con Stripe. Una compra de pruebas (sandbox: TestFlight y la revisión de Apple,
// que renueva cada pocos minutos y termina sola en una hora) no gasta la prueba que quedaba: vuelve a ella.
const terminado = (plan, apple, hoy) => {
  const sandbox = apple?.entorno && apple.entorno !== 'Production' && plan?.hasta && plan.hasta >= hoy.toISOString().slice(0, 10);
  return { ...plan, apple, pagado: false, estado: 'canceled', hasta: sandbox || (plan?.hasta && plan.hasta < ayerDe(hoy)) ? plan.hasta : ayerDe(hoy) };
};

// tx: transacción firmada ya comprobada (JWSTransactionDecodedPayload); renovacion: JWSRenewalInfoDecodedPayload o null.
export function planTrasApple(antes, tx, renovacion = null, hoy = new Date()) {
  const p = planDeProducto(tx.productId);
  // Lo de Stripe (cupón, suscripción, estado) no sigue: ahora cobra Apple. El cliente de Stripe se queda (facturas de antes).
  const { descuento: _d, suscripcion: _s, estado: _e, ...previo } = antes || {};
  const ahora = hoy.getTime();
  const expira = Number(tx.expiresDate) || 0;
  const gracia = Number(renovacion?.gracePeriodExpiresDate) || 0;
  const revocada = Number(tx.revocationDate) || 0;
  const misma = antes?.apple?.original === String(tx.originalTransactionId);
  const renueva = renovacion ? renovacion.autoRenewStatus === 1 : misma ? antes.apple.renueva : undefined;
  const siguiente = renovacion?.autoRenewProductId && renovacion.autoRenewProductId !== tx.productId && planDeProducto(renovacion.autoRenewProductId) ? renovacion.autoRenewProductId : null;
  const estado = revocada ? 'revoked' : expira > ahora ? 'active' : gracia > ahora ? 'grace' : 'expired';
  const apple = {
    original: String(tx.originalTransactionId), transaccion: String(tx.transactionId), producto: tx.productId,
    compra: Number(tx.purchaseDate) || 0, expira, entorno: tx.environment || 'Production', estado,
    ...(renueva === undefined ? {} : { renueva }), ...(siguiente ? { siguiente } : {}), ...(gracia ? { gracia } : {}), ...(revocada ? { revocada } : {}),
  };
  const base = { ...previo, tipo: p.tipo, nombre: p.nombre, periodo: p.periodo, version: VERSION_PLAN };
  if (estado === 'active' || estado === 'grace') return { ...base, apple, pagado: true, estado: estado === 'grace' ? 'past_due' : 'active' };
  return terminado(base, apple, hoy);
}

// ¿Se ignora esta transacción porque la empresa ya tiene algo más nuevo?
// - De la misma suscripción: una mejorada (isUpgraded: la sustituye otra) o una compra anterior a la guardada (salvo que
//   sea la misma transacción, que puede volver con un reembolso).
// - De otra suscripción (otro ID de Apple u otra compra): una que ya no vale no quita la que sí vale.
function anterior(guardada, tx, hoy) {
  if (!guardada) return false;
  if (guardada.original === String(tx.originalTransactionId)) {
    if (tx.isUpgraded) return true;
    return (Number(tx.purchaseDate) || 0) < guardada.compra && String(tx.transactionId) !== guardada.transaccion;
  }
  const vale = !tx.revocationDate && Number(tx.expiresDate) > hoy.getTime();
  return !vale && appleVigente({ apple: guardada });
}

// Mismo contenido, sin importar el orden de las claves.
const ordenado = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenado(v[k])])) : v);
const mismo = (a, b) => JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b));

// Cambia el plan de una empresa con el cerrojo del plan (el mismo que Stripe, lib/suscripcion.js) y las cifras de bajas del
// panel /admin (lib/admin.js). cambio(e) → el plan nuevo, o null para no tocar nada. Devuelve { plan, antes } o null.
async function cambiarPlan(id, cambio, hoy) {
  const r = await conCerrojo(`empresa-plan:${id}`, async () => {
    const e = await redis.hget('empresas', id);
    if (!e || e.baja) return null;
    const plan = cambio(e);
    if (!plan || mismo(plan, e.plan)) return { plan: e.plan, antes: e.plan, igual: true };
    await iniciarBajasAdmin();
    // Las compras de pruebas (sandbox: TestFlight y la revisión de Apple) no cuentan como pago en las cifras.
    const despues = { ...e, plan, pagoConocidoAdmin: (plan.estado === 'active' && plan.apple?.entorno === 'Production') || pagaParaBajas(e) };
    await redis.hset('empresas', { [id]: { ...despues, historialPagoAdmin: historialPagoTrasCambio(e, despues, hoy) } });
    return { plan, antes: e.plan };
  });
  // Los avisos de cobro fallido los manda Apple (con su enlace para cambiar la forma de pago): aquí, solo el de plan
  // activado y el de plan terminado.
  if (r && !r.igual && r.plan.estado !== 'past_due') await avisarSuscripcion(id, r.antes, r.plan);
  return r;
}

// Guarda en su empresa lo que dice una transacción comprobada. empresa: la de quien la manda desde la app, solo para las
// compras sin appAccountToken (un código de oferta canjeado en el App Store) que aún no son de ninguna empresa.
// Devuelve { empresa, plan } o { error }.
export async function aplicarTransaccion(tx, { renovacion = null, empresa = null, hoy = new Date() } = {}) {
  const original = String(tx.originalTransactionId);
  const [porToken, porOriginal] = await Promise.all([empresaDeToken(tx.appAccountToken), redis.hget('apple-original', original)]);
  const id = String(porToken || porOriginal || empresa || '');
  if (!id) return { error: 'Sin empresa' };
  const r = await cambiarPlan(id, (e) => {
    // Fundador (gratis de por vida) no cambia; tampoco por algo más viejo que lo que ya tiene.
    if ((esFundador(e.plan) && !e.plan?.apple) || anterior(e.plan?.apple, tx, hoy)) return null;
    return planTrasApple(e.plan, tx, renovacion, hoy);
  }, hoy);
  if (!r) return { error: 'Sin empresa' };
  if (r.igual) return { empresa: id, plan: r.plan, cambiado: false };
  await redis.hset('apple-original', { [original]: id });
  // La misma suscripción estaba en otra empresa (se cambió de plan desde otra empresa con el mismo ID de Apple): allí termina.
  if (porOriginal && String(porOriginal) !== id) {
    await cambiarPlan(String(porOriginal), (otra) => (otra.plan?.apple?.original === original && appleVigente(otra.plan)
      ? terminado(otra.plan, { ...otra.plan.apple, estado: 'moved' }, hoy) : null), hoy);
  }
  return { empresa: id, plan: r.plan, cambiado: true };
}

// --- Avisos de Apple (App Store Server Notifications V2) ---

// signedPayload → { ok, tipo } o { error, status }. TEST y los que no traen transacción solo se confirman.
export async function atenderAviso(signedPayload, hoy = new Date()) {
  const v = verificar(signedPayload, hoy);
  if (!v.ok) return { error: v.error || 'Firma no válida', status: 400 };
  const n = v.payload;
  const d = n.data || {};
  if (d.bundleId && d.bundleId !== BUNDLE) return { error: 'Otra app', status: 400 };
  if (!d.signedTransactionInfo) return { ok: true, tipo: n.notificationType };
  const t = verificarTransaccion(d.signedTransactionInfo, hoy);
  if (t.error) return { error: t.error, status: 400 };
  const r = d.signedRenewalInfo ? verificar(d.signedRenewalInfo, hoy) : null;
  const res = await aplicarTransaccion(t.tx, { renovacion: r?.ok ? r.payload : null, hoy });
  if (res.error) console.warn(`[apple] aviso ${n.notificationType} sin empresa: ${t.tx.originalTransactionId}`);
  return { ok: true, tipo: n.notificationType, empresa: res.empresa || null };
}

// --- App Store Server API (opcional) ---

// Con APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID y APPLE_IAP_PRIVATE_KEY (clave «In-App Purchase» de App Store Connect, .p8).
export const apiAppleLista = () => Boolean(env('APPLE_IAP_KEY_ID') && env('APPLE_IAP_ISSUER_ID') && env('APPLE_IAP_PRIVATE_KEY'));
export function tokenApi(ahora = Math.floor(Date.now() / 1000)) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const cuerpo = `${b64({ alg: 'ES256', kid: env('APPLE_IAP_KEY_ID'), typ: 'JWT' })}.${b64({ iss: env('APPLE_IAP_ISSUER_ID'), iat: ahora, exp: ahora + 1200, aud: 'appstoreconnect-v1', bid: BUNDLE })}`;
  const firma = sign('sha256', Buffer.from(cuerpo), { key: createPrivateKey(env('APPLE_IAP_PRIVATE_KEY').replace(/\\n/g, '\n')), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${cuerpo}.${firma}`;
}
const servidorApi = (entorno) => env('APPLE_STOREKIT_URL') || (entorno === 'Sandbox' ? 'https://api.storekit-sandbox.itunes.apple.com' : 'https://api.storekit.itunes.apple.com');

// Último estado de una suscripción según Apple: { tx, renovacion } (ya comprobados), {} si Apple no la conoce, o { error }.
export async function estadoEnApple(original, entorno, { pedir = fetch, hoy = new Date() } = {}) {
  let r;
  try {
    r = await pedir(`${servidorApi(entorno)}/inApps/v1/subscriptions/${encodeURIComponent(original)}`, { headers: { Authorization: `Bearer ${tokenApi()}` }, signal: AbortSignal.timeout(10000) });
  } catch (e) { return { error: e.message }; }
  if (r.status === 404) return {};
  if (!r.ok) return { error: `App Store Server API: ${r.status}` };
  const d = await r.json().catch(() => ({}));
  const ultima = (d.data || []).flatMap((g) => g.lastTransactions || []).find((x) => String(x.originalTransactionId) === String(original));
  if (!ultima?.signedTransactionInfo) return {};
  const t = verificarTransaccion(ultima.signedTransactionInfo, hoy);
  if (t.error) return { error: t.error };
  const ren = ultima.signedRenewalInfo ? verificar(ultima.signedRenewalInfo, hoy) : null;
  return { tx: t.tx, renovacion: ren?.ok ? ren.payload : null };
}

// Cron del día (lib/trabajosTareas.js, dia-apple): una suscripción que ha pasado su fecha (y su gracia) sin que Apple
// avisara de la renovación. Con la API, manda lo que diga Apple. Sin ella, se da por terminada a los 7 días: el aviso de
// renovación de Apple no ha llegado, y si sigue pagada vuelve sola al abrir la app (o con «Restaurar compras»).
export const ESPERA_SIN_NOTICIAS = 7;
export const tocaRevisar = (plan, hoy = new Date()) => appleVigente(plan) && Math.max(plan.apple.expira || 0, plan.apple.gracia || 0) < hoy.getTime();
export async function revisarApple(id, hoy = new Date(), opciones = {}) {
  const e = await redis.hget('empresas', id);
  if (!e || e.baja || !tocaRevisar(e.plan, hoy)) return { cambiado: false };
  const a = e.plan.apple;
  if (apiAppleLista()) {
    const r = await estadoEnApple(a.original, a.entorno, { ...opciones, hoy });
    if (r.tx) { await aplicarTransaccion(r.tx, { renovacion: r.renovacion, empresa: id, hoy }); return { cambiado: true, api: true }; }
    if (r.error) console.warn(`[apple] ${id}: ${r.error}`);
  }
  if (Math.max(a.expira || 0, a.gracia || 0) + ESPERA_SIN_NOTICIAS * DIA > hoy.getTime()) return { cambiado: false };
  const r = await cambiarPlan(id, (x) => (tocaRevisar(x.plan, hoy) && x.plan.apple.original === a.original ? terminado(x.plan, { ...x.plan.apple, estado: 'expired' }, hoy) : null), hoy);
  return { cambiado: Boolean(r && !r.igual) };
}
