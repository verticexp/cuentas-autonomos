// Prueba de carga (informe de capacidad): usuarios virtuales con pausas realistas contra una app LOCAL sembrada con
// tests/carga/sembrar.mjs. Rampa por etapas, un pico aparte de inicios de sesión, usuarios concentrados en una empresa
// (cerrojo de emisión) y los crons de la mañana a mitad. Al final, comprobaciones de coherencia de los datos.
// Uso: BASE=http://localhost:3001 KV_REST_API_URL=http://127.0.0.1:8079 KV_REST_API_TOKEN=x CRON_SECRET=… \
//      node tests/carga/carga.mjs sesiones-carga.json [informe.json]
import { readFileSync, writeFileSync } from 'node:fs';
import '../apoyo/cargador.mjs';

const BASE = process.env.BASE || 'http://localhost:3001';
if (!/localhost|127\.0\.0\.1/.test(BASE) || !/127\.0\.0\.1|localhost/.test(process.env.KV_REST_API_URL || '')) throw new Error('Solo contra una copia local');
const sesiones = JSON.parse(readFileSync(process.argv[2] || 'sesiones-carga.json', 'utf8'));
const ETAPAS = (process.env.ETAPAS || '20:60,50:60,100:60,200:180').split(',').map((x) => { const [v, s] = x.split(':').map(Number); return { vus: v, ms: s * 1000 }; });
const PAUSA = (process.env.PAUSA || '5000-10000').split('-').map(Number);
const CONCENTRADOS = Number(process.env.CONCENTRADOS ?? 20);
const TIMEOUT = 30000;

const medidas = new Map(); // accion → { ms: [], errores, rechazos, n }
const anota = (accion, ms, estado) => {
  const m = medidas.get(accion) || { ms: [], errores: 0, rechazos: 0, n: 0 };
  m.n++; m.ms.push(ms);
  if (estado === 0 || estado >= 500) m.errores++;
  else if (estado === 429 || estado === 409) m.rechazos++;
  medidas.set(accion, m);
};
async function pedir(accion, ruta, { token, metodo = 'GET', cuerpo, form } = {}) {
  const t0 = performance.now();
  let estado = 0;
  try {
    const r = await fetch(BASE + ruta, { method: metodo, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT),
      headers: { Origin: BASE, 'X-Real-IP': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...(token ? { Cookie: `t=${token}` } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : form });
    await r.arrayBuffer();
    estado = r.status;
    return r;
  } catch { return null; } finally { anota(accion, performance.now() - t0, estado); }
}
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const azar = (a, b) => a + Math.random() * (b - a);
const hoy = new Date().toISOString().slice(0, 10);

// Reparto: el 70 % de los usuarios en empresas pequeñas, el 20 % en medianas (mes grande), el 10 % en grandes.
const porTipo = Object.groupBy(sesiones, (s) => s.tipo);
const elegir = (i) => { const r = (i * 7919) % 100; const l = r < 70 ? porTipo.pequena : r < 90 ? porTipo.mediana : porTipo.grande; return l[i % l.length]; };
const concentrada = porTipo.mediana[0];

const ACCIONES = [
  [20, 'resumen', (s) => pedir('resumen', '/', s)],
  [20, 'facturas', (s) => pedir('facturas', '/facturas', s)],
  [8, 'sin-cobrar', (s) => pedir('sin-cobrar', '/facturas?estado=pendientes', s)],
  [10, 'buscar', (s) => pedir('buscar', `/facturas?q=${encodeURIComponent(`cliente ${Math.floor(Math.random() * 300)}`)}`, s)],
  [15, 'gastos', (s) => pedir('gastos', '/gastos', s)],
  [5, 'tesoreria', (s) => pedir('tesoreria', '/tesoreria', s)],
  [5, 'impuestos', (s) => pedir('impuestos', '/modelos', s)],
  [10, 'emitir', (s) => pedir('emitir', '/api/facturas', { ...s, metodo: 'POST', cuerpo: { fecha: hoy, actividad: 'servicios', cliente: { nombre: 'Cliente carga', nif: '12345678Z' }, irpfPct: 15, lineas: [{ concepto: 'Prueba de carga', cantidad: 1, precio: '100', ivaPct: 21 }] } })],
  [7, 'nuevo-gasto', (s) => pedir('nuevo-gasto', '/api/gastos', { ...s, metodo: 'POST', cuerpo: { fecha: hoy, concepto: `Gasto de carga ${Math.random().toString(36).slice(2, 8)}`, proveedor: `Proveedor ${Math.floor(Math.random() * 1e6)}`, base: String(10 + Math.floor(Math.random() * 900)), ivaPct: 21, actividad: 'servicios' } })],
];
const totalPeso = ACCIONES.reduce((s, a) => s + a[0], 0);
const accion = () => { let r = Math.random() * totalPeso; for (const a of ACCIONES) { if ((r -= a[0]) < 0) return a; } return ACCIONES[0]; };

let activos = 0, fin = false;
async function usuario(i, objetivo) {
  const s = i < CONCENTRADOS ? concentrada : elegir(i);
  while (!fin && i < objetivo()) {
    const a = i < CONCENTRADOS && Math.random() < 0.5 ? ACCIONES.find((x) => x[1] === 'emitir') : accion();
    await a[2]({ token: s.token });
    await dormir(azar(PAUSA[0], PAUSA[1]));
  }
  activos--;
}

const percentil = (xs, p) => { if (!xs.length) return 0; const o = [...xs].sort((a, b) => a - b); return o[Math.min(o.length - 1, Math.ceil((p / 100) * o.length) - 1)]; };
function resumen(titulo, segundos) {
  const filas = [...medidas].map(([a, m]) => ({ accion: a, n: m.n, porSeg: +(m.n / segundos).toFixed(2), p50: Math.round(percentil(m.ms, 50)), p95: Math.round(percentil(m.ms, 95)), p99: Math.round(percentil(m.ms, 99)), errores: m.errores, rechazos: m.rechazos }));
  const n = filas.reduce((s, f) => s + f.n, 0), err = filas.reduce((s, f) => s + f.errores, 0);
  console.log(`\n== ${titulo} (${segundos} s, ${n} peticiones, ${(n / segundos).toFixed(1)}/s, errores ${err} = ${((err / Math.max(1, n)) * 100).toFixed(2)} %)`);
  console.table(filas);
  return { titulo, segundos, peticiones: n, errores: err, filas };
}

const informe = { base: BASE, inicio: new Date().toISOString(), etapas: [] };
// 1) Pico de 200 inicios de sesión a la vez.
const conClave = sesiones.filter((s) => s.email).slice(0, 200);
const t0 = Date.now();
await Promise.all(conClave.map((s) => { const f = new FormData(); f.set('email', s.email); f.set('password', 'carga-local-solo-pruebas'); return pedir('login', '/api/login', { metodo: 'POST', form: f }); }));
informe.pico = resumen(`Pico de ${conClave.length} inicios de sesión`, Math.max(1, Math.round((Date.now() - t0) / 1000)));
medidas.clear();

// 2) Rampa por etapas, con los crons de la mañana a mitad de la última.
let objetivo = 0;
const lanzados = [];
for (const [n, e] of ETAPAS.entries()) {
  objetivo = e.vus;
  while (activos < objetivo) { const i = lanzados.length; activos++; lanzados.push(usuario(i, () => objetivo)); await dormir(50); }
  const t = Date.now();
  if (n === ETAPAS.length - 1 && process.env.CRON_SECRET) {
    setTimeout(() => { for (const r of ['/api/recurrentes/cron', '/api/recordatorios']) fetch(BASE + r, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).then(async (x) => { informe[r] = { estado: x.status, cuerpo: await x.json().catch(() => null) }; }).catch(() => {}); }, e.ms / 2);
  }
  await dormir(e.ms);
  informe.etapas.push(resumen(`Etapa ${n + 1}: ${e.vus} usuarios`, Math.round((Date.now() - t) / 1000)));
  medidas.clear();
}
fin = true;
await Promise.all(lanzados);

// 3) Coherencia tras la carga: numeración única, totales que cuadran e integridad Verifactu/numeración.
const R = await import('../../lib/redis.js');
const I = await import('../../lib/indices.js');
const { comprobarIntegridad } = await import('../../lib/integridad.js');
const revisar = [concentrada, ...porTipo.pequena.slice(0, 20), ...porTipo.grande];
const incidencias = [];
for (const s of revisar) {
  const u = { id: s.empresa, empresa: s.empresa };
  const fs = await R.leer(u, 'facturas');
  const ids = fs.map((f) => `${f.serie || ''}|${f.anio}|${f.numero}`);
  if (new Set(ids).size !== ids.length) incidencias.push({ empresa: s.empresa, tipo: 'numero-repetido' });
  if (I.comprobarTotales) for (const col of ['facturas', 'gastos']) for (const d of await I.comprobarTotales(u, col)) incidencias.push({ empresa: s.empresa, tipo: `total-descuadrado-${col}`, ...d });
  const inc = comprobarIntegridad({ facturas: fs, borradas: (await R.leer(u, 'facturasBorradas')) || [], registros: (await R.leer(u, 'registros')) || [], cabeza: (await R.redis.get(R.clave(u, 'verifactu'))) || '', numeracion: (await R.redis.hgetall(R.clave(u, 'numeracion'))) || {} });
  for (const x of inc.filter((x) => !['sin-instantanea'].includes(x.tipo))) incidencias.push({ empresa: s.empresa, ...x });
}
informe.coherencia = { revisadas: revisar.length, incidencias };
console.log(`\n== Coherencia: ${revisar.length} empresas revisadas, ${incidencias.length} incidencias`, incidencias.slice(0, 10));
writeFileSync(process.argv[3] || 'informe-carga.json', JSON.stringify(informe, null, 1));
process.exit(0);
