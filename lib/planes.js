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

// --- Uso durante la prueba (lib/usoPlan.js lo apunta) y avisos antes de que acabe ---

const VECES = { conciliacion: (n) => `${n} ${n === 1 ? 'movimiento conciliado' : 'movimientos conciliados'}`, inventario: (n) => `${n} ${n === 1 ? 'movimiento' : 'movimientos'} de stock`, tesoreria: (n) => `${n} ${n === 1 ? 'cambio' : 'cambios'} en la previsión`, asistente: (n) => `${n} ${n === 1 ? 'pregunta' : 'preguntas'}`, nominas: (n) => `${n} ${n === 1 ? 'nómina' : 'nóminas'}` };

// Lo que ha usado en la prueba y no entra en su plan. uso: { funcion: veces }; hay: { usuarios, empleados }.
export function perderia(plan, uso = {}, hay = {}) {
  if (!plan || !LIMITES[plan.tipo]) return [];
  const l = { plan: plan.nombre, ...(LIMITES[plan.tipo][plan.nombre] || LIMITES[plan.tipo].Esencial) };
  const out = [];
  for (const f of Object.keys(FUNCIONES)) {
    const n = Number(uso[f]) || 0;
    if (n > 0 && !l.funciones.includes(f)) out.push({ que: f, texto: `${FUNCIONES[f]} (${VECES[f](n)})` });
  }
  for (const k of ['usuarios', 'empleados']) {
    if ((Number(hay[k]) || 0) > l[k]) out.push({ que: k, hay: Number(hay[k]), texto: `${hay[k]} ${k}, y el plan ${l.plan} admite ${l[k]}` });
  }
  return out;
}

// El plan más barato de su tipo que incluye todo lo que ha usado (o null si ya le vale el suyo).
export function planQueLoIncluye(plan, uso = {}, hay = {}) {
  if (!perderia(plan, uso, hay).length) return null;
  return PLANES[plan.tipo].find((p) => !perderia({ ...plan, nombre: p.n }, uso, hay).length) || null;
}

// Aviso que toca hoy según los días de prueba que quedan (lib/prueba.js diasPrueba): a 7, a 3, el último y al acabar.
export const AVISOS = { 7: 'semana', 3: 'tres', 1: 'ultimo', 0: 'fin' };
export const avisoDelDia = (dias) => (dias === null || dias === undefined ? null : AVISOS[dias] || null);

// Asunto y texto del email. precio: lo que cuesta su plan (texto); recomendado: plan de PLANES o null.
export function textoAviso({ aviso, plan, nombre, hasta, perdidas = [], recomendado, enlace }) {
  const cuando = { semana: 'dentro de una semana', tres: 'dentro de 3 días', ultimo: 'hoy' }[aviso];
  const p = planDe(plan.tipo, plan.nombre);
  const asunto = aviso === 'fin' ? 'Tu prueba de Netto ha terminado: tus datos siguen ahí' : `Tu prueba de Netto acaba ${cuando}`;
  const usado = perdidas.length && [
    `Durante la prueba has usado cosas que el plan ${plan.nombre} no incluye:`,
    perdidas.map((x) => `· ${x.texto}`).join('\n'),
    recomendado ? `Con el plan ${recomendado.n} (${recomendado.p} €/mes + IVA) lo sigues teniendo todo.` : 'Para seguir con todo, escríbenos y te preparamos un plan a medida.',
  ].join('\n');
  const mensaje = [
    `Hola${nombre ? ` ${nombre.split(' ')[0]}` : ''},`,
    aviso === 'fin'
      ? `Tu mes de prueba acabó el ${hasta}. No se ha borrado nada: puedes entrar, ver y exportar todo. Para volver a crear facturas y apuntar gastos, elige tu plan.`
      : `Tu mes de prueba del plan ${plan.nombre} acaba ${cuando}${aviso === 'ultimo' ? '' : ` (el ${hasta})`}. Para seguir sin cortes, añade tu tarjeta: el plan ${plan.nombre} cuesta ${p?.p} €/mes + IVA (o un ${DESCUENTO} % menos si pagas el año), sin permanencia.`,
    usado,
    `Elegir plan y añadir la tarjeta: ${enlace}`,
    aviso !== 'fin' && 'Si no haces nada, no se te cobra nada: tu cuenta pasa a solo lectura y tus datos se quedan donde están.',
    'El equipo de Netto',
  ].filter(Boolean).join('\n\n');
  return { asunto, mensaje };
}
