// Circuitos HTTP con una empresa de prueba separada, exclusivamente en el simulador local.
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { leerZip } from '../../lib/zip.js';
import { hoy } from '../../lib/formato.js';
const BASE = process.env.BASE || 'http://localhost:3002', UPSTASH = process.env.UPSTASH || 'http://127.0.0.1:8089';
for (const url of [BASE, UPSTASH]) if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Solo localhost');
process.env.KV_REST_API_URL = UPSTASH; process.env.KV_REST_API_TOKEN = 'local';
const { redis } = await import('../../lib/redis.js');
const id = randomBytes(4).toString('hex'), email = `auditoria-${id}@fisquo.example`, password = 'Auditoria-Simulada-2026!';
const sal = randomBytes(16).toString('hex');
const actividad = { id: 'x', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 };
const fiscal = { tipo: 'sociedad', iva: 'general', trabajadores: true, inventario: true };
const empresa = { id, nombre: 'Circuitos numéricos (SIMULADA)', creada: `${hoy()}T00:00:00Z`, pendiente: false, fiscal, actividades: [actividad], emisor: { nombre: 'Circuitos numéricos S.L. (ficticia)', nif: 'B12345674', direccion: 'C/ Ficticia, 1', ciudad: '08001 Barcelona', plazo: 30 }, pagos130: {}, pagos202: {} };
const cliente = { nombre: 'Cliente ficticio', nif: 'B12345674' };
const usuario = { id, nombre: 'Auditoría ficticia', email, admin: false, emailVerificado: true, empresa: id, rol: 'admin', pass: `${sal}:${scryptSync(password, sal, 64).toString('hex')}` };
await redis.multi().hset('empresas', { [id]: empresa }).hset('usuarios', { [id]: usuario }).hset('emails', { [email]: id }).exec();
const guardar = (col, d) => redis.hset(`${col}:${id}`, { [d.id]: d });
await guardar('clientes', { id: 'CLIENTE FICTICIO', ...cliente, formaCobro: 'cheque', riesgoMax: 150 });
await guardar('clientes', { id: 'CLIENTE RENOMBRADO', nombre: 'Cliente renombrado', nif: cliente.nif, riesgoMax: 150 });
const f = { id: '2026-1', numero: 1, anio: 2026, fecha: '2026-10-01', actividad: 'x', cliente, concepto: 'Servicio ficticio', base: 100, ivaPct: 21, irpfPct: 0, cobrada: false };
await guardar('facturas', f);
const form = new FormData(); form.set('email', email); form.set('password', password);
const login = await fetch(`${BASE}/api/login`, { method: 'POST', body: form, headers: { Origin: BASE }, redirect: 'manual' });
const cookie = login.headers.getSetCookie().map((s) => s.split(';')[0]).join('; ');
assert.match(cookie, /(?:^|; )t=/);
let fallos = 0, correctas = 0;
const resultados = [];
async function comprobar(nombre, fn) { try { await fn(); correctas++; resultados.push({ nombre, ok: true }); console.log('✓', nombre); } catch (e) { fallos++; resultados.push({ nombre, ok: false, error: e.message }); console.log('✗', nombre, e.message); } }
const pedir = (ruta, opciones = {}) => fetch(BASE + ruta, { redirect: 'manual', ...opciones, headers: { Cookie: cookie, Origin: BASE, ...opciones.headers } });
await comprobar('WEB03: el Excel hereda Cheque de la ficha del cliente', async () => {
  const r = await pedir('/api/cartera'); assert.equal(r.status, 200);
  const z = leerZip(Buffer.from(await r.arrayBuffer()));
  const xml = Object.values(z).map((b) => b.toString()).join('\n');
  assert.match(xml, /Cheque/); assert.match(xml, /Pendiente de recibir/);
});
await comprobar('WEB02 HTTP: cambiar nombre conservando NIF no duplica riesgo', async () => {
  const r = await pedir('/api/facturas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, cliente: { ...cliente, nombre: 'Cliente renombrado', direccion: 'C/ Ficticia 1', ciudad: 'Barcelona' } }) });
  assert.equal(r.status, 200, await r.text());
  assert.equal((await redis.hget(`facturas:${id}`, f.id)).cliente.nombre, 'Cliente renombrado');
});
console.log(JSON.stringify({ correctas, fallos }));
if (fallos) process.exitCode = 1;
