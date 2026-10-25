// Módulos: modelo 131 y régimen simplificado del IVA (lib/estimacionObjetiva.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { limpiarModulos, modelo131, modelos131, pctModulos, simplificado } from '../lib/estimacionObjetiva.js';

const fac = (id, fecha, base, actividad, extra = {}) => ({ id, fecha, actividad, base, ivaPct: 10, irpfPct: 0, cliente: { nombre: 'C' }, ...extra });

test('porcentaje del 131 por personal asalariado: 2 % sin nadie, 3 % hasta uno, 4 % con más', () => {
  assert.deepEqual([0, 0.5, 1, 1.01, 3].map(pctModulos), [2, 3, 3, 4, 4]);
});

test('datos de módulos: se validan y se guardan redondeados', () => {
  assert.deepEqual(limpiarModulos({ tipo: 'datos', rendimiento: '12.345,678', asalariados: '1,5' }), { tipo: 'datos', rendimiento: 12345.68, asalariados: 1.5 });
  assert.match(limpiarModulos({ tipo: 'datos' }).error, /rendimiento/);
  assert.match(limpiarModulos({ tipo: 'otro' }).error, /tipo/);
  assert.deepEqual(limpiarModulos({ tipo: 'agricola', joven: true, iva: { cuota: '1000', ingreso: '6', minima: '20' } }), { tipo: 'agricola', iva: { cuota: 1000, ingreso: 6, minima: 20 }, joven: true });
  assert.match(limpiarModulos({ tipo: 'agricola', iva: { cuota: '1000' } }).error, /IVA simplificado/);
});

test('131: actividad con módulos (4 % con dos asalariados), agrícola (2 % de lo ingresado), retenciones y minoración', () => {
  const modulos = { bar: { tipo: 'datos', rendimiento: 20000, asalariados: 2 }, huerta: { tipo: 'agricola' } };
  const facturas = [fac('a', '2026-02-10', 3000, 'huerta', { irpfPct: 1 }), fac('b', '2026-05-01', 999, 'huerta'), fac('c', '2026-03-01', 500, 'bar')];
  const c = modelo131({ modulos, facturas, anio: 2026, t: 1, rendAnterior: 9500 });
  // 02 = 4 % de 20.000; 06 = 2 % de 3.000; 08 = 1 % de 3.000; 09 = 75 € (rendimiento anterior entre 9.000 y 10.000).
  assert.deepEqual([c['01'], c['02'], c['05'], c['06'], c['07'], c['08'], c['09'], c['10'], c['13']], [20000, 800, 3000, 60, 860, 30, 75, 755, 755]);
});

test('131: un trimestre negativo se resta en los siguientes del año (casilla 11); la vivienda, con su tope', () => {
  const modulos = { taxi: { tipo: 'datos', rendimiento: 10000, asalariados: 0 } };
  // 2 % de 10.000 = 200 por trimestre; en el 1T, 450 de retenciones lo dejan en −250.
  const facturas = [fac('r', '2026-01-15', 45000, 'taxi', { irpfPct: 1 })];
  const q = modelos131({ modulos, facturas }, 2026);
  assert.deepEqual(q.map((c) => c['13']), [-250, 0, 150, 200]);
  assert.deepEqual(q.map((c) => c['11']), [0, 200, 50, 0]);
  // Vivienda (casilla 12): 0,5 % de 30.000 = 150 por trimestre.
  const v = modelos131({ modulos: { tienda: { tipo: 'datos', rendimiento: 30000, asalariados: 0 } }, vivienda: true }, 2026);
  assert.deepEqual(v.map((c) => c['12']), [150, 150, 150, 150]);
  assert.deepEqual(v.map((c) => c['13']), [450, 450, 450, 450]);
});

// Instrucciones del 131 en la Sede, casilla 12 (art. 110.3.d del Reglamento).
test('131, casilla 12: límite de 33.007,20 € de rendimientos previsibles y tope de 660,14 € en el año', () => {
  const vivienda = (modulos, facturas = []) => modelos131({ modulos, facturas, vivienda: true }, 2026).map((c) => c['12']);
  // Con 33.007,20 € o más, nada; justo por debajo, 0,5 % = 165,04, y el 4T solo lo que falta hasta 660,14.
  assert.deepEqual(vivienda({ tienda: { tipo: 'datos', rendimiento: 33007.2 } }), [0, 0, 0, 0]);
  assert.deepEqual(vivienda({ tienda: { tipo: 'datos', rendimiento: 33007.19 } }), [165.04, 165.04, 165.04, 165.02]);
  // Apartado II: 2 % de la 03, con el primer trimestre elevado al año (1.000 × 4 = 4.000) para el límite. En el 2T, el 2 %
  // de 50.000 = 1.000, pero quedan 640,14 del tope del año.
  const sin = { obra: { tipo: 'sinDatos' } };
  assert.deepEqual(vivienda(sin, [fac('a', '2026-02-01', 1000, 'obra'), fac('b', '2026-05-01', 50000, 'obra')]), [20, 640.14, 0, 0]);
  // I y II juntos: 30.000 de la 01 + 800 × 4 = 33.200, por encima del límite.
  assert.deepEqual(vivienda({ tienda: { tipo: 'datos', rendimiento: 30000 }, ...sin }, [fac('a', '2026-02-01', 800, 'obra')]), [0, 0, 0, 0]);
  // Sin ingresos en el 1T, cuenta el primer trimestre con ingresos: 9.000 × 4 = 36.000 en el 2T.
  assert.deepEqual(vivienda(sin, [fac('a', '2026-05-01', 9000, 'obra')]), [0, 0, 0, 0]);
  // Solo agrícola (apartado III): 2 % de la 05 si los ingresos previsibles no llegan (5.000 × 4 = 20.000); 9.000 × 4, sí.
  const huerta = { huerta: { tipo: 'agricola' } };
  assert.deepEqual(vivienda(huerta, [fac('a', '2026-02-01', 5000, 'huerta')]), [100, 0, 0, 0]);
  assert.deepEqual(vivienda(huerta, [fac('a', '2026-02-01', 9000, 'huerta')]), [0, 0, 0, 0]);
  // Agrícola y de las otras a la vez: nunca.
  assert.deepEqual(vivienda({ ...huerta, tienda: { tipo: 'datos', rendimiento: 10000 } }, [fac('a', '2026-02-01', 1000, 'huerta')]), [0, 0, 0, 0]);
  // Sin `vivienda`, nada.
  assert.deepEqual(modelos131({ modulos: { tienda: { tipo: 'datos', rendimiento: 10000 } } }, 2026).map((c) => c['12']), [0, 0, 0, 0]);
});

test('IVA simplificado: ingresos a cuenta en el 1T-3T y liquidación del año en el 4T', () => {
  const modulos = { bar: { tipo: 'datos', rendimiento: 20000, asalariados: 1, iva: { cuota: 4000, ingreso: 6, minima: 20 } } };
  assert.equal(simplificado({ modulos, anio: 2026, t: 1 }).resultado, 240);
  const gastos = [
    { id: 'g1', fecha: '2026-03-01', actividad: 'bar', base: 5000, ivaPct: 21 }, // 1.050 de IVA corriente
    { id: 'g2', fecha: '2026-06-01', actividad: 'bar', base: 4000, ivaPct: 21, inversion: { tipo: 'maquinaria' } }, // bien de inversión: 840
  ];
  const r = simplificado({ modulos, gastos, anio: 2026, t: 4 });
  // 4.000 − 1.050 − 40 (1 %) = 2.910, por encima de la mínima (800); menos 720 ingresados y 840 del bien de inversión.
  assert.deepEqual([r.actividades[0].derivada, r.ingresado, r.activosFijos, r.resultado], [2910, 720, 840, 1350]);
  // Si el IVA soportado se come la cuota, manda la cuota mínima (20 % de 4.000).
  const mucho = simplificado({ modulos, gastos: [{ id: 'g3', fecha: '2026-03-01', actividad: 'bar', base: 20000, ivaPct: 21 }], anio: 2026, t: 4 });
  assert.equal(mucho.actividades[0].derivada, 800);
});
