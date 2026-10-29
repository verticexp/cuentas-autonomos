import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { TRAMOS, PRUEBA_DIAS, PAGINAS_MES, tramoDe, textoTramo, cabe } from '../lib/tarifasDocumentos.js';

// Solo funciones puras: ninguna dependencia puede consultar Stripe ni Redis.
const dependencias = {
  './redis.js': 'export const redis = null;',
  './stripe.js': 'export const stripe = () => { throw new Error("Stripe inesperado"); };',
  './suscripcion.js': 'export const ivaDe = () => { throw new Error("IVA inesperado"); };',
  './despachos.js': 'const fallo = () => { throw new Error("Redis inesperado"); }; export { fallo as cambiarDespacho, fallo as clientesDe, fallo as despachoDe, fallo as listarDespachos };',
};
const hooks = registerHooks({
  resolve(spec, context, next) {
    if (context.parentURL === new URL('../lib/panelDocumentos.js', import.meta.url).href && dependencias[spec]) {
      return { url: `data:text/javascript,${encodeURIComponent(dependencias[spec])}`, shortCircuit: true };
    }
    return next(spec, context);
  },
});
let P;
try { P = await import('../lib/panelDocumentos.js'); } finally { hooks.deregister(); }

const opciones = { precio: 'price_panel', iva: 'txr_iva', email: 'ana@example.test', volver: 'https://fisquo.test/despacho' };
const suscripcion = (datos = {}) => ({
  id: 'sub_panel', customer: 'cus_panel', status: 'active',
  metadata: { despacho: 'd1', tipo: 'panel' },
  items: { data: [{ id: 'si_panel', price: { id: 'price_panel', lookup_key: P.claveTramo(1) } }] },
  ...datos,
});

test('tramos: bordes, textos, capacidad y claves de precio', () => {
  for (const [n, i] of [[0, 0], [1, 0], [25, 0], [26, 1], [75, 1], [76, 2], [1000, 2], [-1, 0]]) assert.equal(tramoDe(n), i);
  assert.deepEqual(TRAMOS.map((_, i) => textoTramo(i)), ['Hasta 25 clientes', 'Hasta 75 clientes', 'Sin límite']);
  assert.equal(cabe(0, 25), true);
  assert.equal(cabe(0, 26), false);
  assert.equal(cabe(1, 75), true);
  assert.equal(cabe(1, 76), false);
  assert.equal(cabe(2, 1000), true);
  for (const [i, t] of TRAMOS.entries()) assert.equal(P.claveTramo(i), `fisquo_panel_documentos_${t.hasta === Infinity ? 'inf' : t.hasta}_${t.cent}`);
  assert.ok(PRUEBA_DIAS > 0);
  assert.ok(PAGINAS_MES > 0);
});

test('panel activo y reconocimiento de suscripciones del panel', () => {
  assert.equal(P.panelActivo(undefined), false);
  assert.equal(P.panelActivo({ demo: true }), true);
  assert.equal(P.panelActivo({ panel: { activo: true } }), true);
  assert.equal(P.panelActivo({ cobro: { activo: true } }), false);
  assert.equal(P.esPanel(suscripcion()), true);
  for (const sub of [undefined, {}, { metadata: { despacho: 'd1' } }, { metadata: { tipo: 'panel' } }]) assert.equal(P.esPanel(sub), false);
});

test('checkout: cuota única con IVA y primera prueba', () => {
  assert.deepEqual(P.datosCheckoutPanel({ id: 'd1' }, opciones), {
    mode: 'subscription',
    line_items: { 0: { price: opciones.precio, quantity: 1, tax_rates: { 0: opciones.iva } } },
    client_reference_id: 'panel:d1', customer_email: opciones.email,
    success_url: `${opciones.volver}?panel={CHECKOUT_SESSION_ID}`, cancel_url: opciones.volver,
    billing_address_collection: 'required', tax_id_collection: { enabled: true },
    metadata: { despacho: 'd1', tipo: 'panel' },
    subscription_data: { metadata: { despacho: 'd1', tipo: 'panel' }, trial_period_days: PRUEBA_DIAS },
  });
  const sinEmail = P.datosCheckoutPanel({ id: 'd1' }, { ...opciones, email: undefined });
  assert.equal('customer_email' in sinEmail, false);
  assert.equal('customer' in sinEmail, false);
});

test('checkout: prueba gastada y cliente reutilizado del panel o de licencias', () => {
  for (const [panel, cliente] of [[{ pruebaUsada: true, cliente: 'cus_panel' }, 'cus_panel'], [{ pruebaUsada: true }, 'cus_licencias']]) {
    const d = { id: 'd1', panel, cobro: { cliente: 'cus_licencias' } };
    const antes = structuredClone(d);
    const datos = P.datosCheckoutPanel(d, opciones);
    assert.equal(datos.customer, cliente);
    assert.deepEqual(datos.customer_update, { name: 'auto', address: 'auto' });
    assert.equal('customer_email' in datos, false);
    assert.equal('trial_period_days' in datos.subscription_data, false);
    assert.deepEqual(d, antes);
  }
  assert.equal(P.datosCheckoutPanel({ id: 'd1', cobro: { cliente: 'cus_licencias' } }, opciones).subscription_data.trial_period_days, PRUEBA_DIAS);
});

test('suscripción: deduce cada tramo y admite customer como objeto', () => {
  for (const [tramo] of TRAMOS.entries()) {
    const sub = suscripcion({ customer: { id: 'cus_panel' }, items: { data: [
      { price: { lookup_key: 'otro_precio' } },
      { price: { lookup_key: P.claveTramo(tramo) } },
    ] } });
    const antes = structuredClone(sub);
    assert.deepEqual(P.panelDeSuscripcion({}, sub, '2026-10-29'), {
      cliente: 'cus_panel', suscripcion: 'sub_panel', estado: 'active', activo: true, tramo, pruebaUsada: true,
    });
    assert.deepEqual(sub, antes);
  }
});

test('suscripción: estados vivos e inactivos y tramo anterior si no se reconoce el precio', () => {
  for (const status of ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
    const panel = P.panelDeSuscripcion({}, suscripcion({ status }));
    assert.equal(panel.activo, ['active', 'trialing', 'past_due'].includes(status));
    assert.equal(panel.estado, status);
    assert.equal(panel.pruebaUsada, true);
  }
  for (const items of [undefined, { data: [] }, { data: [{ price: { lookup_key: 'fisquo_panel_documentos_antiguo' } }] }]) {
    assert.equal(P.panelDeSuscripcion({ panel: { tramo: 2 } }, suscripcion({ items })).tramo, 2);
    assert.equal(P.panelDeSuscripcion({}, suscripcion({ items })).tramo, 0);
    assert.equal(P.panelDeSuscripcion({ panel: { tramo: 0 } }, suscripcion({ items })).tramo, 0);
  }
});

test('suscripción: ignora otra baja mientras la actual está viva y clientes distintos', () => {
  for (const estado of ['active', 'trialing', 'past_due']) {
    const d = { panel: { suscripcion: 'sub_actual', estado, cliente: 'cus_panel' } };
    const antes = structuredClone(d);
    assert.equal(P.panelDeSuscripcion(d, suscripcion({ status: 'canceled' })), null);
    assert.ok(P.panelDeSuscripcion(d, suscripcion()));
    assert.ok(P.panelDeSuscripcion(d, suscripcion({ id: 'sub_actual', status: 'canceled' })));
    assert.deepEqual(d, antes);
  }
  assert.ok(P.panelDeSuscripcion({ panel: { suscripcion: 'sub_vieja', estado: 'canceled' } }, suscripcion({ status: 'canceled' })));
  for (const customer of ['cus_otro', { id: 'cus_otro' }, undefined]) {
    assert.equal(P.panelDeSuscripcion({ panel: { cliente: 'cus_panel' } }, suscripcion({ customer })), null);
  }
});

test('suscripción: fin de prueba en fecha UTC y retirada al desaparecer trial_end', () => {
  const fin = Date.parse('2026-11-28T23:59:59Z') / 1000;
  assert.equal(P.panelDeSuscripcion({}, suscripcion({ status: 'trialing', trial_end: fin })).finPrueba, '2026-11-28');
  assert.equal('finPrueba' in P.panelDeSuscripcion({ panel: { finPrueba: '2026-11-28' } }, suscripcion()), false);
});

test('cambios de tramo: mismo precio, sustitución y alta sin línea previa', () => {
  const item = { id: 'si_panel', price: { id: 'price_panel', lookup_key: P.claveTramo(0) } };
  const otro = { id: 'si_otro', price: { id: 'price_otro', lookup_key: 'fisquo_despacho_aut' } };
  const items = [otro, item];
  const antes = structuredClone(items);
  assert.deepEqual(P.cambiosTramo(items, 'price_panel'), {});
  assert.deepEqual(P.cambiosTramo([{ ...item, price: { id: 'price_panel' } }], 'price_panel'), {});
  assert.deepEqual(P.cambiosTramo(items, 'price_nuevo'), {
    0: { id: 'si_panel', deleted: 'true' }, 1: { price: 'price_nuevo', quantity: 1 },
  });
  assert.deepEqual(P.cambiosTramo([otro], 'price_nuevo'), { 0: { price: 'price_nuevo', quantity: 1 } });
  assert.deepEqual(P.cambiosTramo([], 'price_nuevo'), { 0: { price: 'price_nuevo', quantity: 1 } });
  assert.deepEqual(items, antes);
});

test('cuenta solo documentos: excluye bajas, otros despachos y empresas sin vínculo', () => {
  const empresas = [
    { documentos: { despacho: 'd1' } }, { documentos: { despacho: 'd1' }, baja: false },
    { documentos: { despacho: 'd1' }, baja: '2026-10-01' }, { documentos: { despacho: 'd2' } },
    { despachoCliente: { id: 'd1' } }, {}, null, undefined,
  ];
  const antes = structuredClone(empresas);
  assert.equal(P.cuentaSoloDocumentos(empresas, 'd1'), 2);
  assert.equal(P.cuentaSoloDocumentos(empresas, 'd2'), 1);
  assert.equal(P.cuentaSoloDocumentos(empresas, 'd3'), 0);
  assert.equal(P.cuentaSoloDocumentos([], 'd1'), 0);
  assert.deepEqual(empresas, antes);
});
