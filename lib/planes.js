import { DESCUENTO, PLANES } from '../components/web/datos.js';
import { perfilDe } from './permisos.js';
import { diasPrueba, planDe } from './prueba.js';

// Suscripción de la empresa a Fisquo (lib/prueba.js para el mes de prueba). Con plan.pagado la paga Stripe Billing
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
const LIMITES_ANTERIORES = {
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
// Las condiciones nuevas solo se aplican a altas versionadas. Ninguna suscripción anterior pierde módulos.
const OPERACIONES = ['inventario', 'tesoreria', 'asistente', 'albaranes', 'cartera', 'remesas', 'analisis', 'proyectos', 'revision'];
const GESTION = ['conciliacion', ...OPERACIONES];
const LIMITES_V2 = {
  aut: {
    Esencial: { usuarios: 1, empleados: 0, funciones: [] },
    Pro: { usuarios: 1, empleados: 0, funciones: GESTION },
    Plus: { usuarios: 3, empleados: 2, funciones: [...GESTION, 'nominas'] },
  },
  pym: {
    Esencial: { usuarios: 3, empleados: 5, funciones: ['conciliacion', 'nominas'] },
    Pro: { usuarios: 8, empleados: 15, funciones: [...GESTION, 'nominas'] },
    Plus: { usuarios: 15, empleados: 30, funciones: [...GESTION, 'nominas'] },
  },
};
// Versión 3: el autónomo no tiene lo que solo usa una sociedad (remesas SEPA) y Pyme Esencial se queda en lo que
// una sociedad necesita, para que Pyme Pro sea el plan natural. Pyme Pro incluye todo lo de Autónomo Plus.
const BANCO = ['conciliacion', 'revision'];
const AUT_PRO = [...BANCO, 'cartera', 'tesoreria', 'asistente', 'inventario', 'albaranes', 'analisis'];
const LIMITES = {
  aut: {
    Esencial: { usuarios: 1, empleados: 0, funciones: [] },
    Pro: { usuarios: 1, empleados: 0, funciones: AUT_PRO },
    Plus: { usuarios: 2, empleados: 1, funciones: [...AUT_PRO, 'proyectos', 'nominas'] },
  },
  pym: {
    Esencial: { usuarios: 2, empleados: 3, funciones: [...BANCO, 'nominas'] },
    Pro: { usuarios: 8, empleados: 15, funciones: [...GESTION, 'nominas'] },
    Plus: { usuarios: 15, empleados: 30, funciones: [...GESTION, 'nominas'] },
  },
};
const TABLAS = { 2: LIMITES_V2, 3: LIMITES };
export const FUNCIONES = { conciliacion: 'La conciliación automática', inventario: 'El inventario', tesoreria: 'La previsión de caja', asistente: 'El asistente IA', nominas: 'Las nóminas y la jornada', albaranes: 'Los pedidos y albaranes', cartera: 'La cartera avanzada de cobros', remesas: 'Las remesas SEPA', analisis: 'El análisis financiero', proyectos: 'La rentabilidad por proyecto', revision: 'La revisión de gastos del banco' };
const tablaDe = (plan) => TABLAS[plan?.version] || LIMITES_ANTERIORES;
const versionada = (plan) => Object.hasOwn(TABLAS, plan?.version);
function condiciones(plan, nombre) {
  const tabla = tablaDe(plan)[plan.tipo];
  if (!tabla) return null;
  const limites = tabla[nombre] || tabla.Esencial;
  return { plan: nombre, ...limites, funciones: versionada(plan) ? limites.funciones : [...limites.funciones, 'albaranes', 'cartera', 'remesas', 'analisis', 'proyectos', 'revision'] };
}


// Durante la prueba, lo máximo de su tipo de negocio (el plan Plus); pagado, lo de su plan. null = sin límites.
export function limitesDe(plan) {
  if (!plan || plan.fundador || !Object.hasOwn(tablaDe(plan), plan.tipo)) return null;
  const nombre = plan.pagado ? plan.nombre : PLANES[plan.tipo].at(-1).n;
  return condiciones(plan, nombre);
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
export const SOLO_LECTURA_APP = 'Tu periodo de prueba ha terminado: puedes consultar y exportar todos tus datos, pero no crear ni editar.';

// Escrituras que se dejan en solo lectura: pagar, la propia cuenta, cambiar de empresa, salir, desbloquear y mandar el
// paquete a la gestoría (es exportar, que se puede), escribir a soporte y darse de baja (empresa o cuenta).
const LIBRES = /^\/api\/(suscripcion|empresas|logout|bloqueo|passkey|push|paquete|soporte|baja)(\/|$)/;
export const escrituraLibre = (ruta) => LIBRES.test(ruta || '');

// --- Uso durante la prueba (lib/usoPlan.js lo apunta) y avisos antes de que acabe ---

const VECES = { conciliacion: (n) => `${n} ${n === 1 ? 'movimiento conciliado' : 'movimientos conciliados'}`, inventario: (n) => `${n} ${n === 1 ? 'movimiento' : 'movimientos'} de stock`, tesoreria: (n) => `${n} ${n === 1 ? 'cambio' : 'cambios'} en la previsión`, asistente: (n) => `${n} ${n === 1 ? 'pregunta' : 'preguntas'}`, nominas: (n) => `${n} ${n === 1 ? 'nómina' : 'nóminas'}` };

// Lo que ha usado en la prueba y no entra en su plan. uso: { funcion: veces }; hay: { usuarios, empleados }.
export function perderia(plan, uso = {}, hay = {}) {
  if (!plan || plan.fundador || !Object.hasOwn(tablaDe(plan), plan.tipo)) return [];
  const l = condiciones(plan, plan.nombre);
  const out = [];
  for (const f of Object.keys(FUNCIONES)) {
    const n = Number(uso[f]) || 0;
    if (n > 0 && !l.funciones.includes(f)) out.push({ que: f, texto: `${FUNCIONES[f]} (${VECES[f] ? VECES[f](n) : `${n} usos`})` });
  }
  for (const k of ['usuarios', 'empleados']) {
    const n = Number(k === 'usuarios' && versionada(plan) ? (hay.usuariosInternos ?? hay.usuarios) : hay[k]) || 0;
    if (n > l[k]) out.push({ que: k, hay: n, texto: `${n} ${k}, y el plan ${l.plan} admite ${l[k]}` });
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
// Datos de la plantilla del aviso (lib/correos.js, correos prueba-semana · prueba-tres · prueba-ultimo · prueba-fin).
export function datosAviso({ aviso, plan, nombre, hasta, perdidas = [], recomendado, url }) {
  return { aviso, nombre, plan: plan.nombre, precio: planDe(plan.tipo, plan.nombre)?.p, descuento: DESCUENTO, hasta, perdidas: perdidas.map((x) => x.texto), recomendado, url };
}

// Se restringen módulos completos, con coincidencia por segmento para no bloquear rutas parecidas.
// El historial de documentos y las exportaciones generales siguen disponibles tras bajar de plan.
export function funcionDeRuta(ruta, metodo = 'GET') {
  const path = (ruta || '').split('?')[0];
  if (/^\/(api\/)?albaranes(\/|$)/.test(path)) {
    if (['GET', 'HEAD'].includes(metodo) && path !== '/albaranes/nuevo') return null;
    return 'albaranes';
  }
  const rutas = [
    [/^\/(api\/)?cartera(\/|$)/, 'cartera'],
    [/^\/(tesoreria\/remesas|api\/remesas)(\/|$)/, 'remesas'],
    [/^\/analisis(\/|$)/, 'analisis'],
    [/^\/proyectos(\/|$)/, 'proyectos'],
    [/^\/api\/gastos\/revision(\/|$)/, 'revision'],
    [/^\/api\/jornada(?:\/|$)/, ['GET', 'HEAD'].includes(metodo) ? null : 'nominas'],
  ];
  return rutas.find(([patron]) => patron.test(path))?.[1] || null;
}

// Una plaza de gestoría incluida aparte. Las demás personas, incluidas gestorías adicionales,
// consumen plazas internas. Solo un perfil de gestoría sin permisos extra puede usar esa plaza.
export function plazasDe(personas) {
  const gestorias = personas.filter((p) => perfilDe(p) === 'Gestoría').length;
  return { usuarios: personas.length, usuariosInternos: personas.length - Math.min(gestorias, 1), gestorias };
}

// También se comprueba al cambiar permisos, para que una plaza gratuita no se convierta en un usuario extra.
export function sinPlaza(plan, personas, candidato, id) {
  const l = limitesDe(plan);
  if (!l) return null;
  const despues = id ? personas.map((p) => p.id === id ? { ...candidato, id } : p) : [...personas, candidato];
  const clave = versionada(plan) ? 'usuariosInternos' : 'usuarios';
  const antes = plazasDe(personas)[clave], n = plazasDe(despues)[clave];
  return n > l.usuarios && n > antes ? sinHueco(plan, 'usuarios', n - 1) : null;
}
