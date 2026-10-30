// Simuladores locales para probar los clientes «solo documentos» a mano (lib/documentos.js, lib/panelDocumentos.js), sin
// claves reales: la IA que lee los documentos y Stripe con suscripciones (precios, Checkout con prueba gratis, portal).
// El Checkout no pide tarjeta: su página vuelve sola al despacho con la suscripción creada.
// Uso: node tests/e2e/panel-local.mjs [puerto IA] [puerto Stripe]   (por defecto 8096 y 8097), y la app con
// ANTHROPIC_API_KEY=x ANTHROPIC_URL=http://127.0.0.1:8096/v1/messages STRIPE_SECRET_KEY=sk_test_local STRIPE_URL=http://127.0.0.1:8097
import http from 'node:http';

const PUERTO_IA = Number(process.argv[2]) || 8096;
const PUERTO_STRIPE = Number(process.argv[3]) || 8097;

const json = (res, d, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
const cuerpo = async (req) => { const t = []; for await (const x of req) t.push(x); return Buffer.concat(t).toString(); };

// Un error en una petición rara no tumba el simulador: responde 500 y sigue.
const seguro = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) { console.error('[simulador]', req.method, req.url, e.message); if (!res.headersSent) json(res, { error: { message: `Simulador: ${e.message}` } }, 500); }
};
// El contenido de un mensaje puede ser texto o una lista de bloques (texto, imagen, documento).
const bloques = (m) => (typeof m?.content === 'string' ? [{ type: 'text', text: m.content }] : Array.isArray(m?.content) ? m.content : []);

// IA: alterna una venta del cliente, un gasto y un ticket borroso. Lo que no lleva foto ni PDF (el asistente, emparejar
// columnas al importar…) recibe una respuesta de texto genérica.
let n = 0;
http.createServer(seguro(async (req, res) => {
  const b = JSON.parse((await cuerpo(req)) || '{}');
  if (req.url.endsWith('/count_tokens')) return json(res, { input_tokens: 1500 });
  const contenido = bloques(b.messages?.[0]);
  if (!contenido.some((c) => ['image', 'document'].includes(c.type))) return json(res, { model: b.model, usage: { input_tokens: 100, output_tokens: 20 }, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Respuesta del simulador local.' }] });
  const prompt = contenido.find((c) => c.type === 'text')?.text || '';
  const nif = (prompt.match(/con NIF ([A-Z0-9]+)/) || [])[1] || '';
  const tipos = [
    { proveedor: 'Recambios Norte SL', nif: 'B00000301', emisor: 'Recambios Norte SL', emisorNif: 'B00000301', receptor: 'Cliente', receptorNif: nif, sentido: 'compra', legible: true, numero: `RN-${2000 + n}`, fecha: '2026-10-20', concepto: 'Pastillas de freno', base: 150, ivaPct: 21, total: 181.5, desglose: [{ ivaPct: 21, base: 150, cuota: 31.5 }], irpf: null, irpfPct: 0 },
    { proveedor: 'Taller', nif, emisor: 'Taller', emisorNif: nif, receptor: 'Autocares Vidal SL', receptorNif: 'B00000399', sentido: 'venta', legible: true, numero: `TR-2026-${20 + n}`, fecha: '2026-10-21', concepto: 'Revisión de autocar', base: 900, ivaPct: 21, total: 1089, desglose: [{ ivaPct: 21, base: 900, cuota: 189 }], irpf: null, irpfPct: 0 },
    { proveedor: 'Gasolinera', nif: '', emisor: 'Gasolinera', emisorNif: '', legible: false, fecha: '2026-10-22', base: null, ivaPct: 21, total: null },
  ];
  const d = tipos[n++ % tipos.length];
  json(res, { model: b.model, usage: { input_tokens: 1500, output_tokens: 300 }, content: [{ type: 'text', text: JSON.stringify(d) }] });
})).listen(PUERTO_IA, '127.0.0.1');

// Stripe: precios por lookup_key, IVA, Checkout de suscripción (con su página que vuelve al success_url), suscripciones
// y portal. Al «pagar», la suscripción queda en prueba (trialing) si se pidió.
const precios = {}, sesiones = {}, subs = {};
let id = 0;
const nuevo = (p) => `${p}_${++id}`;
const plano = (s) => Object.fromEntries(new URLSearchParams(s));
http.createServer(seguro(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const f = req.method === 'POST' ? plano(await cuerpo(req)) : {};
  const r = url.pathname;
  if (r === '/v1/prices' && req.method === 'GET') return json(res, { data: url.searchParams.getAll('lookup_keys[]').map((k) => precios[k]).filter(Boolean) });
  if (r === '/v1/prices') { const p = { id: nuevo('price'), lookup_key: f.lookup_key, unit_amount: Number(f.unit_amount) }; precios[p.lookup_key] = p; return json(res, p); }
  if (r === '/v1/tax_rates' && req.method === 'GET') return json(res, { data: [{ id: 'txr_iva', percentage: 21, country: 'ES', inclusive: false }] });
  if (r === '/v1/checkout/sessions' && req.method === 'POST') {
    const s = { id: `cs_test_${++id}`, f, metadata: { despacho: f['metadata[despacho]'], tipo: f['metadata[tipo]'] }, url: `http://127.0.0.1:${PUERTO_STRIPE}/pagar/${id}` };
    sesiones[s.id] = s;
    return json(res, s);
  }
  if (r.startsWith('/pagar/')) {
    const s = sesiones[`cs_test_${r.slice(7)}`];
    const precio = Object.values(precios).find((p) => p.id === s.f['line_items[0][price]']);
    const sub = { id: nuevo('sub'), status: s.f['subscription_data[trial_period_days]'] ? 'trialing' : 'active', customer: s.f.customer || 'cus_local', metadata: s.metadata,
      trial_end: s.f['subscription_data[trial_period_days]'] ? Math.floor(Date.now() / 1000) + 30 * 86400 : null, items: { data: [{ id: nuevo('si'), quantity: 1, price: precio }] } };
    subs[sub.id] = sub; s.subscription = sub.id;
    res.writeHead(303, { Location: s.f.success_url.replace('{CHECKOUT_SESSION_ID}', s.id) }); return res.end();
  }
  if (r.startsWith('/v1/checkout/sessions/')) { const s = sesiones[r.split('/')[4]]; return s ? json(res, { ...s, subscription: subs[s.subscription] || null }) : json(res, { error: { message: 'No such session' } }, 404); }
  if (r.startsWith('/v1/subscriptions/')) {
    const sub = subs[r.split('/')[3]];
    if (!sub) return json(res, { error: { message: 'No such subscription' } }, 404);
    if (req.method === 'POST') {
      const items = sub.items.data.filter((it) => !Object.keys(f).some((k) => /items\[\d+\]\[deleted\]/.test(k) && f[k.replace('[deleted]', '[id]')] === it.id));
      for (const k of Object.keys(f)) if (/^items\[\d+\]\[price\]$/.test(k)) items.push({ id: nuevo('si'), quantity: 1, price: Object.values(precios).find((p) => p.id === f[k]) });
      sub.items.data = items;
      console.log('[stripe] suscripción cambiada:', items.map((x) => x.price.lookup_key).join(', '));
    }
    return json(res, sub);
  }
  if (r === '/v1/billing_portal/sessions') return json(res, { url: `http://127.0.0.1:${PUERTO_STRIPE}/portal` });
  json(res, { error: { message: `Simulador: ${req.method} ${r}` } }, 404);
})).listen(PUERTO_STRIPE, '127.0.0.1');
console.log(`Simuladores listos: IA en ${PUERTO_IA}, Stripe en ${PUERTO_STRIPE}`);
