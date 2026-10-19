// Facturas y gastos con los que se calculan los impuestos de un año: los mismos en Impuestos (app/modelos), en el
// Resumen (lib/panelCache.js) y en el fichero para la Sede (app/api/aeat), para que las cifras coincidan siempre.
// Facturas: el año y los cuatro anteriores (compensación del IVA), o todas con inventario (valoración del almacén).
// Gastos: todos (amortización de bienes de inversión de cualquier año y retenciones imputadas al pago).
import { leer } from './redis.js';
import { delosAnios } from './indices.js';
import { fiscalDe } from './empresa.js';

export async function datosImpuestos(u, anio) {
  const [facturas, gastos] = await Promise.all([
    fiscalDe(u).inventario ? leer(u, 'facturas') : delosAnios(u, Array.from({ length: 5 }, (_, i) => anio - i)).then((d) => d.facturas),
    leer(u, 'gastos'),
  ]);
  return { facturas: facturas || [], gastos: gastos || [] };
}
