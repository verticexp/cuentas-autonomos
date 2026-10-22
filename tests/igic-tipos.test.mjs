import test from 'node:test';
import assert from 'node:assert/strict';
import { gastoDeRecepcion } from '../lib/albaranes.js';
import { previa } from '../lib/importar.js';
import { ventasDesdeFilas, limpiarDia } from '../lib/importarVentas.js';
import { calcularDieta } from '../lib/dietas.js';
import { limpiarCierre, totalCierre } from '../lib/caja.js';
import { TIPOS_IGIC } from '../lib/igic.js';

const opciones = { igic: true };
const fecha = '2026-10-22';
const pedido = { id: 'pedido', fecha, proveedor: 'Proveedor', lineas: [{ concepto: 'Producto', cantidad: 2, coste: 50 }] };

test('Recepción: tipos de IGIC, defecto y comportamiento de IVA', () => {
  for (const ivaPct of TIPOS_IGIC) {
    const g = gastoDeRecepcion(pedido, { ...opciones, ivaPct });
    assert.equal(g.ivaPct, ivaPct);
    assert.equal(g.impuesto, 'igic');
    assert.equal(g.base, 100);
  }
  assert.equal(gastoDeRecepcion(pedido, opciones).ivaPct, 7);
  assert.equal(gastoDeRecepcion(pedido, { ...opciones, ivaPct: 21 }).ivaPct, 7);
  assert.equal(gastoDeRecepcion(pedido).ivaPct, 21);
  assert.equal(gastoDeRecepcion(pedido).impuesto, undefined);
});

for (const tipo of ['facturas', 'gastos']) {
  const importar = (cabecera, valores, igic = true) => previa(tipo,
    [['Número', 'Fecha', 'Cliente', 'Concepto', 'Base', cabecera], ['1', fecha, 'Cliente', 'Compra', 100, valores]], [], null, {}, { igic }).items[0];
  test(`Importar ${tipo}: IGIC explícito, cuota redondeada y rechazo de IVA`, () => {
    for (const pct of TIPOS_IGIC) {
      const x = importar('% IVA', String(pct).replace('.', ','));
      assert.equal(x.estado, 'nuevo');
      assert.equal(x.datos.ivaPct, pct);
      assert.equal(x.datos.impuesto, 'igic');
    }
    assert.equal(importar('% IVA', 0.095).datos.ivaPct, 9.5);
    for (const pct of [7, 9.5]) assert.equal(importar('Cuota IVA', pct + 0.01).datos.ivaPct, pct);
    assert.equal(importar('% IVA', 21).error, 'Tipo de IGIC no admitido (21 %)');
    assert.equal(importar('Cuota IVA', 21).error, 'Tipo de IGIC no admitido (21 %)');
    const iva = importar('% IVA', 21, false);
    assert.equal(iva.estado, 'nuevo');
    assert.equal(iva.datos.impuesto, undefined);
  });
}

test('Dietas: titular al 7 % por defecto y todos los tipos de IGIC', () => {
  const d = { quien: 'titular', dias: 1, pagado: 21.4, electronico: true };
  assert.equal(calcularDieta(d, opciones).ivaPct, 7);
  assert.equal(calcularDieta(d, opciones).base, 20);
  for (const ivaPct of TIPOS_IGIC) {
    const g = calcularDieta({ ...d, ivaPct }, opciones);
    assert.equal(g.ivaPct, ivaPct);
    assert.equal(g.impuesto, 'igic');
  }
  assert.equal(calcularDieta({ dias: 1 }, opciones).ivaPct, 0);
  assert.equal(calcularDieta(d).ivaPct, 10);
  assert.equal(calcularDieta(d).impuesto, undefined);
});

test('Caja: todos los tipos de IGIC y totales conservados', () => {
  for (const pct of TIPOS_IGIC) {
    const f = limpiarCierre({ fecha, porIva: [{ pct, total: 100 + pct }] }, [], opciones);
    assert.equal(f.ivaPct, pct);
    assert.equal(f.base, 100);
    assert.equal(f.impuesto, 'igic');
    assert.equal(totalCierre(f), 100 + pct);
  }
  assert.match(limpiarCierre({ fecha, porIva: [{ pct: 21, total: 121 }] }, [], opciones).error, /IGIC/);
  assert.equal(limpiarCierre({ fecha, porIva: [{ pct: 21, total: 121 }] }).impuesto, undefined);
});

test('Ventas importadas: tipos explícitos y deducidos, validación del día', () => {
  for (const pct of [7, 9.5]) {
    const v = ventasDesdeFilas([['Fecha', 'Total', '% IVA'], [fecha, 100 + pct, pct]], [], opciones);
    assert.equal(v.dias[0].porIva[0].pct, pct);
    assert.equal(v.dias[0].impuesto, 'igic');
    assert.ok(limpiarDia(v.dias[0], opciones));
    const cuota = ventasDesdeFilas([['Fecha', 'Total', 'Cuota IVA'], [fecha, 100 + pct, pct]], [], opciones);
    assert.equal(cuota.dias[0].porIva[0].pct, pct);
  }
  assert.equal(ventasDesdeFilas([['Fecha', 'Total', '% IVA'], [fecha, 121, 21]], [], opciones).error, 'Tipo de IGIC no admitido (21 %)');
  assert.equal(ventasDesdeFilas([['Fecha', 'Total', 'Cuota IVA'], [fecha, 121, 21]], [], opciones).error, 'Tipo de IGIC no admitido (21 %)');
  assert.equal(limpiarDia({ fecha, total: 121, tarjeta: 121, porIva: [{ pct: 21, total: 121 }] }, opciones), null);
});
