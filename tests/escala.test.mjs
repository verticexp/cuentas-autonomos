// Tope redondo del eje de la gráfica del resumen (components/Grafica.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { topeRedondo } from '../lib/escala.js';

test('el tope sube a una cifra redonda cuya mitad también lo es', () => {
  assert.equal(topeRedondo(32300), 40000);
  assert.equal(topeRedondo(11090.43), 20000);
  assert.equal(topeRedondo(4598), 5000);
  assert.equal(topeRedondo(750), 800);
  assert.equal(topeRedondo(1000), 1000);
  assert.equal(topeRedondo(1000.01), 2000);
  assert.equal(topeRedondo(9.5), 10);
});

test('sin datos no hay tope', () => {
  assert.equal(topeRedondo(0), 0);
  assert.equal(topeRedondo(-5), 0);
  assert.equal(topeRedondo(NaN), 0);
});
