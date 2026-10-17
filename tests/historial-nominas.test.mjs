import test from 'node:test';
import assert from 'node:assert/strict';
import { historialNominas, equipoPorFecha } from '../lib/historialNominas.js';

test('todos los meses de varios años son accesibles sin truncar ni mutar', () => {
  const nominas = [2021, 2023, 2025].flatMap((anio) => Array.from({ length: 12 }, (_, i) => ({ mes: `${anio}-${String(i + 1).padStart(2, '0')}`, id: `${anio}-${i}` })));
  const copia = structuredClone(nominas);
  assert.deepEqual(historialNominas(nominas, 2026).anios, [2026, 2025, 2023, 2021]);
  const visitados = [];
  for (const anio of [2021, 2023, 2025]) {
    const h = historialNominas(nominas, 2026, String(anio));
    assert.equal(h.anio, anio);
    assert.equal(h.meses.length, 12);
    assert.equal(h.meses[0], `${anio}-12`);
    visitados.push(...h.meses);
  }
  assert.equal(new Set(visitados).size, 36);
  assert.deepEqual(nominas, copia);
  assert.deepEqual(historialNominas(nominas, 2026).meses, []);
});

test('año inválido, repetido o inexistente vuelve al actual; meses únicos', () => {
  for (const solicitado of ['2024', '2025foo', ['2025', '2026'], undefined]) {
    assert.equal(historialNominas([{ mes: '2025-01' }], 2026, solicitado).anio, 2026);
  }
  assert.deepEqual(historialNominas([{ mes: '2025-01' }, { mes: '2025-01' }], 2026, '2025').meses, ['2025-01']);
  assert.deepEqual(historialNominas([], 2026).anios, [2026]);
});

test('altas y bajas futuras, incluidas las del mes actual, no son bajas reales', () => {
  const empleados = [
    { id: 'alta-futura-mes', alta: '2026-10-20' },
    { id: 'alta-otro-anio', alta: '2027-01-01', baja: '2027-12-31' },
    { id: 'baja-futura-mes', alta: '2025-01-01', baja: '2026-10-20' },
    { id: 'baja-futura-anio', alta: '2025-01-01', baja: '2027-01-01' },
    { id: 'baja-real-mes', alta: '2025-01-01', baja: '2026-10-16' },
    { id: 'alta-hoy', alta: '2026-10-17' },
    { id: 'baja-hoy', alta: '2025-01-01', baja: '2026-10-17' },
  ];
  const equipo = equipoPorFecha(empleados, '2026-10-17');
  assert.deepEqual(equipo.futuras.map((e) => e.id), ['alta-futura-mes', 'alta-otro-anio']);
  assert.deepEqual(equipo.bajas.map((e) => e.id), ['baja-real-mes']);
  assert.deepEqual(equipo.actuales.map((e) => e.id), ['baja-futura-mes', 'baja-futura-anio', 'alta-hoy', 'baja-hoy']);
  assert.equal(Object.values(equipo).flat().length, empleados.length);
});
