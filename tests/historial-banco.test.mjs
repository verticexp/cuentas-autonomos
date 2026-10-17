import test from 'node:test';
import assert from 'node:assert/strict';
import { historialBanco } from '../lib/historialBanco.js';

const movimiento = (i, estado = 'pendiente') => ({ id: String(i).padStart(4, '0'), fecha: '2026-10-01', concepto: `Movimiento ${i}`, contraparte: 'Ferretería Norte', cuenta: i % 2 ? 'a' : 'b', estado });
test('todos los movimientos son accesibles sin huecos ni duplicados en los tres estados', () => {
  for (const [estado, grupo, parametro] of [['pendiente', 'pendientes', 'pp'], ['emparejado', 'emparejados', 'pe'], ['ignorado', 'ignorados', 'pi']]) {
    const lista = Array.from({ length: 177 }, (_, i) => movimiento(i, estado));
    const vistos = [];
    for (let p = 1; p <= 4; p++) {
      const g = historialBanco(lista, { [parametro]: p }).grupos[grupo];
      vistos.push(...g.items.map((m) => m.id));
      assert.equal(g.total, 177);
      assert.equal(g.pagina, p);
      assert.equal(g.paginas, 4);
      assert.equal(g.desde, (p - 1) * 50 + 1);
      assert.equal(g.hasta, Math.min(p * 50, 177));
    }
    assert.equal(new Set(vistos).size, 177);
    assert.deepEqual(vistos, lista.map((m) => m.id));
  }
});
test('los filtros se aplican al histórico completo antes de paginar y se conservan en enlaces', () => {
  const lista = Array.from({ length: 201 }, (_, i) => movimiento(i));
  const h = historialBanco(lista, { q: 'FERRETERIA', cuenta: 'a', desde: '2026-10-01', hasta: '2026-10-01', pe: '2' });
  assert.equal(h.grupos.pendientes.total, 100);
  assert.equal(h.grupos.pendientes.items.length, 50);
  const url = new URL(h.grupos.pendientes.siguiente, 'http://localhost');
  assert.equal(url.searchParams.get('q'), 'FERRETERIA');
  assert.equal(url.searchParams.get('cuenta'), 'a');
  assert.equal(url.searchParams.get('pp'), '2');
  assert.equal(url.hash, '#banco-pendientes');
  assert.equal(lista.length, 201);
});
test('páginas fuera de rango se ajustan, fechas imposibles se ignoran y consultas múltiples no fallan', () => {
  const lista = Array.from({ length: 51 }, (_, i) => movimiento(i));
  assert.equal(historialBanco(lista, { pp: '999' }).grupos.pendientes.pagina, 2);
  for (const pp of ['-1', '1.5', 'Infinity', 'texto', '']) assert.equal(historialBanco(lista, { pp }).grupos.pendientes.pagina, 1);
  const h = historialBanco(lista, { q: ['Movimiento 50', 'otro'], desde: '2026-02-30', hasta: 'inválida' });
  assert.equal(h.grupos.pendientes.items[0].id, '0050');
  assert.equal(h.filtros.desde, '');
  assert.equal(h.filtros.hasta, '');
  const vacio = historialBanco([], { pp: '99' }).grupos.pendientes;
  assert.equal(vacio.pagina, 1);
  assert.equal(vacio.desde, 0);
  assert.equal(vacio.siguiente, null);
});
test('sin estado cuenta como pendiente y el orden por fecha e ID es estable sin mutar el origen', () => {
  const lista = [movimiento(2), { ...movimiento(1), estado: undefined }, { ...movimiento(0), fecha: '2026-10-02' }];
  const antes = structuredClone(lista);
  assert.deepEqual(historialBanco(lista).grupos.pendientes.items.map((m) => m.id), ['0000', '0001', '0002']);
  assert.deepEqual(lista, antes);
});
