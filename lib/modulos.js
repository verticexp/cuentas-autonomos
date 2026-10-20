import { PLANES } from '../components/web/datos.js';
import { limitesDe } from './planes.js';

// Qué ve cada empresa en los menús según su forma (autónomo o sociedad) y su plan. Sin lecturas a la base de datos.
// - Lo que solo usa una sociedad no se enseña a un autónomo: la contabilidad completa (diario, mayor, balance, cuentas
//   anuales), los ratios y las remesas SEPA. Al autónomo le queda lo que le pide la ley: libros registro y amortizaciones.
// - Lo que existe para su tipo pero va en un plan superior sí se enseña, con el plan que lo incluye («Pro», «Plus»).

export const esSociedad = (fiscal) => fiscal?.tipo === 'sociedad';

// Vistas de /contabilidad. El autónomo ve los libros, las amortizaciones y su cuenta de resultados.
export const VISTAS_CONTABILIDAD = [['pyg', 'Resultados'], ['balance', 'Balance'], ['diario', 'Diario'], ['sumas', 'Sumas y saldos'], ['mayor', 'Mayor'], ['bienes', 'Amortizaciones'], ['anuales', 'Cuentas anuales'], ['libros', 'Libros registro']];
const VISTAS_AUTONOMO = ['libros', 'bienes', 'pyg'];
export const vistasContabilidad = (fiscal) => esSociedad(fiscal) ? VISTAS_CONTABILIDAD : VISTAS_AUTONOMO.map((v) => VISTAS_CONTABILIDAD.find((x) => x[0] === v));

// Pantallas que no existen para un autónomo: la página lleva a otra.
export const SOLO_SOCIEDAD = ['/tesoreria/remesas'];
export const soloSociedad = (fiscal, path) => !esSociedad(fiscal) && SOLO_SOCIEDAD.some((r) => path === r || path.startsWith(`${r}/`));
// Cómo se llaman para un autónomo las pantallas que comparte con las sociedades (menú lateral y «Más»).
export const PARA_AUTONOMO = {
  '/contabilidad': { nombre: 'Libros registro', detalle: 'Libros de IVA e IRPF y amortizaciones', palabras: 'libros registro iva irpf amortizaciones bienes de inversion hacienda' },
  '/tesoreria': { detalle: 'Previsión de caja', palabras: 'prevision saldo liquidez caja' },
};

// Módulo del plan (lib/planes.js FUNCIONES) que hay detrás de cada pantalla del menú.
const FUNCION_DE = { '/inventario': 'inventario', '/albaranes': 'albaranes', '/cartera': 'cartera', '/tesoreria': 'tesoreria', '/analisis': 'analisis', '/proyectos': 'proyectos', '/nominas': 'nominas', '/jornada': 'nominas', '/asistente': 'asistente' };

// { href: 'Pro' }: las pantallas que su plan no incluye, con el plan más barato de su tipo que sí. Vacío durante la prueba
// (lo tiene todo), con plan Fundador o sin plan.
export function planesQueFaltan(plan) {
  const l = limitesDe(plan);
  if (!l || !PLANES[plan.tipo]) return {};
  const out = {};
  for (const [href, funcion] of Object.entries(FUNCION_DE)) {
    if (l.funciones.includes(funcion)) continue;
    const p = PLANES[plan.tipo].find((x) => limitesDe({ ...plan, pagado: true, nombre: x.n })?.funciones.includes(funcion));
    if (p) out[href] = p.n;
  }
  return out;
}
