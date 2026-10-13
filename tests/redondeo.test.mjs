import test from 'node:test';
import assert from 'node:assert/strict';
import { r2, r3, baseLinea, desglose, importes } from '../lib/calculos.js';
import { registroAlta } from '../lib/verifactu.js';
import { facturae, ubl, leerFacturaElectronica } from '../lib/facturae.js';

const emisor = { nombre: 'Emisora S.L.', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: '28013 Madrid', iban: 'ES9121000418450200051332', plazo: 30 };
const cliente = { nombre: 'Cliente S.L.', nif: '12345678Z', direccion: 'C/ Sol 2', ciudad: '28014 Madrid' };

test('r2/r3 redondean mitades lejos del cero, simétricamente y sin menos cero', () => {
  for (const [n, esperado] of [[1.005, 1.01], [2.675, 2.68], [1.015, 1.02], [0.125, 0.13], [-1.005, -1.01], [-0.004, 0], [1e-9, 0], [123456789.125, 123456789.13]]) assert.equal(r2(n), esperado);
  assert.equal(Object.is(r2(-0.004), 0), true);
  assert.ok(Number.isNaN(r2(NaN)));
  assert.equal(r3(0.0005), 0.001);
  assert.equal(r3(-2.0005), -2.001);
});

test('unidades fraccionarias, precios con decimales y descuentos redondean cada línea', () => {
  assert.equal(baseLinea({ cantidad: 0.5, precio: 19.99 }), 10);
  assert.equal(baseLinea({ cantidad: 3, precio: 0.35 }), 1.05);
  assert.equal(baseLinea({ cantidad: 1.5, precio: 33.333 }), 50);
  assert.equal(baseLinea({ cantidad: 7, precio: 9.99, dto: 15 }), 59.44);
});

// PRNG reproducible; los datos evitan mutaciones globales y permiten repetir la auditoría.
function generador(semilla) {
  let s = semilla >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 0x100000000);
}
function muestraFacturas() {
  const rnd = generador(0xf09);
  const elige = (xs) => xs[Math.floor(rnd() * xs.length)];
  return Array.from({ length: 30 }, (_, i) => {
    const lineas = Array.from({ length: 2 + Math.floor(rnd() * 4) }, (_, j) => ({
      concepto: `Servicio ${i + 1}.${j + 1}`,
      cantidad: (1 + Math.floor(rnd() * 40)) / 2,
      precio: (1 + Math.floor(rnd() * 25000)) / 100,
      dto: elige([0, 5, 10, 15, 20]),
      ivaPct: elige([21, 10, 4, 0]),
    }));
    const base = r2(lineas.reduce((s, l) => s + baseLinea(l), 0));
    return { numero: i + 1, anio: 2026, fecha: '2026-10-13', cliente, base, ivaPct: 21,
      irpfPct: elige([15, 7, 0]), lineas };
  });
}

const facturas = muestraFacturas();

test('rectificativas espejo conservan importes y desglose opuestos en 30 facturas deterministas', () => {
  for (const f of facturas) {
    const espejo = { ...f, serie: 'R', base: -f.base, lineas: f.lineas.map((l) => ({ ...l, cantidad: -l.cantidad })) };
    const a = importes(f), b = importes(espejo);
    assert.deepEqual([b.base, b.iva, b.irpf, b.total], [-a.base || 0, -a.iva || 0, -a.irpf || 0, -a.total || 0]);
    const opuesto = desglose(f).map((d) => ({ ...d, base: -d.base || 0, iva: -d.iva || 0 }));
    assert.deepEqual(desglose(espejo), opuesto);
  }
});

test('100 conceptos de un céntimo calculan IVA sobre la base agregada', () => {
  const f = { base: 1, ivaPct: 21, irpfPct: 0, lineas: Array.from({ length: 100 }, (_, i) => ({ concepto: `Concepto ${i}`, cantidad: 1, precio: 0.01, ivaPct: 21 })) };
  assert.deepEqual(importes(f), { base: 1, iva: 0.21, irpf: 0, total: 1.21 });
});

test('VeriFactu y exportaciones electrónicas conservan importes y cuotas', () => {
  for (const f of facturas) {
    const esperado = importes(f);
    const alta = registroAlta(f, 'B12345674', '');
    assert.equal(Number(alta.CuotaTotal), esperado.iva);
    assert.equal(Number(alta.ImporteTotal), r2(esperado.base + esperado.iva));
    const esperadoDesglose = desglose(f).map(({ pct, base, iva }) => ({ pct, base, cuota: iva }));
    for (const xml of [facturae(f, emisor), ubl(f, emisor)]) {
      const leida = leerFacturaElectronica(xml);
      assert.equal(leida.base, esperado.base);
      assert.deepEqual(leida.desglose, esperadoDesglose);
    }
  }
});
