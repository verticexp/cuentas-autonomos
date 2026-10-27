import test from 'node:test';
import assert from 'node:assert/strict';
import { abiertoDe, estadoDe, extrasNomina, fichar, filasRegistro, hhmm, laborables, minutos, resumenMes, validar } from '../lib/jornada.js';

test('jornada: entrar, pausa, volver y salir, en orden', () => {
  let F = [];
  const paso = (accion, ahora) => { const r = fichar(F, 'e1', accion, ahora, 'u1'); if (r.fichaje) F = [...F.filter((f) => f.id !== r.fichaje.id), r.fichaje]; return r; };
  assert.equal(paso('pausa', '2026-10-05T08:00').error, 'Primero ficha la entrada');
  paso('entrar', '2026-10-05T09:00');
  assert.equal(estadoDe(abiertoDe(F, 'e1')), 'dentro');
  assert.equal(paso('entrar', '2026-10-05T09:05').error, 'Ya has fichado la entrada');
  paso('pausa', '2026-10-05T11:00');
  assert.equal(estadoDe(abiertoDe(F, 'e1')), 'pausa');
  assert.equal(paso('pausa', '2026-10-05T11:05').error, 'Ya estás en pausa');
  paso('volver', '2026-10-05T11:30');
  paso('salir', '2026-10-05T17:15');
  assert.equal(F.length, 1);
  assert.deepEqual([F[0].entrada, F[0].salida, F[0].pausas], ['2026-10-05T09:00', '2026-10-05T17:15', [{ inicio: '2026-10-05T11:00', fin: '2026-10-05T11:30' }]]);
  assert.equal(minutos(F[0]), 465);
  assert.equal(hhmm(465), '7:45');
  assert.equal(abiertoDe(F, 'e1'), null);
  // Salir estando en pausa cierra la pausa.
  paso('entrar', '2026-10-06T22:00'); paso('pausa', '2026-10-07T02:00');
  const r = paso('salir', '2026-10-07T02:30');
  assert.deepEqual([r.fichaje.fecha, r.fichaje.pausas[0].fin, minutos(r.fichaje)], ['2026-10-06', '2026-10-07T02:30', 240]);
});

test('jornada: lo escrito a mano tiene que tener sentido', () => {
  assert.ok(validar({ entrada: '2026-10-05T17:00', salida: '2026-10-05T09:00' }).error);
  assert.ok(validar({ entrada: '2026-10-05T09:00', salida: '2026-10-06T09:00' }).error);
  assert.ok(validar({ entrada: '2026-10-05T09:00', salida: '2026-10-05T17:00', pausas: [{ inicio: '2026-10-05T08:00', fin: '2026-10-05T08:30' }] }).error);
  assert.ok(validar({ entrada: '2026-10-05T09:00', salida: '2026-10-05T17:00', pausas: [{ inicio: '2026-10-05T10:00', fin: '2026-10-05T11:00' }, { inicio: '2026-10-05T10:30', fin: '2026-10-05T12:00' }] }).error);
  const v = validar({ entrada: '2026-10-05T09:00', salida: '2026-10-05T17:00', pausas: [{ inicio: '2026-10-05T13:00', fin: '2026-10-05T14:00' }], x: 1 });
  assert.deepEqual(v, { entrada: '2026-10-05T09:00', salida: '2026-10-05T17:00', pausas: [{ inicio: '2026-10-05T13:00', fin: '2026-10-05T14:00' }] });
});

test('jornada: horas del mes frente a su jornada, y horas extra en la nómina', () => {
  // El lunes 12 es la Fiesta Nacional: 21 laborables (antes los festivos contaban como jornada).
  assert.equal(laborables('2026-10-01', '2026-10-31'), 21);
  const e = { id: 'e1', alta: '2026-10-14', horasSemana: 20, precioHoraExtra: 15 };
  const F = [
    { id: 'a', empleado: 'e1', fecha: '2026-10-14', entrada: '2026-10-14T09:00', salida: '2026-10-14T19:00', pausas: [] },
    { id: 'b', empleado: 'e1', fecha: '2026-10-15', entrada: '2026-10-15T09:00', salida: '2026-10-15T15:30', pausas: [{ inicio: '2026-10-15T12:00', fin: '2026-10-15T12:30' }] },
    { id: 'c', empleado: 'e1', fecha: '2026-10-16', entrada: '2026-10-16T09:00', salida: null, pausas: [] },
    { id: 'd', empleado: 'e2', fecha: '2026-10-16', entrada: '2026-10-16T09:00', salida: '2026-10-16T10:00', pausas: [] },
    { id: 'z', empleado: 'e1', fecha: '2026-09-30', entrada: '2026-09-30T09:00', salida: '2026-09-30T10:00', pausas: [] },
  ];
  // Desde el alta (14) hasta el 16: 3 laborables × 4 h = 12 h; trabajadas 10 + 6 = 16 h.
  const r = resumenMes(F, e, '2026-10', '2026-10-16');
  assert.deepEqual(r, { fichajes: 3, dias: 2, abiertos: 1, trabajados: 960, teoricos: 720, diferencia: 240, extra: 240 });
  assert.deepEqual(extrasNomina(r, e), { horas: { trabajadas: 960, teoricas: 720, extra: 240 }, importe: 60 });
  assert.deepEqual(extrasNomina(r, { ...e, precioHoraExtra: 0 }).importe, 0);
  assert.equal(extrasNomina(resumenMes([], e, '2026-10'), e), null);
  // Mes entero (sin «hasta»): del miércoles 14 al 31 de octubre hay 13 laborables.
  assert.equal(resumenMes(F, e, '2026-10').teoricos, 13 * 4 * 60);
});

// Auditoría completa (21-10-2026, revisión de Codex).
test('jornada: los cambios de hora cuentan los minutos de verdad', () => {
  const f = (d) => ({ entrada: `${d}T01:30`, salida: `${d}T03:30`, pausas: [] });
  assert.equal(minutos(f('2026-03-29')), 60); // a las 02:00 pasan a ser las 03:00
  assert.equal(minutos(f('2026-10-25')), 180); // a las 03:00 vuelven a ser las 02:00
  assert.equal(minutos(f('2026-10-24')), 120);
});

test('jornada: los festivos nacionales no cuentan como jornada y dejan ver las horas extra', () => {
  assert.equal(laborables('2026-01-01', '2026-01-31'), 20); // sin el 1 y el 6 de enero
  const e = { id: 'e1', alta: '2025-01-01', horasSemana: 40, precioHoraExtra: 15 };
  const F = Array.from({ length: 21 }, (_, i) => ({ id: `f${i}`, empleado: 'e1', fecha: '2026-01-02', entrada: '2026-01-02T08:00', salida: '2026-01-02T16:00', pausas: [] }));
  const r = resumenMes(F, e, '2026-01');
  assert.deepEqual([r.teoricos / 60, r.trabajados / 60, r.extra / 60], [160, 168, 8]);
  assert.equal(extrasNomina(r, e).importe, 120);
});

test('jornada: a mano, ni fechas que no existen ni más pausas de las que caben', () => {
  assert.match(validar({ entrada: '2026-02-30T09:00', salida: '2026-02-30T17:00' }).error, /fecha que exista/);
  assert.match(validar({ entrada: '2026-02-27T09:00', salida: '2026-02-27T25:00' }).error, /fecha que exista/);
  const pausas = Array.from({ length: 11 }, (_, i) => ({ inicio: `2026-02-27T${String(9 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, fin: `2026-02-27T${String(9 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '35' : '05'}` }));
  assert.match(validar({ entrada: '2026-02-27T08:00', salida: '2026-02-27T17:00', pausas }).error, /Como mucho 10 pausas/);
  assert.equal(validar({ entrada: '2026-02-27T08:00', salida: '2026-02-27T17:00', pausas: pausas.slice(0, 10) }).pausas.length, 10);
});

test('jornada: filas para la Inspección, con las correcciones', () => {
  const F = [{ id: 'a', empleado: 'e1', fecha: '2026-10-14', entrada: '2026-10-14T22:00', salida: '2026-10-15T06:00', pausas: [{ inicio: '2026-10-15T02:00', fin: '2026-10-15T02:20' }],
    cambios: [{ cuando: '2026-10-16T10:00', porNombre: 'Marc', motivo: 'Olvidó fichar la salida' }] }];
  assert.deepEqual(filasRegistro(F, [{ id: 'e1', nombre: 'Ana', nif: '1X' }]), [{ trabajador: 'Ana', nif: '1X', fecha: '2026-10-14', entrada: '22:00', salida: '15/10 06:00', pausas: '02:00-02:20', horas: '7:40', observaciones: 'Corregido el 2026-10-16 por Marc: Olvidó fichar la salida' }]);
});
