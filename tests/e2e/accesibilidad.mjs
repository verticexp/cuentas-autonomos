// Accesibilidad automática (axe-core) de las pantallas clave, contra la app ya compilada y una base VACÍA. Solo en local
// (tests/apoyo/upstash-mem.mjs); nunca contra producción ni las previews de Vercel (usan la base de datos de producción).
//   node tests/apoyo/upstash-mem.mjs 8091 &
//   KV_REST_API_URL=http://127.0.0.1:8091 KV_REST_API_TOKEN=x HIBP=off npx next start -p 3071 &
//   BASE=http://localhost:3071 node tests/e2e/accesibilidad.mjs          (A11Y_AVISOS=1 detalla también las infracciones moderadas)
// Crea cuentas nuevas (autónomo, sociedad y un despacho), pide el HTML de cada pantalla con su cookie de sesión y pasa axe-core
// sobre él dentro de jsdom. Falla con las infracciones serias o críticas, con pantalla, regla y elemento. jsdom no calcula
// diseños ni la mezcla de colores: la regla color-contrast va desactivada aquí y la cubre tests/contraste.test.mjs.
import { JSDOM, VirtualConsole } from 'jsdom';
import axe from 'axe-core';

const BASE = process.env.BASE || 'http://localhost:3001';
if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('Solo contra una copia local con la base de datos vacía');
let ip = 0;
const pedir = (ruta, { metodo = 'GET', cuerpo, cookie, form } = {}) => fetch(BASE + ruta, {
  method: metodo, redirect: 'manual',
  headers: { Origin: BASE, 'X-Real-IP': `10.7.${Math.floor(++ip / 250)}.${ip % 250}`, ...(cookie ? { Cookie: `t=${cookie}` } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
  body: form || (cuerpo ? JSON.stringify(cuerpo) : undefined),
});
const json = async (ruta, op) => { const r = await pedir(ruta, op); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const galleta = (r) => /t=([^;]+)/.exec(r.headers.get('set-cookie') || '')?.[1];
const sufijo = Date.now();

// ---- Cuentas de prueba -------------------------------------------------------------------------------------------------
// La primera de la base de datos es la del administrador de Fisquo (ve también /admin).
const alta = await pedir('/api/registro', { metodo: 'POST', form: form({ nombre: 'Prueba Accesible', email: `acc${sufijo}@test.es`, password: 'Clave-Local-01-2026' }) });
const admin = galleta(alta);
if (!admin) throw new Error('No se pudo crear la cuenta de prueba: ¿la base de datos está vacía?');
const configurar = (cookie, configuracion) => json('/api/cuenta', { metodo: 'PATCH', cookie, cuerpo: { configuracion } });
const aut = await configurar(admin, {
  fiscal: { tipo: 'autonomo', iva: 'general' },
  emisor: { nombre: 'Ana Accesible', nif: '12345678Z', direccion: 'C/ Uno 1', cp: '08001', ciudad: 'Barcelona', provincia: 'Barcelona', iban: 'ES9121000418450200051332', plazo: 30 },
  actividades: [{ nombre: 'Diseño gráfico', ivaPct: 21, irpfPct: 15 }],
});
const act = aut.actividades?.[0]?.id;
if (!act) throw new Error(`No se pudo configurar la empresa de prueba: ${JSON.stringify(aut)}`);
const Y = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 4);

// Una empresa más (sociedad) y un despacho, invitados por el administrador y con su propia contraseña.
async function invitada(cuerpo, clave) {
  const inv = await json(cuerpo.ruta, { metodo: 'POST', cookie: admin, cuerpo: cuerpo.datos });
  const codigo = inv.enlace?.split('/').pop();
  if (!codigo) throw new Error(`No se pudo invitar (${cuerpo.ruta}): ${JSON.stringify(inv)}`);
  const r = await pedir('/api/invitacion', { metodo: 'POST', form: form({ codigo, password: clave }) });
  const c = galleta(r);
  if (!c) throw new Error(`No se pudo aceptar la invitación (${cuerpo.ruta})`);
  return c;
}
const soc = await invitada({ ruta: '/api/usuarios', datos: { empresaNueva: 'Accesible SL', nombre: 'Sara', email: `soc${sufijo}@test.es` } }, 'Clave-Local-02-2026');
const sociedad = await configurar(soc, {
  fiscal: { tipo: 'sociedad', iva: 'general' },
  emisor: { nombre: 'Accesible SL', nif: 'B12345674', direccion: 'C/ Dos 2', cp: '08001', ciudad: 'Barcelona', provincia: 'Barcelona', iban: 'ES9121000418450200051332', plazo: 30 },
  actividades: [{ nombre: 'Servicios', ivaPct: 21, irpfPct: 0 }],
});
const despacho = await invitada({ ruta: '/api/admin/despachos', datos: { nombre: 'Gestoría Accesible', nif: 'B87654321', email: `desp${sufijo}@test.es`, titular: 'Dani', codigo: `ACC${String(sufijo).slice(-6)}` } }, 'Clave-Local-03-2026');

// Algo de datos para que las listas, las fichas y los formularios de edición salgan con contenido.
const f1 = await json('/api/facturas', { metodo: 'POST', cookie: admin, cuerpo: { fecha: `${Y}-01-10`, actividad: act, cliente: { nombre: 'Cliente Uno', nif: '00000000T' }, concepto: 'Sesión', base: '1000', ivaPct: 21, irpfPct: 15, cobrada: true } });
await json('/api/facturas', { metodo: 'POST', cookie: admin, cuerpo: { fecha: `${Y}-02-10`, actividad: act, cliente: { nombre: 'Cliente Dos' }, concepto: 'Diseño', base: '500', ivaPct: 21, irpfPct: 15 } });
const g1 = await json('/api/gastos', { metodo: 'POST', cookie: admin, cuerpo: { fecha: `${Y}-01-20`, actividad: act, concepto: 'Material', proveedor: 'Papelería SL', base: '100', ivaPct: 21 } });
await json('/api/presupuestos', { metodo: 'POST', cookie: admin, cuerpo: { fecha: `${Y}-03-01`, actividad: act, cliente: { nombre: 'Cliente Tres' }, concepto: 'Propuesta', base: '300', ivaPct: 21 } });
const idF = f1.factura?.id, idG = g1.gasto?.id;

// ---- Pantallas ---------------------------------------------------------------------------------------------------------
// [nombre, ruta, cuenta]: sin cuenta, la pantalla se pide sin sesión (las de entrada).
const PANTALLAS = [
  ['Entrar', '/login'], ['Registro', '/registro'], ['Recuperar contraseña', '/recuperar'], ['Sin conexión', '/sin-conexion'],
  ['Resumen', '/', admin], ['Facturas', '/facturas', admin], ['Nueva factura', '/facturas/nueva', admin],
  ...(idF ? [['Factura', `/facturas/${idF}`, admin]] : []),
  ['Gastos', '/gastos', admin],
  ...(idG ? [['Gasto', `/gastos/${idG}`, admin]] : []),
  ['Proveedores', '/gastos/proveedores', admin],
  ['Banco', '/banco', admin], ['Impuestos', '/modelos', admin], ['Nóminas', '/nominas', admin], ['Clientes', '/clientes', admin],
  ['Presupuestos', '/presupuestos', admin], ['Nuevo presupuesto', '/presupuestos/nuevo', admin], ['Facturas recurrentes', '/facturas/recurrentes', admin],
  ['Cartera de cobros', '/cartera', admin], ['Tesorería', '/tesoreria', admin], ['Análisis', '/analisis', admin],
  ['Más', '/mas', admin], ['Ajustes', '/ajustes', admin],
  ['Ajustes: datos de la empresa', '/ajustes/facturacion', admin], ['Ajustes: diseño de factura', '/ajustes/marca', admin],
  ['Ajustes: series', '/ajustes/series', admin], ['Ajustes: cobros', '/ajustes/cobros', admin], ['Ajustes: email de envío', '/ajustes/envio', admin],
  ['Ajustes: Verifactu', '/ajustes/verifactu', admin], ['Ajustes: seguridad', '/ajustes/seguridad', admin], ['Ajustes: avisos', '/ajustes/avisos', admin],
  ['Ajustes: apariencia', '/ajustes/apariencia', admin], ['Ajustes: importar', '/ajustes/importar', admin], ['Ajustes: ayuda', '/ajustes/ayuda', admin],
  ['Ajustes: plan', '/ajustes/plan', admin], ['Ajustes: tu gestoría', '/ajustes/gestoria', admin], ['Usuarios y permisos', '/usuarios', admin],
  ['Pregunta a Fisquo', '/asistente', admin], ['Panel de Fisquo', '/admin', admin],
  ['Sociedad: Resumen', '/', soc], ['Sociedad: Impuestos', '/modelos', soc], ['Sociedad: Contabilidad', '/contabilidad', soc], ['Sociedad: Remesas', '/tesoreria/remesas', soc],
  ['Mi despacho', '/despacho', despacho], ['Despacho: hoy', '/despacho/hoy', despacho], ['Despacho: plazos', '/despacho/plazos', despacho],
  ['Despacho: equipo', '/despacho/equipo', despacho], ['Despacho: ajustes', '/despacho/ajustes', despacho], ['Despacho: facturación', '/despacho/facturacion', despacho],
  ['Despacho: mensajes', '/despacho/mensajes', despacho],
];

const consola = new VirtualConsole(); // Sin ruido: jsdom se queja de CSS y de scripts que aquí no hacen falta.
const REGLAS = { 'color-contrast': { enabled: false } };
// Por defecto fallan las serias y críticas; A11Y_ESTRICTO=1 hace fallar también las moderadas y menores.
const GRAVES = new Set(process.env.A11Y_ESTRICTO ? ['minor', 'moderate', 'serious', 'critical'] : ['serious', 'critical']);
const detalleAvisos = Boolean(process.env.A11Y_AVISOS);
let graves = 0, avisos = 0, revisadas = 0;
const resumenAvisos = new Map();
const recorte = (s, n = 140) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

async function revisar([nombre, ruta, cookie]) {
  const r = await pedir(ruta, { cookie });
  if (r.status !== 200) { graves += 1; console.log(`  ✗ ${nombre} (${ruta}): responde ${r.status}${r.headers.get('location') ? ` → ${r.headers.get('location')}` : ''}`); return; }
  const html = await r.text();
  // Una pantalla que falla al pintarse llega con 200 y con la marca de error de React (la llamada $RX("B:0", "código") del final
  // del HTML, o un data-dgst): una página rota no es una página accesible, y sin esto el fallo pasaba por «0 infracciones»
  // (se coló un ReferenceError en /gastos el 26-10-2026).
  const roto = /\$RX\(\s*"[^"]*"\s*,\s*"([^"]*)"/.exec(html) || /data-dgst="([^"]*)"/.exec(html);
  if (roto) { graves += 1; console.log(`  ✗ ${nombre} (${ruta}): la pantalla falla al pintarse (código ${roto[1]})`); return; }
  // Los scripts de la propia página (los de Next que cierran los Suspense) se ejecutan; los externos no se cargan.
  const dom = new JSDOM(html, { url: BASE + ruta, runScripts: 'dangerously', virtualConsole: consola });
  try {
    // Una pantalla que solo redirige (a Bienvenida, a Entrar…) no se estaría revisando: eso también es un fallo.
    const salto = dom.window.document.querySelector('meta[http-equiv="refresh"]')?.getAttribute('content');
    if (salto) { graves += 1; console.log(`  ✗ ${nombre} (${ruta}): redirige (${salto})`); return; }
    dom.window.eval(axe.source);
    const { violations } = await dom.window.axe.run(dom.window.document.documentElement, { rules: REGLAS, resultTypes: ['violations'] });
    revisadas += 1;
    const serias = violations.filter((v) => GRAVES.has(v.impact));
    const otras = violations.filter((v) => !GRAVES.has(v.impact));
    for (const v of otras) { avisos += v.nodes.length; resumenAvisos.set(v.id, (resumenAvisos.get(v.id) || 0) + v.nodes.length); }
    const nodos = dom.window.document.querySelectorAll('*').length;
    if (!serias.length) { console.log(`  ✓ ${nombre} · ${nodos} elementos${otras.length ? ` (${otras.length} aviso${otras.length > 1 ? 's' : ''} menores)` : ''}`); }
    else console.log(`  ✗ ${nombre} (${ruta})`);
    for (const v of detalleAvisos ? violations : serias) {
      if (GRAVES.has(v.impact)) graves += v.nodes.length;
      console.log(`      [${v.impact}] ${v.id}: ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) console.log(`        ${n.target.join(' ')}  ${recorte(n.html)}`);
      if (v.nodes.length > 3) console.log(`        … y ${v.nodes.length - 3} más`);
    }
  } finally { dom.window.close(); }
}

// El comprobador mismo: sobre una página con fallos de libro tiene que verlos (si jsdom o axe dejaran de funcionar, todo
// saldría «en verde» sin mirar nada).
{
  const dom = new JSDOM('<!doctype html><html lang="es"><head><title>x</title></head><body><main><button></button><img src="a.png"><input type="text"></main></body></html>', { runScripts: 'dangerously', virtualConsole: consola });
  dom.window.eval(axe.source);
  const { violations } = await dom.window.axe.run(dom.window.document.documentElement, { rules: REGLAS });
  const vistas = new Set(violations.map((v) => v.id));
  for (const id of ['button-name', 'image-alt', 'label']) if (!vistas.has(id)) throw new Error(`El comprobador no detecta «${id}» en una página con ese fallo: axe/jsdom no funcionan`);
  dom.window.close();
}

console.log(`Accesibilidad (axe-core ${axe.version}, sin color-contrast) · ${PANTALLAS.length} pantallas`);
for (const p of PANTALLAS) await revisar(p);
if (resumenAvisos.size) console.log(`\nInfracciones menores (no fallan): ${[...resumenAvisos].map(([k, n]) => `${k} ×${n}`).join(', ')}  (A11Y_AVISOS=1 las detalla)`);
console.log(`\n${revisadas} pantallas revisadas · ${graves} infracciones serias o críticas · ${avisos} menores`);
if (graves) process.exit(1);
