// Fichero del modelo 232 (operaciones vinculadas y paraísos fiscales) para el botón «Importar» del formulario de la Sede.
//
// Diseño de registro dr232e17v14, «ejercicio 2016 y siguientes»
// (sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_200_299/archivos_17/dr232e17v14.xlsx). Dos páginas
// de ancho fijo dentro del sobre común <T2320AAAA0A0000>: la 01 de 1.500 posiciones (identificación, devengo, cuadro I
// de operaciones con vinculadas y cuadro II de la reducción de rentas de intangibles) y la 02 de 3.500 (cuadro III:
// operaciones con paraísos fiscales y tenencia de valores). Mismas reglas de relleno que el resto de modelos: los
// alfanuméricos a la izquierda con blancos, los numéricos a la derecha con ceros y en céntimos (15 enteros + 2 decimales).
//
// Cada página admite un número fijo de registros (5 en el cuadro I, 3 en el II, 12 en cada mitad del III). Si no caben,
// el diseño repite la página con la marca de página complementaria («C» en la posición 12).
import { importe, numero, partirNombre, registro, sobre, texto } from './ficheroAeat.js';
import { provinciaDe } from './modelos.js';

const U = (v) => importe(v, 17, false);

// Tabla C del diseño: el tipo de operación de cada grupo de modelo232.
const TIPO_OPERACION = { bienes: '01', servicios: '06', alquileres: '08', intereses: '09' };
// Tabla A: el tipo de vinculación. Las letras de TIPOS_VINCULO (lib/terceros.js) son las del art. 18.2 LIS y coinciden
// con las de la tabla; «otra» no tiene letra y el modelo no admite dejarla en blanco.
const letraVinculo = (fila) => {
  const l = String(fila.letra || '').toUpperCase();
  if (!/^[A-H]$/.test(l)) throw new Error(`Elige una vinculación concreta de ${fila.nombre} en su ficha: el 232 no admite «otra vinculación»`);
  return l;
};

const ENTIDAD = /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/;
const FISICA = /^(\d{8}[A-Z]|[XYZKLM]\d{7}[A-Z])$/;
// Campo «F/J/O»: persona física, jurídica u otra (quien no tiene NIF español con el que decidirlo).
const fjo = (nif) => (FISICA.test(nif) ? 'F' : ENTIDAD.test(nif) ? 'J' : 'O');

// Campo «Código Provincia / País»: el país de dos letras si la contraparte no es residente; si lo es, la provincia de su
// ficha. Son dos posiciones y el diseño no las distingue.
function provinciaOPais(fila, domicilios) {
  const pais = String(fila.pais || '').trim().toUpperCase();
  if (pais && pais !== 'ES') return texto(pais, 2);
  const provincia = provinciaDe(domicilios, fila.nif, fila.nombre);
  if (!provincia) throw new Error(`Falta el código postal de ${fila.nombre}: ponlo en su ficha (Ciudad y CP) para saber su provincia`);
  return provincia;
}

// Importe de la operación: el diseño lo define como «Num», numérico sin signo (nota 2 de la página 00), así que un neto
// negativo no cabe en el modelo. Pasa cuando los abonos de un tipo de operación superan las facturas del año: no se
// maquilla poniéndolo en positivo ni a cero, se dice para que se revise.
const importeOperacion = (v, quien, donde) => {
  if (Number(v) < 0) throw new Error(`${donde} de ${quien} suma ${v} €: el 232 no admite importes negativos (sus campos de importe no llevan signo). Revisa los abonos de ese tipo de operación`);
  return U(v);
};

// Nombre de la contraparte: una persona física va con los apellidos delante, como en el resto de modelos.
const nombre232 = (nif, nombre, lon) => {
  if (!String(nombre || '').trim()) throw new Error('Falta el nombre de una persona o entidad del 232');
  const p = partirNombre(nombre);
  return texto(FISICA.test(nif) ? `${p.apellidos} ${p.nombre}` : nombre, lon);
};

// Reparte una lista en páginas de n registros. La primera es la página normal; las siguientes, complementarias.
const enPaginas = (lista, n) => (lista.length ? Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, (i + 1) * n)) : [[]]);

const CUADRO_I = { desde: 144, ancho: 121, caben: 5 };
const CUADRO_II = { desde: 749, ancho: 116, caben: 3 };
const CUADRO_III = { desde: 13, ancho: 150, caben: 12 };
const TENENCIA = { desde: 1813, ancho: 105, caben: 12 };

// m: modelo232 (lib/modelos.js). domicilios: el mapa de lib/api del 347 y el 180, para la provincia de cada contraparte.
// metodos: el método de valoración (tabla B) por tipo de operación, que Fisquo no puede deducir de las facturas; sin él
// el campo queda en blanco y se elige en la Sede.
export function fichero232({ nif, nombre }, anio, m, { domicilios = new Map(), metodos = {}, constitucion = '' } = {}) {
  if (!m.obligado) throw new Error('Con estos datos no hay obligación de presentar el 232: no se genera el fichero');
  if (m.cuadroII?.length) throw new Error('El cuadro II (reducción de rentas de intangibles, art. 23 LIS) se rellena en la Sede: Fisquo no lo calcula');

  const p = /^[0-9XYZKLM]/.test(nif) ? partirNombre(nombre) : { apellidos: nombre, nombre: '' };
  // Periodo impositivo: el año natural, o desde la constitución si la sociedad nació ese año (tipo de ejercicio 3).
  const nacida = /^\d{4}-\d{2}-\d{2}$/.test(constitucion) && constitucion.slice(0, 4) === String(anio);
  const inicio = nacida ? `${constitucion.slice(8, 10)}${constitucion.slice(5, 7)}${anio}` : `0101${anio}`;
  const identidad = [[14, texto(nif, 9)], [23, texto(p.apellidos, 60)], [83, texto(p.nombre, 20)],
    [103, numero(anio, 4)], [107, '0A'], [109, nacida ? '3' : '1'], [110, inicio], [118, `3112${anio}`],
    // C.N.A.E. de la actividad principal: no se inventa, se elige en la Sede, como en el 202.
    [126, '0000']];

  const paginas = [];
  // Página 01: cuadro I, cinco registros por página. El cuadro II va siempre vacío (no se calcula).
  enPaginas(m.filas, CUADRO_I.caben).forEach((trozo, i) => {
    const campos = [[1, '<T23201000>'], ...(i ? [[12, 'C']] : []), ...identidad];
    trozo.forEach((fila, j) => {
      const base = CUADRO_I.desde + j * CUADRO_I.ancho;
      const tipo = TIPO_OPERACION[fila.tipo];
      if (!tipo) throw new Error(`Tipo de operación del 232 no válido: ${fila.tipo}`);
      if (!['I', 'P'].includes(fila.lado)) throw new Error(`El 232 solo admite ingresos («I») o pagos («P»): ${fila.lado}`);
      campos.push([base, texto(fila.nif, 15)], [base + 15, fjo(fila.nif)], [base + 16, nombre232(fila.nif, fila.nombre, 60)],
        [base + 96, letraVinculo(fila)], [base + 97, provinciaOPais(fila, domicilios)], [base + 99, tipo],
        [base + 101, fila.lado], [base + 102, texto(metodos[fila.tipo] || '', 2)], [base + 104, importeOperacion(fila.importe, fila.nombre, `El ${fila.lado === 'I' ? 'ingreso' : 'pago'} por «${fila.tipo}»`)]);
    });
    campos.push([1489, '</T23201000>']);
    paginas.push(registro(1500, campos));
  });

  // Página 02: cuadro III, doce operaciones por página. La tenencia de valores en paraísos no sale de las facturas.
  if (m.paraisos.length) {
    enPaginas(m.paraisos, CUADRO_III.caben).forEach((trozo, i) => {
      const campos = [[1, '<T23202000>'], ...(i ? [[12, 'C']] : [])];
      trozo.forEach((op, j) => {
        const base = CUADRO_III.desde + j * CUADRO_III.ancho;
        campos.push([base, texto(op.lado === 'I' ? 'Ingresos por ventas' : 'Pagos por compras y servicios', 50)],
          [base + 50, nombre232(op.nif, op.nombre, 60)], [base + 130, fjo(op.nif)],
          [base + 131, texto(op.pais, 2)], [base + 133, importeOperacion(op.importe, op.nombre, `La operación en ${op.pais}`)]);
      });
      campos.push([3489, '</T23202000>']);
      paginas.push(registro(3500, campos));
    });
  }
  return { contenido: sobre('232', anio, '0A', paginas), paginas: paginas.length };
}

export { CUADRO_I, CUADRO_II, CUADRO_III, TENENCIA, TIPO_OPERACION };
