// Deducciones y bonificaciones del Impuesto sobre Sociedades (lib/modelos.js borradorSociedades): el camino de la cuota
// íntegra a la líquida y de ahí a la diferencial. Los esperados están calculados a mano, con su regla y su fuente.
// Fuentes: Ley 27/2014 del Impuesto sobre Sociedades (LIS), arts. 29 a 39; Ley 49/2002 de incentivos fiscales al
// mecenazgo, art. 20 (con los porcentajes y el límite del Real Decreto-ley 6/2023, desde el 1-1-2024).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_DEDUCCION_IS, borradorSociedades, limpiarDeduccionIS, modelo202 } from '../lib/modelos.js';

let n = 0;
const fac = (fecha, base) => ({ id: `f${++n}`, fecha, numero: n, anio: Number(fecha.slice(0, 4)), actividad: 'a', cliente: { nombre: 'Cliente S.L.', nif: 'B28777774' }, base, ivaPct: 21, irpfPct: 0 });
const gas = (fecha, base) => ({ id: `g${++n}`, fecha, actividad: 'a', proveedor: 'Proveedor S.L.', proveedorNif: 'B28123456', concepto: 'Servicios', base, ivaPct: 21 });

// La sociedad de las pruebas: en cada año factura 150.000 y gasta 50.000, así que su base imponible es 100.000.
// Con menos de 1 millón de cifra de negocios es microempresa (art. 29.1 LIS): en 2026 tributa al 19 % los primeros
// 50.000 € y al 21 % el resto, o sea 9.500 + 10.500 = 20.000 de cuota íntegra.
const anual = (y) => [fac(`${y}-03-10`, 150000), gas(`${y}-04-01`, 50000)];
const is = (anio, deduccionesIS, extra = {}) => {
  const [f, g] = anual(anio);
  return borradorSociedades([f], [g], anio, { deduccionesIS, ...extra });
};
const d = (tipo, de, importe, entidad) => ({ id: `${tipo}-${de}`, tipo, de, importe, ...(entidad ? { entidad } : {}) });

test('la base de las pruebas: 100.000 de base y 20.000 de cuota íntegra (micro de 2026, art. 29.1 LIS)', () => {
  const b = is(2026, []);
  assert.deepEqual([b.base, b.tamano, b.tipos, b.cuota, b.cuotaIntegra], [100000, 'micro', [19, 21], 20000, 20000]);
  // Sin nada que restar, la cuota líquida es la íntegra y la diferencial, lo mismo (no hay retenciones ni pagos).
  assert.deepEqual([b.cuotaLiquida, b.cuotaEjercicio, b.cuotaDiferencial, b.resultado], [20000, 20000, 20000, 20000]);
});

test('orden de la liquidación: doble imposición, bonificaciones, deducciones, retenciones y pagos del 202', () => {
  // Cuota íntegra 20.000 − 1.000 de doble imposición (art. 31) − 2.000 de bonificación de Ceuta (art. 33) = 17.000 de
  // cuota íntegra ajustada positiva. La deducción de I+D (10.000) pasa del 10 % de esa cuota (1.700), así que el límite
  // del art. 39.1 es el 50 %: 8.500. Cuota líquida 17.000 − 8.500 = 8.500 y quedan 1.500 de I+D para los años siguientes.
  const b = is(2026, [d('ddiJuridica', 2026, 1000), d('ceuta', 2026, 2000), d('idi', 2026, 10000)], { pagos202: { 2026: { 1: 500 } } });
  assert.deepEqual([b.ddi, b.bonificaciones, b.cuotaAjustada], [1000, 2000, 17000]);
  assert.deepEqual([b.pct39, b.limite39, b.deduccionesCapIV], [50, 8500, 8500]);
  assert.deepEqual([b.cuota, b.cuotaLiquida, b.deducciones], [20000, 8500, 9500]);
  assert.deepEqual(b.deduccionesQuedan, [{ tipo: 'idi', de: 2026, entidad: '', importe: 1500 }]);
  // Las retenciones y los pagos del 202 van después: 8.500 − 500 = 8.000 a ingresar.
  assert.deepEqual([b.retenciones, b.pagos, b.cuotaDiferencial, b.resultado], [0, 500, 8000, 8000]);
  // La base del 202 del año siguiente (art. 40.2) es la cuota del ejercicio: la líquida menos retenciones, sin los pagos.
  assert.equal(b.cuotaEjercicio, 8500);
  assert.deepEqual(modelo202({ 2026: b.cuotaEjercicio }, 2027).slice(1).map((x) => x.pago), [1530, 1530]);
});

test('límite del art. 39.1: el 25 % de la cuota ajustada cuando no hay I+D+i del ejercicio', () => {
  // La deducción por empleo de personas con discapacidad (art. 38 ter) no sube el límite al 50 %: cabe el 25 % de 20.000,
  // o sea 5.000, de los 9.000 apuntados. Cuota líquida 15.000 y 4.000 pendientes.
  const b = is(2026, [d('discapacidad', 2026, 9000)]);
  assert.deepEqual([b.pct39, b.limite39, b.deduccionesCapIV, b.cuotaLiquida], [25, 5000, 5000, 15000]);
  assert.deepEqual(b.deduccionesQuedan, [{ tipo: 'discapacidad', de: 2026, entidad: '', importe: 4000 }]);
  // Con I+D del ejercicio por encima del 10 % de la cuota (2.000), el límite sube al 50 %: 10.000 de los 11.500.
  const c = is(2026, [d('discapacidad', 2026, 9000), d('idi', 2026, 2500)]);
  assert.deepEqual([c.pct39, c.limite39, c.deduccionesCapIV, c.cuotaLiquida], [50, 10000, 10000, 10000]);
  assert.deepEqual(c.deduccionesQuedan, [{ tipo: 'idi', de: 2026, entidad: '', importe: 1500 }]);
});

test('donativos (art. 20 de la Ley 49/2002): el 40 % con el límite del 15 % de la base imponible desde 2024', () => {
  // Donados 20.000, pero la base de la deducción no pasa del 15 % de 100.000 = 15.000; el 40 % de 15.000 son 6.000.
  const b = is(2026, [d('donativo', 2026, 20000, 'Fundación Alfa')]);
  assert.deepEqual([b.donativos, b.cuotaLiquida], [6000, 14000]);
  assert.deepEqual([b.donativosDetalle.donado, b.donativosDetalle.limite, b.donativosDetalle.recortado], [20000, 15000, true]);
  assert.deepEqual(b.donativosDetalle.lista, [{ entidad: 'Fundación Alfa', donado: 20000, recurrente: false, pct: 40, base: 15000, deduccion: 6000 }]);
  // Sin pasar del límite, el 40 % de lo donado: el 40 % de 10.000 son 4.000.
  const c = is(2026, [d('donativo', 2026, 10000, 'Fundación Alfa')]);
  assert.deepEqual([c.donativos, c.donativosDetalle.recortado, c.cuotaLiquida], [4000, false, 16000]);
  // No entra en el límite conjunto del art. 39.1: ese sigue libre para las del capítulo IV.
  assert.deepEqual([c.pct39, c.limite39, c.deduccionesCapIV], [25, 5000, 0]);
});

test('donativos antes de 2024: el 35 % con el límite del 10 % de la base imponible', () => {
  // 2023, micro al 23 % (Ley 38/2022): cuota íntegra 23.000. Donados 20.000, base de la deducción 10.000 (el 10 % de
  // 100.000) y el 35 %: 3.500. Cuota líquida 19.500.
  const b = is(2023, [d('donativo', 2023, 20000, 'Fundación Alfa')]);
  assert.deepEqual([b.tipos, b.cuota], [[23, 23], 23000]);
  assert.deepEqual([b.donativosDetalle.limite, b.donativosDetalle.lista[0].pct, b.donativos, b.cuotaLiquida], [10000, 35, 3500, 19500]);
});

test('donativos recurrentes: el 50 % donando a la misma entidad los dos ejercicios anteriores sin bajar el importe', () => {
  const previos = [d('donativo', 2024, 1000, 'Fundación Alfa'), d('donativo', 2025, 1000, 'Fundación Alfa')];
  // 2026 con 1.000 a la misma entidad y 1.000 en 2024 y 2025: el 50 % de 1.000 = 500.
  const b = is(2026, [...previos, { id: 'don26', tipo: 'donativo', de: 2026, importe: 1000, entidad: 'Fundación Alfa' }]);
  assert.deepEqual([b.donativosDetalle.lista[0].recurrente, b.donativosDetalle.lista[0].pct, b.donativos], [true, 50, 500]);
  // Los donativos de 2024 y 2025, años que Fisquo no calcula, solo cuentan para la recurrencia: no deducen aquí.
  assert.deepEqual(b.deduccionesQuedan, []);
  // Si este año se dona menos que el anterior, no hay recurrencia: el 40 %.
  const c = is(2026, [...previos, { id: 'don26', tipo: 'donativo', de: 2026, importe: 900, entidad: 'Fundación Alfa' }]);
  assert.deepEqual([c.donativosDetalle.lista[0].recurrente, c.donativos], [false, 360]);
  // Y a otra entidad, tampoco: el 40 %.
  const e = is(2026, [...previos, { id: 'don26', tipo: 'donativo', de: 2026, importe: 1000, entidad: 'Fundación Beta' }]);
  assert.deepEqual([e.donativosDetalle.lista[0].recurrente, e.donativos], [false, 400]);
});

test('arrastre: 18 años las de los arts. 35 y 36, 15 el resto del capítulo IV y 10 los donativos', () => {
  assert.deepEqual([TIPOS_DEDUCCION_IS.idi.arrastre, TIPOS_DEDUCCION_IS.cine.arrastre, TIPOS_DEDUCCION_IS.discapacidad.arrastre, TIPOS_DEDUCCION_IS.donativoPendiente.arrastre], [18, 18, 15, 10]);
  // I+D de 2008: 2026 es el año 18 y todavía entra; la de 2007 ya no (y no sigue pendiente).
  const dentro = is(2026, [d('idi', 2008, 1000)]);
  assert.deepEqual([dentro.deduccionesCapIV, dentro.cuotaLiquida], [1000, 19000]);
  const fuera = is(2026, [d('idi', 2007, 1000)]);
  assert.deepEqual([fuera.deduccionesCapIV, fuera.cuotaLiquida, fuera.deduccionesQuedan], [0, 20000, []]);
  // Empleo de personas con discapacidad de 2011: año 15, entra; la de 2010 ya no.
  assert.equal(is(2026, [d('discapacidad', 2011, 1000)]).deduccionesCapIV, 1000);
  assert.equal(is(2026, [d('discapacidad', 2010, 1000)]).deduccionesCapIV, 0);
  // Donativos pendientes de 2016: año 10, entra; los de 2015 ya no.
  assert.equal(is(2026, [d('donativoPendiente', 2016, 1000)]).donativos, 1000);
  assert.equal(is(2026, [d('donativoPendiente', 2015, 1000)]).donativos, 0);
});

test('lo que no cabe en un año se aplica en el siguiente, con el límite de ese año', () => {
  const F = [anual(2025)[0], anual(2026)[0]];
  const G = [anual(2025)[1], anual(2026)[1]];
  const deduccionesIS = [d('idi', 2025, 20000)];
  // 2025: micro al 21/22 % (cuota íntegra 10.500 + 11.000 = 21.500). La I+D de 20.000 pasa del 10 % de esa cuota, así que
  // el límite es el 50 %: 10.750. Quedan 9.250.
  const b25 = borradorSociedades(F, G, 2025, { deduccionesIS });
  assert.deepEqual([b25.cuota, b25.pct39, b25.deduccionesCapIV, b25.cuotaLiquida], [21500, 50, 10750, 10750]);
  assert.deepEqual(b25.deduccionesQuedan, [{ tipo: 'idi', de: 2025, entidad: '', importe: 9250 }]);
  // 2026: la pendiente no es «del propio ejercicio», así que el límite vuelve al 25 % de 20.000 = 5.000. Quedan 4.250.
  const b26 = borradorSociedades(F, G, 2026, { deduccionesIS });
  assert.deepEqual([b26.cuota, b26.pct39, b26.deduccionesCapIV, b26.cuotaLiquida], [20000, 25, 5000, 15000]);
  assert.deepEqual(b26.deduccionesPendientes, [{ tipo: 'idi', de: 2025, entidad: '', importe: 9250 }]);
  assert.deepEqual(b26.deduccionesQuedan, [{ tipo: 'idi', de: 2025, entidad: '', importe: 4250 }]);
});

test('primero lo pendiente de los años más antiguos', () => {
  // Cuota íntegra 20.000, límite del 25 % = 5.000 para las dos: entran los 4.000 de 2012 y 1.000 de los 3.000 de 2026.
  const b = is(2026, [d('discapacidad', 2026, 3000), d('capituloIV', 2012, 4000)]);
  assert.deepEqual([b.deduccionesCapIV, b.cuotaLiquida], [5000, 15000]);
  assert.deepEqual(b.deduccionesAplicadas, [{ tipo: 'capituloIV', de: 2012, entidad: '', importe: 4000 }, { tipo: 'discapacidad', de: 2026, entidad: '', importe: 1000 }]);
  assert.deepEqual(b.deduccionesQuedan, [{ tipo: 'discapacidad', de: 2026, entidad: '', importe: 2000 }]);
});

test('la cuota líquida nunca baja de cero y lo que sobra queda pendiente', () => {
  // 50.000 de doble imposición sobre una cuota de 20.000: la líquida se queda en cero y quedan 30.000 (arts. 31.5 y 32.6,
  // sin plazo). Con 500 pagados en el 202, el borrador sale a devolver.
  const b = is(2026, [d('ddiJuridica', 2026, 50000)], { pagos202: { 2026: { 1: 500 } } });
  assert.deepEqual([b.ddi, b.cuotaLiquida, b.cuotaAjustada], [20000, 0, 0]);
  assert.deepEqual(b.deduccionesQuedan, [{ tipo: 'ddiJuridica', de: 2026, entidad: '', importe: 30000 }]);
  assert.deepEqual([b.cuotaEjercicio, b.resultado], [0, -500]);
  // Sin cuota ajustada no hay sitio para las del capítulo IV: el límite del art. 39.1 es cero.
  const c = is(2026, [d('ddiJuridica', 2026, 50000), d('idi', 2026, 9000)]);
  assert.deepEqual([c.limite39, c.deduccionesCapIV, c.cuotaLiquida], [0, 0, 0]);
  assert.deepEqual(c.deduccionesQuedan, [{ tipo: 'ddiJuridica', de: 2026, entidad: '', importe: 30000 }, { tipo: 'idi', de: 2026, entidad: '', importe: 9000 }]);
});

test('con pérdidas no hay cuota y nada se aplica: todo queda pendiente', () => {
  const b = borradorSociedades([fac('2026-03-10', 10000)], [gas('2026-04-01', 50000)], 2026, { deduccionesIS: [d('idi', 2026, 5000)] });
  assert.deepEqual([b.perdida, b.cuota, b.cuotaLiquida, b.deduccionesCapIV], [40000, 0, 0, 0]);
  assert.deepEqual(b.deduccionesQuedan, [{ tipo: 'idi', de: 2026, entidad: '', importe: 5000 }]);
});

test('en Navarra y el País Vasco no se aplican: cada norma foral tiene sus deducciones', () => {
  const b = is(2026, [d('idi', 2026, 5000), d('ceuta', 2026, 1000)], { territorio: 'navarra' });
  assert.deepEqual([b.foral, b.deducciones, b.bonificaciones, b.cuotaLiquida], ['navarra', 0, 0, b.cuota]);
  assert.deepEqual(b.deduccionesQuedan, []);
});

test('limpiarDeduccionIS: tipo del catálogo, ejercicio, importe positivo y entidad en los donativos', () => {
  assert.deepEqual(limpiarDeduccionIS({ tipo: 'idi', de: 2026, importe: 1234.567 }), { tipo: 'idi', de: 2026, importe: 1234.57 });
  assert.deepEqual(limpiarDeduccionIS({ tipo: 'donativo', de: 2026, importe: 100, entidad: '  Fundación Alfa  ' }), { tipo: 'donativo', de: 2026, importe: 100, entidad: 'Fundación Alfa' });
  assert.match(limpiarDeduccionIS({ tipo: 'loquesea', de: 2026, importe: 100 }).error, /tipo/);
  assert.match(limpiarDeduccionIS({ tipo: 'idi', de: 1800, importe: 100 }).error, /ejercicio/);
  assert.match(limpiarDeduccionIS({ tipo: 'idi', de: 2026, importe: -5 }).error, /positivo/);
  assert.match(limpiarDeduccionIS({ tipo: 'donativo', de: 2026, importe: 100 }).error, /entidad/);
});

test('el asiento del Impuesto sobre Sociedades usa la cuota líquida', async () => {
  const { generarAsientos } = await import('../lib/asientos.js');
  const [f, g] = anual(2026);
  const op = { facturas: [f], gastos: [g], fiscal: { tipo: 'sociedad', iva: 'general' }, deduccionesIS: [d('idi', 2026, 10000)] };
  const asientos = generarAsientos(op, '2027-06-30');
  const cierre = asientos.find((a) => a.concepto === 'Impuesto sobre Sociedades 2026');
  // Cuota íntegra 20.000, I+D con el límite del 50 % (10.000): cuota líquida 10.000, que es el gasto de la cuenta 630.
  assert.equal(cierre.lineas.find((l) => l.cuenta === '630').debe, 10000);
});
