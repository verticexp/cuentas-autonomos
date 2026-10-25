// Ficheros para importar el 303 y el 130 en el formulario de la Sede de la AEAT (botón «Importar»).
// Diseños de registro oficiales: DR303e26v101 (303, desde 2026) y DR130e15v12 (130). Registros de ancho fijo:
// alfanuméricos a la izquierda con blancos; numéricos a la derecha con ceros, en céntimos (15 enteros + 2 decimales);
// los negativos llevan una N en la primera posición. Sin dependencias: se usa en el servidor y en las pruebas.
import { r2 } from './calculos.js';

// Solo letras, números y blancos, en mayúsculas y sin tildes (la Ñ y la Ç se quedan).
export function texto(v, lon) {
  const limpio = String(v ?? '').toUpperCase()
    .replace(/Ñ/g, '\u0000').replace(/Ç/g, '\u0001')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\u0000/g, 'Ñ').replace(/\u0001/g, 'Ç')
    .replace(/[^A-Z0-9ÑÇ ]/g, ' ').replace(/ +/g, ' ').trim();
  return limpio.slice(0, lon).padEnd(lon, ' ');
}

// Importe en céntimos. conSigno: campo «N» (admite negativos con N delante); si no, un negativo es un error.
export function importe(v, lon = 17, conSigno = false) {
  const c = Math.round(r2(Number(v) || 0) * 100);
  if (c < 0 && !conSigno) throw new Error(`Importe negativo en un campo sin signo: ${v}`);
  const s = String(Math.abs(c)).padStart(lon, '0');
  if (s.length > lon) throw new Error(`Importe demasiado grande: ${v}`);
  return c < 0 ? `N${s.slice(1)}` : s;
}

const blancos = (n) => ' '.repeat(n);
const N = (v) => importe(v, 17, true);
const U = (v) => importe(v, 17, false);

// Cabecera común de los dos modelos (página 00 del diseño).
function sobre(modelo, anio, t, paginas) {
  const periodo = `${t}T`;
  const auxiliar = `<AUX>${blancos(70)}${'0100'}${blancos(4)}${blancos(9)}${blancos(213)}</AUX>`;
  return `<T${modelo}0${anio}${periodo}0000>${auxiliar}${paginas.join('')}</T${modelo}0${anio}${periodo}0000>`;
}

function comprobar(pagina, lon, nombre) {
  if (pagina.length !== lon) throw new Error(`${nombre}: ${pagina.length} posiciones en vez de ${lon}`);
  return pagina;
}

// Identificación del declarante a partir de Ajustes (u.emisor).
export function declarante(emisor = {}) {
  const nif = String(emisor.nif || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');
  if (!/^[A-Z0-9]{9}$/.test(nif)) return { error: 'Rellena tu NIF en Ajustes para generar el fichero' };
  const nombre = String(emisor.nombre || '').trim();
  if (!nombre) return { error: 'Rellena tu nombre o razón social en Ajustes para generar el fichero' };
  return { nif, nombre };
}

// 303 de un trimestre (régimen general). c: casillas303; liq: la fila de liquidaciones303 de ese trimestre
// (compensación de cuotas de periodos anteriores y, en el 4T, la devolución pedida: se aplica todo el saldo anterior,
// casilla 78 = 110, y el resultado negativo se pide como devolución, tipo D; la cuenta se elige en el formulario).
export function fichero303({ nif, nombre }, anio, t, c, liq) {
  if (c.otros?.length) throw new Error('Hay facturas con tipos de IVA distintos del 4, 10 y 21 %: revisa esas casillas a mano en la Sede');
  if (c.reOtros?.length) throw new Error('Hay recargo de equivalencia a tipos distintos del 0,5, 1,4 y 5,2 %: revisa esas casillas a mano en la Sede');
  const ultimo = t === 4;
  const anterior = r2(liq?.anterior || 0), compensado = r2(liq?.compensado || 0);
  const r69 = r2(c['46'] - compensado);
  const vacia = [c['27'], c['45'], c['59'], c['60'], c['120'], c['122'], c['123'], c['62'], c['74'], anterior].every((x) => !x);
  // I ingreso, C a compensar, D devolución (solo en el 4T, si se ha pedido), N resultado cero.
  const devolver = ultimo && liq?.devolucion > 0 && r69 < 0;
  const tipo = r69 > 0 ? 'I' : r69 < 0 ? (devolver ? 'D' : 'C') : 'N';

  const p1 = comprobar([
    '<T30301000>', ' ', tipo, texto(nif, 9), texto(nombre, 80), String(anio), `${t}T`,
    '2', // tributación exclusivamente foral
    '2', // registro de devolución mensual
    '3', // solo régimen general
    '2', // autoliquidación conjunta
    c.criterioCaja ? '1' : '2', // criterio de caja (lib/calculos.js)
    c.destinatarioCaja ? '1' : '2', // destinatario de operaciones en criterio de caja
    // Prorrata especial: opción y revocación para el año siguiente, solo en el 4T (la Sede rechaza el blanco que indica la
    // Nota 6: E010170/E010180).
    c.opcionEspecial === 'opcion' ? '1' : '2', c.opcionEspecial === 'revocacion' ? '1' : '2',
    '2', blancos(8), ' ', // concurso de acreedores
    '2', // SII
    ultimo ? '2' : '0', // exonerado del 390 (Nota 4)
    '0', // volumen de operaciones (Nota 3)
    '0', // gasolinas (Nota 8)
    U(0), '00000', U(0), // 150-152
    U(0), '00000', U(0), // 165-167
    U(c['01']), '00400', U(c['03']),
    U(0), '00000', U(0), // 153-155
    U(c['04']), '01000', U(c['06']),
    U(c['07']), '02100', U(c['09']),
    U(c['10']), U(c['11']), U(c['12']), U(c['13']),
    N(c['14'] || 0), N(c['15'] || 0), // 14-15: rectificativas, con signo
    U(0), '00175', U(0), U(c['168'] || 0), '00050', U(c['170'] || 0), U(0), '00000', U(0), U(c['19'] || 0), '00140', U(c['21'] || 0), U(c['22'] || 0), '00520', U(c['24'] || 0), // recargo, en el orden del diseño: 156-158 (1,75 %), 168-170 (0,5 %), 16-18 (tipo 0), 19-21 (1,4 %), 22-24 (5,2 %)
    N(c['25'] || 0), N(c['26'] || 0), // 25-26: modificación del recargo (rectificativas), con signo
    N(c['27']),
    U(c['28']), U(c['29']), U(c['30']), U(c['31']), U(c['32'] || 0), U(c['33'] || 0), U(c['34'] || 0), U(c['35'] || 0), U(c['36']), U(c['37']), U(c['38'] || 0), U(c['39'] || 0),
    N(c['40'] || 0), N(c['41'] || 0), N(c['42'] || 0), N(0), N(c['44'] || 0), // 40-41 abonos de proveedores, 42 compensaciones del REAGP, 43, 44 regularización de la prorrata
    N(c['45']), N(c['46']),
    blancos(521), blancos(13), '</T30301000>',
  ].join(''), 1581, '303 página 1');

  const p3 = comprobar([
    '<T30303000>',
    N(c['59']), N(c['60']), N(c['120']), N(c['122']), N(c['123'] || 0), N(0), // 59, 60, 120, 122, 123 (ventanilla única), 124
    N(c['62'] || 0), N(c['63'] || 0), N(c['74'] || 0), N(c['75'] || 0), // criterio de caja: 62, 63, 74, 75
    N(0), // 76
    N(c['46']), // 64
    '10000', N(c['46']), // 65 (100 %) y 66
    U(0), // 77
    U(anterior), U(compensado), U(r2(anterior - compensado)), // 110, 78, 87
    N(0), N(0), // 68, 108
    N(r69), // 69
    U(0), U(0), U(0), // 70, 109, 112
    N(r69), // 71
    vacia ? 'X' : ' ', ' ', blancos(13), ' ', U(0), ' ', ' ', // sin actividad y rectificativa
    blancos(546), '</T30303000>',
  ].join(''), 1017, '303 página 3');

  // Página DID (datos bancarios): la Sede la exige aunque vaya vacía (E060010). La cuenta se elige en el formulario.
  const did = comprobar(['<T303DID00>', blancos(11), blancos(34), blancos(70), blancos(35), blancos(30), blancos(2), '0', blancos(617), '</T303DID00>'].join(''), 823, '303 página DID');

  return { contenido: sobre('303', anio, t, [p1, p3, did]), resultado: r69, tipo };
}

// El 130 pide apellidos y nombre aparte y Fisquo guarda «Nombre Apellido1 Apellido2» junto. Se toman como apellidos
// las dos últimas palabras con sus partículas (de, del, la…), así «María del Mar García López» o «Juan de la Fuente
// Pérez» salen bien; «García López, Ana» se parte por la coma. Siempre queda al menos una palabra de nombre.
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'san', 'santa', 'da', 'das', 'do', 'dos', 'van', 'von']);
export function partirNombre(completo) {
  const limpio = String(completo || '').trim().replace(/\s+/g, ' ');
  const coma = limpio.indexOf(',');
  if (coma > 0) return { apellidos: limpio.slice(0, coma).trim(), nombre: limpio.slice(coma + 1).trim() };
  const p = limpio ? limpio.split(' ') : [];
  if (p.length < 2) return { apellidos: p[0] || '', nombre: '' };
  let i = p.length;
  for (let apellidos = 0; apellidos < 2 && i > 1; apellidos++) {
    i--;
    while (i > 1 && PARTICULAS.has(p[i - 1].toLowerCase())) i--;
  }
  return { apellidos: p.slice(i).join(' '), nombre: p.slice(0, i).join(' ') };
}

// 130 de un trimestre. q: el trimestre de resumenAnual (casillas acumuladas desde enero).
export function fichero130({ nif, nombre }, anio, q) {
  // Actividades agrícolas (apartado II, casillas 08-11, lib/calculos.js resumenAnual): el apartado I va a cero.
  const agricola = q.c08 !== undefined;
  const c03 = agricola ? 0 : r2(q.rendAcum);
  const c04 = r2(0.2 * Math.max(0, c03));
  const c07 = r2(q.c07);
  // La 12 (07 + 11) no admite negativos en el diseño: un 07 negativo cuenta como cero, igual que en resumenAnual.
  const c12 = r2(q.c12 ?? Math.max(0, c07));
  const c13 = r2(q.minoracion || 0);
  const c14 = r2(c12 - c13);
  const c15 = r2(q.negPrev || 0);
  const c16 = r2(q.c16 || 0);
  const c17 = r2(c14 - c15 - c16);
  // Negativa en el 1T-3T: «B» (resultado a deducir en los siguientes); en el 4T o a cero, «N» (negativa).
  const tipo = c17 > 0 ? 'I' : c17 < 0 && q.t < 4 ? 'B' : 'N';
  const { nombre: nom, apellidos: ape } = partirNombre(nombre);

  const p1 = comprobar([
    '<T13001000>', ' ', tipo, texto(nif, 9), texto(ape, 60), texto(nom, 20), String(anio), `${q.t}T`,
    U(agricola ? 0 : q.ingAcum), U(agricola ? 0 : q.gasAcum), N(c03), U(c04), U(agricola ? 0 : q.pagosPrev), U(agricola ? 0 : q.retAcum), N(c07),
    U(q.c08 || 0), U(q.c09 || 0), U(q.c10 || 0), N(q.c11 || 0), // II. agrícolas: 08-11
    U(c12),
    U(c13), N(c14), U(c15), U(c16), N(c17), U(0), N(c17),
    ' ', blancos(13), blancos(34), blancos(96), blancos(13), '</T13001000>',
  ].join(''), 600, '130 página 1');

  return { contenido: sobre('130', anio, q.t, [p1]), resultado: c17, tipo };
}

// Nombre con el que se descarga: el formulario lo busca así por defecto (303.txt / 130.txt).
export const nombreFichero = (modelo, anio, t) => `${modelo}_${anio}_${t}T.txt`;
