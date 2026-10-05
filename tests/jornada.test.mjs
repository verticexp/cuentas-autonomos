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
  assert.equal(laborables('2026-10-01', '2026-10-31'), 22);
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

test('jornada: filas para la Inspección, con las correcciones', () => {
  const F = [{ id: 'a', empleado: 'e1', fecha: '2026-10-14', entrada: '2026-10-14T22:00', salida: '2026-10-15T06:00', pausas: [{ inicio: '2026-10-15T02:00', fin: '2026-10-15T02:20' }],
    cambios: [{ cuando: '2026-10-16T10:00', porNombre: 'Marc', motivo: 'Olvidó fichar la salida' }] }];
  assert.deepEqual(filasRegistro(F, [{ id: 'e1', nombre: 'Ana', nif: '1X' }]), [{ trabajador: 'Ana', nif: '1X', fecha: '2026-10-14', entrada: '22:00', salida: '15/10 06:00', pausas: '02:00-02:20', horas: '7:40', observaciones: 'Corregido el 2026-10-16 por Marc: Olvidó fichar la salida' }]);
});
