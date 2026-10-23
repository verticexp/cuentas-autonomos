import test from 'node:test';
import assert from 'node:assert/strict';
import { plazosDespacho } from '../lib/plazosDespacho.js';
import { FISCAL_BASE, modelosDe } from '../lib/empresa.js';
import { habil, limiteTrimestre } from '../lib/calculos.js';
import { plazo420 } from '../lib/igic.js';
import { TERRITORIOS } from '../lib/territorios.js';

const cliente = (fiscal = {}, pres, mas = {}) => ({ id: 'a', nombre: 'Ana', fiscal: { ...FISCAL_BASE, ...fiscal }, pres, ...mas });
const fila = (plazos, modelo, periodo) => {
  const p = plazos.find((p) => p.modelo === modelo && (!periodo || p.periodo === periodo));
  assert.ok(p, `Falta ${modelo} ${periodo || ''}`);
  return p;
};
const marca = (plazos, modelo) => fila(plazos, modelo).clientes[0].presentado;

test('Autónomo común: 303 y 130 del 3T de 2026, con sus marcas independientes', () => {
  const plazos = plazosDespacho([cliente({}, { pres303: { 2026: { 3: false } }, pagos130: { 2026: { 3: 0 } } })], { hoy: '2026-10-05' });
  assert.deepEqual(plazos.map((p) => [p.fecha, p.modelo, p.periodo]), [
    ['2026-10-20', '130', '3T 2026'], ['2026-10-20', '303', '3T 2026'],
  ]);
  assert.equal(marca(plazos, '303'), false);
  assert.equal(marca(plazos, '130'), true);
  assert.equal(fila(plazos, '303').hacienda, 'Agencia Tributaria');
  for (const p of plazos) assert.equal(p.nombre, modelosDe(FISCAL_BASE).find((m) => m.id === p.modelo).nombre);
});

test('Agrupa los clientes y los ordena por nombre en castellano', () => {
  const plazos = plazosDespacho([
    cliente({}, undefined, { id: 'z', nombre: 'Zoe' }),
    cliente({}, { pres303: { 2026: { 3: true } } }, { id: 'e', nombre: 'Ángela' }),
  ], { hoy: '2026-10-05' });
  assert.equal(plazos.length, 2);
  assert.deepEqual(fila(plazos, '303').clientes, [
    { id: 'e', nombre: 'Ángela', presentado: true }, { id: 'z', nombre: 'Zoe', presentado: false },
  ]);
});

test('Sociedad: IVA y segundo pago de Sociedades en octubre, sin 130', () => {
  const plazos = plazosDespacho([cliente({ tipo: 'sociedad' })], { hoy: '2026-10-01', dias: 30 });
  assert.deepEqual(plazos.map((p) => [p.modelo, p.periodo, p.fecha]), [
    ['202', '2P 2026', '2026-10-20'], ['303', '3T 2026', '2026-10-20'],
  ]);
  assert.equal(marca(plazos, '202'), null);
});

test('Canarias: plazo propio del 420 y del 425, sin 303, y AEAT para el IRPF', () => {
  const plazos = plazosDespacho([cliente({ territorio: 'canarias' }, { pagos130: { 2025: { 4: 0 } } })], { hoy: '2026-01-01' });
  assert.ok(plazos.every((p) => p.modelo !== '303'));
  assert.equal(fila(plazos, '420').fecha, plazo420(2025, 4));
  assert.equal(fila(plazos, '420').fecha, '2026-02-02');
  assert.equal(fila(plazos, '425').fecha, '2026-02-02');
  assert.equal(fila(plazos, '420').hacienda, 'Agencia Tributaria Canaria');
  assert.equal(marca(plazos, '420'), true);
  assert.equal(fila(plazos, '130').hacienda, 'Agencia Tributaria');
  assert.equal(fila(plazos, '415').fecha, '2026-03-02');
  assert.equal(fila(plazos, '415').hacienda, 'Agencia Tributaria Canaria');
  assert.equal(fila(plazos, '347').hacienda, 'Agencia Tributaria');
});

test('Navarra: F-69 e IRPF del 2T el 5 de agosto; retenciones en julio', () => {
  const plazos = plazosDespacho([cliente({ territorio: 'navarra', trabajadores: true, alquiler: true, intracom: true, oss: true, capital: true }, {
    pres303: { 2026: { 2: true } }, pagos130: { 2026: { 2: 0 } }, pres111: { 2026: { 2: false } }, pres115: { 2026: { 2: true } },
  })], { hoy: '2026-07-01', dias: 40 });
  assert.deepEqual(plazos.map((p) => [p.modelo, p.fecha]), [
    ['715', '2026-07-20'], ['759', '2026-07-20'], ['130', habil('2026-08-05')], ['F-69', habil('2026-08-05')],
  ]);
  assert.ok(plazos.every((p) => p.periodo === '2T 2026' && p.hacienda === TERRITORIOS.navarra.hacienda));
  assert.equal(marca(plazos, 'F-69'), true);
  assert.equal(marca(plazos, '130'), true);
  assert.equal(marca(plazos, '715'), false);
  assert.equal(marca(plazos, '759'), true);
});

test('Álava: no incluye el IRPF de oficio y conserva las retenciones propias', () => {
  const plazos = plazosDespacho([cliente({ territorio: 'alava', trabajadores: true, alquiler: true })], { hoy: '2026-07-01', dias: 45 });
  assert.deepEqual(plazos.map((p) => [p.modelo, p.fecha]), [
    ['110', '2026-07-27'], ['115-A', '2026-07-27'], ['303', '2026-07-27'],
  ]);
  assert.ok(plazos.every((p) => p.hacienda === TERRITORIOS.alava.hacienda));
});

test('Bizkaia y Gipuzkoa: IRPF del 1T exonerado en 2026, con plazos separados en el 2T', () => {
  for (const territorio of ['bizkaia', 'gipuzkoa']) {
    const c = cliente({ territorio });
    const abril = plazosDespacho([c], { hoy: '2026-04-01', dias: 45 });
    assert.ok(abril.every((p) => p.modelo !== '130'));
    const julio = plazosDespacho([c], { hoy: '2026-07-01', dias: 45 });
    assert.equal(fila(julio, '130').fecha, territorio === 'bizkaia' ? '2026-07-27' : '2026-08-10');
  }
});

test('IVA vasco del 4T: usa el 390 y la marca del 303, sin mezclar Haciendas', () => {
  const plazos = plazosDespacho(['alava', 'bizkaia', 'gipuzkoa'].map((territorio) => cliente({ territorio }, { pres303: { 2026: { 4: false } }, pagos130: { 2026: { 4: 100 } } })), { hoy: '2027-01-01', dias: 35 });
  const iva = plazos.filter((p) => p.modelo === '390');
  assert.equal(iva.length, 3);
  assert.equal(new Set(iva.map((p) => p.hacienda)).size, 3);
  assert.ok(iva.every((p) => p.periodo === '4T 2026' && p.clientes[0].presentado === false));
  assert.equal(iva.find((p) => p.hacienda === TERRITORIOS.alava.hacienda).fecha, '2027-02-01');
  assert.ok(plazos.every((p) => p.modelo !== '303'));
});

test('Anuales del año anterior: enero y último día hábil de febrero', () => {
  const plazos = plazosDespacho([cliente({ trabajadores: true, alquiler: true, capital: true })], { hoy: '2026-01-01', dias: 65 });
  assert.equal(fila(plazos, '390').fecha, '2026-01-30');
  for (const modelo of ['190', '180', '193']) assert.equal(fila(plazos, modelo).fecha, '2026-02-02');
  assert.equal(fila(plazos, '347').fecha, '2026-03-02');
  for (const modelo of ['390', '190', '180', '193', '347']) {
    assert.equal(fila(plazos, modelo).periodo, '2025');
    assert.equal(marca(plazos, modelo), null);
  }
  assert.equal(fila(plazos, '111').fecha, '2026-01-20');
  assert.equal(fila(plazos, '130').fecha, '2026-01-30');
});

test('Renta, Sociedades, Registro Mercantil y los tres pagos del 202', () => {
  const plazos = plazosDespacho([cliente(), cliente({ tipo: 'sociedad' }, undefined, { id: 's', nombre: 'Sociedad' })], { hoy: '2026-01-01', dias: 364 });
  for (const [modelo, fecha] of [['100', '2026-06-30'], ['200', '2026-07-27'], ['rm-libros', '2026-04-30'], ['rm-cuentas', '2026-07-30']]) {
    assert.equal(fila(plazos, modelo).fecha, fecha);
    assert.equal(fila(plazos, modelo).periodo, '2025');
  }
  assert.deepEqual(plazos.filter((p) => p.modelo === '202').map((p) => [p.periodo, p.fecha]), [
    ['1P 2026', '2026-04-20'], ['2P 2026', '2026-10-20'], ['3P 2026', '2026-12-21'],
  ]);
});

test('Módulos, operaciones intracomunitarias y OSS mantienen sus ids, nombres y plazos', () => {
  const c = cliente({ irpf: 'modulos', iva: 'simplificado', intracom: true });
  const enero = plazosDespacho([c], { hoy: '2026-01-01', dias: 30 });
  assert.deepEqual(enero.map((p) => p.modelo), ['131', '303', '349']);
  assert.ok(enero.every((p) => p.fecha === limiteTrimestre(4, 2025)));
  assert.equal(fila(enero, '303').nombre, 'IVA trimestral (régimen simplificado)');
  assert.equal(marca(enero, '131'), null);
  assert.equal(marca(enero, '349'), null);
  const oss = plazosDespacho([cliente({ oss: true })], { hoy: '2026-01-01', dias: 364 });
  assert.deepEqual(oss.filter((p) => p.modelo === '369').map((p) => p.fecha), ['2026-02-02', '2026-04-30', '2026-07-31', '2026-11-02']);
});

test('Marcas ausentes, falsas y heredadas: distingue pendiente y desconocido', () => {
  for (const pres of [undefined, {}, { pres303: {}, pagos130: {}, pres111: {}, pres115: {}, pres123: {} }]) {
    const plazos = plazosDespacho([cliente({ trabajadores: true, alquiler: true, capital: true }, pres)], { hoy: '2026-10-01', dias: 30 });
    for (const modelo of ['303', '130']) assert.equal(marca(plazos, modelo), false);
    for (const modelo of ['111', '115', '123']) assert.equal(marca(plazos, modelo), null);
  }
  const pres = { pagos130: { 2026: { 3: 0 } }, pres111: { 2026: { 3: false } }, pres115: { 2026: { 3: true } }, pres123: { 2026: { 3: false } } };
  const plazos = plazosDespacho([cliente({ trabajadores: true, alquiler: true, capital: true }, pres)], { hoy: '2026-10-01', dias: 30 });
  assert.equal(marca(plazos, '303'), true);
  assert.equal(marca(plazos, '111'), false);
  assert.equal(marca(plazos, '115'), true);
  assert.equal(marca(plazos, '123'), false);
  pres.pres123[2026][3] = true;
  assert.equal(marca(plazosDespacho([cliente({ capital: true }, pres)], { hoy: '2026-10-01', dias: 30 }), '123'), true);
});

test('Ventana inclusiva, cambio de año, días naturales y años bisiestos', () => {
  const clientes = [cliente({ trabajadores: true, oss: true })];
  assert.deepEqual(plazosDespacho(clientes, { hoy: '2026-10-21', dias: 5 }), []);
  assert.deepEqual(plazosDespacho(clientes, { hoy: '2026-10-01', dias: 18 }), []);
  assert.equal(plazosDespacho(clientes, { hoy: '2026-10-20', dias: 0 }).length, 3);
  assert.equal(plazosDespacho(clientes, { hoy: '2026-10-19', dias: 1 }).length, 3);
  const plazos = plazosDespacho(clientes, { hoy: '2026-12-31', dias: 20 });
  assert.deepEqual(plazos.map((p) => [p.modelo, p.periodo, p.fecha]), [['111', '4T 2026', '2027-01-20']]);
  const siguiente = plazosDespacho(clientes, { hoy: '2026-12-31', dias: 111 });
  assert.ok(siguiente.some((p) => p.periodo === '1T 2027' && p.fecha === '2027-04-20'));
  assert.ok(siguiente.every((p) => p.fecha >= '2026-12-31' && p.fecha <= '2027-04-21'));
  assert.equal(fila(plazosDespacho([cliente()], { hoy: '2024-02-01', dias: 28 }), '347').fecha, '2024-02-29');
});

test('Función pura: admite fiscal parcial y no modifica los datos de entrada', () => {
  const congelar = (x) => {
    if (x && typeof x === 'object') { Object.values(x).forEach(congelar); Object.freeze(x); }
    return x;
  };
  const clientes = congelar([{ id: 'a', nombre: 'Ana', fiscal: {}, pres: { pagos130: { 2026: { 3: 0 } } } }]);
  const opciones = congelar({ hoy: '2026-10-05' });
  const antes = JSON.stringify(clientes);
  const plazos = plazosDespacho(clientes, opciones);
  assert.equal(JSON.stringify(clientes), antes);
  assert.deepEqual(plazosDespacho(clientes, opciones), plazos);
  assert.equal(marca(plazos, '303'), true);
  assert.deepEqual(plazosDespacho([], opciones), []);
});
