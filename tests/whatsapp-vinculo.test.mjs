import test from 'node:test';
import assert from 'node:assert/strict';
import { codigoEn, enlaceWa, nuevoCodigo, telefonoBonito } from '../lib/whatsappVinculo.js';
import { PUBLICO } from '../lib/rutasPublicas.js';

test('códigos de conexión: formato fijo, sin letras que se confunden y distintos cada vez', () => {
  const vistos = new Set();
  for (let i = 0; i < 200; i++) {
    const c = nuevoCodigo();
    assert.match(c, /^FISQUO-[A-Z2-9]{6}$/);
    assert.doesNotMatch(c.slice(7), /[01ILO]/);
    vistos.add(c);
  }
  assert.ok(vistos.size > 195);
});

test('reconoce el código dentro del mensaje, en mayúsculas o no', () => {
  assert.equal(codigoEn('FISQUO-AB2CD3'), 'FISQUO-AB2CD3');
  assert.equal(codigoEn('hola! fisquo-ab2cd3 👍'), 'FISQUO-AB2CD3');
  assert.equal(codigoEn('Factura a Bar Pepe de 300'), null);
  assert.equal(codigoEn('FISQUO-AB2'), null);
  assert.equal(codigoEn('FISQUO-AB2CD3X'), null);
  assert.equal(codigoEn(undefined), null);
});

test('enlace wa.me con el código ya escrito, y el teléfono legible', () => {
  assert.equal(enlaceWa('15551935257', 'FISQUO-AB2CD3'), 'https://wa.me/15551935257?text=FISQUO-AB2CD3');
  assert.equal(enlaceWa(null, 'FISQUO-AB2CD3'), null);
  assert.equal(telefonoBonito('34693818775'), '+34 693 818 775');
  assert.equal(telefonoBonito('+1 555 193 5257'), '+15551935257');
  assert.equal(telefonoBonito(''), '');
});

test('la API de conexión necesita sesión (no cae bajo la ruta pública del webhook)', () => {
  assert.ok(PUBLICO.test('/api/whatsapp'));
  assert.ok(!PUBLICO.test('/api/conexion-whatsapp'));
});
