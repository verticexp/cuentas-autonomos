// Uso de las funciones que no van en todos los planes, contado solo durante la prueba (sin plan pagado): con eso los
// avisos y Ajustes › Tu plan le dicen qué dejaría de tener con el plan que eligió (lib/planes.js perderia).
import { redis } from './redis.js';
import { sinFuncion, plazasDe } from './planes.js';
import { membresias } from './membresias.js';

const clave = (empresa) => `uso-plan:${empresa}`;

// Mensaje de error si su plan no la incluye; si la incluye, la apunta (en la prueba) y devuelve null.
export async function usarFuncion(u, funcion) {
  const no = sinFuncion(u.plan, funcion);
  if (no) return no;
  if (u.plan && !u.plan.pagado && redis) await redis.hincrby(clave(u.empresa), funcion, 1).catch(() => {});
  return null;
}

export const usoDe = async (empresa) => ((await redis.hgetall(clave(empresa))) || {});

// Personas de la empresa (y las administradoras, a quien van los avisos) y empleados en alta.
export async function genteDe(empresa, leer) {
  const todos = Object.values((await redis.hgetall('usuarios')) || {}).filter((x) => membresias(x)[empresa]);
  const empleados = (await leer({ id: empresa, empresa }, 'empleados')).filter((e) => !e.baja).length;
  const admins = todos.filter((x) => membresias(x)[empresa].rol === 'admin' && x.email);
  return { ...plazasDe(todos.map((u) => membresias(u)[empresa])), empleados, admins };
}
