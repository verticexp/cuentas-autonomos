import test from 'node:test';
import assert from 'node:assert/strict';
import { borradorRenta, cuotaEscala, modelo115, modelo180, modelo190, modelo202, modelo347, modelo349, modelo390, nifUE, retencionesProfesionales } from '../lib/modelos.js';

const F = [
  { fecha: '2026-02-01', base: 1000, ivaPct: 21, irpfPct: 15, cliente: { nombre: 'Ana', nif: '12345678Z' } },
  { fecha: '2026-05-01', base: 2000, ivaPct: 0, irpfPct: 0, cliente: { nombre: 'Berlin GmbH', nif: 'DE 123456789' } },
  { fecha: '2026-06-01', base: 500, ivaPct: 0, irpfPct: 0, cliente: { nombre: 'Berlin GmbH', nif: 'DE123456789' } },
  { fecha: '2026-08-01', base: 400, ivaPct: 10, irpfPct: 0, cliente: { nombre: 'Paris', nif: 'FR12345678901' } },
];
const G = [
  { fecha: '2026-01-31', base: 600, ivaPct: 21, alquiler: true, proveedor: 'Casero SL', proveedorNif: 'B1' },
  { fecha: '2026-02-28', base: 600, ivaPct: 21, alquiler: true, proveedor: 'Casero SL', proveedorNif: 'B1' },
  { fecha: '2026-04-30', base: 600, ivaPct: 21, alquiler: true, proveedor: 'Casero SL', proveedorNif: 'B1' },
  { fecha: '2026-03-10', base: 100, ivaPct: 21 },
];

test('115 y 180: 19 % de las rentas del alquiler', () => {
  assert.deepEqual(modelo115(G, 2026, 1), { perceptores: 1, base: 1200, retenciones: 228 });
  const a = modelo180(G, 2026);
  assert.deepEqual([a.base, a.retenciones, a.arrendadores.length, a.arrendadores[0].nif], [1800, 342, 1, 'B1']);
});

test('349: clientes de la UE por NIF-IVA, sumados por trimestre', () => {
  assert.equal(nifUE('12345678Z'), ''); assert.equal(nifUE('ES12345678Z'), ''); assert.equal(nifUE('fr 12345678901'), 'FR12345678901');
  assert.deepEqual(modelo349(F, 2026, 2), { operadores: [{ nif: 'DE123456789', nombre: 'Berlin GmbH', clave: 'S', base: 2500 }], total: 2500 });
  assert.equal(modelo349(F, 2026, 1).total, 0);
});

test('390: suma de los cuatro 303', () => {
  const c = modelo390(F, G, 2026);
  assert.deepEqual([c.base21, c.cuota21, c.base10, c.cuota10, c.sinIva, c.deducible, c.resultado, c.volumen], [1000, 210, 400, 40, 2500, 399, -149, 3900]);
  assert.deepEqual(c.trimestres, [-63, -126, 40, 0]);
});

test('190: por trabajador', () => {
  const N = [{ empleado: 'e', empleadoNombre: 'Eva', mes: '2026-01', bruto: 2000, irpfPct: 10 }, { empleado: 'e', mes: '2026-02', bruto: 2000, irpfPct: 10 }, { empleado: 'e', mes: '2025-12', bruto: 9, irpfPct: 10 }];
  assert.deepEqual(modelo190(N, [{ id: 'e', nombre: 'Eva Gil', nif: '1X' }], 2026), { perceptores: [{ nombre: 'Eva Gil', nif: '1X', clave: 'A', percepciones: 4000, retenciones: 400 }], percepciones: 4000, retenciones: 400 });
});

test('renta: escala, mínimo personal, retenciones y pagos del 130', () => {
  assert.equal(cuotaEscala(12450), 2365.5);
  assert.equal(cuotaEscala(20000), 2365.5 + 1812);
  const r = borradorRenta([{ fecha: '2026-03-01', base: 30000, ivaPct: 21, irpfPct: 15 }], [{ fecha: '2026-03-02', base: 5000, ivaPct: 21 }], 2026, { 1: 200, 2: 100 });
  // 30.000 − 5.000 = 25.000; 5 % = 1.250 → 23.750
  assert.equal(r.rendimiento, 23750);
  assert.equal(r.cuota, r2(cuotaEscala(23750) - cuotaEscala(5550)));
  assert.equal(r.retenciones, 4500); assert.equal(r.pagos130, 300);
  assert.equal(r.resultado, r2(r.cuota - 4800));
});
const r2 = (n) => Math.round(n * 100) / 100;

test('349: clientes de la UE con clave S y proveedores de la UE con clave I', () => {
  const F = [{ fecha: '2026-05-05', base: 700, ivaPct: 0, cliente: { nombre: 'Studio Paris', nif: 'FR12345678901' } }];
  const G = [{ fecha: '2026-05-06', base: 120, ivaPct: 0, proveedor: 'Google Ireland', proveedorNif: 'IE6388047V' }, { fecha: '2026-05-07', base: 80, ivaPct: 21, proveedor: 'Otro', proveedorNif: 'IE6388047V' }];
  const m = modelo349(F, 2026, 2, G);
  assert.deepEqual(m.operadores.map((o) => [o.nif, o.clave, o.base]), [['FR12345678901', 'S', 700], ['IE6388047V', 'I', 120]]);
  assert.equal(m.total, 820);
});

test('111 y 190: retenciones a profesionales (gastos con retención), aparte de las nóminas', () => {
  const G = [
    { fecha: '2026-04-10', base: 200, ivaPct: 21, irpfPct: 15, proveedor: 'Gestoría Ruiz', proveedorNif: 'B11111111' },
    { fecha: '2026-05-10', base: 200, ivaPct: 21, irpfPct: 15, proveedor: 'Gestoría Ruiz', proveedorNif: 'B11111111' },
    { fecha: '2026-06-10', base: 100, ivaPct: 21, irpfPct: 7, proveedor: 'Diseñadora', proveedorNif: '12345678Z' },
    { fecha: '2026-06-11', base: 50, ivaPct: 21, proveedor: 'Papelería' },
  ];
  assert.deepEqual(retencionesProfesionales(G, 2026, 2), { perceptores: 2, base: 500, retenciones: 67 });
  assert.deepEqual(retencionesProfesionales(G, 2026, 1), { perceptores: 0, base: 0, retenciones: 0 });
  const m = modelo190([], [], 2026, G);
  assert.deepEqual(m.perceptores.map((p) => [p.nombre, p.clave, p.percepciones, p.retenciones]), [['Gestoría Ruiz', 'G', 400, 60], ['Diseñadora', 'G', 100, 7]]);
  assert.equal(m.retenciones, 67);
});

test('202: 18 % de la cuota del último Impuesto sobre Sociedades presentado', () => {
  const m = modelo202({ 2024: 0, 2025: 1000 }, 2026);
  assert.deepEqual(m.map((x) => [x.mes, x.de, x.cuota, x.pago, x.fecha]), [['abril', 2024, 0, 0, '2026-04-20'], ['octubre', 2025, 1000, 180, '2026-10-20'], ['diciembre', 2025, 1000, 180, '2026-12-20']]);
  assert.equal(modelo202({}, 2026)[1].cuota, null);
});

test('347: más de 3.005,06 € con IVA por cliente (B) y proveedor (A), por trimestres; sin 349, retenciones ni fuera de la UE', () => {
  const F = [
    { fecha: '2026-02-01', base: 2000, ivaPct: 21, irpfPct: 0, cliente: { nombre: 'Grande SL', nif: 'B12345678' } },
    { fecha: '2026-05-01', base: 1000, ivaPct: 21, irpfPct: 0, cliente: { nombre: 'Grande SL', nif: 'b-12345678' } },
    { fecha: '2026-03-01', base: 2900, ivaPct: 21, irpfPct: 0, cliente: { nombre: 'Pequeña SL', nif: 'B87654321' } }, // 3.509 € con IVA: entra
    { fecha: '2026-03-02', base: 2400, ivaPct: 21, irpfPct: 0, cliente: { nombre: 'Justa SL', nif: 'B11111111' } }, // 2.904 €: no
    { fecha: '2026-03-03', base: 9000, ivaPct: 21, irpfPct: 15, cliente: { nombre: 'Con retención', nif: 'B22222222' } },
    { fecha: '2026-03-04', base: 9000, ivaPct: 0, irpfPct: 0, cliente: { nombre: 'Berlin', nif: 'DE123456789' } },
    { fecha: '2026-03-05', base: 9000, ivaPct: 0, irpfPct: 0, cliente: { nombre: 'New York Inc', nif: '12-3456789' } },
  ];
  const G = [
    { fecha: '2026-04-01', base: 3000, ivaPct: 21, proveedor: 'Proveedor SL', proveedorNif: 'B33333333' },
    { fecha: '2026-04-02', base: 5000, ivaPct: 21, proveedor: 'Locales', proveedorNif: 'B44444444', alquiler: true },
    { fecha: '2026-04-03', base: 5000, ivaPct: 0, proveedor: 'Google', proveedorNif: 'IE6388047V' },
    { fecha: '2026-04-04', base: 5000, ivaPct: 21 },
  ];
  const m = modelo347(F, G, 2026);
  assert.deepEqual(m.ventas.map((o) => [o.nif, o.total, o.trimestres]), [['B12345678', 3630, [2420, 1210, 0, 0]], ['B87654321', 3509, [3509, 0, 0, 0]]]);
  assert.deepEqual(m.compras.map((o) => [o.nif, o.total]), [['B33333333', 3630]]);
  assert.equal(m.sinNif.length, 0);
});
