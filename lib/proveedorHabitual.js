// Memoria por proveedor: lo que se eligió en su último gasto (categoría, IVA deducible, parte afecta, actividad…) se
// propone en la siguiente factura suya, leída con la cámara o llegada a la bandeja. La IA lee los importes; esto solo
// rellena lo que la factura no dice y que cada uno decide para ese proveedor.
import { documentos, todasFichas } from './indices.js';

const nif = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const nombre = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Mismo proveedor: el mismo NIF o, si a alguno le falta, el mismo nombre (la IA puede leer el NIF de una factura cuyo
// gasto anterior se apuntó sin él).
export function mismoProveedor(a, b) {
  const na = nif(a.proveedorNif), nb = nif(b.proveedorNif);
  if (na && nb) return na === nb;
  return Boolean(nombre(a.proveedor)) && nombre(a.proveedor) === nombre(b.proveedor);
}

const CAMPOS = ['categoria', 'deduciblePct', 'afectoPct', 'actividad', 'proyecto', 'alquiler', 'recc', 'irpfPct', 'clave190'];
const puesto = (v) => v !== undefined && v !== null && v !== '';

// gastos: los de ese proveedor, del más reciente al más antiguo. El concepto solo se repite si los dos últimos lo
// comparten (un recibo de cada mes: «Fibra de la oficina»); el de una compra suelta no sirve para la siguiente.
export function habitualDeGastos(gastos) {
  const [ultimo, anterior] = gastos || [];
  if (!ultimo) return null;
  const h = {};
  for (const c of CAMPOS) if (puesto(ultimo[c])) h[c] = ultimo[c];
  if (ultimo.concepto && anterior && ultimo.concepto === anterior.concepto) h.concepto = ultimo.concepto;
  return Object.keys(h).length ? { ...h, proveedor: ultimo.proveedor || '', fecha: ultimo.fecha } : null;
}

// Lo habitual de ese proveedor en la empresa (sin los bienes traídos de otro programa ni las nóminas).
export async function habitualDe(u, quien) {
  if (!nif(quien?.proveedorNif) && !nombre(quien?.proveedor)) return null;
  const fichas = (await todasFichas(u, 'gastos'))
    .filter((f) => !f.mi && !String(f.id).startsWith('nomina-') && mismoProveedor(quien, { proveedor: f.c, proveedorNif: f.n }))
    .sort((a, b) => String(b.f).localeCompare(String(a.f))).slice(0, 2);
  if (!fichas.length) return null;
  const gastos = (await documentos(u, 'gastos', fichas.map((f) => f.id))).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return habitualDeGastos(gastos);
}

// Para la respuesta del escáner: { habitual } o nada.
export async function conHabitual(u, leido) {
  try {
    const h = await habitualDe(u, { proveedor: leido?.proveedor, proveedorNif: leido?.nif });
    return h ? { habitual: h } : {};
  } catch { return {}; }
}

// Junta lo leído con lo habitual: la factura manda en lo que dice (importes, tipos, retención si la trae); lo habitual,
// en cómo lo clasifica cada uno.
export function conLoHabitual(propuesta, h) {
  if (!h) return propuesta;
  const p = { ...propuesta };
  for (const c of ['categoria', 'deduciblePct', 'afectoPct', 'actividad', 'proyecto', 'alquiler', 'recc']) if (puesto(h[c]) && !puesto(p[c])) p[c] = h[c];
  // La retención, solo si la factura no dice nada (null): un «sin retención» leído y comprobado (0) se respeta.
  if (puesto(h.irpfPct) && (p.irpfPct === null || p.irpfPct === undefined)) p.irpfPct = h.irpfPct;
  // La subclave del 190 (G01, G03, H04…), si la retención que queda es la de entonces.
  if (puesto(h.clave190) && !puesto(p.clave190) && Number(p.irpfPct) === Number(h.irpfPct)) p.clave190 = h.clave190;
  if (h.concepto) p.concepto = h.concepto;
  return p;
}
