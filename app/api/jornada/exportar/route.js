import { leer } from '@/lib/redis';
import { error, usuarioApi } from '@/lib/api';
import { puede } from '@/lib/permisos';
import { ahoraMadrid, filasRegistro, hhmm, resumenMes } from '@/lib/jornada';
import { miEmpleado } from '@/lib/jornadaServidor';
import { nombreMes } from '@/lib/nominas';
import { xlsx } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

// Registro de jornada de un mes en Excel, listo para la Inspección de Trabajo (o, para cada empleado, el suyo).
export async function GET(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const mes = req.nextUrl.searchParams.get('mes') || '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return error('Mes no válido');
  const ahora = ahoraMadrid();
  const { empleados, yo } = await miEmpleado(u, ahora.slice(0, 10));
  const todos = puede(u, 'nominas');
  if (!todos && !yo) return error('No tienes acceso al registro de jornada', 403);
  const quienes = todos ? empleados : [yo];
  const ids = new Set(quienes.map((e) => e.id));
  const fichajes = ((await leer(u, 'jornada')) || []).filter((f) => ids.has(f.empleado) && f.fecha.startsWith(mes));
  const hasta = ahora.slice(0, 10);
  const conDatos = quienes.filter((e) => fichajes.some((f) => f.empleado === e.id) || (e.alta.slice(0, 7) <= mes && (!e.baja || e.baja.slice(0, 7) >= mes)));
  const buf = xlsx([
    { nombre: 'Empresa', anchos: [28, 50], filas: [
      ['Registro de jornada', nombreMes(mes)],
      ['Empresa', u.emisor?.nombre || u.empresaNombre || ''], ['CIF / NIF', u.emisor?.nif || ''],
      ['Generado', `${ahora.slice(0, 10)} ${ahora.slice(11)}`],
      ['Base legal', 'Art. 34.9 del Estatuto de los Trabajadores. Se conserva 4 años.'],
    ] },
    { nombre: 'Jornadas', anchos: [28, 12, 12, 8, 12, 24, 10, 60], filas: [
      ['Trabajador', 'DNI / NIE', 'Fecha', 'Entrada', 'Salida', 'Pausas', 'Horas', 'Observaciones'],
      ...filasRegistro(fichajes, empleados).map((x) => [x.trabajador, x.nif, x.fecha.split('-').reverse().join('/'), x.entrada, x.salida, x.pausas, x.horas, x.observaciones]),
    ] },
    { nombre: 'Resumen', anchos: [28, 12, 10, 14, 16, 14], filas: [
      ['Trabajador', 'DNI / NIE', 'Días', 'Horas trabajadas', 'Horas de su jornada', 'Diferencia'],
      ...conDatos.map((e) => { const r = resumenMes(fichajes, e, mes, hasta); return [e.nombre, e.nif || '', { n: r.dias }, hhmm(r.trabajados), hhmm(r.teoricos), hhmm(r.diferencia)]; }),
    ] },
  ]);
  return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="registro-jornada-${mes}${todos ? '' : `-${yo.nombre.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}`}.xlsx"` } });
}
