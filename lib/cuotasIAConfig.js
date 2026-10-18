// Páginas enviadas a lectura IA por empresa y mes natural (Europa/Madrid), también pagando al año.
export const ESCANEOS_MES = {
  aut: { Esencial: 50, Pro: 200, Plus: 500 },
  pym: { Esencial: 200, Pro: 600, Plus: 1500 },
  // Catálogo histórico; las nuevas propuestas Business acuerdan su capacidad por contacto.
  gra: { Esencial: 1000, Pro: 2000, Plus: 3000 },
};
export const ESCANEOS_PRUEBA = 50;
export const MAX_PAGINAS_IA = 10;
export const esPruebaIA = (plan) => Boolean(plan?.estado === 'trialing' || (plan?.hasta && !plan.pagado));
export function escaneosDe(plan) {
  if (esPruebaIA(plan)) return ESCANEOS_PRUEBA;
  // Capacidad Business acordada y guardada por administración, nunca desde un formulario público.
  if (plan?.tipo === 'gra' && Number.isSafeInteger(plan.escaneosMensuales) && plan.escaneosMensuales > 0) return plan.escaneosMensuales;
  const capacidad = ESCANEOS_MES[plan?.tipo]?.[plan?.nombre];
  return Number.isSafeInteger(capacidad) && capacidad > 0 ? capacidad : ESCANEOS_PRUEBA;
}
