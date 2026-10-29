// Clientes «solo documentos» de un despacho: empresas que no llevan sus cuentas en Fisquo. Su gestoría los da de alta desde
// Mi despacho (con la suscripción del panel, lib/panelDocumentos.js) y el cliente solo sube tickets y facturas (de gasto y
// de venta) desde /documentos, o los reenvía a su buzón (lib/buzon.js). La IA los lee y la gestoría los revisa, los
// corrige y los exporta por trimestre a su programa de contabilidad (lib/exportarContable.js).
//
//   empresa.documentos = { despacho, desde }        marca del perfil; al pasar a Fisquo completo se quita y no se pierde nada
//   documentos:<empresa>  hash id → documento
//   documento = { id, recibido, origen: 'subida'|'correo', nombre, archivo, estado, por?, correo?: { de, asunto },
//                 tipo?: 'gasto'|'ingreso', datos?, avisos?: [código], revisado?: { fecha, por, nombre }, corregido?, error? }
//   datos = { tercero, nif, fecha, numero, concepto, base, ivaPct, desglose?: [{ ivaPct, base, cuota }], cuota, irpf,
//             irpfPct, total, categoria }
//
// Estados: 'leyendo' (en la cola), 'revisar' (leído, la gestoría aún no lo ha revisado), 'revisado', 'error' (no se pudo
// leer: se corrige a mano o se vuelve a leer), 'cuarentena' (por correo de un remitente desconocido: no gasta lecturas).
// Sin dependencias de servidor: lo usan las pantallas, el servidor y las pruebas.
import { categoriaDe, CATEGORIAS } from './categorias.js';
import { normalizarNumero } from './duplicados.js';
import { r2 } from './redondeo.js';

export const MAX_DOCUMENTOS = 3000;
export const ESTADOS = ['leyendo', 'revisar', 'revisado', 'error', 'cuarentena'];
export const ESTADOS_TEXTO = { leyendo: 'Leyendo', revisar: 'Por revisar', revisado: 'Revisado', error: 'No se ha podido leer', cuarentena: 'Remitente desconocido' };
export const TIPOS = { gasto: 'Gasto', ingreso: 'Ingreso' };
export const CATEGORIA_INGRESO = { '705': 'Ventas y servicios' };
const TIPOS_IVA = [21, 10, 5, 4, 2, 0];
const IRPF = [0, 1, 2, 7, 15, 19];
export const idValido = (id) => /^d[a-f0-9]{16}$/.test(String(id || ''));

// Avisos para la gestoría: lo que falta o no se lee bien.
export const AVISOS = {
  ilegible: 'Foto borrosa o ilegible',
  'sin-nif': 'Sin NIF',
  duplicado: 'Posible duplicado',
  'no-cuadra': 'Los importes no cuadran',
  fecha: 'Fecha dudosa',
  'sin-importe': 'Sin importe',
  'sin-tipo': 'No se sabe si es gasto o ingreso',
};

export { esSoloDocumentos, soloDocumentos, permitidoDocumentos, NO_PERMITIDO } from './perfilDocumentos.js';
import { esSoloDocumentos } from './perfilDocumentos.js';

// ---- Lectura

const texto = (v, n) => (v ? String(v).trim().slice(0, n) : '');
const nif = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');
export const mismoNif = (a, b) => Boolean(nif(a)) && nif(a) === nif(b);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? r2(Number(v)) : null);

// Gasto o ingreso: si quien emite la factura es el propio cliente, es una venta; si el cliente es el receptor, un gasto.
// Sin NIF que lo diga, lo que entendió la IA (y si no lo sabe, gasto: es lo que más se sube).
export function clasificar(leido, empresa) {
  const propio = empresa?.emisor?.nif;
  if (propio && mismoNif(leido?.emisorNif, propio)) return 'ingreso';
  if (propio && mismoNif(leido?.receptorNif, propio)) return 'gasto';
  return leido?.sentido === 'venta' ? 'ingreso' : 'gasto';
}

// La lectura (lib/ticket.js limpiarTicket con los datos de lib/ticket.js limpiarDocumento) → { tipo, datos, legible }.
export function documentoDeLectura(gasto, extra, empresa) {
  const tipo = clasificar(extra, empresa);
  const tercero = tipo === 'ingreso' ? extra?.receptor || '' : extra?.emisor || gasto?.proveedor || '';
  const nifTercero = tipo === 'ingreso' ? extra?.receptorNif || '' : extra?.emisorNif || gasto?.nif || '';
  const desglose = (Array.isArray(gasto?.desglose) ? gasto.desglose : []).filter((d) => d.base);
  const base = num(gasto?.base);
  const cuota = desglose.length ? (desglose.every((d) => d.cuota !== null) ? r2(desglose.reduce((s, d) => s + d.cuota, 0)) : null) : base !== null ? r2(base * (gasto.ivaPct || 0) / 100) : null;
  const irpf = num(gasto?.irpf) ?? (base !== null && gasto?.irpfPct ? r2(base * gasto.irpfPct / 100) : null);
  const datos = {
    tercero: texto(tercero, 80), nif: nif(nifTercero).slice(0, 20), fecha: gasto?.fecha || '', numero: texto(gasto?.numero, 40),
    concepto: texto(gasto?.concepto, 140), base, ivaPct: TIPOS_IVA.includes(gasto?.ivaPct) ? gasto.ivaPct : 21,
    ...(desglose.length > 1 ? { desglose: desglose.map((d) => ({ ivaPct: d.ivaPct, base: r2(d.base), cuota: d.cuota })) } : {}),
    cuota, irpf, irpfPct: IRPF.includes(gasto?.irpfPct) ? gasto.irpfPct : 0, total: num(extra?.total),
  };
  if (datos.total === null && base !== null && cuota !== null) datos.total = r2(base + cuota - (irpf || 0));
  datos.categoria = tipo === 'ingreso' ? '705' : categoriaDe({ concepto: datos.concepto, proveedor: datos.tercero });
  return { tipo, datos, legible: extra?.legible !== false, cuadra: gasto?.cuadra, fechaDudosa: Boolean(gasto?.fechaDudosa) };
}

// Los avisos de un documento, mirando también los demás (duplicados: el mismo archivo, o el mismo número del mismo NIF,
// o el mismo total y fecha del mismo tercero).
export function avisosDe(doc, docs = []) {
  const d = doc.datos;
  if (!d || doc.estado === 'leyendo' || doc.estado === 'cuarentena') return [];
  const a = [];
  // Una vez corregido a mano, lo leído ya no manda: la foto borrosa deja de ser un aviso.
  if (doc.legible === false && !doc.corregido) a.push('ilegible');
  if (!d.nif) a.push('sin-nif');
  if (!(d.base > 0) && !(d.total > 0)) a.push('sin-importe');
  if (!doc.corregido && doc.cuadra === false) a.push('no-cuadra');
  if (!doc.corregido && doc.fechaDudosa) a.push('fecha');
  if (duplicadoDe(doc, docs)) a.push('duplicado');
  return a;
}
export function duplicadoDe(doc, docs) {
  const d = doc.datos || {};
  return docs.find((o) => {
    if (o.id === doc.id || !o.datos || o.descartado) return false;
    if (doc.archivo?.huella && o.archivo?.huella === doc.archivo.huella) return true;
    if (o.tipo !== doc.tipo) return false;
    const mismo = d.nif ? mismoNif(o.datos.nif, d.nif) : texto(o.datos.tercero, 80).toLowerCase() === texto(d.tercero, 80).toLowerCase() && Boolean(d.tercero);
    if (!mismo) return false;
    if (d.numero && o.datos.numero) return normalizarNumero(d.numero) === normalizarNumero(o.datos.numero);
    return Boolean(d.fecha) && o.datos.fecha === d.fecha && d.total > 0 && o.datos.total === d.total;
  })?.id || null;
}

// ---- Correcciones de la gestoría (o del cliente antes de que se revise): solo los campos conocidos, ya limpios.
export function limpiarDatos(b = {}, antes = {}) {
  const out = { ...antes };
  const errores = {};
  if (b.tercero !== undefined) out.tercero = texto(b.tercero, 80);
  if (b.nif !== undefined) out.nif = nif(b.nif).slice(0, 20);
  if (b.numero !== undefined) out.numero = texto(b.numero, 40);
  if (b.concepto !== undefined) out.concepto = texto(b.concepto, 140);
  if (b.fecha !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha)) || Number.isNaN(Date.parse(b.fecha))) errores.fecha = 'Fecha no válida';
    else out.fecha = b.fecha;
  }
  for (const k of ['base', 'cuota', 'irpf', 'total']) {
    if (b[k] === undefined) continue;
    const v = b[k] === '' || b[k] === null ? null : Number(String(b[k]).replace(',', '.'));
    if (v !== null && !Number.isFinite(v)) errores[k] = 'Importe no válido';
    else out[k] = v === null ? null : r2(v);
  }
  if (b.ivaPct !== undefined) {
    if (!TIPOS_IVA.includes(Number(b.ivaPct))) errores.ivaPct = 'Tipo de IVA no válido';
    else { out.ivaPct = Number(b.ivaPct); delete out.desglose; }
  }
  if (b.irpfPct !== undefined) {
    if (!IRPF.includes(Number(b.irpfPct))) errores.irpfPct = 'Retención no válida';
    else out.irpfPct = Number(b.irpfPct);
  }
  if (b.categoria !== undefined) {
    if (![...CATEGORIAS.map((c) => c.id), ...Object.keys(CATEGORIA_INGRESO)].includes(String(b.categoria))) errores.categoria = 'Categoría no válida';
    else out.categoria = String(b.categoria);
  }
  // Cambiar la base o el tipo sin tocar la cuota: la cuota se recalcula (con un solo tipo).
  if ((b.base !== undefined || b.ivaPct !== undefined) && b.cuota === undefined && !out.desglose && out.base !== null) out.cuota = r2(out.base * (out.ivaPct || 0) / 100);
  if ((b.base !== undefined || b.irpfPct !== undefined) && b.irpf === undefined && out.base !== null) out.irpf = r2(out.base * (out.irpfPct || 0) / 100);
  if (['base', 'cuota', 'irpf', 'ivaPct', 'irpfPct'].some((k) => b[k] !== undefined) && b.total === undefined && out.base !== null) out.total = r2(out.base + (out.cuota || 0) - (out.irpf || 0));
  return Object.keys(errores).length ? { errores } : { datos: out };
}

// ---- Trimestres

export const trimestreDe = (fecha) => (/^\d{4}-\d{2}/.test(String(fecha || '')) ? { anio: Number(fecha.slice(0, 4)), t: Math.ceil(Number(fecha.slice(5, 7)) / 3) } : null);
// La fecha que manda: la del documento; si aún no se ha leído, la de llegada.
export const fechaDe = (doc) => doc.datos?.fecha || String(doc.recibido || '').slice(0, 10);
export const delTrimestre = (docs, anio, t) => docs.filter((d) => {
  const q = trimestreDe(fechaDe(d));
  return q && q.anio === Number(anio) && q.t === Number(t);
});

export function resumen(docs) {
  const r = { total: docs.length, leyendo: 0, revisar: 0, revisado: 0, error: 0, cuarentena: 0, conAvisos: 0, gastos: 0, ingresos: 0, baseGastos: 0, baseIngresos: 0 };
  for (const d of docs) {
    r[d.estado] = (r[d.estado] || 0) + 1;
    if (d.avisos?.length) r.conAvisos++;
    if (!d.datos) continue;
    if (d.tipo === 'ingreso') { r.ingresos++; r.baseIngresos = r2(r.baseIngresos + (d.datos.base || 0)); }
    else { r.gastos++; r.baseGastos = r2(r.baseGastos + (d.datos.base || 0)); }
  }
  return r;
}

const PESO = { error: 0, revisar: 1, leyendo: 2, cuarentena: 3, revisado: 4 };
export const ordenar = (docs) => [...docs].sort((a, b) => (PESO[a.estado] ?? 9) - (PESO[b.estado] ?? 9) || fechaDe(b).localeCompare(fechaDe(a)) || String(b.recibido).localeCompare(String(a.recibido)));

// Lo que ve cada uno. El cliente: su lista, sin los avisos internos ni quién lo corrigió.
export const paraGestoria = (d) => ({ ...d, archivo: d.archivo ? { tipo: d.archivo.tipo, tamano: d.archivo.tamano } : null });
export const paraCliente = (d) => ({
  id: d.id, recibido: d.recibido, origen: d.origen, nombre: d.nombre, estado: d.estado === 'revisado' ? 'revisado' : d.estado === 'error' ? 'error' : d.estado === 'cuarentena' ? 'cuarentena' : d.estado === 'leyendo' ? 'leyendo' : 'recibido',
  tipo: d.tipo || null, ...(d.datos ? { tercero: d.datos.tercero, fecha: d.datos.fecha, total: d.datos.total } : {}), archivo: d.archivo ? { tipo: d.archivo.tipo } : null,
});

// ---- A la contabilidad: los documentos revisados, como facturas emitidas y gastos mínimos para generarAsientos y el
// registro de IVA (lib/asientos.js, lib/exportarContable.js). El número de la venta es el suyo (importada).
export function aContabilidad(docs) {
  const facturas = [], gastos = [];
  for (const d of docs) {
    const x = d.datos;
    if (!x || !(x.base > 0 || x.base < 0) || !x.fecha) continue;
    const porTipo = x.desglose?.length > 1 ? x.desglose.map((t) => ({ ivaPct: t.ivaPct, base: t.base })) : undefined;
    const comun = { id: d.id, fecha: x.fecha, base: x.base, ivaPct: x.ivaPct ?? 21, irpfPct: x.irpfPct || 0, ...(porTipo ? { porTipo } : {}), concepto: x.concepto || '' };
    if (d.tipo === 'ingreso') facturas.push({ ...comun, importada: x.numero || d.id, serie: '', numero: 0, anio: Number(x.fecha.slice(0, 4)), cliente: { nombre: x.tercero || '', nif: x.nif || '' } });
    else gastos.push({ ...comun, proveedor: x.tercero || '', proveedorNif: x.nif || '', ...(x.numero ? { numero: x.numero } : {}), categoria: x.categoria || '629' });
  }
  return { facturas, gastos };
}
