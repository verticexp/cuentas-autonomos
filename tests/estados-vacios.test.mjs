import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const leer = (archivo) => readFileSync(new URL(`../${archivo}`, import.meta.url), 'utf8');

test('Tesorería: el vacío precede al saldo y los informes requieren movimientos', () => {
  const s = leer('app/tesoreria/page.js');
  assert.match(s, /!p\.movimientos\.length && <Vacio/);
  assert.match(s, /Aquí verás qué dinero entra y sale en los próximos meses/);
  assert.match(s, /!p\.movimientos\.length && <SaldoBanco/);
  assert.match(s, /p\.movimientos\.length > 0 && <>[\s\S]*className="segmentado"[\s\S]*className="teso-cifras"[\s\S]*<GraficaCaja[\s\S]*<\/>}/);
  assert.ok(s.indexOf('<Vacio') < s.indexOf('<SaldoBanco'));
});

test('Cartera: las cifras solo aparecen con efectos y la explicación está plegada', () => {
  const s = leer('app/cartera/page.js');
  assert.match(s, /d\.efectos\.length > 0 && <div className="teso-cifras">/);
  assert.match(s, /<details className="como-se-calcula"><summary>(\{tr\('Cómo se calcula'\)\}|Cómo se calcula)<\/summary>[\s\S]*Forma de cobro:/);
});

test('Análisis: conserva navegación si existen datos en otros años', () => {
  const s = leer('app/analisis/page.js');
  assert.match(s, /const hayDatos = !sinDatos \|\| \[facturas, gastos, nominas, manuales, capital, productos, ajustes, albaranes\]\.some/);
  assert.match(s, /hayDatos && <nav className="anios" aria-label="Año">/);
  assert.match(s, /hayDatos && <nav className="segmentado cont-periodo" aria-label="Periodo">/);
  assert.match(s, /sinDatos \? <Vacio/);
});

test('Albaranes: sin documentos queda el primer vacío, sin contadores ni pestañas', () => {
  const s = leer('app/albaranes/page.js');
  assert.match(s, /const hay = docs.length > 0/);
  assert.match(s, /const ver = hay && VISTAS.some[\s\S]*: 'pedidos'/);
  assert.match(s, /hay && <p className="resumen-linea">/);
  assert.match(s, /hay && <nav className="segmentado" aria-label="Vista de pedidos y albaranes">/);
  assert.match(s, /hay && puedeOperar && <Ir/);
});

test('Inventario: desactivado termina antes de cargar el módulo; sin productos no hay informes', () => {
  const s = leer('app/inventario/page.js');
  assert.match(s, /if \(!fiscalDe\(u\).inventario\) return/);
  assert.match(s, /titulo="El inventario está desactivado"/);
  assert.match(s, /href: '\/bienvenida\?editar=1', texto: 'Activar inventario'/);
  assert.ok(s.indexOf('El inventario está desactivado') < s.indexOf('datosStock(u)'));
  assert.match(s, /!inv\.productos\.length \? <Vacio[\s\S]*: <>[\s\S]*className="cont-resumen"[\s\S]*Descargar en Excel[\s\S]*<\/>}/);
});

test('Gastos: tarjeta plegada sin vacío duplicado y herramientas cerradas sin gastos', () => {
  const s = leer('app/gastos/page.js');
  assert.match(s, /<FormGasto[^>]*\splegado\s/);
  assert.doesNotMatch(s, /titulo="Añade tu primer gasto"/);
  assert.match(s, /<details className="gastos-mas" open=\{hay\}>/);
  assert.match(s, /!lista.length && \(hay \|\| buscado \|\| desde\) &&/);
});

test('Banco: conserva filtros con resultados vacíos solo si hay historial', () => {
  const s = leer('components/Banco.js');
  assert.match(s, /historial && historial.total > 0 && <section className="grupo bco-historial"[\s\S]*className="bco-filtros"/);
  assert.match(s, /historial.encontrados === 0 && historial.total > 0 && <Vacio/);
});

for (const archivo of ['tesoreria', 'cartera', 'analisis', 'inventario']) {
  test(`${archivo}: explicación técnica cerrada`, () => {
    const s = leer(`app/${archivo}/page.js`);
    assert.match(s, /<details className="como-se-calcula"><summary>(\{tr\('Cómo se calcula'\)\}|Cómo se calcula)<\/summary>/);
    assert.doesNotMatch(s, /<details className="como-se-calcula"[^>]*\bopen/);
  });
}
