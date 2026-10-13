import test from 'node:test';
import assert from 'node:assert/strict';
import { fechaReal, TIPOS_IVA, TIPOS_IRPF, nifEspanolValido, validarNif, validarFactura, validarFechaDoc } from '../lib/validacion.js';

const factura = (cambios = {}) => ({ fecha: '2026-02-28', cliente: { nombre: 'Cliente', nif: '12345678Z' }, base: 100, ivaPct: 21, irpfPct: 15, ...cambios });
const linea = (cambios = {}) => ({ concepto: 'Servicios', cantidad: 1, precio: 100, dto: 0, ivaPct: 21, ...cambios });

test('fechas reales, bisiestos, formato estricto y límites del año', () => {
  for (const s of ['2000-02-29', '2024-02-29', '2026-02-28', '2100-12-31']) assert.equal(fechaReal(s), true, s);
  for (const s of ['2026-02-31', '2026-02-29', '2100-02-29', '2026-04-31', '2026-00-10', '2026-13-01', '2026-01-00', '1999-12-31', '2101-01-01', '2026-2-01', '2026-02-01T00:00:00Z', ' 2026-02-01', '2026-02-01\n', '', null, 20260201]) assert.equal(fechaReal(s), false, String(s));
  assert.deepEqual(validarFechaDoc('2024-02-29'), { ok: true });
  assert.equal(validarFechaDoc('2026-02-31').ok, false);
  assert.equal(typeof validarFechaDoc('').error, 'string');
});

test('DNI, NIE y NIF especiales: módulo 23 y normalización', () => {
  // 12345678 % 23 = 14 (Z); 01234567 % 23 = 19 (L).
  for (const nif of ['12345678Z', 'X1234567L', 'Y1234567X', 'Z1234567R', 'K1234567L', 'L1234567L', 'M1234567L', ' es 12.345.678-z ']) assert.equal(nifEspanolValido(nif), true, nif);
  for (const nif of ['12345678A', 'X1234567A', 'Y1234567L', 'Z1234567L', 'K1234567A', '1234567Z', '', null]) assert.equal(nifEspanolValido(nif), false, String(nif));
});

test('CIF: suma de pares y dobles de impares, control numérico o alfabético según entidad', () => {
  // 1234567: pares 2+4+6=12, impares 2+6+1+5=14; suma 26, control 4/D.
  // 5881850: pares 8+1+5=14, impares 1+7+7+0=15; suma 29, control 1/A.
  for (const nif of ['B12345674', 'A58818501', 'P1234567D', 'Q1234567D', 'N1234567D', 'R1234567D', 'S1234567D', 'W1234567D', 'C12345674', 'C1234567D', 'B00000000', 'ES B-1234567-4']) assert.equal(nifEspanolValido(nif), true, nif);
  for (const nif of ['B12345675', 'A58818502', 'B1234567D', 'A5881850A', 'P12345674', 'Q1234567A', 'W12345674', 'T12345674']) assert.equal(nifEspanolValido(nif), false, nif);
});

test('clasificación fiscal: NIF español, UE por formato y otros identificadores', () => {
  for (const nif of ['', '  ', undefined, null]) assert.deepEqual(validarNif(nif), { ok: true, tipo: '' });
  assert.deepEqual(validarNif('ES12345678Z'), { ok: true, tipo: 'es' });
  for (const nif of ['12345678A', 'B12345678', 'X1234567A', 'K1234567A', 'BABCDEFGH']) assert.equal(validarNif(nif).ok, false, nif);
  for (const nif of ['FR12345678901', 'DE123456789', 'IE6388047V', 'EL123456789', 'XI123456789', ' de 123.456.789 ']) assert.deepEqual(validarNif(nif), { ok: true, tipo: 'ue' }, nif);
  for (const nif of ['US-123456', 'GB123456789', 'abc', '1'.repeat(20)]) assert.deepEqual(validarNif(nif), { ok: true, tipo: 'otro' }, nif);
  for (const nif of ['DE1', 'FR12/34', 'ab', '1'.repeat(21), 'US/123', 'US 123', 12345678, {}]) assert.equal(validarNif(nif).ok, false, String(nif));
});

test('F06: devuelve todos los errores de fecha, IVA y base negativa', () => {
  const r = validarFactura(factura({ fecha: '2026-02-31', base: -100, ivaPct: 99, cliente: { nombre: 'Cliente' } }));
  assert.equal(r.ok, false);
  assert.ok(r.errores.fecha);
  assert.ok(r.errores.ivaPct);
  assert.equal(r.errores.base, 'Un importe negativo solo puede ir en una factura rectificativa');
  assert.equal(r.error, r.errores.fecha);
  assert.equal(r.errores['cliente.nif'], undefined);
});

test('base negativa solo en rectificativas y base cero siempre rechazada', () => {
  const f = factura({ base: '-100,50' });
  assert.equal(validarFactura(f).errores.base, 'Un importe negativo solo puede ir en una factura rectificativa');
  assert.deepEqual(validarFactura(f, { rectificativa: true }), { ok: true });
  for (const base of [0, '0,00', -0]) {
    assert.equal(validarFactura(factura({ base }), { rectificativa: true }).errores.base, 'La factura no puede ser de 0 €');
  }
  for (const base of ['abc', '100abc', '', undefined, NaN, Infinity, -Infinity, true, {}, '1,2,3']) assert.ok(validarFactura(factura({ base })).errores.base, String(base));
  assert.deepEqual(validarFactura(factura({ base: '1.234,50' })), { ok: true });
});

test('tipos de IVA e IRPF permitidos; IRPF vacío es cero', () => {
  assert.deepEqual(TIPOS_IVA, [0, 2, 4, 5, 10, 21]);
  assert.deepEqual(TIPOS_IRPF, [0, 1, 2, 7, 15, 19]);
  for (const ivaPct of TIPOS_IVA) assert.deepEqual(validarFactura(factura({ ivaPct: String(ivaPct) })), { ok: true });
  for (const irpfPct of [...TIPOS_IRPF, '', ' ', undefined, null]) assert.deepEqual(validarFactura(factura({ irpfPct })), { ok: true });
  for (const ivaPct of [99, '21abc', '', NaN, true]) assert.ok(validarFactura(factura({ ivaPct })).errores.ivaPct);
  for (const irpfPct of [99, '15abc', 'abc', Infinity, false]) assert.ok(validarFactura(factura({ irpfPct })).errores.irpfPct);
});

test('cliente: nombre obligatorio y hasta 120 caracteres, email opcional y NIF de Verifactu', () => {
  for (const nombre of ['', ' ', undefined, 'a'.repeat(121)]) assert.ok(validarFactura(factura({ cliente: { nombre } })).errores['cliente.nombre']);
  assert.deepEqual(validarFactura(factura({ cliente: { nombre: 'a'.repeat(120), email: 'cliente+test@example.es' } })), { ok: true });
  assert.ok(validarFactura(factura({ cliente: { nombre: 'Cliente', email: 'mal@correo' } })).errores['cliente.email']);
  assert.ok(validarFactura(factura({ cliente: { nombre: 'Cliente', nif: '12345678A' } })).errores['cliente.nif']);
  assert.ok(validarFactura(factura({ cliente: { nombre: 'Cliente' } }), { verifactu: true }).errores['cliente.nif']);
  assert.deepEqual(validarFactura(factura(), { verifactu: true }), { ok: true });
  assert.deepEqual(validarFactura(factura({ cliente: { nombre: 'Cliente', nif: 'DE123456789' } }), { verifactu: true }), { ok: true });
  assert.equal(validarFactura(null).ok, false);
});

test('líneas: límites de longitud y número sin recortar ni mutar', () => {
  assert.deepEqual(validarFactura(factura({ lineas: Array.from({ length: 100 }, () => linea()) })), { ok: true });
  const f = factura({ lineas: Array.from({ length: 101 }, () => linea()) });
  const antes = structuredClone(f);
  assert.ok(validarFactura(f).errores.lineas);
  assert.deepEqual(f, antes);
  for (const lineas of [[], null, {}, 'abc']) assert.ok(validarFactura(factura({ lineas })).errores.lineas);
  assert.ok(validarFactura(factura({ lineas: [linea({ concepto: 'a'.repeat(201) })] })).errores['lineas.0.concepto']);
  assert.ok(validarFactura(factura({ lineas: [linea({ concepto: 'a'.repeat(200) + ' ' })] })).errores['lineas.0.concepto']);
  assert.deepEqual(validarFactura(factura({ lineas: [linea({ concepto: 'a'.repeat(200) })] })), { ok: true });
  assert.ok(validarFactura(factura({ lineas: [linea({ concepto: ' ' })] })).errores['lineas.0.concepto']);
  assert.ok(validarFactura(factura({ lineas: [null] })).errores['lineas.0.concepto']);
});

test('números de líneas: coma decimal, finitud, rango y claves por línea', () => {
  for (const [campo, valores] of [
    ['cantidad', ['abc', '1abc', 0, 1000001, -1000001, Infinity, '', null]],
    ['precio', ['abc', 1000000001, -1000000001, Infinity, undefined, true]],
    ['dto', [-1, 101, 'abc', Infinity]],
    ['ivaPct', [99, '', 'abc', '21abc']],
  ]) {
    for (const valor of valores) assert.ok(validarFactura(factura({ lineas: [linea(), linea({ [campo]: valor })] })).errores[`lineas.1.${campo}`], `${campo}: ${String(valor)}`);
  }
  const f = factura({ lineas: [linea({ cantidad: '2,5', precio: '100,50', dto: '10,5', ivaPct: '21,0' })] });
  const antes = structuredClone(f);
  assert.deepEqual(validarFactura(f), { ok: true });
  assert.deepEqual(f, antes);
  assert.deepEqual(validarFactura(factura({ lineas: [linea({ cantidad: 1000000, precio: 1000000000 })] })), { ok: true });
});

test('base de líneas: descuentos, redondeo, cancelación y signo; ignora base bruta', () => {
  assert.equal(validarFactura(factura({ base: 999, lineas: [linea({ dto: 100 })] })).errores.base, 'La factura no puede ser de 0 €');
  assert.equal(validarFactura(factura({ lineas: [linea(), linea({ cantidad: -1 })] })).errores.base, 'La factura no puede ser de 0 €');
  assert.equal(validarFactura(factura({ lineas: [linea({ precio: '0,004' })] })).errores.base, 'La factura no puede ser de 0 €');
  const negativa = factura({ lineas: [linea({ cantidad: '-2,5' })] });
  assert.ok(validarFactura(negativa).errores.base);
  assert.deepEqual(validarFactura(negativa, { rectificativa: true }), { ok: true });
  assert.deepEqual(validarFactura(factura({ base: -999, lineas: [linea({ dto: undefined })] })), { ok: true });
});
