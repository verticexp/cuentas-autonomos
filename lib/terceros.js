// Fichas de clientes y proveedores: datos de contacto, forma de cobro o de pago, plazo, comercial asignado, zona
// geográfica, la vinculación del modelo 232 y, en los clientes, el riesgo máximo (lib/riesgo.js). Lógica pura, sin
// servidor.
//
// Cliente: se guarda en el hash «clientes» (id = nombre en mayúsculas, como siempre). Proveedor: en «fichasProv»
// (id = claveProveedor, lib/proveedores.js). Los campos de la ficha (los de CAMPOS_FICHA) los conserva guardarCliente
// cuando una factura actualiza los datos básicos del cliente.
import { IDIOMAS_FACTURA, monedaValida } from './idiomas.js';
import { numeroLocal, paisValido, validarNif } from './validacion.js';

export const FORMAS = [
  { id: 'transferencia', nombre: 'Transferencia' },
  { id: 'domiciliacion', nombre: 'Domiciliación SEPA' },
  { id: 'tarjeta', nombre: 'Tarjeta' },
  { id: 'efectivo', nombre: 'Efectivo' },
  { id: 'bizum', nombre: 'Bizum' },
  { id: 'recibo', nombre: 'Recibo bancario' },
  { id: 'pagare', nombre: 'Pagaré' },
  { id: 'cheque', nombre: 'Cheque' },
  { id: 'confirming', nombre: 'Confirming' },
];
export const nombreForma = (id) => FORMAS.find((f) => f.id === id)?.nombre || '';

// Vinculación del art. 18.2 de la Ley del Impuesto sobre Sociedades, para el modelo 232 (lib/modelos.js modelo232). La
// marca la empresa en la ficha del cliente o del proveedor: Fisquo no la deduce de los datos. `letra` es la del propio
// art. 18.2, que el 232 pide en la columna «Tipo vinculación» (el administrador y el consejero comparten la b).
export const TIPOS_VINCULO = {
  socio: { nombre: 'Socio o partícipe', letra: 'a', norma: 'art. 18.2.a LIS' },
  administrador: { nombre: 'Administrador de la sociedad', letra: 'b', norma: 'art. 18.2.b LIS' },
  consejero: { nombre: 'Consejero de la sociedad', letra: 'b', norma: 'art. 18.2.b LIS' },
  familiar: { nombre: 'Familiar de un socio, consejero o administrador', letra: 'c', norma: 'art. 18.2.c LIS' },
  grupo: { nombre: 'Sociedad del mismo grupo', letra: 'd', norma: 'art. 18.2.d LIS' },
  otra: { nombre: 'Otra vinculación', letra: '', norma: 'art. 18.2 LIS' },
};
export const nombreVinculo = (id) => TIPOS_VINCULO[id]?.nombre || '';

// Campo de la forma de cobro (cliente) o de pago (proveedor).
export const CAMPO_FORMA = { cliente: 'formaCobro', proveedor: 'formaPago' };
// Lo propio de la ficha, que no viene de las facturas: lo conserva guardarCliente al actualizar los datos básicos.
export const CAMPOS_FICHA = ['contacto', 'formaCobro', 'plazo', 'comercial', 'zona', 'riesgoMax', 'telefono', 'notas', 'idioma', 'moneda', 'vinculo', 'vinculoModulos'];
export const MAX_PLAZO = 365;
export const MAX_RIESGO = 1e9;

const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const vacio = (v) => v == null || (typeof v === 'string' && !v.trim());
export const idCliente = (nombre) => String(nombre || '').trim().toUpperCase();
// Con NIF en ambos manda la identidad fiscal, igual que en el portal y el riesgo exacto.
export function mismoCliente(a, b) {
  const nif = (c) => String(c?.nif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return nif(a) && nif(b) ? nif(a) === nif(b) : idCliente(a?.nombre) === idCliente(b?.nombre);
}

// b: el formulario. tipo: 'cliente' | 'proveedor'. Devuelve { ok, datos } o { ok: false, error, errores }.
// datos solo lleva los campos con valor; riesgoMax ausente = sin límite (0 = solo al contado, nada a crédito).
export function limpiarFicha(b, tipo = 'cliente') {
  b = b ?? {};
  const errores = {};
  const forma = CAMPO_FORMA[tipo];
  const largo = (campo, max, etiqueta) => {
    const v = texto(b[campo]);
    if (v.length > max) errores[campo] = `${etiqueta} no puede superar los ${max} caracteres`;
    return v.slice(0, max);
  };
  const nombre = largo('nombre', 120, 'El nombre');
  if (!nombre) errores.nombre = tipo === 'cliente' ? 'El nombre del cliente es obligatorio' : 'El nombre del proveedor es obligatorio';
  if (!vacio(b.pais) && !paisValido(b.pais)) errores.pais = 'El país debe ser un código de dos letras (ES, PT, US…)';
  const pais = paisValido(b.pais) ? b.pais.trim().toUpperCase() : undefined;
  const nifValidado = validarNif(b.nif, { pais });
  if (!nifValidado.ok) errores.nif = nifValidado.error;
  const email = texto(b.email).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.email = 'El email no es válido';
  const telefono = largo('telefono', 30, 'El teléfono');
  if (telefono && !/^[0-9+()\s.-]{6,30}$/.test(telefono)) errores.telefono = 'El teléfono solo puede llevar cifras, espacios y + ( ) . -';

  const formaElegida = texto(b[forma]);
  if (formaElegida && !FORMAS.some((x) => x.id === formaElegida)) errores[forma] = tipo === 'cliente' ? 'La forma de cobro no es válida' : 'La forma de pago no es válida';

  // Vinculación del art. 18.2 LIS (modelo 232). Las fichas de antes no la llevan: sin marca, no hay campo.
  const vinculo = texto(b.vinculo);
  if (vinculo && !TIPOS_VINCULO[vinculo]) errores.vinculo = 'El tipo de vinculación no es válido';
  const modulos = [true, 'true', 'on', '1', 1].includes(b.vinculoModulos);

  let plazo;
  if (!vacio(b.plazo)) {
    const n = numeroLocal(b.plazo);
    if (!Number.isInteger(n) || n < 0 || n > MAX_PLAZO) errores.plazo = `El plazo son días enteros, de 0 a ${MAX_PLAZO}`;
    else plazo = n;
  }

  let riesgoMax;
  if (tipo === 'cliente' && !vacio(b.riesgoMax)) {
    const n = numeroLocal(b.riesgoMax);
    if (!Number.isFinite(n) || n < 0 || n > MAX_RIESGO) errores.riesgoMax = 'El riesgo máximo debe ser un importe de 0 € en adelante (vacío = sin límite)';
    else riesgoMax = Math.round(n * 100) / 100;
  }

  const error = Object.values(errores)[0];
  if (error) return { ok: false, error, errores };
  const nif = nifValidado.nif || texto(b.nif);
  const datos = {
    nombre,
    nif: nif.slice(0, 20),
    direccion: largo('direccion', 120, 'La dirección'),
    ciudad: largo('ciudad', 120, 'La ciudad'),
    ...(email ? { email } : {}),
    ...(pais && pais !== 'ES' ? { pais } : {}),
    ...(telefono ? { telefono } : {}),
    // Persona con la que se trata («Pepe», de Can Joan): para el saludo de los correos y para entenderle por WhatsApp.
    ...(texto(b.contacto) ? { contacto: largo('contacto', 80, 'La persona de contacto') } : {}),
    ...(formaElegida ? { [forma]: formaElegida } : {}),
    ...(plazo !== undefined ? { plazo } : {}),
    ...(texto(b.comercial) ? { comercial: largo('comercial', 80, 'El comercial') } : {}),
    ...(texto(b.zona) ? { zona: largo('zona', 80, 'La zona') } : {}),
    ...(riesgoMax !== undefined ? { riesgoMax } : {}),
    ...(texto(b.notas) ? { notas: largo('notas', 500, 'Las notas') } : {}),
    // Parte vinculada del modelo 232 y, en su caso, persona física en módulos con el 25 % o más de la sociedad: todas
    // sus operaciones son entonces «específicas» (arts. 18.3 LIS y 16.5 RIS), con el límite propio de 100.000 €.
    ...(TIPOS_VINCULO[vinculo] ? { vinculo } : {}),
    ...(TIPOS_VINCULO[vinculo] && modulos ? { vinculoModulos: true } : {}),
    // Idioma y moneda de sus facturas (lib/idiomas.js): la factura nueva los toma al elegir al cliente. Español y euros, sin
    // guardar.
    ...(tipo === 'cliente' && IDIOMAS_FACTURA.some((x) => x.id === b.idioma) && b.idioma !== 'es' ? { idioma: b.idioma } : {}),
    ...(tipo === 'cliente' && monedaValida(b.moneda) && b.moneda !== 'EUR' ? { moneda: b.moneda } : {}),
  };
  return { ok: true, datos };
}

// Valores distintos ya usados (comercial, zona…), para sugerirlos en el formulario y en los filtros.
export const valoresDe = (fichas, campo) => [...new Set((fichas || []).map((f) => texto(f?.[campo])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

// Filtra una lista de fichas por comercial, zona y texto (nombre, NIF, email). Los filtros vacíos no filtran.
export function filtrarFichas(fichas, { comercial = '', zona = '', q = '' } = {}) {
  const t = String(q).trim().toLowerCase();
  const sin = (c, v) => (v === '__sin__' ? !texto(c) : texto(c) === v);
  return (fichas || []).filter((f) => (!comercial || sin(f.comercial, comercial)) && (!zona || sin(f.zona, zona))
    && (!t || [f.nombre, f.nif, f.email].some((x) => String(x || '').toLowerCase().includes(t))));
}
