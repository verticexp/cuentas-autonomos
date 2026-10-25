import { TIPOS_IGIC } from './igic.js';
import { nifUE, leerImporte, baseLinea, r2 } from './calculos.js';
import { errorOperacion } from './operaciones.js';
import { NOMBRES_UE, tiposPais } from './oss.js';
import { CAUSAS_SIN_RETENCION, REF_CATASTRAL, SITUACIONES_INMUEBLE } from './modelos.js';
import { errorNoResidente } from './noResidentes.js';

// Ley 37/1992, arts. 90-91: 4/10/21; 0 exención/no sujeción; REVISAR 2/5 y tipos temporales según fecha y operación.
export const TIPOS_IVA = Object.freeze([0, 2, 4, 5, 10, 21]);
// Reglamento IRPF (RD 439/2007), arts. 80 y 95: 1/2/7/15/19 y 0 sin retención; REVISAR aplicación a cada actividad.
export const TIPOS_IRPF = Object.freeze([0, 1, 2, 7, 15, 19]);

export function fechaReal(s) {
  if (typeof s !== 'string' || s.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [anio, mes, dia] = s.split('-').map(Number);
  if (anio < 2000 || anio > 2100 || mes < 1 || mes > 12 || dia < 1) return false;
  const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
  return dia <= [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
}

const compacto = (nif) => typeof nif === 'string' ? nif.toUpperCase().replace(/[\s.-]/g, '') : '';
const sinES = (nif) => compacto(nif).replace(/^ES/, '');
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';

export function nifEspanolValido(nif) {
  const n = sinES(nif);
  if (/^\d{8}[A-Z]$/.test(n)) return n[8] === LETRAS_DNI[Number(n.slice(0, 8)) % 23];
  if (/^[XYZKLM]\d{7}[A-Z]$/.test(n)) {
    const prefijo = { X: '0', Y: '1', Z: '2', K: '0', L: '0', M: '0' }[n[0]];
    return n[8] === LETRAS_DNI[Number(prefijo + n.slice(1, 8)) % 23];
  }
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(n)) return false;
  // Control CIF: pares + suma de cifras del doble de impares; complemento a 10.
  let suma = 0;
  for (let i = 1; i <= 7; i++) {
    const digito = Number(n[i]);
    const doble = digito * 2;
    suma += i % 2 ? Math.floor(doble / 10) + doble % 10 : digito;
  }
  const control = (10 - suma % 10) % 10;
  const letra = 'JABCDEFGHI'[control];
  if ('ABEH'.includes(n[0])) return n[8] === String(control);
  if ('NPQRSW'.includes(n[0])) return n[8] === letra;
  return n[8] === String(control) || n[8] === letra;
}

// pais: código ISO-2 de la contraparte (ES si falta). Un identificador de otro país no se juzga con el control español
// (el EIN de EE. UU. es «12-3456789»): de la UE se exige el NIF-IVA con el prefijo de su país; de fuera, un formato genérico.
const PAISES_UE = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'GR', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI'];
export const paisValido = (p) => typeof p === 'string' && /^[A-Za-z]{2}$/.test(p.trim());
export function validarNif(nif, { pais } = {}) {
  if (nif == null || (typeof nif === 'string' && !nif.trim())) return { ok: true, tipo: '' };
  if (typeof nif !== 'string') return { ok: false, error: 'El identificador fiscal debe ser texto' };
  const cc = paisValido(pais) ? pais.trim().toUpperCase() : 'ES';
  if (cc !== 'ES') {
    const c = compacto(nif);
    if (PAISES_UE.includes(cc)) {
      const prefijo = cc === 'GR' ? 'EL' : cc;
      const completo = c.startsWith(prefijo) ? c : prefijo + c;
      return nifUE(completo)
        ? { ok: true, tipo: 'ue', pais: cc, nif: completo }
        : { ok: false, error: `El NIF-IVA de la UE (${cc}) no es válido: con el prefijo de su país y sin espacios` };
    }
    return /^[A-Z0-9-]{3,20}$/.test(nif.trim().toUpperCase())
      ? { ok: true, tipo: 'otro', pais: cc }
      : { ok: false, error: `El identificador fiscal (${cc}) debe tener entre 3 y 20 letras, números o guiones` };
  }
  const n = sinES(nif);
  if ((n.length === 9 && /^[0-9XYZKLMABCDEFGHJNPQRSUVW]/.test(n)) || compacto(nif).startsWith('ES')) {
    return nifEspanolValido(nif)
      ? { ok: true, tipo: 'es' }
      : { ok: false, error: 'El NIF español no es válido: comprueba su formato y carácter de control. Si es de otro país, indícalo en País' };
  }
  if (nifUE(nif)) return { ok: true, tipo: 'ue' };
  // Reconocer los prefijos con la misma lista de países que nifUE, sin duplicarla.
  if (nifUE(compacto(nif).slice(0, 2) + '00')) return { ok: false, error: 'El formato del NIF-IVA de la UE no es válido' };
  return /^[A-Z0-9-]{3,20}$/.test(nif.trim().toUpperCase())
    ? { ok: true, tipo: 'otro' }
    : { ok: false, error: 'El identificador extranjero debe tener entre 3 y 20 letras, números o guiones' };
}

const vacio = (v) => v == null || (typeof v === 'string' && !v.trim());
// leerImporte admite separadores locales, pero también elimina letras: validar antes de convertir.
function numero(v, defecto = NaN) {
  if (vacio(v)) return defecto;
  if (typeof v === 'number') return Number.isFinite(v) ? leerImporte(v) : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|[.,]\d+)$/.test(s)) return NaN;
  const n = leerImporte(s);
  return Number.isFinite(n) ? n : NaN;
}

const texto = (v) => typeof v === 'string' ? v.trim() : '';
// Número escrito a la española o con punto decimal ("1.234,50"); NaN si no lo es. Para las fichas de clientes y proveedores.
export const numeroLocal = numero;
// Un importe o una cantidad escritos a mano: como numeroLocal, pero admite espacios y el símbolo € («1 800 €»), que
// leerImporte siempre aceptó. Sigue rechazando letras, Infinity y lo que no sea un número.
export const importeEscrito = (v, defecto) => numero(typeof v === 'string' ? v.replace(/[\s\u00A0€]/g, '') : v, defecto);

// Factura sin ningún NIF del destinatario en una venta en España: solo puede ser simplificada (arts. 4, 6.1.d y 7 del
// Reglamento de facturación). Las de la ventanilla única y las de clientes de otro país no lo son: en la completa, su NIF
// no es obligatorio (art. 6.1.d). Lo usan la validación (límite del art. 4) y el título del documento (lib/idiomas.js).
export const sinNifEspana = (f) => !f?.oss?.pais && vacio(f?.cliente?.nif) && (vacio(f?.cliente?.pais) || String(f.cliente.pais).trim().toUpperCase() === 'ES');
// Los cierres de caja (lib/caja.js) son simplificadas de resumen.
export const esSimplificada = (f) => Boolean(f?.simplificada) || sinNifEspana(f);
// Límite de la factura simplificada (art. 4 del Reglamento de facturación), IVA incluido: 400 €, o 3.000 € en los sectores
// del art. 4.1.c (lib/empresa.js limiteSimplificada). Por encima, la factura es completa y lleva el NIF del cliente.
export function errorSimplificada(f, total, limite = 400) {
  if (!sinNifEspana(f) || !(total > limite)) return null;
  return `Sin el NIF del cliente solo cabe la factura simplificada, y esta llega hasta ${limite === 3000 ? '3.000' : limite} € IVA incluido (art. 4 del Reglamento de facturación): pídele su NIF o DNI y añádelo.${limite < 3000 ? ' Si vendes al por menor, en hostelería u otro sector del art. 4.1.c, el límite es de 3.000 €: márcalo en Ajustes › Actividades e impuestos.' : ''}`;
}

// presupuesto: lo valida un presupuesto (no una factura): no se le pide el NIF del cliente por el importe.
// limiteSimplificada: hasta dónde llega la factura simplificada de la empresa (lib/empresa.js limiteSimplificada).
export function validarFactura(b, { rectificativa = false, verifactu = false, igic = false, presupuesto = false, limiteSimplificada = 400 } = {}) {
  b = b ?? {};
  const errores = {};
  if (!fechaReal(b.fecha)) errores.fecha = 'La fecha debe existir en el calendario y estar entre 2000 y 2100 (AAAA-MM-DD)';
  const cliente = b.cliente ?? {};
  const nombre = texto(cliente.nombre);
  if (!nombre) errores['cliente.nombre'] = 'El nombre del cliente es obligatorio';
  else if (cliente.nombre.length > 120) errores['cliente.nombre'] = 'El nombre del cliente no puede superar los 120 caracteres';
  if (!vacio(cliente.pais) && !paisValido(cliente.pais)) errores['cliente.pais'] = 'El país debe ser un código de dos letras (ES, PT, US…)';
  const nif = validarNif(cliente.nif, { pais: paisValido(cliente.pais) ? cliente.pais : undefined });
  if (!nif.ok) errores['cliente.nif'] = nif.error;
  else if (verifactu && nif.tipo === '') errores['cliente.nif'] = 'El NIF del cliente es obligatorio con Verifactu';
  // Domicilio del destinatario (art. 6.1.e del Reglamento de facturación): la factura completa lo lleva, salvo si es una
  // persona física que no actúa como empresario o profesional (Manual práctico de IVA 2026 de la AEAT, cap. 10, «Contenido
  // general de las facturas ordinarias»). Se exige cuando el cliente es una empresa española (NIF de sociedad); con un
  // NIF de persona no se sabe si es un particular, así que no se pide. Las rectificativas copian los datos de su factura.
  else if (!rectificativa && nif.tipo === 'es' && /^[ABCDEFGHJNPQRSUVW]/.test(sinES(cliente.nif)) && !texto(cliente.direccion)) {
    errores['cliente.direccion'] = 'Si el cliente es una empresa, la factura lleva su domicilio (art. 6.1.e del Reglamento de facturación)';
  }
  if (!vacio(cliente.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(cliente.email))) {
    errores['cliente.email'] = 'El email del cliente no es válido';
  }

  // Venta de la ventanilla única (lib/oss.js): a un particular de otro país de la UE, con los tipos de IVA de ese país.
  const pais = b.oss?.pais ? String(b.oss.pais).toUpperCase() : '';
  const tipos = igic ? TIPOS_IGIC : pais ? tiposPais(pais) : TIPOS_IVA;
  if (igic) {
    for (const campo of ['oss', 'recargo', 'margen', 'recc']) if (b[campo]) errores[campo] = 'No aplicable en Canarias (IGIC)';
    // Canarias está fuera del IVA de la UE: lo que se vende fuera de las islas es exportación o no sujeto (art. 17 de la Ley 20/1991).
    if (['servicios-ue', 'intracomunitaria'].includes(b.operacion)) errores.operacion = 'En Canarias, una venta a la UE es una exportación o una operación no sujeta';
  }
  const tipoMal = igic ? 'El tipo de IGIC no está permitido' : pais ? `Ese tipo de IVA no existe en ${NOMBRES_UE[pais] || pais}` : 'El tipo de IVA no está permitido';
  if (b.oss && !tiposPais(pais).length) errores['oss.pais'] = 'Elige el país de la UE del cliente';
  else if (pais && nifUE(cliente.nif)) errores['oss.pais'] = 'Con NIF-IVA de la UE es una venta a una empresa: no va por la ventanilla única';
  else if (pais && (numero(b.irpfPct, 0) > 0 || b.recargo === true)) errores['oss.pais'] = 'Una venta de la ventanilla única no lleva retención ni recargo de equivalencia';

  let base = NaN, totalAprox = NaN;
  if (b.lineas !== undefined) {
    if (!Array.isArray(b.lineas) || b.lineas.length < 1 || b.lineas.length > 100) {
      errores.lineas = 'La factura debe tener entre 1 y 100 líneas';
    } else {
      let baseValida = true;
      let suma = 0, conIva = 0;
      for (let i = 0; i < b.lineas.length; i++) {
        const l = b.lineas[i] ?? {};
        const clave = (campo) => `lineas.${i}.${campo}`;
        const concepto = texto(l.concepto);
        if (!concepto) errores[clave('concepto')] = 'El concepto de la línea es obligatorio';
        else if (l.concepto.length > 200) errores[clave('concepto')] = 'El concepto no puede superar los 200 caracteres';
        const cantidad = numero(l.cantidad), precio = numero(l.precio), dto = numero(l.dto, 0);
        if (!Number.isFinite(cantidad) || cantidad === 0 || Math.abs(cantidad) > 1000000) {
          errores[clave('cantidad')] = 'La cantidad debe ser un número finito distinto de 0 y no superar 1.000.000 en valor absoluto';
          baseValida = false;
        }
        if (!Number.isFinite(precio) || Math.abs(precio) > 1000000000) {
          errores[clave('precio')] = 'El precio debe ser un número finito y no superar 1.000.000.000 en valor absoluto';
          baseValida = false;
        }
        if (!Number.isFinite(dto) || dto < 0 || dto > 100) {
          errores[clave('dto')] = 'El descuento debe estar entre 0 y 100';
          baseValida = false;
        }
        if (!tipos.includes(numero(l.ivaPct))) errores[clave('ivaPct')] = tipoMal;
        if (baseValida) { const bl = baseLinea({ cantidad, precio, dto }); suma += bl; conIva += bl * (1 + (numero(l.ivaPct, 0) || 0) / 100); }
      }
      if (baseValida) { base = r2(suma); totalAprox = r2(conIva); }
    }
  } else {
    base = numero(b.base);
    if (!Number.isFinite(base)) errores.base = 'La base debe ser un número finito';
    if (!tipos.includes(numero(b.ivaPct))) errores.ivaPct = tipoMal;
  }
  if (!TIPOS_IRPF.includes(numero(b.irpfPct, 0))) errores.irpfPct = 'El tipo de IRPF no está permitido';
  if (base === 0) errores.base = 'La factura no puede ser de 0 €';
  else if (base < 0 && !rectificativa) errores.base = 'Un importe negativo solo puede ir en una factura rectificativa';
  // Sin NIF del cliente (art. 6.1.d del Reglamento de facturación): en una venta en España, la factura completa lleva el
  // NIF del destinatario; sin él solo cabe la simplificada, hasta 400 € IVA incluido o 3.000 € en los sectores del art.
  // 4.1.c (comercio minorista, hostelería…). Por encima, se pide (auditoría F1-10). Las rectificativas pueden ser
  // simplificadas sin límite (art. 4.1.b) y los presupuestos no son facturas.
  const total = Number.isFinite(totalAprox) ? totalAprox : base * (1 + (numero(b.ivaPct, 0) || 0) / 100);
  const simplificada = !presupuesto && !rectificativa && !errores['cliente.nif'] && nif.ok && errorSimplificada(b, total, limiteSimplificada);
  if (simplificada) errores['cliente.nif'] = simplificada;
  // Operación de la parte sin IVA (auditoría F10): que cuadre con el cliente y con las líneas.
  const op = errorOperacion(b);
  if (op) errores.operacion = op;
  const error = Object.values(errores)[0];
  return error ? { ok: false, errores, error } : { ok: true };
}

export function validarFechaDoc(s) {
  return fechaReal(s) ? { ok: true } : { ok: false, error: 'La fecha del documento no es válida (AAAA-MM-DD, entre 2000 y 2100)' };
}

// Gasto (auditoría N11): las mismas garantías que una factura en todos los recorridos de alta y edición. antes: el gasto
// que se edita; un tipo de IVA antiguo que no se toca (histórico) se respeta, uno nuevo ha de ser de los admitidos.
export function validarGasto(b, { antes, igic = false } = {}) {
  b = b ?? {};
  const errores = {};
  if (!fechaReal(b.fecha)) errores.fecha = 'La fecha debe existir en el calendario y estar entre 2000 y 2100 (AAAA-MM-DD)';
  const base = numero(b.base);
  if (!Number.isFinite(base) || Math.abs(base) > 1000000000) errores.base = 'El importe debe ser un número finito y no superar 1.000.000.000 en valor absoluto';
  else if (base === 0) errores.base = 'Importe no válido';
  const iva = numero(b.ivaPct, 0);
  if (!(igic ? TIPOS_IGIC : TIPOS_IVA).includes(iva) && !(antes && !igic && Number(antes.ivaPct) === iva)) errores.ivaPct = `El tipo de ${igic ? 'IGIC' : 'IVA'} no está permitido`;
  if (b.ivaAuto !== undefined && ![4, 10, 21].includes(Number(b.ivaAuto))) errores.ivaAuto = 'El IVA autoliquidado debe ser del 4, 10 o 21 %';
  // Retenciones de un gasto: 15 o 7 % (profesionales), 1 % (empresarios en módulos del art. 95.6.2.º RIRPF y engorde de
  // cerdos y aves), 2 % (agricultura, ganadería y forestal, art. 95.4) y, fuera del alquiler del local (que lleva la suya o
  // ninguna), las del art. 75.2.b RIRPF: 19 % (arrendamiento de bienes muebles o de negocios, propiedad industrial,
  // asistencia técnica) y 24 % (derechos de imagen), art. 101.2 RIRPF (lib/modelos.js SUBCLAVES_190, clave I).
  const ret = numero(b.irpfPct, 0);
  if (!vacio(b.irpfPct) && ![0, 1, 2, 7, 15, 19, 24].includes(ret)) errores.irpfPct = 'La retención debe ser del 1, 2, 7, 15, 19 o 24 %';
  else if ((ret === 19 || ret === 24) && (b.alquiler || b.alquilerSinRetencion)) errores.irpfPct = 'El alquiler del local ya lleva su propia retención (o ninguna): quita la otra';
  else if (ret > 0 && b.alquilerSinRetencion) errores.irpfPct = 'Un alquiler sin retención no lleva retención de IRPF';
  // Alquiler del local sin retención (art. 75.3.h RIRPF): con su causa y sin la marca de alquiler con retención.
  if (!vacio(b.alquilerSinRetencion) && !Object.hasOwn(CAUSAS_SIN_RETENCION, b.alquilerSinRetencion)) errores.alquilerSinRetencion = 'Elige por qué el alquiler no lleva retención';
  else if (b.alquilerSinRetencion && b.alquiler) errores.alquilerSinRetencion = 'El alquiler lleva retención o no la lleva: elige una de las dos';
  // Inmueble del alquiler (diseño del 180, posiciones 114-134): situación 1 a 4 y, salvo en la 4, la referencia catastral.
  if (b.inmueble != null && b.inmueble !== '') {
    const situacion = Number(b.inmueble?.situacion), ref = String(b.inmueble?.refCatastral ?? '').toUpperCase().replace(/\s/g, '');
    if (!Object.hasOwn(SITUACIONES_INMUEBLE, situacion)) errores.inmueble = 'Elige dónde está el inmueble';
    else if (situacion !== 4 && !REF_CATASTRAL.test(ref)) errores.inmueble = 'La referencia catastral tiene 20 letras y números (está en el recibo del IBI o en la Sede del Catastro)';
    else if (situacion === 4 && ref) errores.inmueble = 'Sin referencia catastral, deja la referencia en blanco';
  }
  // Perceptor no residente (IRNR, modelos 216 y 296): país, clave de la renta y retención (lib/noResidentes.js).
  if (errorNoResidente(b.noResidente)) errores.noResidente = errorNoResidente(b.noResidente);
  // IVA deducible en parte (lib/ivaDeducible.js): sin él, el 100 %.
  if (!vacio(b.deduciblePct) && !(Number.isFinite(numero(b.deduciblePct)) && numero(b.deduciblePct) >= 0 && numero(b.deduciblePct) <= 100)) errores.deduciblePct = 'El IVA deducible debe ser un porcentaje entre 0 y 100';
  if (!vacio(b.afectoPct) && !(Number.isFinite(numero(b.afectoPct)) && numero(b.afectoPct) >= 0 && numero(b.afectoPct) <= 100)) errores.afectoPct = 'La parte deducible en el IRPF debe ser un porcentaje entre 0 y 100';
  if (!texto(b.concepto)) errores.concepto = 'Falta el concepto';
  // Varios tipos de IVA en la misma factura (lib/calculos.js porTipo): de 2 a 6 tipos distintos, cada uno con su base, y
  // la base del gasto es su suma. No con lo que solo admite un tipo: autoliquidaciones, REAGP, ISP, importación o un bien
  // de inversión (que se apunta con su propio gasto).
  if (b.porTipo !== undefined && b.porTipo !== null) {
    const l = Array.isArray(b.porTipo) ? b.porTipo : [];
    const tipos = igic ? TIPOS_IGIC : TIPOS_IVA;
    const bases = l.map((t) => numero(t?.base));
    const nombre = igic ? 'IGIC' : 'IVA';
    if (l.length < 2 || l.length > 6) errores.porTipo = `Con varios tipos de ${nombre}, pon entre 2 y 6`;
    else if (l.some((t, i) => !tipos.includes(numero(t?.ivaPct, NaN)) || !Number.isFinite(bases[i]) || bases[i] === 0)) errores.porTipo = `Cada tipo de ${nombre} necesita su base y un tipo permitido`;
    else if (new Set(l.map((t) => numero(t.ivaPct))).size !== l.length) errores.porTipo = `Cada tipo de ${nombre}, una sola vez`;
    else if (bases.some((x) => Math.sign(x) !== Math.sign(base))) errores.porTipo = 'Las bases de cada tipo deben tener el mismo signo';
    else if (Number.isFinite(base) && Math.abs(bases.reduce((s, x) => s + x, 0) - base) > 0.005) errores.porTipo = 'La base del gasto debe ser la suma de las de cada tipo';
    else if (b.isp === true || b.importacion === true || b.inversion || ['ue', 'fuera', 'isp'].includes(b.origen) || (!vacio(b.compensacion) && numero(b.compensacion, 0))) errores.porTipo = `Este gasto no admite varios tipos de ${nombre}: apúntalo en un gasto por tipo`;
  }
  const error = Object.values(errores)[0];
  return error ? { ok: false, errores, error } : { ok: true };
}
