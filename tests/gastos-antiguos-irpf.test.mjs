import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afectoPctDe, faltaAfectacionIRPF } from '../lib/ivaDeducible.js';
import { gastosSinAfectacion } from '../lib/revisionGastosIRPF.js';
import { gastoEditado, nuevoGasto } from '../lib/gastoCuerpo.js';
import { casillas303, importes, resumenAnual } from '../lib/calculos.js';
import { librosRegistro } from '../lib/librosRegistro.js';
import { avisosFiscales } from '../lib/revisionFiscal.js';
import { fichero130 } from '../lib/ficheroAeat.js';

const ejemplo = JSON.parse(await readFile(new URL('./fixtures/gastos-antiguos-irpf.json', import.meta.url), 'utf8'));
// Cada expediente es una copia aislada. Los esperados de la fixture están calculados a mano, en estimación normal:
// antes 1.105 + 116,80 + 331,50 + 200; después 0 + 6 + 331,50 + 200. 20 % de (10.000 − gasto).
const copia = () => structuredClone(ejemplo);
const antiguo = ejemplo.gastos[0];
const ids = (g) => g.map((x) => x.id);

test('100 % confirmado se conserva; ausente, vacío o inválido nunca acredita una revisión', () => {
  for (const v of [100, '100', '100,00', '100 %']) assert.equal(afectoPctDe(v), 100);
  for (const v of [undefined, null, '', '  ', 'mal', -1, 101, Infinity, NaN]) assert.equal(afectoPctDe(v), undefined, String(v));
  for (const v of [0, 6, 33.33, 50, 100]) {
    assert.equal(afectoPctDe(v), v);
    assert.equal(faltaAfectacionIRPF({ ...antiguo, afectoPct: v }), false);
  }
  assert.equal(faltaAfectacionIRPF(antiguo), true);
  for (const v of [undefined, null, '', 'mal', 101]) assert.equal(faltaAfectacionIRPF({ ...antiguo, afectoPct: v }), true);
});

test('diagnóstico completo del ejercicio, estable y sin modificar la copia de datos', () => {
  const { gastos } = copia();
  const antes = structuredClone(gastos);
  assert.deepEqual(ids(gastosSinAfectacion(gastos.reverse(), 2026)), ['turismo', 'luz', 'profesional']);
  assert.deepEqual(gastosSinAfectacion(gastos, 2027), []);
  assert.deepEqual(gastosSinAfectacion(null, 2026), []);
  assert.deepEqual(gastos, antes.reverse());
  assert.deepEqual(ids(gastosSinAfectacion(Array.from({ length: 70 }, (_, i) => ({ ...antiguo, id: String(i) })), 2026)).length, 70);
});

test('excluye nóminas y gastos que ya no restan en el IRPF; incluye abonos e inversiones pendientes', () => {
  const g = (id, extra) => ({ ...antiguo, id, ...extra });
  const lista = [g('confirmado', { afectoPct: 100 }), g('iva-entero', { deduciblePct: 100 }),
    g('nomina', { nomina: 'n' }), g('no-deducible', { noDeducibleIS: true }),
    g('abono', { base: -100 }), g('bien', { inversion: { tipo: 'transporte' } }), g('sin-iva-deducible', { deduciblePct: 0 })];
  assert.deepEqual(ids(gastosSinAfectacion(lista, 2026)), ['abono', 'bien', 'sin-iva-deducible']);
});

test('también avisa de bienes anteriores que aún se amortizan, pero no de gastos corrientes de otro año', () => {
  const bien = { ...antiguo, id: 'bien-2025', fecha: '2025-01-01', base: 10000, inversion: { tipo: 'transporte' } };
  const agotado = { ...bien, id: 'agotado', fecha: '2000-01-01' };
  assert.deepEqual(ids(gastosSinAfectacion([bien, agotado, { ...antiguo, fecha: '2025-02-01' }], 2026)), ['bien-2025']);
  const corregido = gastoEditado(ejemplo.empresa, { ...bien, afectoPct: 0 }, bien).gasto;
  const q = resumenAnual(ejemplo.facturas, [corregido], 2026, {}, ['servicios'], { normal: true }).trimestres[3];
  assert.equal(q.gasAcum, 0);
  assert.deepEqual(gastosSinAfectacion([corregido], 2026), []);
});

test('el aviso enlaza la lista del año elegido y desaparece solo al confirmar todos los candidatos', () => {
  const { gastos } = copia();
  const avisos = (g, c130 = true) => avisosFiscales({ gastos: g, anio: 2026, hoy: '2026-11-05', c303: false, c130 });
  const aviso = avisos(gastos).find((a) => a.id === 'afecto');
  assert.equal(aviso.href, '/gastos?irpf=2026#revisar-irpf');
  assert.match(aviso.texto, /3 gastos/);
  assert.match(aviso.texto, /ya presentado/);
  assert.equal(avisos(gastos, false).some((a) => a.id === 'afecto'), false);
  const corregidos = gastos.map((g) => ({ ...g, afectoPct: ejemplo.confirmaciones[g.id] }));
  assert.equal(avisos(corregidos).some((a) => a.id === 'afecto'), false);
  assert.equal(avisos([{ ...antiguo, afectoPct: 101 }]).some((a) => a.id === 'afecto'), true);
});

test('guardar y releer la copia corregida: 130, libros y fichero AEAT coinciden; se conserva el IVA y los justificantes', () => {
  const { empresa, facturas, gastos, confirmaciones, esperados: e } = copia();
  const resumen = (gs) => resumenAnual(facturas, gs, 2026, {}, ['servicios'], { normal: true }).trimestres[3];
  const antes = resumen(gastos);
  assert.deepEqual([antes.gasAcum, antes.rendAcum, antes.m130], [e.gastosAntes, e.rendimientoAntes, e.pagoAntes]);
  const corregidos = gastos.map((g) => {
    if (!(g.id in confirmaciones)) return g;
    const r = gastoEditado(empresa, { ...g, afectoPct: confirmaciones[g.id] }, g);
    assert.equal(r.error, undefined);
    assert.deepEqual(importes(r.gasto), importes(g));
    assert.deepEqual(r.gasto.archivo, g.archivo);
    assert.equal(r.gasto.pendiente, g.pendiente);
    assert.equal(r.gasto.id, g.id);
    return JSON.parse(JSON.stringify(r.gasto)); // frontera de persistencia: el 100 no se pierde al serializar
  });
  assert.equal(corregidos[2].afectoPct, 100);
  assert.deepEqual(gastosSinAfectacion(corregidos, 2026), []);
  const despues = resumen(corregidos);
  assert.deepEqual([despues.gasAcum, despues.rendAcum, despues.m130], [e.gastosDespues, e.rendimientoDespues, e.pagoDespues]);
  assert.equal(fichero130({ nif: '12345678Z', nombre: 'Ana Ejemplo Ficticio' }, 2026, despues).resultado, e.pagoDespues);
  assert.equal(librosRegistro({ facturas, gastos: corregidos, fiscal: empresa.fiscal, actividades: empresa.actividades }, 2026, '2026-12-31').totales.gastos, e.gastosDespues);
  for (const t of [1, 2, 3, 4]) assert.deepEqual(casillas303(facturas, corregidos, 2026, t), casillas303(facturas, gastos, 2026, t));
  assert.deepEqual(ejemplo.gastos, gastos, 'el expediente original permanece intacto');
});

test('crear un gasto con 100 % explícito y volver a editarlo no hace reaparecer el aviso', () => {
  const { empresa } = copia();
  const { gasto } = nuevoGasto(empresa, { ...antiguo, afectoPct: '100' });
  assert.equal(gasto.afectoPct, 100);
  const { afectoPct, ...sinCampo } = gasto;
  const editado = gastoEditado(empresa, { ...sinCampo, concepto: 'Proveedor corregido' }, gasto).gasto;
  assert.equal(editado.afectoPct, 100, 'un cliente antiguo no borra la revisión al omitir el campo');
  assert.deepEqual(gastosSinAfectacion([editado], 2026), []);
  const repetido = gastoEditado(empresa, editado, editado).gasto;
  assert.deepEqual(JSON.parse(JSON.stringify(repetido)), JSON.parse(JSON.stringify(editado)));
  assert.ok(gastoEditado(empresa, { ...editado, afectoPct: 101 }, editado).errores.afectoPct);
  const pendiente = gastoEditado(empresa, { ...editado, afectoPct: null }, editado).gasto;
  assert.equal(gastosSinAfectacion([pendiente], 2026).length, 1);
});
