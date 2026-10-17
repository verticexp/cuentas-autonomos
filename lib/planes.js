import { DESCUENTO, PLANES } from '../components/web/datos.js';
import { diasPrueba, planDe } from './prueba.js';

// Suscripción de la empresa a Netto (lib/prueba.js para el mes de prueba). Con plan.pagado la paga Stripe Billing
// (lib/suscripcion.js); al acabar la prueba sin pagar, solo lectura: se ve y se exporta todo, pero no se crea ni edita.
// Las empresas de antes (sin plan) no tienen límites ni solo lectura.

export const PERIODOS = { mes: 'Mensual', anio: 'Anual' };

// Céntimos que se cobran (sin IVA): el anual son 12 meses con el descuento de la web (DESCUENTO, en %).
export function importe(tipo, nombre, periodo) {
  const p = planDe(tipo, nombre);
  if (!p || !PERIODOS[periodo]) return null;
  return periodo === 'anio' ? Math.round(p.p * 12 * (100 - DESCUENTO)) : Math.round(p.p * 100);
}

// Lo que limita cada plan (de la tabla de Precios). funciones: módulos que no van en todos los planes de autónomo.
const AUT = ['conciliacion', 'inventario', 'tesoreria', 'asistente', 'nominas'];
const LIMITES = {
  aut: {
    Esencial: { usuarios: 1, empleados: 0, funciones: [] },
    Pro: { usuarios: 2, empleados: 0, funciones: ['conciliacion', 'inventario', 'tesoreria', 'asistente'] },
    Plus: { usuarios: 3, empleados: 2, funciones: AUT },
  },
  pym: {
    Esencial: { usuarios: 3, empleados: 5, funciones: AUT },
    Pro: { usuarios: 8, empleados: 15, funciones: AUT },
    Plus: { usuarios: 15, empleados: 30, funciones: AUT },
  },
  gra: {
    Esencial: { usuarios: 20, empleados: 50, funciones: AUT },
    Pro: { usuarios: 50, empleados: 150, funciones: AUT },
    Plus: { usuarios: Infinity, empleados: 500, funciones: AUT },
  },
};
export const FUNCIONES = { conciliacion: 'La conciliación automática', inventario: 'El inventario', tesoreria: 'La previsión de caja', asistente: 'El asistente IA', nominas: 'Las nóminas y la jornada' };

// Durante la prueba, lo máximo de su tipo de negocio (el plan Plus); pagado, lo de su plan. null = sin límites.
export function limitesDe(plan) {
  if (!plan || !LIMITES[plan.tipo]) return null;
  const nombre = plan.pagado ? plan.nombre : PLANES[plan.tipo].at(-1).n;
  return { plan: nombre, ...(LIMITES[plan.tipo][nombre] || LIMITES[plan.tipo].Esencial) };
}

// Mensaje de error si el plan no incluye esa función; null si puede.
export function sinFuncion(plan, funcion) {
  const l = limitesDe(plan);
  if (!l || l.funciones.includes(funcion)) return null;
  return `${FUNCIONES[funcion]} no va en el plan ${l.plan}. Puedes cambiar de plan en Ajustes › Tu plan.`;
}

// Mensaje de error si ya está en el máximo de usuarios o empleados del plan; null si cabe uno más.
export function sinHueco(plan, que, hay) {
  const l = limitesDe(plan);
  if (!l || hay < l[que]) return null;
  return l[que] === 0
    ? `${que === 'empleados' ? 'Las nóminas no van' : 'No caben más usuarios'} en el plan ${l.plan}. Puedes cambiar de plan en Ajustes › Tu plan.`
    : `El plan ${l.plan} admite ${l[que]} ${que}. Puedes cambiar de plan en Ajustes › Tu plan.`;
}

export const soloLectura = (plan, hoy = new Date()) => diasPrueba(plan, hoy) === 0;
export const SOLO_LECTURA = 'Tu mes de prueba ha terminado: puedes ver y exportar todo, pero para crear o editar tienes que elegir un plan en Ajustes › Tu plan.';

// Escrituras que se dejan en solo lectura: pagar, la propia cuenta, cambiar de empresa, salir y desbloquear.
const LIBRES = /^\/api\/(suscripcion|cuenta|empresas|logout|bloqueo|passkey|push)(\/|$)/;
export const escrituraLibre = (ruta) => LIBRES.test(ruta || '');
