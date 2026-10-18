import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const leer = (ruta) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');

test('el componente de cupo consulta sin caché y permite reintentar/refrescar', async () => {
  const s = await leer('components/CupoEscaneo.js');
  assert.match(s, /cache: 'no-store'/);
  assert.match(s, /netto:escaneos/);
  assert.match(s, /Reintentar/);
  assert.match(s, /Solicitar ampliación/);
  assert.match(s, /gastos a mano/);
});

test('formularios de gasto actualizan el cupo tras cada intento de lectura', async () => {
  const [form, rafaga] = await Promise.all([leer('components/FormGasto.js'), leer('components/RafagaTickets.js')]);
  assert.match(form, /finally \{ window\.dispatchEvent\(new Event\('netto:escaneos'\)\); \}/);
  assert.match(rafaga, /finally \{ window\.dispatchEvent\(new Event\('netto:escaneos'\)\); \}/);
  assert.match(form, /<CupoEscaneo/);
  assert.match(rafaga, /<CupoEscaneo/);
});

test('precios y altas reflejan cuotas distintas por plan y distinguen prueba de mes', async () => {
  const [datos, registro, elegir, precios] = await Promise.all([
    leer('components/web/datos.js'), leer('components/FormRegistro.js'), leer('components/ElegirPlan.js'), leer('components/web/Precios.js'),
  ]);
  for (const n of ['50', '200', '500', '600', '1.500']) assert.ok(datos.includes(`${n} páginas/mes`));
  assert.match(precios, /páginas por empresa/);
  for (const s of [datos, registro, elegir]) assert.match(s, /páginas|Páginas/);
  assert.match(datos, /mes natural/);
  assert.match(datos, /50 páginas en total/);
  assert.doesNotMatch(datos, /100 tickets o facturas al día/);
});
