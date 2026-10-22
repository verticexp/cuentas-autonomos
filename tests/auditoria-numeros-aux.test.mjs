import test from 'node:test';
import assert from 'node:assert/strict';
import { calculoNomina, gastoDeNomina, modelo111 } from '../lib/nominas.js';
import { emparejarLineas, inventario, quePedir, valorInventario } from '../lib/inventario.js';
import { gastosHabituales, prevision } from '../lib/tesoreria.js';

// Oráculo independiente: céntimos y cocientes enteros, sin r2/importes/baseLinea.
// Los porcentajes son entradas de prueba; no se afirma su vigencia normativa.
const redondearCociente = (n, d) => {
  const signo = n < 0n ? -1n : 1n;
  const a = n * signo;
  return signo * ((2n * a + d) / (2n * d));
};
const cuotaCentimos = (brutoCentimos, puntosBasicos) =>
  Number(redondearCociente(BigInt(brutoCentimos) * BigInt(puntosBasicos), 10000n));
const euros = (centimos) => centimos / 100;
const fiscal = { tipo: 'sociedad', iva: 'exento' };
const producto = 'aaaaaaaaaaaa';
const productos = [{ id: producto, nombre: 'Cable', sku: 'XLR10', coste: 10 }];
const compra = (id, fecha, cantidad, coste) => ({
  id, fecha, concepto: 'Compra de cables', base: cantidad * coste, ivaPct: 0,
  stock: [{ producto, cantidad, coste }],
});
const venta = (id, fecha, cantidad, precio, extra = {}) => ({
  id, fecha, lineas: [{ producto, cantidad, precio }], ...extra,
});
const estado = (datos) => inventario({ productos, ...datos }, { hoy: '2026-11-30' }).productos[0];

test('control: fórmulas de nómina contrastadas con aritmética entera independiente', () => {
  let casos = 0;
  for (const brutoCentimos of [0, 1, 50, 19999, 200001, 1999999, -50, -200001]) {
    for (const [irpfPB, trabajadorPB, empresaPB] of [[0, 0, 0], [1200, 650, 3165], [1527, 637, 3099]]) {
      const irpf = cuotaCentimos(brutoCentimos, irpfPB);
      const ssTrabajador = cuotaCentimos(brutoCentimos, trabajadorPB);
      const ssEmpresa = cuotaCentimos(brutoCentimos, empresaPB);
      assert.deepEqual(calculoNomina({
        bruto: euros(brutoCentimos), irpfPct: irpfPB / 100,
        ssTrabajadorPct: trabajadorPB / 100, ssEmpresaPct: empresaPB / 100,
      }), {
        bruto: euros(brutoCentimos), irpf: euros(irpf),
        ssTrabajador: euros(ssTrabajador), ssEmpresa: euros(ssEmpresa),
        neto: euros(brutoCentimos - irpf - ssTrabajador),
        coste: euros(brutoCentimos + ssEmpresa), seguros: euros(ssTrabajador + ssEmpresa),
      }, `bruto en céntimos=${brutoCentimos}; porcentajes en puntos básicos=${[irpfPB, trabajadorPB, empresaPB]}`);
      casos++;
    }
  }
  assert.equal(casos, 24);
});

test('control: gasto de nómina al cierre de febrero bisiesto y cambio de año', () => {
  for (const [mes, fecha] of [['2028-02', '2028-02-29'], ['2026-02', '2026-02-28'], ['2026-12', '2026-12-31']]) {
    const g = gastoDeNomina({ id: 'n', empleadoNombre: 'Ana', mes, bruto: 2000, ssEmpresaPct: 31.65 }, 'actividad');
    assert.deepEqual([g.fecha, g.base, g.ivaPct], [fecha, 2633, 0]);
  }
});

test('control: modelo111 suma por nómina, deduplica empleados y separa trimestre/año', () => {
  const n = { empleado: 'ana', bruto: 1000.01, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 };
  const nominas = [
    { ...n, mes: '2026-01' }, { ...n, mes: '2026-02' },
    { ...n, empleado: 'bea', mes: '2026-03' },
    { ...n, mes: '2026-04' }, { ...n, mes: '2025-03' },
  ];
  assert.deepEqual(modelo111(nominas, 2026, 1), {
    perceptores: 2, percepciones: 3000.03, retenciones: 360, seguros: 1144.5,
  });
});

test('control: cobro parcial positivo respeta saldo pendiente y vencimiento guardado', () => {
  const p = prevision({
    fiscal, hoy: '2026-11-10', meses: 0, plazo: 90, saldo: { importe: 1000 },
    facturas: [{
      id: 'v', fecha: '2026-11-01', vence: '2026-11-15', base: 100, ivaPct: 21, irpfPct: 15,
      pagos: [{ fecha: '2026-11-03', importe: 40 }, { fecha: '2026-11-04', importe: 10 }],
    }],
  });
  // 100 + 21 - 15 - 40 - 10 = 56 pendientes.
  assert.deepEqual(p.movimientos.map((m) => [m.fecha, m.importe]), [['2026-11-15', 56]]);
  assert.equal(p.final, 1056);
});

test('control: inventario fraccionario, consumo, fecha de corte y unidades en camino', () => {
  const datos = {
    productos: [{ ...productos[0], minimo: 1, maximo: 3 }],
    gastos: [compra('c', '2026-11-01', 2.5, 10), compra('futura', '2026-12-01', 100, 50)],
    facturas: [venta('v', '2026-11-02', 0.75, 20)],
    ajustes: [{ id: 'a', fecha: '2026-11-03', producto, cantidad: -1, motivo: 'consumo' }],
  };
  const p = inventario(datos, { hoy: '2026-11-30' }).productos[0];
  assert.deepEqual([p.stock, p.valor, p.costeVentas, p.costeConsumo, p.margen], [0.75, 7.5, 7.5, 10, 7.5]);
  assert.equal(valorInventario(datos, '2026-11-01'), 25);
  assert.equal(quePedir([p], { [producto]: 0.5 }).length, 0);
});

test('AUX01 alta: la previsión debe incluir neto y seguros de la nómina además de la retención', () => {
  const n = { id: 'n', empleado: 'ana', mes: '2026-10', bruto: 2000, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 };
  const p = prevision({ nominas: [n], fiscal, hoy: '2026-10-01', meses: 3, saldo: { importe: 100000 } });
  // Neto 2000-240-130=1630; seguros 130+633=763; retención 240.
  // Horizonte hasta 31/01: obligación total 1630+763+240=2633.
  assert.deepEqual({ salida: p.sale + p.hacienda, final: p.final }, { salida: 2633, final: 97367 });
});

test('AUX02 alta: la rectificativa pendiente incluye el reembolso restante tras un pago parcial', () => {
  const actuales = [], esperados = [];
  for (const devuelto of [0, 25]) {
    const p = prevision({
      fiscal, hoy: '2026-11-10', meses: 0, saldo: { importe: 1000 },
      facturas: [{
        id: 'r', serie: 'R', rectifica: { id: 'original' }, fecha: '2026-11-05', vence: '2026-11-15',
        base: -100, ivaPct: 0, irpfPct: 0,
        pagos: devuelto ? [{ fecha: '2026-11-06', importe: -devuelto }] : [],
      }],
    });
    actuales.push({ devuelto, movimientos: p.movimientos.map((m) => [m.fecha, m.importe]), final: p.final });
    esperados.push({ devuelto, movimientos: [['2026-11-15', -(100 - devuelto)]], final: 1000 - (100 - devuelto) });
  }
  assert.deepEqual(actuales, esperados);
});

test('AUX03 alta: el pago al profesional y su media habitual deben descontar la retención', () => {
  const gasto = { id: 'g', fecha: '2026-11-05', concepto: 'Servicio', proveedor: 'Profesional', base: 1000, ivaPct: 21, irpfPct: 15, pendiente: true, vence: '2026-11-05' };
  const p = prevision({ gastos: [gasto], fiscal, hoy: '2026-11-01', meses: 0 });
  const historico = ['07', '08', '09'].map((m) => ({ ...gasto, fecha: `2026-${m}-05`, pendiente: false }));
  const habituales = gastosHabituales(historico, '2026-10-01');
  // Transferencia al proveedor = 1000+210-150=1060, no 1210.
  assert.deepEqual({ pago: p.movimientos[0]?.importe, media: habituales[0]?.importe }, { pago: -1060, media: 1060 });
});

test('AUX04 alta: devolver toda una venta a su coste original no crea margen ficticio', () => {
  const datos = {
    gastos: [compra('c1', '2026-11-01', 10, 10), compra('c2', '2026-11-03', 5, 20)],
    facturas: [venta('v', '2026-11-02', 5, 30), venta('r', '2026-11-04', 5, -30, { rectifica: { id: 'v' } })],
  };
  const p = estado(datos);
  // Compra 100; sale coste 50; compra 100; vuelve coste original 50.
  // Sin venta neta: valor 200, stock 15, medio 200/15, coste de ventas y margen 0.
  assert.deepEqual({ stock: p.stock, valor: p.valor, medio: p.costeMedio, ventas: p.ventas, ingresos: p.ingresos, costeVentas: p.costeVentas, margen: p.margen },
    { stock: 15, valor: 200, medio: 13.33, ventas: 0, ingresos: 0, costeVentas: 0, margen: 0 });
});

test('AUX05 alta: compra y devolución íntegra al proveedor restauran el valor inicial sin ventas', () => {
  const p = estado({ gastos: [
    compra('inicial', '2026-11-01', 10, 10),
    compra('compra', '2026-11-02', 10, 20),
    compra('abono', '2026-11-03', -10, 20),
  ] });
  // Unidades 10+10-10=10; desembolso neto 100+200-200=100.
  // No ha habido ventas/consumos: debe quedar el valor anterior a la compra anulada.
  assert.deepEqual([p.stock, p.costeMedio, p.valor], [10, 10, 100]);
});

test('AUX06 media: unidades adquiridas gratis cuentan en el denominador del coste medio', () => {
  const p = estado({ gastos: [compra('c1', '2026-11-01', 10, 10), compra('gratis', '2026-11-02', 10, 0)] });
  // Coste total 100+0=100; 20 unidades; coste medio 5.
  assert.deepEqual([p.stock, p.costeMedio, p.valor], [20, 5, 100]);
});

test('AUX07 media: emparejar una línea con descuento conserva el coste neto de adquisición', () => {
  const stock = emparejarLineas([{ descripcion: 'XLR10 Cable', cantidad: 10, precio: 20, dto: 10 }], productos);
  const p = estado({ gastos: [{ id: 'g', fecha: '2026-11-01', base: 180, ivaPct: 0, stock }] });
  // 10 × 20 × 90/100 = 180; unitario neto 18.
  assert.deepEqual({ stock, valor: p.valor }, { stock: [{ producto, cantidad: 10, coste: 18 }], valor: 180 });
});

test('AUX08 baja: las dos funciones de valoración coinciden al redondear el total una sola vez', () => {
  const ids = ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'];
  const datos = {
    productos: ids.map((id) => ({ id, coste: 0.01 })),
    gastos: ids.flatMap((id) => [
      { id: `${id}-1`, fecha: '2026-11-01', stock: [{ producto: id, cantidad: 2, coste: 0.01 }] },
      { id: `${id}-2`, fecha: '2026-11-02', stock: [{ producto: id, cantidad: 1, coste: 0.02 }] },
    ]),
    facturas: ids.map((id) => ({ id, fecha: '2026-11-03', lineas: [{ producto: id, cantidad: 2, precio: 1 }] })),
  };
  // Por producto: 4 céntimos / 3 unidades; queda 1 unidad.
  // Total exacto = 8/3 céntimos; redondeo independiente = 3 céntimos.
  const esperado = euros(Number(redondearCociente(8n, 3n)));
  assert.deepEqual({ inventario: inventario(datos, { hoy: '2026-11-30' }).valor, valorInventario: valorInventario(datos, '2026-11-30') },
    { inventario: esperado, valorInventario: esperado });
});
