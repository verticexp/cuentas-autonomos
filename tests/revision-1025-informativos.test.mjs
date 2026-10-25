// Revisión 25-10-2026: esperados calculados a mano según LIVA, RIRPF y arts. 33-34 RGAT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { modelo309, modelo347, modelo190 } from '../lib/modelos.js';
import { limpiarPago, modelo123, modelo193, NATURALEZAS_C } from '../lib/capitalMobiliario.js';

const cliente = { nombre: 'Cliente SL', nif: 'B12345674' };
const americano = { nombre: 'Consultoría USA', nif: '12-3456789', pais: 'US' };
const factura = (cambios = {}) => ({ fecha: '2026-03-10', base: 5000, ivaPct: 0, cliente: americano, operacion: 'servicios-fuera', ...cambios });
const gasto = (cambios = {}) => ({ fecha: '2026-03-10', base: 1000, ivaPct: 0, origen: 'isp', proveedor: 'Proveedor SL', proveedorNif: 'B76543213', categoria: '600', ...cambios });
const pago = (cambios = {}) => limpiarPago({ fecha: '2026-03-10', tipo: 'otros', naturaleza: '06', perceptor: { nombre: 'Ana', nif: '12345678Z' }, bruto: 1000, ...cambios });

test('309: bienes con ISP en recargo, hecho 3, IVA 210 y recargo 52 en las casillas 10-12', () => {
  // Art. 156 LIVA y DR309: hecho 3, mismas casillas de recargo que el hecho 1; 22 = 210 + 52, 24 = 262.
  const r = modelo309([gasto()], 2026, 1, { regimen: 'recargo' });
  assert.deepEqual(r, { declaraciones: [{ hecho: 3, situacion: 2, c: {
    '01': 1000, '02': 21, '03': 210, '10': 1000, '11': 5.2, '12': 52, '22': 262, '23': 0, '24': 262,
  } }], ingresar: 262 });
});

test('309: los servicios ISP no llevan recargo, tampoco al agruparse con bienes al mismo tipo', () => {
  const servicio = gasto({ categoria: '623' });
  const solo = modelo309([servicio], 2026, 1, { regimen: 'recargo' });
  assert.equal(solo.ingresar, 210);
  assert.equal(solo.declaraciones[0].c['10'], undefined);
  const mixto = modelo309([gasto(), servicio], 2026, 1, { regimen: 'recargo' });
  const c = mixto.declaraciones[0].c;
  assert.deepEqual([c['01'], c['03'], c['10'], c['12'], c['24']], [2000, 420, 1000, 52, 472]);
  assert.equal(modelo309([gasto()], 2026, 1, { regimen: 'exento' }).ingresar, 210);
});

test('309: reconoce bienes por categoría, stock o inversión y conserva los tipos y periodos', () => {
  for (const bien of [{ categoria: '600' }, { categoria: '629', stock: [{ producto: 'p', cantidad: 1 }] }, { categoria: '629', inversion: { tipo: 'maquinaria' } }]) {
    assert.equal(modelo309([gasto(bien)], 2026, 1, { regimen: 'recargo' }).ingresar, 262);
  }
  const r = modelo309([gasto(), gasto({ ivaAuto: 10 }), gasto({ ivaAuto: 4 }), gasto({ fecha: '2026-04-01' }), gasto({ fecha: '2025-03-10' })], 2026, 1, { regimen: 'recargo' });
  const c = r.declaraciones[0].c;
  assert.deepEqual([c['10'], c['11'], c['12'], c['13'], c['14'], c['15'], c['16'], c['17'], c['18'], c['24']], [1000, 5.2, 52, 1000, 1.4, 14, 1000, 0.5, 5, 421]);
  const ue = modelo309([gasto({ origen: 'ue' })], 2026, 1, { regimen: 'recargo' });
  assert.deepEqual([ue.declaraciones[0].hecho, ue.ingresar], [1, 262]);
});

test('193: C.06 por defecto retiene el 24 %, también con porcentaje vacío, y llega al 123 y al 193', () => {
  // Art. 101.1 RIRPF: 1.000 × 24 % = 240; líquido = 760.
  for (const retencionPct of [undefined, null, '', '  ']) {
    const p = pago({ retencionPct });
    assert.equal(p.error, undefined);
    assert.deepEqual([p.retencionPct, p.retencion, p.liquido], [24, 240, 760]);
    assert.deepEqual(modelo123([p], 2026, 1), { perceptores: 1, base: 1000, retenciones: 240 });
    assert.deepEqual(modelo193([p], 2026).perceptores.map((x) => [x.clave, x.naturaleza, x.base, x.retenciones]), [['C', '06', 1000, 240]]);
  }
});

test('193: las demás naturalezas conservan el 19 % y se respeta el porcentaje explícito', () => {
  for (const naturaleza of NATURALEZAS_C.filter((n) => n !== '06')) assert.equal(pago({ naturaleza }).retencionPct, 19);
  for (const tipo of ['dividendos', 'intereses']) assert.equal(pago({ tipo }).retencionPct, 19);
  assert.equal(pago({ perceptor: { nombre: 'Sociedad', nif: 'B12345674' } }).retencionPct, 19);
  for (const retencionPct of [0, 19, '24']) assert.equal(pago({ retencionPct }).retencionPct, Number(retencionPct));
});

test('347: servicios a Estados Unidos, B de 5.000 y A de 4.000, sin NIF español y con provincia y país', () => {
  // Art. 33.2.g RGAT: solo excluye mercancías; diseño del 347, posiciones 77-80: 99 US.
  const r = modelo347([factura()], [gasto({ base: 4000, origen: 'fuera', categoria: '623', proveedor: americano.nombre, proveedorNif: americano.nif, proveedorPais: ' us ' })], 2026);
  for (const [lista, clave, total] of [[r.ventas, 'B', 5000], [r.compras, 'A', 4000]]) {
    assert.deepEqual(lista.map((o) => [o.clave, o.nif, o.pais, o.provincia, o.total, o.trimestres]), [[clave, '', 'US', '99', total, [total, 0, 0, 0]]]);
  }
  assert.deepEqual(r.sinNif, []);
});

test('347: admite servicios sin identificador extranjero y mantiene separado cada país', () => {
  const r = modelo347([factura({ cliente: { nombre: 'Consultoría', pais: 'US' } }), factura({ cliente: { nombre: 'Consultoría', pais: 'CA' } })], [], 2026);
  assert.deepEqual(r.ventas.map((o) => [o.nif, o.pais, o.total]), [['', 'US', 5000], ['', 'CA', 5000]]);
  assert.deepEqual(r.sinNif, []);
  const conNif = modelo347([factura({ cliente: { ...americano, nif: 'ESB12345674' } })], [], 2026);
  assert.equal(conNif.ventas[0].nif, 'B12345674');
});

test('347: conserva las exclusiones de mercancías, 349, retenciones, alquileres, IRNR y gastos sin factura', () => {
  const f = [factura({ operacion: 'exportacion' }), factura({ operacion: 'servicios-ue', cliente: { nombre: 'Francia', nif: 'FR40303265045', pais: 'FR' } }), factura({ irpfPct: 15 })];
  const g = [gasto({ origen: 'fuera', importacion: { dua: '123' } }), gasto({ origen: 'fuera' }), gasto({ origen: 'ue', categoria: '623' }), gasto({ irpfPct: 15 }), gasto({ alquiler: true }), gasto({ noResidente: { pct: 24 } }), gasto({ categoria: '631' }), gasto({ categoria: '640' }), gasto({ categoria: '642' }), gasto({ nomina: 'n1' }), gasto({ proveedor: '' })].map((x) => ({ ...x, base: 5000 }));
  assert.deepEqual(modelo347(f, g, 2026).ventas, []);
  assert.deepEqual(modelo347(f, g, 2026).compras, []);
});

test('347: una factura mixta no incluye las líneas de exportación de bienes ni las declaradas en el 349', () => {
  for (const [operacion, destinatario] of [['exportacion', americano], ['servicios-ue', { nombre: 'Francia', nif: 'FR40303265045', pais: 'FR' }]]) {
    const f = factura({ operacion, cliente: destinatario, base: 8000, lineas: [{ cantidad: 1, precio: 5000, ivaPct: 0 }, { cantidad: 1, precio: 3000, ivaPct: 21 }] });
    assert.equal(modelo347([f], [], 2026).ventas[0].total, 3630);
  }
});

const cobro = (ejercicio, importe, cambios = {}) => factura({ fecha: `${ejercicio}-03-10`, cliente, operacion: 'exenta', base: importe, pagos: [{ fecha: '2026-06-10', importe, metodo: 'efectivo' }], ...cambios });

test('347: 4.000 de 2025 y 4.000 de 2026 cobrados en 2026 superan juntos el umbral de metálico', () => {
  // Art. 34 RGAT: 8.000 por cliente en el año de cobro, conservando el ejercicio de cada factura.
  const r = modelo347([cobro(2025, 4000), cobro(2026, 4000)], [], 2026);
  assert.deepEqual(r.ventas.map((o) => [o.total, o.metalico, o.ejercicioMetalico]), [[4000, 4000, 2026], [0, 4000, 2025]]);
  assert.equal(r.ventas.reduce((s, o) => s + o.metalico, 0), 8000);
});

test('347: metálico exige más de 6.000 por cliente, sin sumar otros clientes, bancos ni otros años de cobro', () => {
  assert.equal(modelo347([cobro(2025, 3000), cobro(2026, 3000)], [], 2026).ventas.some((o) => o.metalico), false);
  const otros = [cobro(2025, 4000), cobro(2026, 4000, { cliente: { nombre: 'Otro', nif: 'A58818501' } }), cobro(2026, 4000, { pagos: [{ fecha: '2026-06-10', importe: 4000, metodo: 'banco' }] }), cobro(2025, 4000, { pagos: [{ fecha: '2025-06-10', importe: 4000, metodo: 'efectivo' }] })];
  assert.equal(modelo347(otros, [], 2026).ventas.some((o) => o.metalico), false);
  assert.equal(modelo347([cobro(2025, 3000), cobro(2026, 3000.01)], [], 2026).ventas.reduce((s, o) => s + o.metalico, 0), 6000.01);
});

test('347: el umbral de metálico une registros con y sin criterio de caja del mismo cliente', () => {
  const r = modelo347([cobro(2025, 4000), cobro(2026, 4000, { recc: true })], [], 2026);
  assert.equal(r.ventas.reduce((s, o) => s + (o.metalico || 0), 0), 8000);
});

const nomina = (detalle) => ({ empleado: 'e', mes: '2026-01', bruto: 1000, irpfPct: 35, ssTrabajadorPct: 5, ...(detalle ? { detalle } : {}) });
const empleado = (cotizacion) => ({ id: 'e', nombre: 'Ana', nif: '12345678Z', cotizacion });

test('190: administrador asimilado con 35 % guardado sigue en E.01 aunque la ficha ahora sea pequeña', () => {
  const n = nomina({ administrador: 'asimilado', irpf: { calculado: 35, tipo: 19, manual: true } });
  const e = empleado({ administrador: 'asimilado', pequena: true });
  const r = modelo190([n], [e], 2026);
  assert.deepEqual(r.perceptores.map((p) => [p.clave, p.subclave, p.percepciones, p.retenciones, p.gastosDeducibles]), [['E', '01', 1000, 350, 50]]);
});

test('190: las cuatro subclaves E salen del detalle y las nóminas antiguas recurren a la ficha', () => {
  for (const [administrador, calculado, subclave] of [['asimilado', 35, '01'], ['asimilado', 19, '02'], ['autonomo', 19, '03'], ['autonomo', 35, '04']]) {
    const e = empleado({ administrador: administrador === 'asimilado' ? 'autonomo' : 'asimilado', pequena: calculado !== 19 });
    const n = nomina({ administrador, irpf: { calculado } });
    assert.equal(modelo190([n], [e], 2026).perceptores[0].subclave, subclave);
    assert.equal(modelo190([n], [], 2026).perceptores[0].subclave, subclave);
    const antiguo = modelo190([nomina()], [empleado({ administrador, pequena: calculado === 19 })], 2026);
    assert.equal(antiguo.perceptores[0].subclave, subclave);
  }
});

test('190: una nómina con detalle sin administrador conserva la clave A aunque cambie la ficha', () => {
  const r = modelo190([nomina({ irpf: { calculado: 19 } })], [empleado({ administrador: 'asimilado', pequena: true })], 2026);
  assert.deepEqual(r.perceptores.map((p) => [p.clave, p.subclave]), [['A', '']]);
});
