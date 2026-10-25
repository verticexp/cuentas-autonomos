// Ficheros para importar los modelos de autoliquidación y el 390 en el formulario de la Sede de la AEAT (botón «Importar»).
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
  const valor = Number(v ?? 0);
  if (!Number.isFinite(valor)) throw new Error(`Importe no válido: ${v}`);
  const c = Math.round(r2(valor) * 100);
  if (!Number.isSafeInteger(c)) throw new Error(`Importe demasiado grande: ${v}`);
  if (c < 0 && !conSigno) throw new Error(`Importe negativo en un campo sin signo: ${v}`);
  const ancho = c < 0 ? lon - 1 : lon;
  const s = String(Math.abs(c)).padStart(ancho, '0');
  if (s.length > ancho) throw new Error(`Importe demasiado grande: ${v}`);
  return c < 0 ? `N${s}` : s;
}

const blancos = (n) => ' '.repeat(n);
const N = (v) => importe(v, 17, true);
const U = (v) => importe(v, 17, false);

// Cabecera común (página 00 de los diseños).
function sobre(modelo, anio, t, paginas) {
  const periodo = typeof t === 'string' ? t : `${t}T`;
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
// rect (opcional): autoliquidación rectificativa de un trimestre ya presentado (lib/calculos.js rectificativa303): desde
// 2025 sustituye a la complementaria y a la solicitud de rectificación (diseño DR303e26, página 3, posiciones 357-459).
export function fichero303({ nif, nombre }, anio, t, c, liq, rect = null) {
  if (c.otros?.length) throw new Error('Hay facturas con tipos de IVA distintos del 4, 10 y 21 %: revisa esas casillas a mano en la Sede');
  if (c.reOtros?.length) throw new Error('Hay recargo de equivalencia a tipos distintos del 0,5, 1,4 y 5,2 %: revisa esas casillas a mano en la Sede');
  const ultimo = t === 4;
  const anterior = r2(liq?.anterior || 0), compensado = r2(liq?.compensado || 0);
  const r69 = r2(c['46'] - compensado);
  const vacia = [c['27'], c['45'], c['59'], c['60'], c['120'], c['122'], c['123'], c['62'], c['74'], anterior].every((x) => !x);
  // I ingreso, C a compensar, D devolución (solo en el 4T, si se ha pedido), N resultado cero.
  const devolver = ultimo && liq?.devolucion > 0 && r69 < 0;
  // En una rectificativa, el resultado es la 71 ([69] - [70] + [109]) y el tipo, el de la 71 sin lo que se pide devolver
  // de lo ingresado antes (casilla 111; nota del diseño a la página 3).
  const r71 = rect ? r2(r69 - rect.c70 + rect.c109) : r69;
  const paraTipo = rect ? r2(r71 + rect.c111) : r69;
  const tipo = paraTipo > 0 ? 'I' : paraTipo < 0 ? (devolver ? 'D' : 'C') : 'N';

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
    U(rect?.c70 || 0), U(rect?.c109 || 0), U(0), // 70, 109, 112
    N(r71), // 71
    vacia && !rect ? 'X' : ' ', // sin actividad
    // Rectificativa: marca, justificante de la anterior, baja de su domiciliación, importe a devolver (111) y motivo
    // «rectificaciones».
    rect ? 'X' : ' ', rect ? texto(rect.justificante, 13) : blancos(13), rect?.bajaDomiciliacion ? 'X' : ' ', U(rect?.c111 || 0), rect ? 'X' : ' ', ' ',
    blancos(546), '</T30303000>',
  ].join(''), 1017, '303 página 3');

  // Página DID (datos bancarios): la Sede la exige aunque vaya vacía (E060010). La cuenta se elige en el formulario.
  const did = comprobar(['<T303DID00>', blancos(11), blancos(34), blancos(70), blancos(35), blancos(30), blancos(2), '0', blancos(617), '</T303DID00>'].join(''), 823, '303 página DID');

  return { contenido: sobre('303', anio, t, [p1, p3, did]), resultado: r71, tipo };
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

// Periodo omitido para los anuales; admite el mes del 349 como «01»…«12».
export const nombreFichero = (modelo, anio, t) => `${modelo}_${anio}${t == null ? '' : `_${typeof t === 'string' ? t : `${t}T`}`}.txt`;

// Numérico entero, distinto de los importes en céntimos.
export function numero(v, lon) {
  if (!Number.isSafeInteger(Number(v)) || Number(v) < 0) throw new Error(`Número no válido: ${v}`);
  const s = String(Number(v)).padStart(lon, '0');
  if (s.length > lon) throw new Error(`Número demasiado grande: ${v}`);
  return s;
}

// Posiciones desde 1, como en los diseños. Impide desplazamientos, solapamientos y desbordamientos.
export function registro(lon, campos) {
  const r = Array(lon).fill(' '), ocupadas = new Set();
  for (const [pos, valor] of campos) {
    const s = String(valor);
    if (!Number.isInteger(pos) || pos < 1 || pos + s.length - 1 > lon) throw new Error(`Campo fuera del registro: ${pos}`);
    for (let i = 0; i < s.length; i++) {
      const k = pos - 1 + i;
      if (ocupadas.has(k)) throw new Error(`Campos solapados en la posición ${k + 1}`);
      ocupadas.add(k); r[k] = s[i];
    }
  }
  return comprobar(r.join(''), lon, 'Registro AEAT');
}

const personaFisica = (nif) => /^[0-9XYZKLM]/.test(nif);
export function nombreFiscal(nif, nombre, lon) {
  const p = partirNombre(nombre);
  return texto(personaFisica(nif) ? `${p.apellidos} ${p.nombre}` : nombre, lon);
}
const identificacion = ({ nif, nombre }, anio, t) => {
  const p = personaFisica(nif) ? partirNombre(nombre) : { apellidos: nombre, nombre: '' };
  return [[14, texto(nif, 9)], [23, texto(p.apellidos, 60)], [83, texto(p.nombre, 20)], [103, numero(anio, 4)], [107, `${t}T`]];
};

// DR111e16v18, página 01: bloques de 42 posiciones (8 perceptores + dos importes de 17).
export function fichero111(yo, anio, t, nominas, profesionales = {}) {
  const resultado = r2(nominas.retenciones + (profesionales.retenciones || 0));
  const tipo = resultado > 0 ? 'I' : 'N';
  const campos = [[1, '<T11101000>'], [13, tipo], ...identificacion(yo, anio, t)];
  for (let i = 0; i < 9; i++) {
    const d = i === 0 ? nominas : i === 2 ? profesionales : {};
    campos.push([109 + i * 42, numero(d.perceptores || 0, 8)], [117 + i * 42, U(d.percepciones ?? d.base ?? 0)], [134 + i * 42, U(d.retenciones || 0)]);
  }
  campos.push([487, U(resultado)], [504, N(0)], [521, U(resultado)], [989, '</T11101000>']);
  return { contenido: sobre('111', anio, t, [registro(1000, campos)]), resultado, tipo };
}

// DR115e15v13, página 01, posiciones 109-191: casillas 01 a 05.
export function fichero115(yo, anio, t, m) {
  const resultado = m.retenciones, tipo = resultado > 0 ? 'I' : 'N';
  const p = registro(500, [[1, '<T11501000>'], [13, tipo], ...identificacion(yo, anio, t),
    [109, numero(m.perceptores, 15)], [124, U(m.base)], [141, U(resultado)], [158, U(0)], [175, U(resultado)], [489, '</T11501000>']]);
  return { contenido: sobre('115', anio, t, [p]), resultado, tipo };
}

// DR390e2025: orden de casillas de las páginas con campos consecutivos de 17 posiciones.
const CASILLAS390 = {
  '02': [1806, '700 701 667 668 01 02 702 703 669 670 03 04 05 06 704 705 671 672 500 501 706 707 673 674 502 503 504 505 708 709 675 676 643 644 710 711 677 678 645 646 647 648 712 713 679 680 07 08 714 715 681 682 09 10 11 12 13 14 716 717 683 684 21 22 718 719 685 686 23 24 25 26 720 721 687 688 545 546 722 723 689 690 547 548 551 552 27 28 29 30 649 650 31 32 33 34'],
  '02B': [531, '663 664 691 692 35 36 665 666 693 694 599 600 601 602 41 42 43 44 45 46 47'],
  '03': [1840, '695 696 190 191 724 725 697 698 603 604 605 606 48 49 745 746 506 507 726 727 747 748 607 608 609 610 512 513 749 750 196 197 728 729 751 752 611 612 613 614 50 51 753 754 514 515 730 731 755 756 615 616 617 618 520 521 757 758 202 203 732 733 759 760 619 620 621 622 52 53 761 762 208 209 734 735 763 764 623 624 625 626 54 55 765 766 214 215 736 737 767 768 627 628 629 630 56 57'],
  '04': [854, '769 770 220 221 738 739 771 772 631 632 633 634 58 59 773 774 587 588 740 741 775 776 635 636 637 638 597 598 60 61 660 661 639 62 651 652 63 522 64 65'],
  '08': [1092, '139 140 141 142 143 144 145 146 147 148 149 150 151 152 640 153 154 155 156 157 158 159 160 161 162 163 164 165 166 167 168 169 641 170 171 172 173 174 175 176 177 178 179 180 181 182 183 184 185 186 642 187 188 189'],
};
// Nota 2 del diseño: casillas históricas que desde 2025 solo admiten cero.
const CEROS390 = '701 667 668 702 703 669 670 705 671 672 706 707 673 674 709 675 676 710 711 677 678 713 679 680 714 715 681 682 717 683 684 718 719 685 686 721 687 688 722 723 689 690 663 664 691 692 665 666 693 694 749 750 728 729 751 752 753 754 730 731 755 756 761 762 734 735 763 764 769 770 738 739 771 772 773 774 740 741 775 776'.split(' ');

// El 390 importa todas las páginas; simplificado (05) y sectores diferenciados (08) quedan a cero:
// modelo390 solo calcula el régimen general. Estadísticos y representantes, sin datos, quedan vacíos.
export function fichero390(yo, anio, m, { actividades = [], criterioCaja, destinatarioCaja, declara347 = false } = {}) {
  if (anio < 2025) throw new Error('El diseño del fichero 390 está disponible desde el ejercicio 2025');
  if (m.avisos?.length) throw new Error(`Revisa el 390 en la Sede: ${m.avisos.join(' ')}`);
  const c = m.c;
  for (const k of CEROS390) if (c[k]) throw new Error(`La casilla ${k} del diseño del 390 debe ser cero`);
  const pagina = (id, lon, campos) => registro(lon, [[1, `<T390${id.padEnd(5, '0')}>`], ...campos, [lon - 11, `</T390${id.padEnd(5, '0')}>`]]);
  const p = [];
  const identidad = identificacion(yo, anio, 1).filter(([pos]) => pos !== 107);
  p.push(pagina('01', 1187, [...identidad, [109, '00'], [118, '000'], [130, '2'],
    [131, (criterioCaja ?? Boolean(c['653'] || c['654'] || c['655'])) ? '1' : '2'],
    [132, (destinatarioCaja ?? Boolean(c['656'] || c['657'])) ? '1' : '2'], [430, declara347 ? '1' : '0'],
    [133, '00'], [734, '00000000'], [843, '00000000'], [952, '00000000'],
    ...actividades.slice(0, 6).flatMap((a, i) => [[148 + i * 47, texto(a.nombre, 40)], [191 + i * 47, texto(a.iae, 4)]]) ]));
  for (const id of ['02', '02B', '03', '04']) {
    const [lon, claves] = CASILLAS390[id];
    p.push(pagina(id, lon, claves.split(' ').map((k, i) => [13 + i * 17, N(c[k] || 0)])));
  }
  // Página 05: campos numéricos sin contenido, a ceros según la Nota 1.
  const simplificado = [
    [17, 10], [27, 17], [44, 10], [54, 17], [71, 10], [81, 17], [98, 10], [108, 17],
    [125, 10], [135, 17], [152, 10], [162, 17], [179, 10], [189, 17], [206, 17], [240, 17],
    [257, 3], [260, 17], [277, 5], [282, 17], [299, 17], [316, 17], [337, 10], [347, 17],
    [364, 10], [374, 17], [391, 10], [401, 17], [418, 10], [428, 17], [445, 10], [455, 17],
    [472, 10], [482, 17], [499, 10], [509, 17], [526, 17], [560, 17], [577, 3], [580, 17],
    [597, 5], [602, 17], [619, 17], [636, 17], [653, 2], [655, 17], [672, 6], [678, 17],
    [695, 17], [712, 17], [729, 2], [731, 17], [748, 6], [754, 17], [771, 17], [788, 17],
    [805, 2], [807, 17], [824, 6], [830, 17], [847, 17], [864, 17], [881, 2], [883, 17],
    [900, 6], [906, 17], [923, 17], [940, 17], [957, 2], [959, 17], [976, 6], [982, 17],
    [999, 17], [1016, 17], [1033, 17], [1050, 17], [1067, 17], [1084, 17], [1101, 17], [1118, 17],
    [1135, 17], [1152, 17], [1169, 17], [1186, 17],
  ].map(([pos, lon]) => [pos, numero(0, lon)]);
  p.push(pagina('05', 1519, simplificado));
  // Apartado 8 (varias administraciones): sin reparto foral, todos sus campos a cero.
  const liquidacion = [[13, N(c['658'] || 0)], [30, N(c['84'] || 0)], [47, U(0)], [64, U(c['85'] || 0)], [81, N(c['86'] || 0)], [98, numero(0, 25)]];
  for (let pos = 123; pos <= 208; pos += 17) liquidacion.push([pos, U(0)]);
  for (const [i, k] of ['95', '96', '524', '97', '98', '662', '525', '526', '99', '653', '103', '104', '105', '110', '125', '126', '127', '128', '100', '101', '102', '227', '228', '106', '107', '108'].entries()) {
    liquidacion.push([225 + i * 17, importe(c[k] || 0, 17, i >= 8)]);
  }
  p.push(pagina('06', 828, liquidacion));
  const especificas = ['230', '109', '231', '232', '111', '113', '523', '654', '655', '656', '657'].map((k, i) => [13 + i * 17, N(c[k] || 0)]);
  for (let i = 0; i < 5; i++) {
    // modelo390 devuelve una prorrata agregada; no inventamos actividades ni códigos CNAE.
    especificas.push([243 + i * 83, U(i === 0 ? c['115'] || 0 : 0)], [260 + i * 83, U(i === 0 ? c['116'] || 0 : 0)],
      [278 + i * 83, importe(i === 0 ? c['118'] || 0 : 0, 5)]);
  }
  especificas.push([277, texto(c['117'], 1)]);
  p.push(pagina('07', 776, especificas));
  const [lon, claves] = CASILLAS390['08'];
  p.push(pagina('08', lon, claves.split(' ').map((k, i) => [13 + i * 17, N(c[k] || 0)])));
  return { contenido: sobre('390', anio, '0A', p), resultado: m.resultado };
}
