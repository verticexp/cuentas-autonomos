// Del cuerpo de una petición a un gasto validado y normalizado: lo usan POST y PATCH de /api/gastos y la aprobación de la
// bandeja de facturas (lib/bandejaServidor.js), así un gasto aprobado desde la bandeja pasa las mismas comprobaciones.
import { leerImporte, nifUE, r2, COMPENSACION } from './calculos.js';
import { validarGasto } from './validacion.js';
import { afectoPctDe, deduciblePctDe, origenGasto } from './ivaDeducible.js';
import { actividadesDe, actividadValida, fiscalDe, usaIgic } from './empresa.js';
import { CATEGORIAS } from './categorias.js';
import { TIPOS_BIEN, inversionEditada } from './amortizaciones.js';
import { limpiarProyecto } from './proyectos.js';
import { huellaValida } from './justificantes.js';
import { venceValido } from './pagos.js';
import { SUBCLAVES_190 } from './modelos.js';
import { limpiarNoResidente } from './noResidentes.js';

const USOS_PRORRATA = ['gravadas', 'exentas'];

// Sin IVA en la factura, de dónde es el proveedor: 'es', 'ue' (otro país de la UE) o 'fuera'. Si no se dice y el NIF
// es un NIF-IVA de la UE, 'ue'. Con IVA, nada (lib/calculos.js origenGasto).
const origenDe = (b, ivaPct) => {
  if (ivaPct) return undefined;
  if (['es', 'ue', 'fuera'].includes(b.origen)) return b.origen;
  return b.proveedor && nifUE(b.proveedorNif) ? 'ue' : undefined;
};

// Retención que le haces a un profesional (por ejemplo, la gestoría): 15 % o 7 % (los que empiezan). Va en el 111.
// Profesionales (15 o 7 %), módulos (1 %) y agricultura (2 %): lib/validacion.js validarGasto.
const retencionDe = (b) => ([1, 2, 7, 15].includes(Number(b.irpfPct)) && !limpiarNoResidente(b.noResidente) ? Number(b.irpfPct) : undefined);
// Perceptor que no reside en España (lib/noResidentes.js): su retención va al 216 y al 296, no al 111 ni al 115/180; con
// ella no hay retención del IRPF.
const noResidenteDe = (b) => limpiarNoResidente(b.noResidente);
// Subclave del 190 de esa retención (lib/modelos.js SUBCLAVES_190: G01, G03, H04…): solo con retención, fuera del alquiler
// del local y si es de ese %. Sin elegirla, el 190 usa la que toca al % (clave190De).
const clave190De = (b, g) => (g.irpfPct && !g.alquiler && SUBCLAVES_190[b.clave190]?.pct === g.irpfPct ? b.clave190 : undefined);

// Categoría del plan contable (si no se elige, Fisquo la deduce del concepto) y bien de inversión (se amortiza en años).
const categoriaDe = (b) => (CATEGORIAS.some((c) => c.id === b.categoria) ? b.categoria : undefined);
const inversionDe = (b) => (b.inversion && TIPOS_BIEN.some((t) => t.id === b.inversion.tipo) ? { tipo: b.inversion.tipo } : undefined);
// Productos que entran al almacén con este gasto (inventario): [{ producto, cantidad, coste unitario sin IVA }].
const stockDe = (b) => {
  const l = (Array.isArray(b.stock) ? b.stock : []).slice(0, 50).map((x) => ({ producto: String(x.producto || ''), cantidad: Math.round((Number(String(x.cantidad).replace(',', '.')) || 0) * 1000) / 1000, coste: r2(leerImporte(x.coste) || 0) }))
    .filter((x) => /^[a-f0-9]{12}$/.test(x.producto) && x.cantidad > 0);
  return l.length ? l : undefined;
};

// Varios tipos de IVA (lib/calculos.js porTipo), ya validados: el de más base primero (es el ivaPct del gasto).
const porTipoDe = (b) => (Array.isArray(b.porTipo) && b.porTipo.length > 1
  ? b.porTipo.map((t) => ({ ivaPct: Number(t.ivaPct), base: r2(leerImporte(t.base)) })).sort((x, y) => Math.abs(y.base) - Math.abs(x.base)) : undefined);

// Factura del proveedor (opcional): su número y, si llegó como factura electrónica, en qué formato (facturae, ubl, cii).
const facturaDe = (b) => {
  const numero = String(b.numero || '').trim().slice(0, 40);
  return { ...(numero ? { numero } : {}), ...(['facturae', 'ubl', 'cii'].includes(b.efactura) ? { efactura: b.efactura } : {}) };
};

// Proveedor (opcional): nombre y NIF de quien emite el ticket o la factura.
const proveedorDe = (b) => {
  const nombre = String(b.proveedor || '').trim().slice(0, 80);
  const nif = String(b.proveedorNif || '').trim().toUpperCase().slice(0, 20);
  return { ...(nombre ? { proveedor: nombre } : {}), ...(nombre && nif ? { proveedorNif: nif } : {}) };
};

// Gasto nuevo → { gasto } o { error, errores, status }.
export function nuevoGasto(u, b) {
  const v = validarGasto(b, { igic: usaIgic(fiscalDe(u)) });
  if (!v.ok) return { error: v.error, errores: v.errores, status: 400 };
  const base = r2(leerImporte(b.base));
  const g = {
    id: crypto.randomUUID(),
    fecha: b.fecha,
    actividad: actividadValida(actividadesDe(u), b.actividad),
    concepto: String(b.concepto).trim().slice(0, 140),
    base,
    ...(usaIgic(fiscalDe(u)) ? { impuesto: 'igic', ...(b.isp === true ? { isp: true } : {}), ...(b.importacion === true ? { importacion: true } : {}) } : {}),
    ivaPct: Math.min(100, Math.max(0, Number(porTipoDe(b)?.[0].ivaPct ?? b.ivaPct) || 0)),
    ...(porTipoDe(b) ? { porTipo: porTipoDe(b) } : {}),
    ...proveedorDe(b),
    ...facturaDe(b),
    ...(limpiarProyecto(b.proyecto) ? { proyecto: limpiarProyecto(b.proyecto) } : {}),
    ...(b.pendiente ? { pendiente: true } : {}),
    // Vencimiento de la factura (lib/pagos.js): sin él, el del plazo del proveedor (lib/pagosServidor.js conVencimiento).
    ...(venceValido(b.vence, b.fecha) ? { vence: venceValido(b.vence, b.fecha) } : {}),
    ...(b.alquiler ? { alquiler: true } : {}),
    // Sociedades: no deducible en el Impuesto sobre Sociedades (art. 15 LIS), marcado o desmarcado a mano (lib/categorias.js).
    ...(typeof b.noDeducibleIS === 'boolean' ? { noDeducibleIS: b.noDeducibleIS } : {}),
    // Proveedor en el criterio de caja (lo dice su factura): su IVA se deduce al pagarlo (lib/calculos.js).
    ...(!usaIgic(fiscalDe(u)) && b.recc ? { recc: true } : {}),
    // Importación de bienes: el IVA lo liquida la Aduana con el DUA y va en las casillas 32 a 35 del 303.
    ...(!usaIgic(fiscalDe(u)) && b.importacion === true && Number(porTipoDe(b)?.[0].ivaPct ?? b.ivaPct) > 0 ? { importacion: true } : {}),
    // Prorrata especial (lib/calculos.js): uso solo en operaciones con derecho a deducir o solo en las exentas.
    ...(USOS_PRORRATA.includes(b.usoProrrata) ? { usoProrrata: b.usoProrrata } : {}),
    // Compra a quien está en el régimen de la agricultura: sin IVA, con la compensación del 12 o el 10,5 % (casilla 42).
    // La compensación del 12 o el 10,5 % es del REAGP del IVA: en Canarias (IGIC) no se aplica.
    ...(!usaIgic(fiscalDe(u)) && COMPENSACION.includes(Number(b.compensacion)) && !(Number(b.ivaPct) > 0) ? { compensacion: Number(b.compensacion) } : {}),
    ...(deduciblePctDe(b.deduciblePct) !== undefined ? { deduciblePct: deduciblePctDe(b.deduciblePct) } : {}),
    ...(afectoPctDe(b.afectoPct) !== undefined ? { afectoPct: afectoPctDe(b.afectoPct) } : {}),
    ...(categoriaDe(b) ? { categoria: categoriaDe(b) } : {}),
    ...(inversionDe(b) ? { inversion: inversionDe(b) } : {}),
    ...(stockDe(b) ? { stock: stockDe(b), categoria: categoriaDe(b) || '600' } : {}),
    // Huella del justificante que el navegador va a subir justo después (PUT /api/gastos/justificante): avisa de duplicados
    // ya al guardar. Al subirlo, el servidor la vuelve a calcular sobre el archivo.
    ...(huellaValida(b.huella) ? { archivo: { huella: b.huella } } : {}),
  };
  // Con varios tipos no hay autoliquidación (lib/validacion.js lo impide): el NIF europeo no la activa sola.
  if (!g.porTipo && origenDe(b, g.ivaPct)) g.origen = origenDe(b, g.ivaPct);
  if (origenGasto(g) && [4, 10].includes(Number(b.ivaAuto))) g.ivaAuto = Number(b.ivaAuto);
  if (retencionDe(b)) g.irpfPct = retencionDe(b);
  if (noResidenteDe(b)) g.noResidente = noResidenteDe(b);
  if (clave190De(b, g)) g.clave190 = clave190De(b, g);
  return { gasto: g };
}

// Gasto editado sobre el que había → { gasto } o { error, errores?, status? }.
export function gastoEditado(u, b, antes) {
  const v = validarGasto(b, { antes, igic: usaIgic(fiscalDe(u)) });
  if (!v.ok) return { error: v.error, errores: v.errores, status: 400 };
  const base = r2(leerImporte(b.base));
  const g = { ...antes, fecha: b.fecha, actividad: actividadValida(actividadesDe(u), b.actividad), concepto: String(b.concepto).trim().slice(0, 140), base, ivaPct: Math.min(100, Math.max(0, Number(porTipoDe(b)?.[0].ivaPct ?? b.ivaPct) || 0)), porTipo: porTipoDe(b), proveedor: undefined, proveedorNif: undefined, ...proveedorDe(b), numero: undefined, efactura: antes.efactura, ...facturaDe(b), proyecto: limpiarProyecto(b.proyecto) || undefined, pendiente: b.pendiente ? true : undefined, vence: venceValido(b.vence, b.fecha), alquiler: b.alquiler ? true : undefined, noDeducibleIS: typeof b.noDeducibleIS === 'boolean' ? b.noDeducibleIS : antes.noDeducibleIS, impuesto: usaIgic(fiscalDe(u)) ? 'igic' : antes.impuesto, isp: usaIgic(fiscalDe(u)) && b.isp === true ? true : undefined, importacion: b.importacion === true && (usaIgic(fiscalDe(u)) || Number(porTipoDe(b)?.[0].ivaPct ?? b.ivaPct) > 0) ? true : undefined, usoProrrata: USOS_PRORRATA.includes(b.usoProrrata) ? b.usoProrrata : undefined, recc: !usaIgic(fiscalDe(u)) && b.recc ? true : undefined, compensacion: !usaIgic(fiscalDe(u)) && COMPENSACION.includes(Number(b.compensacion)) && !(Number(b.ivaPct) > 0) ? Number(b.compensacion) : undefined, deduciblePct: deduciblePctDe(b.deduciblePct), afectoPct: afectoPctDe(b.afectoPct), categoria: stockDe(b) ? categoriaDe(b) || '600' : categoriaDe(b), inversion: inversionEditada(inversionDe(b), antes.inversion), stock: stockDe(b) };
  g.origen = g.porTipo ? undefined : origenDe(b, g.ivaPct);
  delete g.ivaAuto;
  if (origenGasto(g) && [4, 10].includes(Number(b.ivaAuto))) g.ivaAuto = Number(b.ivaAuto);
  g.irpfPct = retencionDe(b);
  g.noResidente = noResidenteDe(b);
  g.clave190 = clave190De(b, g);
  if (antes.inversion?.acumulada !== undefined && !g.inversion) return { error: 'Este bien trae su amortización de otro programa: no se puede dejar de amortizar desde aquí' };
  return { gasto: g };
}
