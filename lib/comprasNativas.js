'use client';

// Suscripción con compras dentro de la app de iOS (mobile/ios/App/App/ComprasPlugin.swift, StoreKit 2). La compra la hace
// Apple; cada transacción firmada se manda a app/api/suscripcion/apple, que la comprueba y deja el plan de la empresa al
// día (lib/compraApple.js). En el navegador y en la app de Android no existe (hayCompras() es false).
const plugin = () => (typeof window === 'undefined' ? null : window.Capacitor?.Plugins?.Compras || null);
export const hayCompras = () => Boolean(plugin());

const SIN_RED = 'No se ha podido conectar. Revisa la conexión.';
const json = async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) });

// Lo que necesita la pantalla de planes: { motivo, tipos, productos, token, apple, vigente } (app/api/suscripcion/apple).
export const datosCompras = () => fetch('/api/suscripcion/apple', { cache: 'no-store' }).then(json).catch(() => ({ ok: false, error: SIN_RED }));

// Manda transacciones ({ jws, … } del plugin) al servidor. Devuelve { ok, plan, apple, vigente, deOtra } o { ok: false, error }.
export function enviarTransacciones(lista) {
  const transacciones = (lista || []).map((t) => t?.jws).filter(Boolean);
  if (!transacciones.length) return Promise.resolve({ ok: true, vacio: true });
  return fetch('/api/suscripcion/apple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transacciones }) })
    .then(json).catch(() => ({ ok: false, error: SIN_RED }));
}

// Productos del App Store con su precio en la moneda de la persona: { 'com.fisquo.app.aut.pro.mes': { precio, … } }.
export async function productosApple(ids) {
  const { productos = [] } = await plugin().productos({ ids });
  return Object.fromEntries(productos.map((p) => [p.id, p]));
}

export const puedeComprar = () => plugin().puedeComprar().then((r) => Boolean(r?.puede)).catch(() => false);

// Compra un producto para la empresa (token: su appAccountToken). Devuelve { estado: 'comprado', plan, … } con el plan ya
// guardado, { estado: 'pendiente' } (Compra Aplazada o confirmación del banco: llegará sola), { estado: 'cancelado' } o
// { error }. Si el servidor no responde, la compra ya está hecha en Apple y se vuelve a mandar al abrir la app.
export async function comprarApple(id, token) {
  let r;
  try { r = await plugin().comprar({ id, token }); } catch (e) { return { error: e?.message || 'No se ha podido completar la compra.' }; }
  if (r?.estado !== 'comprado') return { estado: r?.estado || 'cancelado' };
  const s = await enviarTransacciones([r]);
  return s.ok ? { estado: 'comprado', ...s } : { estado: 'comprado', pendienteServidor: true, error: s.error };
}

// «Restaurar compras»: { ok, vacio } si este ID de Apple no tiene ninguna suscripción vigente; { cancelado } si cerró la hoja.
export async function restaurarApple() {
  let r;
  try { r = await plugin().restaurar(); } catch (e) { return { ok: false, error: e?.message || 'No se ha podido conectar con el App Store.' }; }
  if (r?.cancelado) return { ok: false, cancelado: true };
  return enviarTransacciones(r?.transacciones);
}

// Al abrir la app y tras gestionar la suscripción: manda las vigentes de este ID de Apple (sin pedir nada a la persona).
export async function sincronizarApple() {
  if (!plugin()) return { ok: true, vacio: true };
  const r = await plugin().sincronizar().catch(() => null);
  return enviarTransacciones(r?.transacciones);
}

// Las suscripciones vigentes de este ID de Apple, sin mandarlas: [{ producto, token, original, expira }].
export const vigentesApple = () => plugin().sincronizar().then((r) => r?.transacciones || []).catch(() => []);

export const gestionarApple = () => plugin().gestionar();

// Renovaciones y compras que acaban fuera de la pantalla de planes: se mandan al servidor según llegan. fn(resultado).
// Devuelve la función para dejar de escuchar.
export function escucharCompras(fn) {
  const p = plugin();
  if (!p?.addListener) return () => {};
  const h = p.addListener('transaccion', async (t) => { const r = await enviarTransacciones([t]); fn?.(r); });
  return () => { Promise.resolve(h).then((x) => x?.remove?.()).catch(() => {}); };
}
