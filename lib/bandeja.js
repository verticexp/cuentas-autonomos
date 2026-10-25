// Bandeja de facturas recibidas: lo que llega (subido de varios en varios, reenviado por correo o compartido desde el
// móvil) se guarda con su archivo, se lee en segundo plano y espera a que alguien lo apruebe como gasto. Nada se apunta
// solo, salvo los proveedores marcados «de confianza» con una factura que cuadra (lib/bandejaServidor.js).
//
//   bandeja:<empresa>   hash id → documento
//   documento = { id, recibido, origen: 'subida'|'correo'|'compartido', nombre, por?, correo?: { de, deNombre, asunto },
//                 archivo, estado, propuesta?, avisos?, duplicados?, banco?, habitual?, error?, leyendoDesde?, gasto? }
//
// Estados: 'leyendo' (en la cola), 'revisar' (leída, espera aprobación), 'error' (no se pudo leer: se apunta a mano o se
// vuelve a leer), 'cuarentena' (de un remitente desconocido: no gasta lecturas hasta que se pida), 'aprobado' (lo aprobó
// la regla de confianza; se ve unos días para poder deshacerlo).
// Sin dependencias de servidor: lo usan la pantalla, el servidor y las pruebas.
import { importes, r2 } from './calculos.js';

export const MAX_BANDEJA = 300;
export const DIAS_APROBADOS = 30;
export const ESTADOS = ['leyendo', 'revisar', 'error', 'cuarentena', 'aprobado'];
export const idValido = (id) => /^b[a-f0-9]{16}$/.test(String(id || ''));
export const nombreArchivo = (s) => String(s || '').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 120) || 'factura';

const texto = (v, n) => (v ? String(v).trim().slice(0, n) : '');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// Lo leído por la IA (lib/ticket.js limpiarTicket) → propuesta de gasto para el formulario. Los importes, como números;
// irpfPct, null si la factura no dice nada (lo habitual del proveedor puede completarlo: lib/proveedorHabitual.js).
// hoy: con un vencimiento que aún no ha llegado, la factura se propone sin pagar.
export function propuestaDeTicket(t, hoy = '') {
  const desglose = (Array.isArray(t?.desglose) ? t.desglose : []).filter((d) => d.base);
  return {
    proveedor: texto(t?.proveedor, 80), proveedorNif: texto(t?.nif, 20).toUpperCase(), concepto: texto(t?.concepto || t?.proveedor, 140),
    ...(t?.numero ? { numero: texto(t.numero, 40) } : {}),
    base: num(t?.base) > 0 ? r2(t.base) : null, ivaPct: num(t?.ivaPct) ?? 21, irpfPct: [0, 1, 2, 7, 15].includes(t?.irpfPct) ? t.irpfPct : null,
    fecha: t?.fecha || '', ...(t?.fechaDudosa ? { fechaDudosa: true } : {}),
    ...(t?.vence ? { vence: t.vence, ...(hoy && t.vence >= hoy ? { pendiente: true } : {}) } : {}),
    ...(desglose.length > 1 ? { desglose: desglose.map((d) => ({ ivaPct: d.ivaPct, base: r2(d.base) })) } : {}),
    cuadra: t?.cuadra ?? (num(t?.base) > 0 ? null : false),
    avisos: Array.isArray(t?.avisos) ? t.avisos.slice(0, 6) : [],
  };
}

// Factura electrónica (lib/facturae.js leerFacturaElectronica): todos sus datos son exactos, sin IA.
export function propuestaDeEfactura(t, hoy) {
  const desglose = (t.desglose || []).filter((d) => d.base);
  return {
    proveedor: texto(t.proveedor?.nombre, 80), proveedorNif: texto(t.proveedor?.nif, 20).toUpperCase(), concepto: texto(t.concepto || t.proveedor?.nombre, 140),
    base: r2(t.base), ivaPct: t.ivaPct, irpfPct: [1, 2, 7, 15].includes(Number(t.irpfPct)) ? Number(t.irpfPct) : 0,
    fecha: t.fecha, numero: texto(t.numero, 40), efactura: t.formato,
    // Con vencimiento posterior a hoy, aún no está pagada; el vencimiento queda para los pagos (lib/pagos.js).
    ...(/^\d{4}-\d{2}-\d{2}$/.test(t.vencimiento || '') && t.vencimiento >= t.fecha ? { vence: t.vencimiento } : {}),
    ...(t.vencimiento && t.vencimiento > (hoy || t.fecha) ? { pendiente: true } : {}),
    ...(desglose.length > 1 ? { desglose: desglose.map((d) => ({ ivaPct: d.pct, base: r2(d.base) })) } : {}),
    cuadra: true, avisos: [],
  };
}

// Total que se paga al proveedor con la propuesta (lo que casa con el cargo del banco).
export const totalPropuesta = (p) => (p?.base > 0 ? importes({ base: p.base, ivaPct: p.ivaPct, irpfPct: p.irpfPct || 0, alquiler: p.alquiler, ...(p.noResidente ? { noResidente: p.noResidente } : {}), ...(p.desglose ? { porTipo: p.desglose } : {}) }).total : 0);

// Se puede aprobar sin abrirla: leída, con importes que cuadran, fecha clara y sin avisos ni posibles duplicados (con
// varios tipos de IVA también: el gasto los guarda por separado, lib/calculos.js porTipo).
export function cuadra(doc) {
  const p = doc?.propuesta;
  return Boolean(doc?.estado === 'revisar' && p && p.base > 0 && p.cuadra === true && !p.fechaDudosa && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha || '')
    && p.concepto && !(p.avisos || []).length && !(doc.duplicados || []).length);
}

// Lo que ve la pantalla de un documento (sin la clave del archivo ni nada interno).
export function paraPantalla(d) {
  return {
    id: d.id, recibido: d.recibido, origen: d.origen, nombre: d.nombre, estado: d.estado,
    tipo: d.archivo?.tipo || '', tamano: d.archivo?.tamano || 0,
    ...(d.correo ? { correo: { de: d.correo.de, deNombre: d.correo.deNombre || '', asunto: d.correo.asunto || '' } } : {}),
    ...(d.propuesta ? { propuesta: d.propuesta, total: totalPropuesta(d.propuesta) } : {}),
    ...(d.duplicados?.length ? { duplicados: d.duplicados } : {}),
    ...(d.banco ? { banco: d.banco } : {}),
    ...(d.habitual ? { habitual: d.habitual } : {}),
    ...(d.error ? { error: d.error } : {}),
    ...(d.gasto ? { gasto: d.gasto } : {}),
    cuadra: cuadra(d),
  };
}

// Orden de la bandeja: lo que necesita a alguien primero (por revisar, con problemas, cuarentena), después lo que se está
// leyendo y al final lo aprobado solo; dentro de cada grupo, lo más reciente arriba.
const PESO = { revisar: 0, error: 1, cuarentena: 2, leyendo: 3, aprobado: 4 };
export const ordenar = (docs) => [...docs].sort((a, b) => (PESO[a.estado] ?? 9) - (PESO[b.estado] ?? 9) || String(b.recibido).localeCompare(String(a.recibido)));

export function resumen(docs) {
  const n = { revisar: 0, error: 0, cuarentena: 0, leyendo: 0, aprobado: 0, cuadran: 0 };
  for (const d of docs || []) { if (n[d.estado] !== undefined) n[d.estado] += 1; if (cuadra(d)) n.cuadran += 1; }
  return { ...n, pendientes: n.revisar + n.error + n.cuarentena + n.leyendo };
}

// Los aprobados por la regla de confianza se quitan de la bandeja pasados DIAS_APROBADOS (el gasto sigue en Gastos).
export const caducado = (d, ahora = Date.now()) => d.estado === 'aprobado' && ahora - Date.parse(d.recibido || 0) > DIAS_APROBADOS * 864e5;
