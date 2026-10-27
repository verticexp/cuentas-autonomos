// «Qué hacer hoy»: qué tarjetas salen, con qué texto y en qué orden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { accionesHoy } from '../lib/hoy.js';

const ids = (x) => accionesHoy(x).map((a) => a.id);

test('sin nada pendiente no sale ninguna tarjeta', () => {
  assert.deepEqual(accionesHoy(), []);
  assert.deepEqual(accionesHoy({ vencidas: { n: 0, nombres: [] }, hacienda: null, teso: { fecha: '2026-11-03', saldo: 120 } }), []);
});

test('vencidas: singular, plural, nombres y destino', () => {
  const [uno] = accionesHoy({ vencidas: { n: 1, nombres: ['Eventos SL'] } });
  assert.equal(uno.titulo, '1 factura vencida');
  assert.equal(uno.detalle, 'Eventos SL');
  assert.equal(uno.href, '/facturas?estado=vencidas');
  const [varias] = accionesHoy({ vencidas: { n: 11, nombres: ['A', 'B', 'C'] } });
  assert.equal(varias.titulo, '11 facturas vencidas');
  assert.equal(varias.detalle, 'A, B, C');
});

test('Hacienda: solo dentro de los 15 días y si hay algo que pagar', () => {
  assert.deepEqual(ids({ hacienda: { dias: 16, importe: 500 } }), []);
  assert.deepEqual(ids({ hacienda: { dias: 7, importe: 0 } }), []);
  const [h] = accionesHoy({ hacienda: { dias: 7, importe: 10636.23 } });
  assert.equal(h.titulo, 'Hacienda en 7 días');
  assert.equal(h.tono, 'naranja');
  assert.match(h.detalle, /10\.636,23/);
  assert.equal(accionesHoy({ hacienda: { dias: 1, importe: 5 } })[0].titulo, 'Hacienda: queda 1 día');
  assert.equal(accionesHoy({ hacienda: { dias: 0, importe: 5 } })[0].titulo, 'Hacienda: hoy es el último día');
  assert.equal(accionesHoy({ hacienda: { dias: 3, importe: 5 } })[0].tono, 'rojo');
});

test('tesorería: solo si el saldo previsto es negativo', () => {
  assert.deepEqual(ids({ teso: { fecha: '2026-11-03', saldo: 0 } }), []);
  const [t] = accionesHoy({ teso: { fecha: '2026-11-03', saldo: -250 } });
  assert.equal(t.id, 'tesoreria');
  // Es el punto más bajo de la previsión (no el día en que se entra en negativo): fecha e importe en el título.
  assert.match(t.titulo, /3 de noviembre.*250/);
  assert.match(t.detalle, /más bajo/);
});

test('orden por urgencia: Hacienda inminente, tesorería, vencidas y, al final, Hacienda con margen', () => {
  const todo = { vencidas: { n: 2, nombres: [] }, teso: { fecha: '2026-11-03', saldo: -1 } };
  assert.deepEqual(ids({ ...todo, hacienda: { dias: 2, importe: 1 } }), ['hacienda', 'tesoreria', 'vencidas']);
  assert.deepEqual(ids({ ...todo, hacienda: { dias: 10, importe: 1 } }), ['tesoreria', 'vencidas', 'hacienda']);
});

test('cada tarjeta lleva destino, texto de acción e icono', () => {
  for (const a of accionesHoy({ vencidas: { n: 1, nombres: ['X'] }, hacienda: { dias: 5, importe: 1 }, teso: { fecha: '2026-11-03', saldo: -1 } })) {
    assert.ok(a.href.startsWith('/') && a.cta && a.icono && a.titulo && ['rojo', 'naranja'].includes(a.tono), a.id);
  }
});
