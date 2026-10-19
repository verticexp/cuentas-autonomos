import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buscar, normalizar } from '../lib/navegacion.js';
import { tocaPaqueteGestoria, trimestreAnterior } from '../lib/gestoriaEnvio.js';
import { TEMAS_SOPORTE } from '../lib/soporte.js';

const PANTALLAS = [
  { href: '/modelos', nombre: 'Impuestos', detalle: 'Modelos, plazos y lo que toca pagar', palabras: 'hacienda aeat 303 iva' },
  { href: '/banco', nombre: 'Banco', detalle: 'Movimientos y conciliación', palabras: 'extracto conciliar' },
  { href: '/cartera', nombre: 'Cartera de cobros', detalle: 'Lo que te deben y cuándo vence', palabras: 'cobros pendientes morosos' },
];

test('buscador de «Más»: sin acentos ni mayúsculas, por nombre, detalle o palabras clave', () => {
  assert.equal(normalizar('  Conciliación '), 'conciliacion');
  assert.deepEqual(buscar(PANTALLAS, 'IMPUESTOS').map((e) => e.href), ['/modelos']);
  assert.deepEqual(buscar(PANTALLAS, 'conciliacion').map((e) => e.href), ['/banco']);
  assert.deepEqual(buscar(PANTALLAS, 'hacienda 303').map((e) => e.href), ['/modelos']);
  assert.deepEqual(buscar(PANTALLAS, 'cobros pendientes').map((e) => e.href), ['/cartera']);
  assert.deepEqual(buscar(PANTALLAS, 'nada que ver'), []);
  assert.equal(buscar(PANTALLAS, '   ').length, PANTALLAS.length);
});

test('secciones: cada pantalla sale una sola vez y Ajustes, Usuarios e Importar ya no están en «Más»', () => {
  const src = readFileSync(new URL('../components/secciones.js', import.meta.url), 'utf8');
  const hrefs = [...src.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(new Set(hrefs).size, hrefs.length, 'hay pantallas repetidas');
  for (const fuera of ['/ajustes', '/usuarios', '/ajustes/importar']) assert.ok(!hrefs.includes(fuera), `${fuera} sigue en «Más»`);
  for (const dentro of ['/clientes', '/banco', '/modelos', '/nominas', '/asistente']) assert.ok(hrefs.includes(dentro), `falta ${dentro}`);
});

test('gestoría: el trimestre que acaba de cerrar y el día del envío automático', () => {
  assert.deepEqual(trimestreAnterior('2026-01-05'), { anio: 2025, t: 4 });
  assert.deepEqual(trimestreAnterior('2026-04-05'), { anio: 2026, t: 1 });
  assert.deepEqual(trimestreAnterior('2026-07-05'), { anio: 2026, t: 2 });
  assert.deepEqual(trimestreAnterior('2026-10-19'), { anio: 2026, t: 3 });
  for (const d of ['2026-01-05', '2026-04-05', '2026-07-05', '2026-10-05']) assert.ok(tocaPaqueteGestoria(d), d);
  for (const d of ['2026-10-04', '2026-10-06', '2026-02-05', '2026-12-05']) assert.ok(!tocaPaqueteGestoria(d), d);
});

test('soporte: los temas del formulario', () => {
  assert.ok(TEMAS_SOPORTE.length >= 3);
  assert.equal(new Set(TEMAS_SOPORTE).size, TEMAS_SOPORTE.length);
});
