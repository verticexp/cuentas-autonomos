// Capturas comparadas de las pantallas clave, para ver qué cambia en la interfaz entre dos versiones de la app.
// Solo contra una app y un Redis simulados LOCALES (nunca producción ni previews de Vercel: usan la base de datos de producción).
//
//   1. App compilada y base vacía:
//        node tests/apoyo/upstash-mem.mjs 8091 &
//        KV_REST_API_URL=http://127.0.0.1:8091 KV_REST_API_TOKEN=x HIBP=off npx next start -p 3071 &
//   2. Capturas de la versión actual (antes de tocar nada) como referencia:
//        BASE=http://localhost:3071 UPSTASH=http://127.0.0.1:8091 node scripts/capturas.mjs --out .local/capturas/antes
//   3. Con los cambios (otra compilación y base vacía otra vez), capturar y comparar con la referencia:
//        BASE=http://localhost:3071 UPSTASH=http://127.0.0.1:8091 node scripts/capturas.mjs --base .local/capturas/antes
//
// Qué hace: crea una cuenta de prueba como tests/e2e/registro-fluido.mjs (crearUsuario/crearSesion contra el Redis
// simulado), le pone unos datos y fotografía unas 12 pantallas a 375 y 1280 px de ancho, en claro y en oscuro y con
// «reducir movimiento» (para que nada esté a medio animar). Las guarda en --out (por defecto .local/capturas/actual, que
// queda fuera de git). Con --base <carpeta> compara cada captura con la de esa carpeta y dice cuáles cambian y cuánto
// (porcentaje de píxeles distintos); las imágenes de diferencias (rojo = cambia) van a <out>/diferencias/. La comparación
// se hace con un <canvas> dentro del propio Chrome de Playwright: no hay dependencias nuevas.
//
// Opciones: --out <carpeta> · --base <carpeta> · --solo <texto,texto> (solo las pantallas cuyo nombre lo contenga)
//           --sin-capturar (solo compara --out con --base, sin abrir la app) · --tolerancia <0-255> (por canal, 12 por
//           defecto: ignora el suavizado de los bordes) · --umbral <%> (termina con error si alguna cambia más de eso).
// Variables: BASE (app local, http://localhost:3071) · UPSTASH (Redis simulado) · PLAYWRIGHT_MODULE=~/.npm/_npx/e41f203b7505f1fb/
//   node_modules/playwright/index.mjs · CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".
import '../tests/apoyo/cargador.mjs';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opcion = (nombre, defecto) => { const i = args.indexOf(`--${nombre}`); return i >= 0 ? (args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[i + 1]) : defecto; };
const OUT = resolve(opcion('out', join(RAIZ, '.local/capturas/actual')));
const BASE_CAPTURAS = opcion('base', null) ? resolve(opcion('base')) : null;
const SOLO = String(opcion('solo', '')).split(',').map((s) => s.trim()).filter(Boolean);
const SIN_CAPTURAR = Boolean(opcion('sin-capturar', false));
const TOLERANCIA = Number(opcion('tolerancia', 12));
const UMBRAL = opcion('umbral', null) === null ? null : Number(opcion('umbral'));
const BASE = process.env.BASE || 'http://localhost:3071';
const UPSTASH = process.env.UPSTASH || 'http://127.0.0.1:8091';
const local = (url) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
if (!local(BASE) || !local(UPSTASH)) throw new Error('Solo contra la app y el Redis simulados de localhost');

// Las pantallas. `cuenta: false` = sin sesión. `{id}` se sustituye por el id de la factura creada.
const PANTALLAS = [
  { nombre: 'entrar', ruta: '/login', cuenta: false },
  { nombre: 'resumen', ruta: '/' },
  { nombre: 'facturas', ruta: '/facturas' },
  { nombre: 'factura', ruta: '/facturas/{factura}' },
  { nombre: 'nueva-factura', ruta: '/facturas/nueva' },
  { nombre: 'gastos', ruta: '/gastos' },
  { nombre: 'gasto', ruta: '/gastos/{gasto}' },
  { nombre: 'impuestos', ruta: '/modelos' },
  { nombre: 'banco', ruta: '/banco' },
  { nombre: 'clientes', ruta: '/clientes' },
  { nombre: 'mas', ruta: '/mas' },
  { nombre: 'ajustes', ruta: '/ajustes' },
  { nombre: 'ajustes-empresa', ruta: '/ajustes/facturacion' },
];
const VISTAS = [{ ancho: 375, alto: 812 }, { ancho: 1280, alto: 800 }];
const TEMAS = ['claro', 'oscuro'];
const nombreArchivo = (p, v, t) => `${p.nombre}-${v.ancho}-${t}.png`;

async function playwright() {
  let ruta = process.env.PLAYWRIGHT_MODULE || 'playwright';
  if (ruta.startsWith('~')) ruta = join(homedir(), ruta.slice(1));
  return import(ruta.startsWith('/') ? `file://${ruta}` : ruta);
}
const abrir = async (chromium) => chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });

// ---- Cuenta de prueba y datos ------------------------------------------------------------------------------------------
const EMISOR = { nombre: 'Ana Capturas', nif: '12345678Z', direccion: 'Calle de Prueba 12', cp: '08001', ciudad: 'Barcelona', provincia: 'Barcelona', iban: 'ES9121000418450200051332', plazo: 30 };
async function prepararCuenta() {
  process.env.KV_REST_API_URL = UPSTASH;
  process.env.KV_REST_API_TOKEN = 'prueba-local';
  const { crearUsuario, crearSesion } = await import('../lib/auth.js');
  // El mismo email cada vez (sale en Ajustes): así dos pasadas dan la misma imagen. Si ya existe, uno con sufijo.
  const alta = (email) => crearUsuario({
    nombre: 'Ana Capturas', email, password: randomBytes(24).toString('hex'), empresaNombre: 'Estudio Capturas',
    empresaDatos: { fiscal: { tipo: 'autonomo', iva: 'general' }, emisor: EMISOR },
  });
  let r = await alta('capturas@fisquo-local.test');
  if (r.error) r = await alta(`capturas-${randomBytes(4).toString('hex')}@fisquo-local.test`);
  if (r.error) throw new Error(r.error);
  const token = await crearSesion(r.usuario.id);
  const api = async (ruta, metodo, cuerpo) => {
    const res = await fetch(BASE + ruta, { method: metodo, headers: { Origin: BASE, Cookie: `t=${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    return res.json().catch(() => ({}));
  };
  const conf = await api('/api/cuenta', 'PATCH', { configuracion: { fiscal: { tipo: 'autonomo', iva: 'general' }, emisor: EMISOR, actividades: [{ nombre: 'Diseño gráfico', ivaPct: 21, irpfPct: 15 }] } });
  const act = conf.actividades?.[0]?.id;
  if (!act) throw new Error(`No se pudo configurar la cuenta (¿está la app en ${BASE} con la base vacía?): ${JSON.stringify(conf).slice(0, 200)}`);
  const Y = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 4);
  const ids = {};
  const filas = [['01-10', 'Cliente Uno', 'Sesión de fotos', 1000, true], ['02-14', 'Cliente Dos', 'Diseño de logotipo', 650, true], ['03-02', 'Cliente Tres', 'Maquetación', 480, false]];
  for (const [f, cliente, concepto, base, cobrada] of filas) {
    const x = await api('/api/facturas', 'POST', { fecha: `${Y}-${f}`, actividad: act, cliente: { nombre: cliente, nif: '00000000T' }, concepto, base: String(base), ivaPct: 21, irpfPct: 15, cobrada });
    ids.factura ??= x.factura?.id;
  }
  for (const [f, concepto, proveedor, base] of [['01-20', 'Material de oficina', 'Papelería SL', 120], ['02-05', 'Software', 'Estudio Digital SL', 300]]) {
    const x = await api('/api/gastos', 'POST', { fecha: `${Y}-${f}`, actividad: act, concepto, proveedor, base: String(base), ivaPct: 21 });
    ids.gasto ??= x.gasto?.id;
  }
  return { token, ids };
}

async function capturar() {
  const { chromium } = await playwright();
  const { token, ids } = await prepararCuenta();
  mkdirSync(OUT, { recursive: true });
  const browser = await abrir(chromium);
  let n = 0;
  try {
    for (const vista of VISTAS) {
      for (const tema of TEMAS) {
        const contexto = async (conSesion) => {
          const c = await browser.newContext({ viewport: { width: vista.ancho, height: vista.alto }, colorScheme: tema === 'oscuro' ? 'dark' : 'light', reducedMotion: 'reduce', bypassCSP: true, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
          await c.addInitScript(() => { sessionStorage.setItem('fisquo-arranque', '1'); sessionStorage.setItem('fisquo-abierta', '1'); });
          try { await c.clock.setFixedTime(new Date('2026-10-26T10:00:00+01:00')); } catch { /* una Playwright más antigua no lo tiene */ }
          if (conSesion) await c.addCookies([{ name: 't', value: token, url: BASE }]);
          return c;
        };
        const ctx = await contexto(false), sesion = await contexto(true);
        for (const p of PANTALLAS) {
          if (SOLO.length && !SOLO.some((s) => p.nombre.includes(s))) continue;
          const ruta = p.ruta.replace('{factura}', ids.factura).replace('{gasto}', ids.gasto);
          if (ruta.includes('undefined')) { console.log(`  - ${p.nombre}: sin datos para esta pantalla, se salta`); continue; }
          const pagina = await (p.cuenta === false ? ctx : sesion).newPage();
          const errores = [];
          pagina.on('pageerror', (e) => errores.push(e.message));
          await pagina.goto(BASE + ruta, { waitUntil: 'networkidle' });
          // Nada a medio animar ni cursor parpadeando: la captura tiene que ser igual en dos pasadas.
          await pagina.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } html { scroll-behavior: auto !important; }' });
          await pagina.waitForTimeout(350);
          const archivo = nombreArchivo(p, vista, tema);
          await pagina.screenshot({ path: join(OUT, archivo), fullPage: true });
          n += 1;
          console.log(`  · ${archivo}${errores.length ? `  (errores de página: ${errores[0]})` : ''}`);
          await pagina.close();
        }
        await ctx.close(); await sesion.close();
      }
    }
  } finally { await browser.close(); }
  console.log(`${n} capturas en ${OUT}`);
}

// ---- Comparación (en un <canvas> del propio Chrome) --------------------------------------------------------------------
async function comparar() {
  if (!existsSync(BASE_CAPTURAS)) throw new Error(`No existe la carpeta de referencia: ${BASE_CAPTURAS}`);
  const { chromium } = await playwright();
  const browser = await abrir(chromium);
  const diffs = join(OUT, 'diferencias');
  mkdirSync(diffs, { recursive: true });
  const nuevos = readdirSync(OUT).filter((f) => f.endsWith('.png')).sort();
  const viejos = new Set(readdirSync(BASE_CAPTURAS).filter((f) => f.endsWith('.png')));
  const filas = [];
  try {
    const pagina = await browser.newPage();
    await pagina.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    for (const f of nuevos) {
      if (SOLO.length && !SOLO.some((s) => f.includes(s))) continue;
      if (!viejos.has(f)) { filas.push({ f, estado: 'nueva' }); continue; }
      viejos.delete(f);
      const a = `data:image/png;base64,${readFileSync(join(BASE_CAPTURAS, f)).toString('base64')}`;
      const b = `data:image/png;base64,${readFileSync(join(OUT, f)).toString('base64')}`;
      const r = await pagina.evaluate(async ({ a, b, tol }) => {
        const cargar = (u) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = u; });
        const [A, B] = await Promise.all([cargar(a), cargar(b)]);
        const w = Math.max(A.width, B.width), h = Math.max(A.height, B.height);
        const datos = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
        const da = datos(A), db = datos(B);
        const salida = document.createElement('canvas'); salida.width = w; salida.height = h;
        const sx = salida.getContext('2d'); const img = sx.createImageData(w, h);
        let distintos = 0;
        for (let i = 0; i < da.length; i += 4) {
          const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
          if (d > tol) { distintos += 1; img.data[i] = 255; img.data[i + 1] = 0; img.data[i + 2] = 60; img.data[i + 3] = 255; }
          else { img.data[i] = 255 - (255 - db[i]) * 0.25; img.data[i + 1] = 255 - (255 - db[i + 1]) * 0.25; img.data[i + 2] = 255 - (255 - db[i + 2]) * 0.25; img.data[i + 3] = 255; }
        }
        sx.putImageData(img, 0, 0);
        return { distintos, total: w * h, antes: [A.width, A.height], ahora: [B.width, B.height], diff: salida.toDataURL('image/png') };
      }, { a, b, tol: TOLERANCIA });
      const pct = (r.distintos / r.total) * 100;
      if (r.distintos > 0) writeFileSync(join(diffs, f), Buffer.from(r.diff.split(',')[1], 'base64'));
      filas.push({ f, estado: r.distintos ? 'cambia' : 'igual', pct, antes: r.antes, ahora: r.ahora });
    }
  } finally { await browser.close(); }
  for (const f of viejos) if (!SOLO.length || SOLO.some((s) => f.includes(s))) filas.push({ f, estado: 'falta' });

  const cambian = filas.filter((x) => x.estado === 'cambia').sort((x, y) => y.pct - x.pct);
  console.log(`\nComparación con ${BASE_CAPTURAS} (tolerancia ${TOLERANCIA}/255 por canal)`);
  for (const x of cambian) {
    const tam = x.antes[0] === x.ahora[0] && x.antes[1] === x.ahora[1] ? '' : `  · tamaño ${x.antes.join('×')} → ${x.ahora.join('×')}`;
    console.log(`  ≠ ${x.f.padEnd(34)} ${x.pct.toFixed(2).padStart(6)} % distinto${tam}`);
  }
  for (const x of filas.filter((y) => y.estado === 'nueva')) console.log(`  + ${x.f}  (no estaba en la referencia)`);
  for (const x of filas.filter((y) => y.estado === 'falta')) console.log(`  - ${x.f}  (estaba en la referencia y ahora no)`);
  const iguales = filas.filter((x) => x.estado === 'igual').length;
  console.log(`${iguales} iguales · ${cambian.length} cambian${cambian.length ? ` (imágenes de diferencias en ${diffs})` : ''}`);
  if (UMBRAL !== null && (cambian.some((x) => x.pct > UMBRAL) || filas.some((x) => x.estado === 'falta'))) { console.log(`Alguna captura cambia más del ${UMBRAL} %`); process.exit(1); }
}

if (!SIN_CAPTURAR) await capturar();
if (BASE_CAPTURAS) await comparar();
