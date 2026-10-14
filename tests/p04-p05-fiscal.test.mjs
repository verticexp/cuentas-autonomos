// Auditoría de octubre de 2026 (P04, P05): el 303 no pierde ningún tipo de IVA admitido y un cierre de caja suma lo cobrado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, desglose, importes, r2 } from '../lib/calculos.js';
import { TIPOS_IVA } from '../lib/validacion.js';
import { limpiarCierre, totalCierre } from '../lib/caja.js';
import { generarAsientos } from '../lib/asientos.js';
import { modelo390 } from '../lib/modelos.js';

const fac = (pct, base = 100, extra = {}) => ({ id: `f${pct}`, numero: 1, anio: 2026, fecha: '2026-02-10', actividad: 'dj', cliente: { nombre: 'X' }, base, ivaPct: pct, irpfPct: 0, ...extra });

test('P04: para cada tipo de IVA admitido, la cuota devengada del 303 y del 390 coincide con la de las facturas', () => {
  for (const pct of TIPOS_IVA) {
    const f = fac(pct);
    const c = casillas303([f], [], 2026, 1);
    assert.equal(c['27'], importes(f).iva, `303 al ${pct} %`);
    assert.equal(modelo390([f], [], 2026).devengado, importes(f).iva, `390 al ${pct} %`);
  }
  const c = casillas303([fac(2), fac(5)], [], 2026, 1);
  assert.deepEqual(c.otros.map((o) => [o.pct, o.base, o.iva]), [[2, 100, 2], [5, 100, 5]]);
  assert.equal(c['27'], 7);
  assert.deepEqual(modelo390([fac(2), fac(5)], [], 2026).otros.map((o) => [o.pct, o.iva]), [[2, 2], [5, 5]]);
  // Mezcla con tipos oficiales y varias líneas.
  const m = fac(21, 0, { lineas: [{ concepto: 'a', cantidad: 1, precio: 100, ivaPct: 21 }, { concepto: 'b', cantidad: 1, precio: 200, ivaPct: 5 }, { concepto: 'c', cantidad: 1, precio: 50, ivaPct: 4 }], base: 350 });
  const cm = casillas303([m], [], 2026, 1);
  assert.equal(cm['27'], importes(m).iva);
  assert.equal(cm['27'], 21 + 10 + 2);
});

test('P05: un cierre de 100 € al 21 % en efectivo suma 100 € y no mueve un céntimo al banco', () => {
  const d = limpiarCierre({ fecha: '2026-03-05', actividad: 'dj', porIva: [{ pct: 21, total: 100 }], efectivo: 100, tarjeta: 0 });
  assert.equal(d.error, undefined);
  const f = { id: 'Z2026-1', numero: 1, anio: 2026, serie: 'Z', ...d };
  assert.equal(importes(f).total, 100);
  assert.equal(importes(f).total, totalCierre(f));
  assert.equal(r2(importes(f).base + importes(f).iva), 100);
  const as = generarAsientos({ facturas: [f] }, '2026-12-31');
  const cobro = as.find((a) => a.concepto.startsWith('Cobro del cierre'));
  const debe = (c) => r2(cobro.lineas.filter((l) => l.cuenta === c).reduce((s, l) => s + l.debe, 0));
  assert.equal(debe('570'), 100);
  assert.equal(debe('572'), 0, 'nada al banco');
  for (const a of as) assert.equal(r2(a.lineas.reduce((s, l) => s + l.debe - l.haber, 0)), 0, 'los asientos cuadran');
  // El IVA del 303 es el de los tiques (17,36), no el de la fórmula.
  assert.equal(casillas303([f], [], 2026, 1)['27'], 17.36);
});

test('P05: muchos cierres, tipos mezclados y diferencias de redondeo en ambos sentidos siempre suman lo cobrado', () => {
  let n = 0;
  for (const pct of [21, 10, 4, 5, 2]) {
    for (let t = 1; t <= 400; t++) {
      const total = r2(t * 1.37 + (t % 7) * 0.01);
      const d = limpiarCierre({ fecha: '2026-03-05', actividad: 'dj', porIva: [{ pct, total }, { pct: 21 - (pct === 21 ? 11 : 0), total: r2(total / 3) }], efectivo: total, tarjeta: r2(total / 3) });
      if (d.error) continue;
      const f = { id: `Z${++n}`, numero: n, anio: 2026, serie: 'Z', ...d };
      const sumaTipos = r2(total + r2(total / 3));
      assert.equal(importes(f).total, sumaTipos, `${pct} % ${total}`);
      const asientos = generarAsientos({ facturas: [f] }, '2026-12-31').filter((a) => a.concepto.startsWith('Cobro del cierre'));
      const banco = asientos[0].lineas.find((l) => l.cuenta === '572');
      assert.equal(banco?.debe || 0, d.caja.tarjeta + d.caja.otros);
    }
  }
});

test('P05: un cierre antiguo guardado sin cuotas (99,99 €) se corrige al calcularlo', () => {
  const f = { id: 'Z1', numero: 1, anio: 2026, serie: 'Z', fecha: '2026-03-05', base: 82.64, ivaPct: 21, irpfPct: 0, lineas: [{ concepto: 'v', cantidad: 1, precio: 82.64, dto: 0, ivaPct: 21 }], caja: { efectivo: 100, tarjeta: 0, otros: 0 } };
  assert.equal(importes(f).total, 100);
  assert.equal(desglose(f)[0].iva, 17.36);
});
