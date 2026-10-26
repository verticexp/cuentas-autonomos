// De qué programa vienen los datos que se importan (tarjeta «¿Vienes de otro programa?» y components/Importar.js).
// El lector es el mismo para todos (lib/importar.js reconoce las columnas por su título): el origen solo decide qué
// indicaciones se enseñan. Son generales a propósito: los menús de cada programa cambian con las versiones.
const COMUN = 'Sube cada archivo aquí tal cual, sin retocarlo: el orden de las columnas da igual y las que sobran se descartan.';

export const ORIGENES = [
  {
    id: 'holded', nombre: 'Holded', corto: 'Holded', resumen: 'Clientes, facturas y gastos en Excel',
    titulo: 'Qué exportar desde Holded',
    pasos: [
      'Abre cada listado de Holded: contactos (tus clientes), facturas de venta y gastos.',
      'Busca la opción de exportar del listado y elige Excel o CSV. Hazlo por separado con cada uno, y amplía antes el filtro de fechas para traer también lo de años anteriores.',
      COMUN,
    ],
    nota: 'El nombre y la posición de las opciones cambian con la versión de Holded: si no ves «Exportar», mira en las acciones del listado o en su ayuda.',
  },
  {
    id: 'quipu', nombre: 'Quipu', corto: 'Quipu', resumen: 'Facturas, gastos y clientes en Excel',
    titulo: 'Qué exportar desde Quipu',
    pasos: [
      'Abre cada listado de Quipu: clientes, facturas emitidas y gastos.',
      'Busca la opción de exportar o descargar del listado y elige Excel o CSV. Hazlo por separado con cada uno, con el filtro de fechas abierto para incluir años anteriores.',
      COMUN,
    ],
    nota: 'El nombre y la posición de las opciones cambian con la versión de Quipu: si no ves «Exportar», mira en las acciones del listado o en su ayuda.',
  },
  {
    id: 'otro', nombre: 'Otro programa o Excel', corto: 'Otro o Excel', resumen: 'Cualquier programa que exporte a Excel o CSV',
    titulo: 'Cómo traer tus datos de otro programa o de un Excel',
    pasos: [
      'Exporta a Excel (.xlsx) o CSV los clientes, las facturas emitidas y los gastos. Vale cualquier programa que lo permita (A3, Sage, Contasol…) o tu propio Excel.',
      'Cada tabla con una fila de títulos arriba y debajo una fila por cada cliente, factura o gasto. Si tu archivo tiene un título encima de la tabla, no pasa nada.',
      'Si alguna columna se llama de otra forma, al subir el archivo podrás indicar cuál es cuál.',
    ],
    nota: 'Para cada tipo (clientes, facturas, gastos…) más abajo tienes qué columnas hacen falta.',
  },
];

// El origen que llega por la dirección (?origen=holded): solo los conocidos.
export const origenValido = (v) => ORIGENES.find((o) => o.id === v)?.id || null;
export const guiaDe = (id) => ORIGENES.find((o) => o.id === id) || null;
