// Facturas y gastos con los que se calculan los impuestos de un año: los mismos en Impuestos (app/modelos), en el
// Resumen (lib/panelCache.js) y en el fichero para la Sede (app/api/aeat), para que las cifras coincidan siempre.
// Facturas: el año y los cuatro anteriores (compensación del IVA), o todas con inventario (valoración del almacén).
// Gastos: todos (amortización de bienes de inversión de cualquier año y retenciones imputadas al pago).
import { leer } from './redis.js';
import { leerAnios } from './indices.js';
import { fiscalDe, usaIgic } from './empresa.js';
import { hoy } from './formato.js';

// Más las rectificativas de los años siguientes (hasta el actual): las que corrigen un error de una factura de este año
// cuentan en este año (fechaIva y fechaIrpf de lib/calculos.js).
export async function datosImpuestos(u, anio) {
  return (await datosImpuestosVarios(u, [anio]))[anio];
}

// Caché limitada a esta llamada: comparte gastos y años solapados sin ocultar cambios entre visitas.
export async function datosImpuestosVarios(u, anios) {
  const ys = [...new Set(anios.map(Number).filter(Boolean))];
  if (!ys.length) return {};
  const fiscal = fiscalDe(u), completo = fiscal.inventario || usaIgic(fiscal);
  const actual = Number(hoy().slice(0, 4));
  const ventanas = ys.map((anio) => ({ anio,
    antes: Array.from({ length: 5 }, (_, i) => anio - i),
    despues: Array.from({ length: Math.max(0, Math.min(4, actual - anio)) }, (_, i) => anio + 1 + i),
  }));
  const [facturas, gastos] = await Promise.all([
    completo ? leer(u, 'facturas') : leerAnios(u, 'facturas', ventanas.flatMap((v) => [...v.antes, ...v.despues])),
    leer(u, 'gastos'),
  ]);
  const porAnio = new Map();
  for (const f of facturas || []) {
    const y = Number(String(f.fecha || '').slice(0, 4));
    if (!porAnio.has(y)) porAnio.set(y, []);
    porAnio.get(y).push(f);
  }
  // Conserva el orden anterior: los cinco años descendentes y luego las rectificativas posteriores.
  return Object.fromEntries(ventanas.map(({ anio, antes, despues }) => [anio, {
    facturas: completo ? facturas || [] : [
      ...antes.flatMap((y) => porAnio.get(y) || []),
      ...despues.flatMap((y) => (porAnio.get(y) || []).filter((f) => f.rectifica)),
    ],
    gastos: gastos || [],
  }]));
}
