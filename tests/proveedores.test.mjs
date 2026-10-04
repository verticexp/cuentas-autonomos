import test from 'node:test';
import assert from 'node:assert/strict';
import { claveProveedor, proveedores } from '../lib/proveedores.js';

test('proveedores: se agrupan por NIF o por nombre, con su historial y lo que se les debe', () => {
  const g = [
    { id: '1', fecha: '2026-01-10', proveedor: 'Ferretería Sol', proveedorNif: 'b111', base: 100, ivaPct: 21 },
    { id: '2', fecha: '2026-03-01', proveedor: 'FERRETERIA SOL S.L.', proveedorNif: 'B111', base: 50, ivaPct: 21, pendiente: true },
    { id: '3', fecha: '2026-02-01', proveedor: '  Gestoría  Ruiz ', base: 80, ivaPct: 21 },
    { id: '4', fecha: '2026-04-01', proveedor: 'gestoría ruiz', base: 80, ivaPct: 21 },
    { id: '5', fecha: '2026-04-02', concepto: 'Sin proveedor', base: 10, ivaPct: 0 },
  ];
  const p = proveedores(g);
  assert.equal(p.length, 2);
  assert.deepEqual([p[0].nombre, p[0].nif, p[0].n, p[0].total, p[0].debe, p[0].pendientes], ['FERRETERIA SOL S.L.', 'B111', 2, 181.5, 60.5, 1]);
  assert.deepEqual(p[0].gastos.map((x) => x.id), ['2', '1']);
  assert.deepEqual([p[1].n, p[1].total, p[1].debe, p[1].ultimo], [2, 193.6, 0, '2026-04-01']);
  assert.equal(claveProveedor({ proveedor: 'Gestoría Ruiz' }), 'gestoria ruiz');
});
