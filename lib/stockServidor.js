// Todo lo que mueve el stock de una empresa (lib/inventario.js): catálogo, facturas, gastos, ajustes y albaranes.
import { leer } from './redis.js';
import { nombresProyectos } from './proyectos.js';

export async function datosStock(u) {
  const [productos, facturas, gastos, ajustes, albaranes] = await Promise.all(['productos', 'facturas', 'gastos', 'stock', 'albaranes'].map((n) => leer(u, n)));
  return { productos: productos || [], facturas: facturas || [], gastos: gastos || [], ajustes: ajustes || [], albaranes: albaranes || [], sinBD: !facturas };
}

// Proyectos y centros de coste ya usados en facturas y gastos (lib/proyectos.js), para sugerirlos en los formularios.
export async function proyectosDe(u) {
  const [facturas, gastos] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos')]);
  return nombresProyectos(facturas || [], gastos || []);
}
