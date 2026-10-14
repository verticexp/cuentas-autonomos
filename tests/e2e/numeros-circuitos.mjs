// Circuitos HTTP con una empresa de prueba separada, exclusivamente en el simulador local.
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { leerZip } from '../../lib/zip.js';
import { hoy } from '../../lib/formato.js';
const BASE = process.env.BASE || 'http://localhost:3002', UPSTASH = process.env.UPSTASH || 'http://127.0.0.1:8089';
for (const url of [BASE, UPSTASH]) if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Solo localhost');
process.env.KV_REST_API_URL = UPSTASH; process.env.KV_REST_API_TOKEN = 'local';
const { redis } = await import('../../lib/redis.js');
const id = randomBytes(4).toString('hex'), email = `auditoria-${id}@netto.example`, password = 'Auditoria-Simulada-2026!';
const sal = randomBytes(16).toString('hex'), producto = 'aaaaaaaaaaaa';
const actividad = { id: 'x', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 };
const fiscal = { tipo: 'sociedad', iva: 'general', trabajadores: true, inventario: true };
const empresa = { id, nombre: 'Circuitos numéricos (SIMULADA)', creada: `${hoy()}T00:00:00Z`, pendiente: false, fiscal, actividades: [actividad], emisor: { nombre: 'Circuitos numéricos S.L. (ficticia)', nif: 'B12345674', direccion: 'C/ Ficticia, 1', ciudad: '08001 Barcelona', plazo: 30 }, pagos130: {}, pagos202: {} };
const cliente = { nombre: 'Cliente ficticio', nif: 'B12345674' };
const usuario = { id, nombre: 'Auditoría ficticia', email, admin: false, emailVerificado: true, empresa: id, rol: 'admin', pass: `${sal}:${scryptSync(password, sal, 64).toString('hex')}` };
await redis.multi().hset('empresas', { [id]: empresa }).hset('usuarios', { [id]: usuario }).hset('emails', { [email]: id }).exec();
const guardar = (col, d) => redis.hset(`${col}:${id}`, { [d.id]: d });
await guardar('productos', { id: producto, nombre: 'Cable de prueba', coste: 10, precio: 20 });
await guardar('gastos', { id: 'compra', fecha: '2025-01-05', actividad: 'x', concepto: 'Compra de 10 cables', base: 100, ivaPct: 21, proveedor: 'Proveedor ficticio', proveedorNif: 'B12345674', categoria: '600', stock: [{ producto, cantidad: 10, coste: 10 }] });
await guardar('albaranes', { id: 'AB2025-1', tipo: 'albaran', fecha: '2025-06-01', cliente, lineas: [{ producto, concepto: 'Cable', cantidad: 5, precio: 20, ivaPct: 21 }] });
await guardar('facturas', { id: '2025-1', numero: 1, anio: 2025, fecha: '2025-06-02', actividad: 'x', cliente, concepto: '5 cables ya entregados', base: 100, ivaPct: 21, irpfPct: 0, cobrada: true, lineas: [{ producto, concepto: 'Cable', cantidad: 5, precio: 20, ivaPct: 21, albaran: 'AB2025-1' }] });
await guardar('asientos', { id: 'apertura', fecha: '2025-01-01', concepto: 'Apertura', apertura: true, lineas: [{ cuenta: '572', debe: 1000, haber: 0 }, { cuenta: '100', debe: 0, haber: 1000 }] });
const n = { id: 'nomina-pendiente', empleado: 'e', empleadoNombre: 'Ana ficticia', mes: '2026-01', bruto: 2000, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65, pagada: false };
await guardar('nominas', n);
await guardar('gastos', { id: `nomina-${n.id}`, nomina: n.id, fecha: '2026-01-31', actividad: 'x', concepto: 'Nómina de prueba', base: 2633, ivaPct: 0 });
const form = new FormData(); form.set('email', email); form.set('password', password);
const login = await fetch(`${BASE}/api/login`, { method: 'POST', body: form, headers: { Origin: BASE }, redirect: 'manual' });
const cookie = login.headers.getSetCookie().map((s) => s.split(';')[0]).join('; ');
assert.match(cookie, /(?:^|; )t=/);
let fallos = 0, correctas = 0;
const resultados = [];
async function comprobar(nombre, fn) { try { await fn(); correctas++; resultados.push({ nombre, ok: true }); console.log('✓', nombre); } catch (e) { fallos++; resultados.push({ nombre, ok: false, error: e.message }); console.log('✗', nombre, e.message); } }
const pedir = (ruta, opciones = {}) => fetch(BASE + ruta, { redirect: 'manual', ...opciones, headers: { Cookie: cookie, Origin: BASE, ...opciones.headers } });
const texto = (s) => s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
await comprobar('Albaranes: la página contable conserva 50 € de existencias, sin volver a descontar la factura', async () => {
  const r = await pedir('/contabilidad?anio=2025&ver=balance'); assert.equal(r.status, 200);
  const t = texto(await r.text());
  assert.match(t, /300\s*·\s*Mercaderías\s+50,00/);
});
await comprobar('Albaranes: el Excel de contabilidad conserva esos mismos 50 €', async () => {
  const r = await pedir('/api/contabilidad?anio=2025'); assert.equal(r.status, 200);
  const z = leerZip(Buffer.from(await r.arrayBuffer()));
  const row = z['xl/worksheets/sheet2.xml'].toString().match(/<row\b[^>]*>[\s\S]*?<\/row>/g).find((r) => r.includes('Mercaderías'));
  assert.ok(row?.includes('<v>50</v>'), row);
});
await comprobar('Existencias: Impuestos calcula base IS 50 € y cuota 10,50 €', async () => {
  const r = await pedir('/modelos?anio=2025'); assert.equal(r.status, 200);
  const html = await r.text(), seccion = html.split('id="m200"')[1]?.split('</section>')[0];
  assert.ok(seccion, 'Falta el modelo 200');
  const t = texto(seccion);
  assert.match(t, /Base imponible \(beneficio\)\s+50,00/);
  assert.match(t, /Cuota al 21 %\s+10,50/);
});
await comprobar('Albaranes: el PDF de cuentas anuales conserva las existencias y resultado', async () => {
  const r = await pedir('/api/cuentas-anuales?anio=2025'); assert.equal(r.status, 200);
  const path = `/private/tmp/netto-circuitos-${id}.pdf`;
  await writeFile(path, Buffer.from(await r.arrayBuffer()));
  const { stdout } = await promisify(execFile)('pdftotext', ['-layout', path, '-']);
  assert.match(stdout, /Existencias\s+50,00/);
  assert.match(stdout, /Resultado del ejercicio\s+39,50/);
});
await comprobar('Nóminas: marcar pagada guarda la fecha efectiva y vuelve a guardarse sin cambiarla', async () => {
  const patch = () => pedir('/api/nominas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id, pagada: true }) });
  assert.equal((await patch()).status, 200);
  assert.equal((await redis.hget(`nominas:${id}`, n.id)).pagado, hoy());
  assert.equal((await patch()).status, 200);
  assert.equal((await redis.hget(`nominas:${id}`, n.id)).pagado, hoy());
});
await writeFile('/private/tmp/netto-auditoria-circuitos.json', JSON.stringify({ correctas, fallos, resultados }, null, 2));
console.log(JSON.stringify({ correctas, fallos }));
if (fallos) process.exitCode = 1;
