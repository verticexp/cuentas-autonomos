import { CUENTAS, diario } from './asientos.js';
import { r2 } from './redondeo.js';
import { zip } from './zip.js';

// SUENLACE formato 4, registro 0. Posiciones desde 1, longitud y relleno:
// textos/cuentas a la izquierda con espacios; empresa con ceros a la izquierda;
// importe con signo, 10 enteros (ceros), punto y 2 decimales. Reserva en blanco.
// Manual: https://media.a3software.com/a3responde/files/5081-Enlace_contable_descripcion_registros_WEB.pdf
const A3 = {
  longitud: 254,
  campos: { formato: [1, 1], empresa: [2, 5], fecha: [7, 8], tipo: [15, 1], cuenta: [16, 12], nombre: [28, 30], lado: [58, 1], documento: [59, 10], linea: [69, 1], concepto: [70, 30], importe: [100, 14], reserva: [114, 138], analitica: [252, 1], moneda: [253, 1], generado: [254, 1] },
};

// XDiario clásico: posiciones desde 1 y longitudes. C = texto a la izquierda,
// espacios a la derecha; N = número a la derecha, espacios a la izquierda;
// F = AAAAMMDD; L = F/T. Decimales con punto, sin separador de miles.
// Campos 1-31 del protocolo: https://grupo.sage.es/ayuda/documentacion/productos/contaplus/Manual_protocolos_ContaPlus.pdf
// Las posiciones coinciden con las del importador de Sage 50 («formato NominaPlus», 255 o más caracteres), que también
// lo lee. Las versiones posteriores de ContaPlus añaden campos al final, que son opcionales.
const CONTAPLUS = {
  longitud: 287,
  campos: {
    asien: [1, 6, 'N'], fecha: [7, 8, 'F'], subcta: [15, 12], contra: [27, 12],
    ptadebe: [39, 16, 'N'], concepto: [55, 25], ptahaber: [80, 16, 'N'], factura: [96, 8, 'N'],
    baseimpo: [104, 16, 'N'], iva: [120, 5, 'N'], recequiv: [125, 5, 'N'], documento: [130, 10],
    departa: [140, 3], clave: [143, 6], estado: [149, 1], ncasado: [150, 6, 'N'], tcasado: [156, 1, 'N'],
    trans: [157, 6, 'N'], cambio: [163, 16, 'N'], debeme: [179, 16, 'N'], haberme: [195, 16, 'N'],
    auxiliar: [211, 1], serie: [212, 1], sucursal: [213, 4], coddivisa: [217, 5], impauxme: [222, 16, 'N'],
    monedauso: [238, 1], eurodebe: [239, 16, 'N'], eurohaber: [255, 16, 'N'], baseeuro: [271, 16, 'N'], noconv: [287, 1, 'L'],
  },
};

// Los programas solo aceptan subcuentas con los mismos dígitos que la empresa de destino (A3, ContaPlus y Sage 50 lo
// comprueban), así que es la gestoría quien elige la longitud. 8 es la más habitual.
export const DIGITOS = { a3: [6, 12], contaplus: [6, 12], contasol: [6, 10] };
export function digitosValidos(formato, digitos) {
  const [min, max] = DIGITOS[formato] || [];
  if (!Number.isInteger(digitos) || !min || digitos < min || digitos > max) throw new Error(max === 10 ? 'Dígitos de subcuenta no válidos (6-10)' : 'Dígitos de subcuenta no válidos (6-12)');
  return digitos;
}

// Se conserva el prefijo de cuatro cifras si existe en el plan de Fisquo.
export function subcuenta(cuenta, digitos = 8) {
  const c = String(cuenta);
  if (!/^[1-7]\d{2,11}$/.test(c)) throw new Error(`Cuenta no válida: ${c}`);
  if (!Number.isInteger(digitos) || digitos < 3 || digitos > 12) throw new Error('Longitud de subcuenta no válida (3-12)');
  if (c.length > digitos) throw new Error(`La cuenta ${c} supera los ${digitos} dígitos de la subcuenta`);
  const prefijo = c.length >= 4 && CUENTAS[c.slice(0, 4)] ? 4 : 3;
  return c.slice(0, prefijo) + '0'.repeat(digitos - c.length) + c.slice(prefijo);
}

const ascii = (v) => String(v ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\x20-\x7e]/gu, ' ');
const decimal = (c) => `${c / 100n}.${String(c % 100n).padStart(2, '0')}`;
const registros = (filas) => filas.length ? filas.join('\r\n') + '\r\n' : '';

function fijo(formato, valores) {
  const registro = Array(formato.longitud).fill(' ');
  for (const [campo, [posicion, longitud, tipo]] of Object.entries(formato.campos)) {
    let valor = ascii(valores[campo]);
    if (tipo === 'N' && valor.length > longitud) throw new Error(`El campo ${campo} supera las ${longitud} posiciones`);
    valor = tipo === 'N' ? valor.padStart(longitud, ' ') : valor.slice(0, longitud).padEnd(longitud, ' ');
    registro.splice(posicion - 1, longitud, ...valor);
  }
  return registro.join('');
}

function centimos(v) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER / 100) throw new Error('Importe contable no válido o demasiado grande');
  return BigInt(r2(n).toFixed(2).replace('.', ''));
}

function preparar(asientos, anio, digitos) {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new Error('Año no válido');
  const orden = { apertura: 0, cierre: 3 };
  const lista = diario(asientos.filter((a) => a.origen?.tipo !== 'regularizacion').slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || (orden[a.origen?.tipo] ?? 1) - (orden[b.origen?.tipo] ?? 1)), anio);
  return lista.map((a) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha) || !Number.isFinite(Date.parse(a.fecha)) || new Date(a.fecha).toISOString().slice(0, 10) !== a.fecha) throw new Error(`Fecha no válida en el asiento ${a.n}`);
    const lineas = a.lineas.map((l) => {
      const debe = centimos(l.debe), haber = centimos(l.haber);
      if (debe && haber) throw new Error(`El asiento ${a.n} tiene debe y haber en el mismo apunte`);
      return { cuenta: subcuenta(l.cuenta, digitos), nombre: CUENTAS[l.cuenta] || CUENTAS[String(l.cuenta).slice(0, 4)] || CUENTAS[String(l.cuenta).slice(0, 3)] || `Cuenta ${l.cuenta}`, debe: (debe > 0n ? debe : 0n) - (haber < 0n ? haber : 0n), haber: (haber > 0n ? haber : 0n) - (debe < 0n ? debe : 0n) };
    }).filter((l) => l.debe || l.haber);
    if (lineas.length < 2) throw new Error(`El asiento ${a.n} necesita al menos dos apuntes con importe`);
    if (lineas.reduce((s, l) => s + l.debe - l.haber, 0n) !== 0n) throw new Error(`El asiento ${a.n} no cuadra al céntimo`);
    return { ...a, lineas };
  });
}

// empresa es el código numérico de la empresa en A3 (por defecto 00001).
export function diarioA3(asientos, { anio, empresa = 1, digitos = 8 }) {
  if (!/^\d{1,5}$/.test(String(empresa)) || Number(empresa) < 1) throw new Error('Código de empresa A3 no válido (1-99999)');
  digitosValidos('a3', digitos);
  return registros(preparar(asientos, anio, digitos).flatMap((a) => a.lineas.map((l, i) => {
    const importe = decimal(l.debe || l.haber);
    if (importe.length > 13) throw new Error(`El importe del asiento ${a.n} supera las 14 posiciones de A3`);
    return fijo(A3, { formato: '4', empresa: String(empresa).padStart(5, '0'), fecha: a.fecha.replaceAll('-', ''), tipo: '0', cuenta: l.cuenta, nombre: l.nombre, lado: l.debe ? 'D' : 'H', documento: String(a.n), linea: i === 0 ? 'I' : i === a.lineas.length - 1 ? 'U' : 'M', concepto: a.concepto, importe: '+' + importe.padStart(13, '0'), moneda: 'E', generado: 'N' });
  })));
}

export function diarioContaplus(asientos, { anio, digitos = 8 }) {
  digitosValidos('contaplus', digitos);
  const ceros = { ptadebe: '0.00', ptahaber: '0.00', factura: '0', baseimpo: '0.00', iva: '0.00', recequiv: '0.00', ncasado: '0', tcasado: '0', trans: '0', cambio: '0.000000', debeme: '0.00', haberme: '0.00', impauxme: '0.00', baseeuro: '0.00', noconv: 'F' };
  // Solo diario, sin libros de IVA: Auxiliar '*' excluye las partidas de declaraciones.
  // Para importar sin libros de IVA, revisar las Cuentas Especiales del IVA en destino.
  // Las subcuentas deben existir en ContaPlus; no se genera XSubCta.
  return registros(preparar(asientos, anio, digitos).flatMap((a) => a.lineas.map((l) => fijo(CONTAPLUS, { ...ceros, asien: a.n, fecha: a.fecha.replaceAll('-', ''), subcta: l.cuenta, concepto: a.concepto, documento: String(a.n), auxiliar: '*', monedauso: '2', eurodebe: decimal(l.debe), eurohaber: decimal(l.haber) }))));
}

// ContaSol solo importa el diario como hoja de cálculo «APU.xls» o «APU.ods», sin cabecera y con las columnas A-Q del
// manual de DELSOL (GIP.C.01.10 «Importación Excel - Calc», tabla Apuntes). Un campo más largo de lo permitido hace que
// ContaSol descarte el registro, así que los textos se recortan aquí. Se importa en Utilidades › Importaciones.
// https://sdelsol.com/pub/programas/adjuntos/1/GIP.C.01.10._CONTASOL_-_Importacion_Excel_-_Calc_1.pdf
const latin1 = (v, max) => [...String(v ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')]
  .map((c) => (c <= '\xff' ? c : c.normalize('NFD')[0] <= '\xff' ? c.normalize('NFD')[0] : ' ')).join('').trim().slice(0, max);
const xml = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const odsCelda = ([tipo, v]) => tipo === 'n' ? `<table:table-cell office:value-type="float" office:value="${v}"><text:p>${v}</text:p></table:table-cell>`
  : tipo === 'f' ? `<table:table-cell office:value-type="date" office:date-value="${v}"><text:p>${v.split('-').reverse().join('/')}</text:p></table:table-cell>`
  : v ? `<table:table-cell office:value-type="string"><text:p>${xml(v)}</text:p></table:table-cell>` : '<table:table-cell/>';

export function ods(filas, hoja = 'Hoja1') {
  const contenido = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:spreadsheet>'
    + `<table:table table:name="${xml(hoja)}">${filas.map((f) => `<table:table-row>${f.map(odsCelda).join('')}</table:table-row>`).join('')}</table:table></office:spreadsheet></office:body></office:document-content>`;
  const manifiesto = '<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>';
  // El mimetype va el primero y sin comprimir (lib/zip.js no comprime): así lo pide ODF.
  return zip([{ nombre: 'mimetype', datos: 'application/vnd.oasis.opendocument.spreadsheet' }, { nombre: 'META-INF/manifest.xml', datos: manifiesto }, { nombre: 'content.xml', datos: contenido }]);
}

// Filas de APU: Diario, Fecha, Asiento, Orden, Cuenta, Importe en pesetas (0), Concepto, Documento, Debe, Haber,
// Moneda (E), Punteo (0), Tipo de IVA, Código de IVA, Departamento, Subdepartamento y Archivo de imagen.
export function apuntesContasol(asientos, { anio, digitos = 8 }) {
  digitosValidos('contasol', digitos);
  const filas = [];
  for (const a of preparar(asientos, anio, digitos)) {
    if (a.n > 99999) throw new Error('ContaSol admite como mucho 99.999 asientos al año');
    a.lineas.forEach((l, i) => filas.push([['n', '1'], ['f', a.fecha], ['n', String(a.n)], ['n', String(i + 1)], ['n', l.cuenta], ['n', '0'], ['s', latin1(a.concepto, 60)], ['s', String(a.n)], ['n', decimal(l.debe)], ['n', decimal(l.haber)], ['s', 'E'], ['n', '0'], ['s', ''], ['n', '0'], ['n', '0'], ['n', '0'], ['s', '']]));
  }
  return filas;
}

export const diarioContasol = (asientos, opciones) => ods(apuntesContasol(asientos, opciones), 'APU');
