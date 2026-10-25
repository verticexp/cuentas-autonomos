// Integración del finiquito, la IT y los atrasos (lib/finiquito.js, lib/nominas.js) con la contabilidad y el finiquito.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generarAsientos } from '../lib/asientos.js';
import { calcularFiniquito } from '../lib/finiquito.js';
import { r2 } from '../lib/calculos.js';

const cuadra = (a) => assert.equal(r2(a.lineas.reduce((s, l) => s + l.debe - l.haber, 0)), 0, a.concepto);
const cuenta = (a, c) => a.lineas.find((l) => l.cuenta === c) || { debe: 0, haber: 0 };

test('Asiento del finiquito: la indemnización sujeta y la exenta a la 641, el resto a la 640, y cuadra', () => {
  const n = { id: 'f1', mes: '2026-05', tipo: 'finiquito', empleadoNombre: 'Eva', pagada: false,
    importes: { bruto: 4000, indemnizacionExenta: 6000, irpf: 600, ssTrabajador: 120, ssEmpresa: 400 },
    finiquito: { indemnizacionSujeta: 1000 } };
  const [a] = generarAsientos({ nominas: [n] }, '2026-12-31').filter((x) => x.concepto.startsWith('Finiquito'));
  cuadra(a);
  assert.equal(cuenta(a, '640').debe, 3000);
  assert.equal(cuenta(a, '641').debe, 7000);
  assert.equal(cuenta(a, '642').debe, 400);
  // Líquido: 4.000 + 6.000 − 600 − 120.
  assert.equal(cuenta(a, '465').haber, 9280);
});

test('Asiento de una nómina con IT en pago delegado: lo adelantado va a la 471 y se compensa al pagar las cuotas', () => {
  const n = { id: 'n1', mes: '2026-03', empleadoNombre: 'Luis', pagada: false,
    importes: { bruto: 1800, irpf: 200, ssTrabajador: 110, ssEmpresa: 520 }, detalle: { it: { pagoDelegado: 300 } } };
  const asientos = generarAsientos({ nominas: [n] }, '2026-12-31');
  const nom = asientos.find((x) => x.concepto.startsWith('Nómina'));
  const ss = asientos.find((x) => x.concepto.startsWith('Seguridad Social'));
  cuadra(nom); cuadra(ss);
  assert.equal(cuenta(nom, '640').debe, 1500);
  assert.equal(cuenta(nom, '471').debe, 300);
  assert.equal(cuenta(ss, '471').haber, 300);
  assert.equal(cuenta(ss, '572').haber, 330); // 630 de cuotas − 300 adelantados
});

// Empleado indefinido con 2.000 € al mes y dos pagas sin prorratear, de alta desde 2024; baja voluntaria el 15-10-2026.
const empleado = { id: 'e1', nombre: 'Eva', nif: '11111111H', alta: '2024-01-01', bruto: 2000, horasSemana: 40,
  cotizacion: { grupo: 5, temporal: false, pagas: 2, prorrateadas: false, atPct: 1.5 } };

test('Finiquito semestral: la paga de junio, ya vencida, no se vuelve a pagar aunque su nómina no esté en Fisquo', () => {
  const r = calcularFiniquito(empleado, { baja: '2026-10-15', causa: 'voluntaria', vacacionesDisfrutadas: 22 }, []);
  assert.equal(r.error, undefined);
  // Paga de diciembre: del 1 de julio al 15 de octubre, 107 de 184 días → 2.000 × 107 / 184.
  assert.equal(r.detalle.pagaExtra, r2((2000 * 107) / 184));
  assert.equal(r.finiquito.indemnizacion, 0);
  assert.ok(r.finiquito.avisos.some((a) => /se da por cobrada/.test(a)));
});
