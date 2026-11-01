// Presentación del Impuesto sobre Sociedades: el fichero del 202 (pago fraccionado) para el botón «Importar» del
// formulario de la Sede y la tabla de casillas del 200 para teclear en Sociedades WEB.
//
// 202: diseño de registro DR202e25, versión 1.3, «ejercicio 2025 y siguientes»
// (sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_200_299/archivos_25/DR202e25.xlsx). Dos páginas de
// ancho fijo, la 01 de 700 posiciones y la 02 de 900, dentro del sobre común <T2020AAAAPP0000> con el periodo «1P», «2P» o
// «3P». Reglas de relleno (notas 3 a 6 del diseño): alfanuméricos a la izquierda con blancos; numéricos a la derecha con
// ceros, en céntimos (15 enteros + 2 decimales), y los campos con signo (tipo N) llevan una N en la primera posición si
// son negativos. Los porcentajes son de 5 posiciones (3 enteros + 2 decimales): el 16 % se escribe «01600».
//
// 200: el diseño de registro (DR200e25, versión 1.02) tiene 77 páginas y más de 7.000 campos, con el balance, la cuenta de
// pérdidas y ganancias y el estado de cambios en el patrimonio neto completos, que Fisquo no tiene línea a línea. En lugar
// de un fichero a medias, se exporta la relación de casillas numeradas que sí sale del borrador (casillas200), para
// teclearlas en Sociedades WEB sin recalcular nada. Los números y las páginas de cada casilla son los de ese diseño.
import { importe, nombreFichero, numero, partirNombre, registro, sobre, texto } from './ficheroAeat.js';
import { r2 } from './calculos.js';

const U = (v) => importe(v, 17, false);
const N = (v) => importe(v, 17, true);
// Porcentaje de 5 posiciones (3 enteros + 2 decimales).
const pct = (v) => importe(v, 5, false);
const marca = (v) => (v ? 'X' : ' ');

// Identificación (apartado 1 de la página 01): una sociedad va entera en «Denominación o apellidos»; una persona física
// (un establecimiento permanente de un no residente) parte apellidos y nombre, como en los demás modelos.
function identidad(nif, nombre) {
  const p = /^[0-9XYZKLM]/.test(nif) ? partirNombre(nombre) : { apellidos: nombre, nombre: '' };
  return [[14, texto(nif, 9)], [23, texto(p.apellidos, 60)], [83, texto(p.nombre, 20)]];
}

// Inicio del periodo impositivo (ddmmaaaa): el 1 de enero, o el día de la constitución si la sociedad nació ese año.
function inicioPeriodo(anio, constitucion) {
  const c = /^\d{4}-\d{2}-\d{2}$/.test(constitucion || '') && constitucion.slice(0, 4) === String(anio);
  return `${c ? constitucion.slice(8, 10) : '01'}${c ? constitucion.slice(5, 7) : '01'}${anio}`;
}

// Tramo de cifra de negocios de los doce meses anteriores (campo 26 de la página 01): «0» no consta (menos de 10 M),
// «1» de 10 a 20 M, «2» de 20 a 60 M y «3» 60 M o más.
const tramoIncn = (incn) => (incn >= 6e7 ? '3' : incn >= 2e7 ? '2' : incn >= 1e7 ? '1' : '0');

// 202 de un pago fraccionado. x: una de las tres entradas de modelo202 (modalidad del art. 40.2: la cuota del último
// Impuesto sobre Sociedades y el 18 %) o de modelo202Art403 (modalidad del art. 40.3: la base de los 3, 9 u 11 primeros
// meses). is: el borrador del año (lib/modelos.js borradorSociedades), del que salen las marcas de datos adicionales.
//
// Lo que el diseño pide y Fisquo no tiene, que hay que completar en la Sede tras importar: el C.N.A.E. de la actividad
// principal (campo 14; la app guarda el epígrafe del IAE, que es otra clasificación) y el tipo de gravamen del ejercicio
// en curso (campo 25), una cadena de 15 posiciones cuyo formato el diseño no documenta y que la Sede ofrece en un
// desplegable. La cuenta de domiciliación (página 02) también se elige en el formulario.
export function fichero202({ nif, nombre }, anio, x, { is = null, constitucion = '' } = {}) {
  if (anio < 2025) throw new Error('El diseño del fichero 202 está disponible desde el ejercicio 2025');
  if (![1, 2, 3].includes(x?.p)) throw new Error('El 202 solo tiene tres pagos: abril, octubre y diciembre');
  const art403 = x.modalidad === '40.3';
  if (!art403 && !(x.cuota > 0)) throw new Error(`Sin la cuota del Impuesto sobre Sociedades de ${x.de} no hay 202 que presentar: apúntala en Impuestos`);
  if (is?.foral) throw new Error('En territorio foral el pago fraccionado se presenta en su Hacienda, con otro modelo');
  const pago = r2(x.pago || 0);
  // Nota 1 del diseño: I ingreso, U domiciliación, G ingreso en C.C.T. y N negativa, sin actividad o resultado cero. La
  // forma de pago se elige en el formulario, así que un pago a ingresar sale como I.
  const tipo = pago > 0 ? 'I' : 'N';
  // Modalidad del art. 40.3: el ajuste de los gastos no deducibles es la diferencia entre la base previa y el resultado
  // contable del periodo. Va entero al «resto de correcciones» (casilla 07) y al total de aumentos (casilla 38): Fisquo no
  // separa aquí la parte que es el propio Impuesto sobre Sociedades (casilla 05), y la base previa (casilla 13) sale igual.
  const correcciones = art403 ? Math.max(0, r2(x.basePrevia - x.resultadoContable)) : 0;

  const p1 = registro(700, [
    [1, '<T20201000>'], [13, tipo], ...identidad(nif, nombre),
    // 103: normativa de territorio foral (nota 9), en blanco: el fichero de la AEAT no es el de las Haciendas forales.
    [104, numero(anio, 4)], [108, `${x.p}P`], [110, inicioPeriodo(anio, constitucion)],
    [118, '0000'], // C.N.A.E. de la actividad principal: no se inventa, se elige en la Sede (nota 12).
    // Datos adicionales (apartado 3). Solo se marca lo que se deduce de los datos: la reducida dimensión del art. 101, los
    // 6 M de cifra de negocios que obligan al art. 40.3 y el millón de la microempresa. Las demás marcas (régimen de la
    // Ley 49/2002, SOCIMI, capital-riesgo, tonelaje, cooperativa, la de la nota 7 con la RIC, la ZEC y las bonificaciones
    // de Ceuta y del art. 34, y las entidades con varios tipos) quedan en blanco: dependen de regímenes que la app no sabe.
    [126, marca(is?.tamano === 'reducida')], [127, marca(is && is.incn > 6e6)], [130, marca(is?.tamano === 'micro')],
    // 132: tipo de gravamen del ejercicio en curso, 15 posiciones alfanuméricas sin formato documentado; en blanco.
    [147, tramoIncn(is?.incn || 0)], [148, art403 ? 'B' : 'A'],
    // A) Modalidad del art. 40.2: base (01), resultado de la declaración anterior si es complementaria (02) y a ingresar (03).
    [149, U(art403 ? 0 : x.cuota)], [166, U(0)], [183, U(art403 ? 0 : pago)],
    // B) Modalidad del art. 40.3, hasta la base imponible previa.
    [200, N(art403 ? x.resultadoContable : 0)], // 04 resultado contable después del IS e IC
    [217, U(0)], [234, U(0)], // 05 y 06 correcciones por el Impuesto sobre Sociedades
    [251, U(0)], [268, U(0)], // 67 Impuesto Complementario y 37 el 30 % de la amortización contable
    [285, U(correcciones)], [302, U(0)], // 07 y 08 resto de correcciones
    [319, U(correcciones)], [336, U(0)], // 38 y 39 total de aumentos y disminuciones
    [353, N(art403 ? x.basePrevia : 0)], // 13 base imponible previa
    [370, U(0)], // 44 remanente de la reserva de capitalización no aplicada
    [387, U(art403 ? x.compensacion : 0)], // 14 bases negativas de ejercicios anteriores
    [404, U(0)], [421, U(0)], // 45 y 46 reserva de nivelación
    [689, '</T20201000>'],
  ]);

  // Página 02: el cálculo del art. 40.3 y los datos comunes. En la modalidad del art. 40.2 va con sus numéricos a cero
  // (nota 4): la página existe igual, porque lleva la complementaria y la cuenta de domiciliación.
  const tramos = art403 ? x.tramos : [];
  // Un solo porcentaje (caso general, B1) o dos (la microempresa parte la base en los primeros 50.000 € y el resto, B2).
  const unTipo = tramos.length < 2;
  const [t1, t2] = tramos;
  const b1 = (v) => (art403 && unTipo ? v : 0);
  const b2 = (v) => (art403 && !unTipo ? v : 0);
  // Casilla 32 = [(18 o 26) − 27 − 28] × 29/100 − 30 − 31 (instrucciones del 202 para 2025). Es un campo sin signo: un
  // resultado negativo no se escribe, la declaración sale como negativa y la 34 es el mayor de la 32 y la 33.
  const c32 = art403 ? Math.max(0, r2(x.previo - x.retenciones - x.anteriores)) : 0;
  const c33 = art403 ? r2(x.minimo || 0) : 0;

  const p2 = registro(900, [
    [1, '<T20202000>'],
    // B1: caso general con un porcentaje único (16, 17 y 18); las dotaciones del art. 11.12, las cuotas negativas de
    // cooperativas y la reserva de nivelación (47, 40, 48 y 49) quedan a cero.
    [13, U(b1(x.base))], [30, pct(b1(t1?.pct || 0))], [35, N(0)], [52, U(0)], [69, U(0)], [86, U(0)], [103, U(b1(x.previo))],
    // B2: casos específicos con más de un porcentaje (19 a 26). Fisquo usa como mucho dos tipos: los tramos 3 y 4 van a cero.
    [120, U(b2(x.base))], [137, N(b2(t1?.base || 0))], [154, pct(b2(t1?.pct || 0))], [159, N(b2(t1?.cuota || 0))],
    [176, N(b2(t2?.base || 0))], [193, pct(b2(t2?.pct || 0))], [198, N(b2(t2?.cuota || 0))],
    [215, N(0)], [232, pct(0)], [237, N(0)], [254, N(0)], [271, pct(0)], [276, N(0)],
    [293, U(0)], [310, U(0)], [327, U(0)], [344, U(0)], [361, U(b2(x.previo))],
    // 27 bonificaciones del periodo: a cero, Fisquo no sabe qué parte de la bonificación anual toca a cada periodo
    // (lib/modelos.js modelo202Art403), así que el pago puede salir algo alto.
    [378, U(0)],
    [395, U(art403 ? x.retenciones : 0)], // 28 retenciones e ingresos a cuenta del periodo
    [412, pct(art403 ? 100 : 0)], // 29 volumen de operaciones en territorio común: todo, sin reparto foral
    [417, U(art403 ? x.anteriores : 0)], // 30 pagos fraccionados anteriores del mismo periodo
    [434, U(0)], // 31 resultado de la declaración anterior (complementarias)
    [451, U(c32)], [468, U(c33)], [485, U(art403 ? Math.max(c32, c33) : 0)], // 32, 33 y 34
    // 502: comunicación de datos adicionales a la declaración, y 503 el número de referencia de Sociedades: en blanco.
    // Información adicional (apartado 5): quitas y esperas, reversión de deterioros, RIC, art. 26 de la Ley 19/1994, ZEC,
    // art. 33 LIS, art. 17.2 LIS, régimen del cap. XIV del tít. VII y art. 34 LIS. Nada de eso lo calcula la app: a cero.
    ...[525, 542, 559, 576, 593, 610, 627, 644, 661, 678, 695].map((pos) => [pos, U(0)]),
    // 712 y 713: declaración complementaria y justificante de la anterior. 726: IBAN de la domiciliación, que se elige en
    // el formulario. Todos en blanco.
    [889, '</T20202000>'],
  ]);

  return { contenido: sobre('202', anio, `${x.p}P`, [p1, p2]), resultado: pago, tipo, modalidad: art403 ? '40.3' : '40.2' };
}

export const nombreFichero202 = (anio, p) => nombreFichero('202', anio, `${p}P`);

// ---------- Modelo 200: relación de casillas ----------

// Las casillas del 200 que salen del borrador, con su número, su página en el diseño DR200e25 y su importe. El esqueleto
// de la liquidación va siempre (aunque valga cero, como en lib/cuentasAnuales.js csvPymes) y el detalle solo cuando hay
// algo: así la tabla se teclea de arriba abajo en Sociedades WEB sin leer filas vacías.
// is: borradorSociedades del año. pagos: los pagos del 202 marcados ese año ({ 1: importe, 2: …, 3: … }).
export function casillas200(is, { pagos = {} } = {}) {
  if (!is) throw new Error('No hay borrador del Impuesto sobre Sociedades de este año');
  if (is.foral) throw new Error('En territorio foral el Impuesto sobre Sociedades se presenta en su Hacienda, con otro modelo');
  const filas = [];
  const fila = (casilla, pagina, concepto, v, { siempre = false, codigo = false } = {}) => {
    const x = codigo ? Number(v) || 0 : r2(v || 0);
    if (siempre || x) filas.push({ casilla, pagina, concepto, importe: x, ...(codigo ? { codigo: true } : {}) });
  };
  // Gastos no deducibles del art. 15 LIS: cada motivo tiene su casilla de aumento. El propio impuesto (art. 15.b) es la
  // «corrección por Impuesto sobre Sociedades» que lleva del resultado contable al resultado antes de impuestos, así que
  // no cuenta en el total de correcciones; los marcados a mano no se sabe de qué letra son y van a «otras correcciones».
  const porMotivo = (re) => r2((is.noDeducibles || []).filter((g) => re.test(g.motivo)).reduce((s, g) => s + g.importe, 0));
  const impuesto = porMotivo(/art\. 15\.b/);
  const sanciones = porMotivo(/art\. 15\.c/);
  const donativos15e = porMotivo(/art\. 15\.e/);
  const otras = r2(is.ajusteNoDeducible - impuesto - sanciones - donativos15e);
  const aumentos = r2(sanciones + donativos15e + otras);
  const aplicada = (tipo) => r2((is.deduccionesAplicadas || []).filter((d) => d.tipo === tipo).reduce((s, d) => s + d.importe, 0));

  fila('00500', '12', 'Resultado de la cuenta de pérdidas y ganancias', is.resultadoContable, { siempre: true });
  fila('00301', '12', 'Correcciones por Impuesto sobre Sociedades (aumentos)', impuesto);
  fila('00501', '12', 'Resultado antes del Impuesto sobre Sociedades y del Impuesto Complementario', r2(is.resultadoContable + impuesto), { siempre: true });
  fila('01815', '12', 'Multas, sanciones y recargos, art. 15.c LIS (aumentos)', sanciones);
  fila('00339', '12', 'Gastos por donativos y liberalidades, art. 15.e LIS (aumentos)', donativos15e);
  fila('00413', '13', 'Otras correcciones al resultado de la cuenta de pérdidas y ganancias (aumentos)', otras);
  fila('00417', '13', 'Total de correcciones al resultado contable (aumentos)', aumentos, { siempre: true });
  fila('00418', '13', 'Total de correcciones al resultado contable (disminuciones)', 0, { siempre: true });
  fila('00550', '14', 'Base imponible antes de la compensación de bases imponibles negativas', is.basePrevia, { siempre: true });
  fila('01032', '14', 'Reserva de capitalización, art. 25 LIS', is.reserva?.aplicada);
  fila('00547', '14', 'Compensación de bases imponibles negativas de periodos anteriores, art. 26 LIS', is.compensacion);
  fila('00552', '14', 'Base imponible', is.base, { siempre: true });
  // Nota 1 de la página 14 del diseño: el tipo se escribe sin coma y con dos decimales (el 25 % es 2500) y, con dos
  // tipos, uno detrás del otro (el 19/21 % de la microempresa es 1921).
  const [tipo1, tipo2] = is.tipos || [];
  fila('00558', '14', 'Tipo de gravamen (el 25 % se escribe 2500; dos tipos, uno detrás del otro: 19/21 % es 1921)',
    !tipo1 ? 0 : tipo1 === tipo2 ? tipo1 * 100 : Number(`${tipo1}${tipo2}`), { siempre: true, codigo: true });
  fila('00562', '14', 'Cuota íntegra', is.cuotaIntegra, { siempre: true });
  fila('00567', '14', 'Bonificación por rentas obtenidas en Ceuta y Melilla, art. 33 LIS', aplicada('ceuta'));
  fila('00568', '14', 'Bonificación por prestación de servicios públicos locales, art. 34 LIS', aplicada('serviciosLocales'));
  fila('01344', '14', 'Doble imposición interna de periodos anteriores aplicada en el ejercicio, DT 23.ª LIS', aplicada('ddiInterna'));
  fila('00571', '14', 'Doble imposición internacional de periodos anteriores aplicada en el ejercicio, arts. 31 y 32 LIS', r2(aplicada('ddiJuridica') + aplicada('ddiEconomica')));
  fila('00582', '14', 'Cuota íntegra ajustada positiva', is.cuotaAjustada, { siempre: true });
  fila('00588', '14 bis', 'Deducciones para incentivar determinadas actividades, cap. IV del tít. VI LIS', is.deduccionesCapIV);
  fila('00565', '14 bis', 'Deducción por donaciones a entidades sin fines de lucro, Ley 49/2002', is.donativos);
  fila('00592', '14 bis', 'Cuota líquida', is.cuotaLiquida, { siempre: true });
  fila('01766', '14 bis', 'Total de retenciones e ingresos a cuenta soportados por la entidad', is.retenciones, { siempre: true });
  fila('00599', '14 bis', 'Cuota del ejercicio a ingresar o a devolver (es la base del 202 del año siguiente, art. 40.2 LIS)', is.cuotaEjercicio, { siempre: true });
  let hechos = 0;
  for (const [p, casilla] of [[1, '00601'], [2, '00603'], [3, '00605']]) {
    const v = r2(pagos?.[p] || 0);
    hechos = r2(hechos + v);
    fila(casilla, '14 bis', `${p}.º pago fraccionado del 202`, v);
  }
  // La cuota diferencial sale de las casillas de arriba, no del borrador: así la tabla cuadra sola. Coincide con el
  // «saldría a pagar» de la pantalla cuando los pagos son los mismos que vio el borrador (los marcados del año).
  const diferencial = r2(is.cuotaEjercicio - hechos);
  fila('00611', '14 bis', 'Cuota diferencial', diferencial, { siempre: true });
  // Sin intereses de demora ni incrementos por incumplimientos, que la app no calcula, el resultado es la cuota diferencial.
  fila('01586', '14 bis', 'Resultado de la autoliquidación', diferencial, { siempre: true });
  return filas;
}

// CSV con el mismo separador y los mismos decimales que el resto de exportaciones de la app (lib/cuentasAnuales.js).
export function csvCasillas200(is, anio, opciones = {}) {
  const campo = (v) => (/[;"\r\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
  const filas = [['casilla', 'página', 'concepto', `importe ${anio}`]];
  for (const f of casillas200(is, opciones)) {
    filas.push([f.casilla, f.pagina, f.concepto, f.codigo ? String(f.importe) : f.importe.toFixed(2).replace('.', ',')]);
  }
  return `﻿${filas.map((f) => f.map(campo).join(';')).join('\r\n')}\r\n`;
}

export const nombreCsv200 = (anio) => `casillas-200-${anio}.csv`;
