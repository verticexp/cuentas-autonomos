import { CUENTAS, diario } from './asientos.js';
import { r2 } from './redondeo.js';

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
// REVISAR con el manual de importación de la versión destino: este perfil clásico
// tiene 287 posiciones; las versiones posteriores añaden campos al final.
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
  if (digitos < 6) throw new Error('A3 necesita subcuentas de 6 a 12 dígitos');
  return registros(preparar(asientos, anio, digitos).flatMap((a) => a.lineas.map((l, i) => {
    const importe = decimal(l.debe || l.haber);
    if (importe.length > 13) throw new Error(`El importe del asiento ${a.n} supera las 14 posiciones de A3`);
    return fijo(A3, { formato: '4', empresa: String(empresa).padStart(5, '0'), fecha: a.fecha.replaceAll('-', ''), tipo: '0', cuenta: l.cuenta, nombre: l.nombre, lado: l.debe ? 'D' : 'H', documento: String(a.n), linea: i === 0 ? 'I' : i === a.lineas.length - 1 ? 'U' : 'M', concepto: a.concepto, importe: '+' + importe.padStart(13, '0'), moneda: 'E', generado: 'N' });
  })));
}

export function diarioContaplus(asientos, { anio, digitos = 12 }) {
  const ceros = { ptadebe: '0.00', ptahaber: '0.00', factura: '0', baseimpo: '0.00', iva: '0.00', recequiv: '0.00', ncasado: '0', tcasado: '0', trans: '0', cambio: '0.000000', debeme: '0.00', haberme: '0.00', impauxme: '0.00', baseeuro: '0.00', noconv: 'F' };
  // Solo diario, sin libros de IVA: Auxiliar '*' excluye las partidas de declaraciones.
  // Para importar sin libros de IVA, revisar las Cuentas Especiales del IVA en destino.
  // Las subcuentas deben existir en ContaPlus; no se genera XSubCta.
  return registros(preparar(asientos, anio, digitos).flatMap((a) => a.lineas.map((l) => fijo(CONTAPLUS, { ...ceros, asien: a.n, fecha: a.fecha.replaceAll('-', ''), subcta: l.cuenta, concepto: a.concepto, documento: String(a.n), auxiliar: '*', monedauso: '2', eurodebe: decimal(l.debe), eurohaber: decimal(l.haber) }))));
}

const celda = (v) => {
  let s = String(v);
  if (/^[\s\x00-\x1f]*[=+\-@]|^[\t\r\n]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function diarioContasol(asientos, { anio, digitos = 8 }) {
  // CSV con las columnas solicitadas, para mapear en el asistente de importación.
  // REVISAR con el manual de importación de destino: puede exigir convertir a XLSX/ODS;
  // este CSV no es el fichero APU clásico (que tiene más columnas y otro orden).
  const filas = [['Diario', 'Fecha', 'Asiento', 'Orden', 'Cuenta', 'Concepto', 'Debe', 'Haber', 'Documento']];
  for (const a of preparar(asientos, anio, digitos)) {
    a.lineas.forEach((l, i) => filas.push(['1', a.fecha.split('-').reverse().join('/'), a.n, i + 1, l.cuenta, a.concepto ?? '', decimal(l.debe).replace('.', ','), decimal(l.haber).replace('.', ','), String(a.n)]));
  }
  return '\uFEFF' + registros(filas.map((f) => f.map(celda).join(';')));
}
