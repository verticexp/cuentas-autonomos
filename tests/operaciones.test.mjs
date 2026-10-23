// Clasificación de las operaciones (auditoría F10): por qué una factura (o parte) va sin IVA, explícito o deducido como
// hasta ahora, y de ahí el 303 (casillas 59, 60, 120 y 122 de 2026), el 349, los libros registro y Verifactu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { operacionDe, TIPOS_OPERACION } from '../lib/operaciones.js';
import { casillas303 } from '../lib/calculos.js';
import { modelo349 } from '../lib/modelos.js';
import { librosRegistro } from '../lib/librosRegistro.js';
import { registroAlta } from '../lib/verifactu.js';
import { xmlAlta } from '../lib/verifactuXml.js';
import { validarFactura } from '../lib/validacion.js';

const f = (cliente, extra = {}) => ({ id: `f${Math.random()}`, numero: 1, anio: 2026, fecha: '2026-02-10', base: 1000, ivaPct: 0, irpfPct: 0, concepto: 'X', cliente, ...extra });
const DE = { nombre: 'Kunde GmbH', nif: 'DE123456789' };
const US = { nombre: 'Client Inc', nif: '12-3456789' };
const ES = { nombre: 'Cliente SL', nif: 'B12345674' };

test('F10 (reproducido): una factura con IVA español a un NIF alemán no va en el 349', () => {
  const conIva = f(DE, { ivaPct: 21 });
  assert.equal(modelo349([conIva], 2026, 1).operadores.length, 0);
  assert.equal(operacionDe(conIva), 'nacional');
});

test('sin indicar nada se deduce como hasta ahora: UE → servicios UE, fuera → servicios fuera, España → exenta', () => {
  assert.equal(operacionDe(f(DE)), 'servicios-ue');
  assert.equal(operacionDe(f(US)), 'servicios-fuera');
  assert.equal(operacionDe(f(ES)), 'exenta');
});

test('303 de 2026: 59 intracomunitarias, 60 exportaciones, 120 no sujetas por localización, 122 inversión del sujeto pasivo', () => {
  const F = [
    f(DE),                                           // servicios UE → 59
    f(DE, { operacion: 'intracomunitaria', base: 200 }), // entrega de bienes UE → 59
    f(US, { operacion: 'exportacion', base: 300 }),   // → 60
    f(US, { base: 400 }),                             // servicios fuera → 120
    f(ES, { operacion: 'isp', base: 500 }),           // → 122
    f(ES, { base: 600 }),                             // exenta: en ninguna de esas
    f(DE, { ivaPct: 21, base: 700 }),                 // con IVA: en ninguna de esas
  ];
  const c = casillas303(F, [], 2026, 1);
  assert.deepEqual([c['59'], c['60'], c['120'], c['122']], [1200, 300, 400, 500]);
  assert.equal(c['07'], 700);
});

test('349: clave E para bienes y S para servicios, por la base sin IVA; nada con IVA español', () => {
  const F = [f(DE), f(DE, { operacion: 'intracomunitaria', base: 200 }), f(DE, { ivaPct: 21, base: 700 })];
  const m = modelo349(F, 2026, 1).operadores.sort((a, b) => a.clave.localeCompare(b.clave));
  assert.deepEqual(m.map((o) => [o.clave, o.base]), [['E', 200], ['S', 1000]]);
});

test('una factura mixta: solo la parte sin IVA cuenta como operación internacional', () => {
  const mixta = f(DE, { base: 1100, lineas: [{ concepto: 'A', cantidad: 1, precio: 1000, ivaPct: 0 }, { concepto: 'B', cantidad: 1, precio: 100, ivaPct: 21 }] });
  assert.equal(casillas303([mixta], [], 2026, 1)['59'], 1000);
  assert.equal(modelo349([mixta], 2026, 1).operadores[0].base, 1000);
});

test('Verifactu: E5 entrega intracomunitaria, E2 exportación, N2 servicios, S2 inversión del sujeto pasivo, E1 exenta', () => {
  const sistema = { nombre: 'Fisquo', nif: 'B12345674', version: '1', instalacion: 'x' };
  const xml = (x) => xmlAlta(registroAlta(x, 'B12345674', ''), { factura: x, emisorNombre: 'E', anterior: null, sistema, fiscal: { iva: 'general' } });
  assert.match(xml(f(DE, { operacion: 'intracomunitaria' })), /<sum1:OperacionExenta>E5<\/sum1:OperacionExenta>/);
  assert.match(xml(f(US, { operacion: 'exportacion' })), /<sum1:OperacionExenta>E2<\/sum1:OperacionExenta>/);
  // Validación 15.5 de la AEAT: con la clave de régimen 01 no se admite E2; la exportación va con la 02.
  assert.match(xml(f(US, { operacion: 'exportacion' })), /<sum1:ClaveRegimen>02<\/sum1:ClaveRegimen>/);
  assert.match(xml(f(DE, { operacion: 'intracomunitaria' })), /<sum1:ClaveRegimen>01<\/sum1:ClaveRegimen>/);
  assert.match(xml(f(DE)), /<sum1:CalificacionOperacion>N2<\/sum1:CalificacionOperacion>/);
  assert.match(xml(f(ES, { operacion: 'isp' })), /<sum1:CalificacionOperacion>S2<\/sum1:CalificacionOperacion>/);
  assert.match(xml(f(ES)), /<sum1:OperacionExenta>E1<\/sum1:OperacionExenta>/);
});

test('libros registro: la calificación o la causa de exención de cada operación', () => {
  const L = librosRegistro({ facturas: [f(DE, { operacion: 'intracomunitaria' }), f(US, { operacion: 'exportacion', id: 'x2' }), f(ES, { operacion: 'isp', id: 'x3' })], fiscal: { tipo: 'autonomo', iva: 'general' }, actividades: [{ id: 'a', nombre: 'A' }] }, 2026, '2026-12-31');
  const filas = L.hojas[0].filas.map((x) => x.join('|'));
  assert.ok(filas.some((x) => x.includes('E5')));
  assert.ok(filas.some((x) => x.includes('E2')));
  assert.ok(filas.some((x) => x.includes('S2')));
  // La exportación va con la clave de régimen 02 (columna R), como en Verifactu.
  assert.equal(L.hojas[0].filas.find((x) => x.includes('E2'))[17], '02');
});

test('libros registro: la rectificativa lleva la clave de su motivo (R1-R4), como en Verifactu', () => {
  const r = (motivo, id) => f(ES, { id, serie: 'R', base: -100, rectifica: { id: 'o', numero: '01-2026', fecha: '2026-02-01', motivo } });
  const L = librosRegistro({ facturas: [r('incobrable', 'r3'), r('concurso', 'r2'), r('errorDerecho', 'r1'), r(undefined, 'r4')], fiscal: { tipo: 'autonomo', iva: 'general' }, actividades: [{ id: 'a', nombre: 'A' }] }, 2026, '2026-12-31');
  const claves = Object.fromEntries(L.hojas[0].filas.filter((x) => /^r\d$/.test(x.at(-1))).map((x) => [x.at(-1), x[5]]));
  assert.deepEqual(claves, { r3: 'R3', r2: 'R2', r1: 'R1', r4: 'R4' });
});

test('validación: la operación tiene que cuadrar con el cliente y con las líneas sin IVA', () => {
  const b = (extra) => ({ fecha: '2026-02-10', cliente: { nombre: 'X', nif: 'B12345674' }, lineas: [{ concepto: 'A', cantidad: 1, precio: 100, ivaPct: 0 }], irpfPct: 0, ...extra });
  assert.match(validarFactura(b({ operacion: 'intracomunitaria' })).errores.operacion, /NIF-IVA/);
  assert.equal(validarFactura(b({ operacion: 'intracomunitaria', cliente: DE })).ok, true);
  assert.match(validarFactura(b({ operacion: 'exportacion', lineas: [{ concepto: 'A', cantidad: 1, precio: 100, ivaPct: 21 }] })).errores.operacion, /sin IVA/);
  assert.match(validarFactura(b({ operacion: 'inventada' })).errores.operacion, /no válida/);
  assert.ok(Object.keys(TIPOS_OPERACION).includes('isp'));
});
