// Quién ficha: el empleado de la empresa con el mismo email que el usuario (y de alta hoy).
import { leer } from './redis.js';

export const activoEn = (e, dia) => e.alta <= dia && (!e.baja || e.baja >= dia);

export async function miEmpleado(u, dia) {
  const empleados = (await leer(u, 'empleados')) || [];
  return { empleados, yo: empleados.find((e) => e.email && e.email === u.email && activoEn(e, dia)) || null };
}
