// Facturas y gastos con los que se calculan los impuestos de un año: los mismos en Impuestos (app/modelos), en el
// Resumen (lib/panelCache.js) y en el fichero para la Sede (app/api/aeat), para que las cifras coincidan siempre.
// Facturas: el año y los cuatro anteriores (compensación del IVA), o todas con inventario (valoración del almacén).
// Gastos: todos (amortización de bienes de inversión de cualquier año y retenciones imputadas al pago).
import { leer } from './redis.js';
import { delosAnios } from './indices.js';
import { fiscalDe, usaIgic } from './empresa.js';
import { hoy } from './formato.js';

// Más las rectificativas de los años siguientes (hasta el actual): las que corrigen un error de una factura de este año
// cuentan en este año (fechaIva y fechaIrpf de lib/calculos.js).
export async function datosImpuestos(u, anio) {
  const completo = fiscalDe(u).inventario || usaIgic(fiscalDe(u));
  const despues = Array.from({ length: Math.max(0, Math.min(4, Number(hoy().slice(0, 4)) - anio)) }, (_, i) => anio + 1 + i);
  const [facturas, gastos, posteriores] = await Promise.all([
    completo ? leer(u, 'facturas') : delosAnios(u, Array.from({ length: 5 }, (_, i) => anio - i)).then((d) => d.facturas),
    leer(u, 'gastos'),
    !completo && despues.length ? delosAnios(u, despues).then((d) => (d.facturas || []).filter((f) => f.rectifica)) : [],
  ]);
  return { facturas: [...(facturas || []), ...posteriores], gastos: gastos || [] };
}
