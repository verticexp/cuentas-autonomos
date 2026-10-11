import test from 'node:test';
import assert from 'node:assert/strict';
import { acumulada, amortizacionesAnio, coeficiente, cuotaEntre, libroBienes } from '../lib/amortizaciones.js';
import { categoriaDe, pareceBien, periodo } from '../lib/contabilidad.js';
import { asientoApertura, balanceContable, diario, generarAsientos, limpiarAsiento, mayor, pygContable, sumasYSaldos } from '../lib/asientos.js';
import { casillas303, resumenAnual } from '../lib/calculos.js';
import { borradorSociedades } from '../lib/modelos.js';

const portatil = { id: 'b1', fecha: '2026-07-01', actividad: 'dj', concepto: 'Portátil', base: 1000, ivaPct: 21, inversion: { tipo: 'informatica' } };

test('amortización lineal por días con el coeficiente de la tabla', () => {
  assert.equal(coeficiente(portatil), 26);
  assert.equal(coeficiente(portatil, 'sociedad'), 25);
  assert.equal(coeficiente({ inversion: { tipo: 'informatica', coef: 20 } }), 20);
  assert.equal(coeficiente({ inversion: { tipo: 'informatica', coef: 40 } }), 26); // nunca más que el máximo
  // 184 días de 2026: 1000 × 26 % × 184 / 365
  assert.equal(cuotaEntre(portatil, '2026-01-01', '2026-12-31'), 131.07);
  assert.equal(cuotaEntre(portatil, '2027-01-01', '2027-12-31'), 260);
  // Al final no pasa de lo que costó.
  assert.equal(acumulada(portatil, '2031-12-31'), 1000);
  assert.equal(cuotaEntre(portatil, '2026-01-01', '2026-06-30'), 0);
  // Los de 300 € o menos, enteros el día de la compra.
  assert.equal(cuotaEntre({ ...portatil, base: 250 }, '2026-07-01', '2026-09-30'), 250);
  const q = amortizacionesAnio([portatil], 2026);
  assert.deepEqual(q.map((x) => x.t), [3, 4]);
  const [l] = libroBienes([portatil], 2027);
  assert.equal(l.acumulada, 391.07);
  assert.equal(l.pendiente, 608.93);
});

test('el bien de inversión: IVA entero en el 303 (30 y 31) y en el 130 solo la amortización', () => {
  const facturas = [{ fecha: '2026-07-10', actividad: 'dj', base: 3000, ivaPct: 21, irpfPct: 0, cliente: { nombre: 'X' } }];
  const gastos = [portatil, { id: 'g', fecha: '2026-07-02', actividad: 'dj', concepto: 'Gestoría', base: 100, ivaPct: 21 }];
  const c = casillas303(facturas, gastos, 2026, 3);
  assert.equal(c['28'], 100); assert.equal(c['30'], 1000); assert.equal(c['31'], 210); assert.equal(c['45'], 231);
  const q3 = resumenAnual(facturas, gastos, 2026, {}, ['dj']).trimestres[2];
  assert.equal(q3.amortizacion, 65.53); // 92 días
  assert.equal(q3.gastos, 165.53);
  assert.equal(q3.ivaDed, 231);
  const is = borradorSociedades(facturas, gastos, 2026);
  assert.equal(is.amortizacion, 126.03); // tabla de sociedades: 25 %
  assert.equal(is.gastos, 226.03);
});

test('categorías: a mano, nóminas y por el concepto', () => {
  assert.equal(categoriaDe({ concepto: 'Alquiler del almacén' }), '621');
  assert.equal(categoriaDe({ concepto: 'Gestoría' }), '623');
  assert.equal(categoriaDe({ concepto: 'Combustible furgoneta' }), '628');
  assert.equal(categoriaDe({ concepto: 'Nóminas y Seguridad Social' }), '640');
  assert.equal(categoriaDe({ concepto: 'Nómina Ana', nomina: 'n1' }), '640');
  assert.equal(categoriaDe({ concepto: 'Cosa rara' }), '629');
  assert.equal(categoriaDe({ concepto: 'Gestoría', categoria: '627' }), '627');
  assert.ok(pareceBien({ concepto: 'Equipo de sonido nuevo (altavoces)', base: 3000 }));
  assert.ok(!pareceBien({ concepto: 'Cables', base: 3000 }));
});

test('partida doble: asientos que cuadran, pérdidas y ganancias, balance y cierre', () => {
  const facturas = [
    { id: 'f1', numero: 1, anio: 2025, fecha: '2025-02-01', actividad: 'dj', base: 5000, ivaPct: 21, irpfPct: 15, cobrada: true, cobro: { fecha: '2025-03-01' }, cliente: { nombre: 'X' } },
    { id: 'f2', numero: 2, anio: 2025, fecha: '2025-11-01', actividad: 'dj', base: 1000, ivaPct: 21, irpfPct: 0, cobrada: false, cliente: { nombre: 'Y' } },
    { id: 'r1', numero: 1, anio: 2025, serie: 'R', fecha: '2025-11-05', actividad: 'dj', base: -100, ivaPct: 21, irpfPct: 0, cobrada: true, cliente: { nombre: 'Y' } },
  ];
  const gastos = [
    { ...portatil, fecha: '2025-07-01' },
    { id: 'a', fecha: '2025-03-01', concepto: 'Alquiler del local', base: 600, ivaPct: 21, alquiler: true },
    { id: 'b', fecha: '2025-03-01', concepto: 'Material', base: 400, ivaPct: 21, pendiente: true },
    { id: 'c', fecha: '2025-04-01', concepto: 'Intereses del préstamo', base: 50, ivaPct: 0 },
    { id: 'n', fecha: '2025-01-31', concepto: 'Nómina', base: 1316.5, ivaPct: 0, nomina: 'n1' },
  ];
  const nominas = [{ id: 'n1', mes: '2025-01', empleadoNombre: 'Ana', bruto: 1000, irpfPct: 10, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 }];
  const manuales = [asientoApertura({ fecha: '2025-01-01', banco: 3000, capital: 3000 }, false)];
  const datos = { facturas, gastos, nominas, manuales, fiscal: { tipo: 'autonomo', iva: 'general' }, pagos130: { 2025: { 1: 500 } } };
  const A = generarAsientos(datos, '2026-03-15');
  for (const a of A) assert.equal(Math.round(a.lineas.reduce((s, l) => s + l.debe - l.haber, 0) * 100), 0, a.concepto);

  // La factura con retención: clientes por el total, retención a cuenta y el IVA repercutido.
  const f1 = A.find((a) => a.origen?.id === 'f1' && a.concepto.startsWith('Factura'));
  assert.deepEqual(f1.lineas, [{ cuenta: '430', debe: 5300, haber: 0 }, { cuenta: '473', debe: 750, haber: 0 }, { cuenta: '705', debe: 0, haber: 5000 }, { cuenta: '477', debe: 0, haber: 1050 }]);
  // La rectificativa, al revés.
  assert.equal(A.find((a) => a.origen?.id === 'r1').lineas.find((l) => l.cuenta === '705').debe, 100);
  // El alquiler retiene el 19 % (115) y el bien va al inmovilizado.
  const alq = A.find((a) => a.origen?.id === 'a' && !a.concepto.startsWith('Pago'));
  assert.equal(alq.lineas.find((l) => l.cuenta === '4751').haber, 114);
  assert.equal(alq.lineas.find((l) => l.cuenta === '410').haber, 612);
  assert.ok(A.find((a) => a.origen?.id === 'b1').lineas.some((l) => l.cuenta === '217' && l.debe === 1000));
  // Nómina desglosada (y el gasto de la nómina no se cuenta dos veces).
  const nom = A.find((a) => a.concepto.startsWith('Nómina Ana'));
  assert.deepEqual(nom.lineas.map((l) => [l.cuenta, l.debe || -l.haber]), [['640', 1000], ['642', 316.5], ['4751', -100], ['476', -381.5], ['465', -835]]);
  assert.ok(!A.some((a) => a.origen?.id === 'n'));

  const p = pygContable(A, periodo(2025));
  const v = (id) => p.partidas.find((x) => x.id === id).importe;
  assert.equal(v('cifra'), 5900);
  assert.equal(v('aprovisionamientos'), -400);
  assert.equal(v('personal'), -1316.5);
  assert.equal(v('explotacion'), -600);
  assert.equal(v('amortizacion'), -131.07);
  assert.equal(v('financieros'), -50);
  assert.equal(p.resultado, 3402.43);

  // Balance a fin de año y ya cerrado: cuadra y el resultado está en la 129.
  const b = balanceContable(A, '2025-12-31');
  assert.equal(b.total, b.totalPasivo);
  const pn = b.pasivo.find((x) => x.id === 'pn');
  assert.equal(pn.detalle.find((x) => x.id === '129').importe, 3402.43);
  assert.equal(pn.detalle.find((x) => x.id === '102').importe, 3000);
  assert.equal(b.activo.find((x) => x.id === 'anc').importe, 868.93);
  // Al año siguiente, el resultado pasa a remanente; y en el año en curso no hay cierre.
  const b26 = balanceContable(A, '2026-03-15');
  assert.equal(b26.total, b26.totalPasivo);
  assert.equal(b26.pasivo.find((x) => x.id === 'pn').detalle.find((x) => x.id === '120').importe, 3402.43);
  assert.ok(!A.some((a) => a.concepto === 'Regularización de 2026'));

  // IVA del 1T: liquidado y, como se marcó presentado, pagado el 20 de abril.
  assert.ok(A.some((a) => a.concepto === 'Pago del IVA (303) del 1T 2025' && a.fecha === '2025-04-20'));
  assert.ok(A.some((a) => a.concepto === 'Pago fraccionado del IRPF (130) del 1T 2025'));
  const s = sumasYSaldos(A, 2025);
  assert.equal(s.debe, s.haber);
  const m = mayor(A, '430', 2025);
  assert.equal(m.final, 1210); // solo queda la de 1.000 € sin cobrar, con IVA (la rectificativa se devolvió)
  assert.equal(diario(A, 2025)[0].concepto, 'Asiento de apertura');
});

test('asiento manual: tiene que cuadrar y las cuentas ser del plan', () => {
  assert.ok(limpiarAsiento({ fecha: '2026-01-10', concepto: 'Préstamo', lineas: [{ cuenta: '572', debe: 10000 }, { cuenta: '170', haber: 10000 }] }).lineas);
  assert.match(limpiarAsiento({ fecha: '2026-01-10', concepto: 'X', lineas: [{ cuenta: '572', debe: 10 }, { cuenta: '170', haber: 9 }] }).error, /No cuadra/);
  assert.match(limpiarAsiento({ fecha: '2026-01-10', concepto: 'X', lineas: [{ cuenta: '9', debe: 10 }, { cuenta: '170', haber: 10 }] }).error, /no es válida/);
});

test('cuentas anuales de pymes: epígrafes, cuadre, aplicación del resultado y modelo', async () => {
  const { cuentasAnuales, epigrafe } = await import('../lib/cuentasAnuales.js');
  assert.equal(epigrafe('572', 100), 'B.VI');
  assert.equal(epigrafe('572', -100), 'PC.II.1'); // descubierto: deuda con el banco
  assert.equal(epigrafe('4750', -50), 'PC.IV.2');
  assert.equal(epigrafe('4700', 50), 'B.II.3');
  assert.equal(epigrafe('281', -10), 'A.II');
  const facturas = [{ id: 'f', numero: 1, anio: 2025, fecha: '2025-03-01', actividad: 'a', base: 10000, ivaPct: 21, irpfPct: 0, cobrada: true, cliente: { nombre: 'X' } }];
  const gastos = [{ ...portatil, fecha: '2025-01-01', inversion: { tipo: 'informatica' } }, { id: 'g', fecha: '2025-02-01', concepto: 'Gestoría', base: 1000, ivaPct: 21 }];
  const manuales = [asientoApertura({ fecha: '2025-01-01', banco: 3000, capital: 3000 }, true)];
  const fiscal = { tipo: 'sociedad', iva: 'general' };
  const A = generarAsientos({ facturas, gastos, manuales, fiscal, pagos130: { 2025: { 1: 0, 2: 0, 3: 0, 4: 0 } }, cuotaIS: {} }, '2026-05-01');
  const c = cuentasAnuales({ asientos: A, gastos, empresa: { emisor: { nombre: 'X S.L.', nif: 'B1' } }, anio: 2025 });
  assert.ok(c.cuadra);
  assert.equal(c.bal[0].v['PA1.I.1'], 3000);
  assert.equal(c.pyg[0].v[1], 10000);
  assert.equal(c.pyg[0].v[8], -250); // portátil: 25 % de 1.000 € (tabla de sociedades)
  assert.equal(c.modelo.id, 'micro');
  // Reserva legal: el 10 % del resultado, hasta el 20 % del capital (600 €); igual en la memoria y en el cierre.
  assert.match(c.memoria[3], /a reserva legal, 600,00 €/);
  const aplicacion = A.find((a) => a.concepto === 'Aplicación del resultado de 2025');
  assert.equal(aplicacion.lineas.find((l) => l.cuenta === '112').haber, 600);
  assert.equal(c.ecpn.final.total, c.bal[0].v.PA);
});
