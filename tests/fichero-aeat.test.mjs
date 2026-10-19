import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, liquidaciones303, resumenAnual } from '../lib/calculos.js';
import { declarante, fichero130, fichero303, importe, texto } from '../lib/ficheroAeat.js';

const yo = { nif: '12345678Z', nombre: 'Marc Ramírez Delgado' };
const F = [
  { fecha: '2026-02-01', base: 1000, ivaPct: 21, irpfPct: 15, cliente: { nombre: 'Ana', nif: '11111111H' } },
  { fecha: '2026-05-01', base: 2000, ivaPct: 21, irpfPct: 15, cliente: { nombre: 'Ana', nif: '11111111H' } },
];
const G = [{ fecha: '2026-01-15', base: 200, ivaPct: 21 }, { fecha: '2026-04-15', base: 3000, ivaPct: 21 }];

// Campo del registro por su posición (1-indexada) y longitud, como en el diseño.
const campo = (s, pos, lon) => s.slice(pos - 1, pos - 1 + lon);
const pagina = (s, id) => s.slice(s.indexOf(`<T${id}>`));

test('formatos de campo: céntimos con ceros, negativos con N, texto sin tildes', () => {
  assert.equal(importe(1234.5), '00000000000123450');
  assert.equal(importe(-12.3, 17, true), 'N0000000000001230');
  assert.throws(() => importe(-1));
  assert.equal(texto('Ramírez, Nuñez & Cía.', 22), 'RAMIREZ NUÑEZ CIA     ');
  assert.equal(declarante({ nombre: 'X' }).error, 'Rellena tu NIF en Ajustes para generar el fichero');
  assert.deepEqual(declarante({ nif: '12345678-z', nombre: 'X' }), { nif: '12345678Z', nombre: 'X' });
});

test('303: cabecera, longitudes de página y casillas en su posición', () => {
  const c = casillas303(F, G, 2026, 1);
  const { contenido, resultado, tipo } = fichero303(yo, 2026, 1, c, liquidaciones303(F, G, 2026)[0]);
  assert.ok(contenido.startsWith('<T303020261T0000><AUX>'));
  assert.ok(contenido.endsWith('</T303020261T0000>'));
  assert.equal(campo(contenido, 323, 6), '</AUX>');
  const p1 = pagina(contenido, '30301000');
  assert.equal(p1.indexOf('</T30301000>'), 1581 - 12);
  assert.equal(campo(p1, 13, 1), 'I');
  assert.equal(campo(p1, 14, 9), '12345678Z');
  assert.equal(campo(p1, 23, 80).trim(), 'MARC RAMIREZ DELGADO');
  assert.equal(campo(p1, 107, 2), '1T');
  assert.equal(campo(p1, 326, 17), importe(1000)); // 07
  assert.equal(campo(p1, 343, 5), '02100'); // 08
  assert.equal(campo(p1, 348, 17), importe(210)); // 09
  assert.equal(campo(p1, 713, 17), importe(200)); // 28
  assert.equal(campo(p1, 730, 17), importe(42)); // 29
  assert.equal(campo(p1, 1019, 17), importe(168)); // 46
  const p3 = pagina(contenido, '30303000');
  assert.equal(p3.indexOf('</T30303000>'), 1017 - 12);
  assert.equal(campo(p3, 340, 17), importe(168)); // 69
  assert.equal(campo(p3, 408, 17), importe(168)); // 71
  assert.equal(campo(p1, 115, 2), '22'); // prorrata especial: NO (la Sede no admite blanco)
  const did = pagina(contenido, '303DID00');
  assert.equal(did.indexOf('</T303DID00>'), 823 - 12);
  assert.equal(campo(did, 194, 1), '0');
  assert.equal(resultado, 168);
  assert.equal(tipo, 'I');
});

test('303: negativo a compensar y su aplicación en el trimestre siguiente', () => {
  const liq = liquidaciones303(F, G, 2026);
  const c2 = casillas303(F, G, 2026, 2);
  const neg = fichero303(yo, 2026, 2, c2, liq[1]);
  assert.equal(neg.tipo, 'C');
  assert.equal(campo(pagina(neg.contenido, '30303000'), 408, 17), importe(-210, 17, true));
  const F3 = [...F, { fecha: '2026-08-01', base: 2000, ivaPct: 21, irpfPct: 15 }];
  const l3 = liquidaciones303(F3, G, 2026)[2];
  const r = fichero303(yo, 2026, 3, casillas303(F3, G, 2026, 3), l3);
  const p3 = pagina(r.contenido, '30303000');
  assert.equal(campo(p3, 255, 17), importe(210)); // 110 pendiente
  assert.equal(campo(p3, 272, 17), importe(210)); // 78 aplicado
  assert.equal(r.resultado, 210);
});

test('303: tipos de IVA fuera del 4, 10 y 21 % no se exportan', () => {
  const c = casillas303([{ fecha: '2026-02-01', base: 100, ivaPct: 5 }], [], 2026, 1);
  assert.throws(() => fichero303(yo, 2026, 1, c, { anterior: 0, compensado: 0 }), /tipos de IVA/);
});

test('130: 600 posiciones y las casillas del resumen anual', () => {
  const q = resumenAnual(F, G, 2026).trimestres[0];
  const { contenido, resultado, tipo } = fichero130(yo, 2026, q);
  assert.ok(contenido.startsWith('<T130020261T0000><AUX>'));
  assert.ok(contenido.endsWith('</T130020261T0000>'));
  const p = pagina(contenido, '13001000');
  assert.equal(p.indexOf('</T13001000>'), 600 - 12);
  assert.equal(campo(p, 23, 60).trim(), 'RAMIREZ DELGADO');
  assert.equal(campo(p, 83, 20).trim(), 'MARC');
  assert.equal(campo(p, 109, 17), importe(q.ingAcum));
  assert.equal(campo(p, 211, 17), importe(q.c07, 17, true));
  assert.equal(resultado, q.m130);
  assert.equal(tipo, q.m130 > 0 ? 'I' : 'N');
});

test('130: un 07 negativo deja la 12 a cero y el resultado sin ingreso', () => {
  const q = resumenAnual(F, G, 2026, { 1: 0 }).trimestres[1];
  assert.ok(q.c07 < 0);
  const { contenido, resultado, tipo } = fichero130(yo, 2026, q);
  assert.equal(campo(pagina(contenido, '13001000'), 296, 17), importe(0));
  assert.equal(resultado, 0);
  assert.equal(tipo, 'N');
});
