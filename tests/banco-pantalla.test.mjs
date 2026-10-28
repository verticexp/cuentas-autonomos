// Pantalla de Banco: lo pendiente primero, nada perdido por el camino y la guía para descargar el extracto.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AVISO_MENUS, BANCOS_EXTRACTO, CONSEJOS_EXTRACTO, FORMATOS_EXTRACTO, LIMITES_EXTRACTO } from '../components/guiaExtractoDatos.js';

const leer = (archivo) => readFileSync(new URL(`../${archivo}`, import.meta.url), 'utf8');

test('Banco empieza por lo pendiente: por revisar, luego emparejado e ignorado y al final saldo, importación, guía y reglas', () => {
  const s = leer('components/Banco.js');
  const sitio = (t) => { const i = typeof t === 'string' ? s.indexOf(t) : s.search(t); assert.ok(i > 0, String(t)); return i; };
  const orden = ['className="bco-resumen"', 'className="grupo bco-historial"', /<h2 className="grupo-t">(\{tr\('Por revisar'\)\}|Por revisar)/, 'id="banco-emparejados"', 'id="banco-ignorados"',
    'id="banco-cuentas"', '<GuiaExtracto />', '<BancoReglas'];
  orden.reduce((antes, t) => { const i = sitio(t); assert.ok(i > antes, `${t} debe ir después del anterior`); return i; }, 0);
  // Y cada parte, con lo que tenía.
  for (const t of ['Confirmar las {n} seguras', 'Por confirmar', 'Sin pareja', 'estado="pendientes"', 'estado="emparejados"', 'estado="ignorados"', 'Saldo en tus cuentas',
    'Cuenta del extracto', 'Subir a esta cuenta', 'Conectar banco', 'Actualizar', '<CupoEscaneo />', 'Sube tu primer extracto', 'No tienes movimientos por revisar', 'Aún no hay movimientos',
    'Deshacer', 'Recuperar', 'Quitar filtros', 'Filtrar movimientos', 'Crear regla con esto']) assert.ok(s.includes(t), t);
  // El primer extracto y el saldo no se piden dos veces: un solo selector de archivo, que usan los dos botones «Subir extracto».
  assert.equal(s.split('type="file"').length - 1, 1);
});

test('Banco: el aviso sigue a quien se desplaza y lo bueno se retira solo', () => {
  assert.match(leer('app/banco.css'), /\.bco > \.bco-aviso \{ position: sticky;/);
  assert.match(leer('components/Banco.js'), /if \(!msg \|\| msg\.error\) return undefined;[\s\S]*setTimeout\(\(\) => setMsg\(null\), 8000\)/);
});

test('la página pasa las reglas al cálculo de sugerencias y a la pantalla', () => {
  const s = leer('app/banco/page.js');
  assert.match(s, /leer\(u, 'bancoReglas'\)/);
  assert.match(s, /sugerencias\(conReglas\(lista, reglas\), facturas, gastos, u\)/);
  assert.match(s, /reglas=\{listaReglas\}/);
});

test('guía del extracto: los catorce bancos, cada uno con dónde, qué buscar y qué formato', () => {
  assert.deepEqual(BANCOS_EXTRACTO.map((b) => b.nombre), ['CaixaBank', 'Santander', 'BBVA', 'Sabadell', 'Bankinter', 'ING', 'Unicaja', 'Kutxabank', 'Abanca', 'Ibercaja', 'Openbank', 'Cajamar', 'Revolut', 'Otro banco']);
  assert.equal(new Set(BANCOS_EXTRACTO.map((b) => b.id)).size, 14);
  for (const b of BANCOS_EXTRACTO) for (const campo of ['donde', 'buscar', 'formato']) assert.ok(typeof b[campo] === 'string' && b[campo].length > 20, `${b.nombre}.${campo}`);
  // La banca de empresas habla de Norma 43 / Cuaderno 43; las que no la ofrecen lo dicen y mandan a Excel o CSV.
  for (const id of ['caixabank', 'santander', 'bbva', 'sabadell', 'bankinter', 'unicaja', 'kutxabank', 'abanca', 'ibercaja', 'cajamar', 'otro']) assert.match(BANCOS_EXTRACTO.find((b) => b.id === id).formato, /Norma 43/, id);
  for (const id of ['ing', 'openbank', 'revolut']) assert.match(BANCOS_EXTRACTO.find((b) => b.id === id).formato, /Excel/, id);
  assert.match(BANCOS_EXTRACTO.find((b) => b.id === 'otro').formato, /Cuaderno 43/);
});

test('guía del extracto: palabras que buscar, sin rutas de menú inventadas y con el aviso de que los menús cambian', () => {
  for (const b of BANCOS_EXTRACTO) {
    const t = `${b.donde} ${b.buscar} ${b.formato}`;
    // Una ruta exacta sería «Menú > Cuentas > Movimientos»: aquí solo hay palabras entre comillas latinas.
    assert.doesNotMatch(t, /[>›→]|\bMenú\b|\bPosición global\b/, b.nombre);
    assert.match(b.buscar, /«[^»]+»/, b.nombre);
  }
  assert.match(AVISO_MENUS, /cambian/);
  assert.ok(CONSEJOS_EXTRACTO.some((c) => /\.xls\b/.test(c) && /\.xlsx/.test(c)));
});

test('guía del extracto: los formatos y límites son los que lee la importación', () => {
  const importar = leer('app/api/banco/importar/route.js');
  const m = /MAX_MB = (\d+), MAX_MOV = (\d+)/.exec(importar);
  assert.ok(m);
  assert.equal(LIMITES_EXTRACTO, `Hasta ${m[1]} MB y ${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, '.')} movimientos por archivo.`);
  const accept = /accept="([^"]+)"/.exec(leer('components/Banco.js'))[1];
  const guia = FORMATOS_EXTRACTO.map(([a, b]) => `${a} ${b}`).join(' ');
  for (const ext of ['.csv', '.xlsx', '.txt', '.n43', '.aeb', '.q43', '.pdf']) assert.ok(accept.includes(ext), ext);
  for (const t of ['Norma 43', '.n43', '.aeb', '.q43', '.txt', 'CSV', '.xlsx', 'PDF', '10 páginas', '3 MB']) assert.ok(guia.includes(t), t);
  // El PDF consume páginas de IA y los demás no: lo dice la guía y el texto de la importación.
  assert.match(guia, /gasta páginas/);
  assert.match(leer('components/Banco.js'), /Norma 43, CSV y Excel no consumen páginas IA/);
});
