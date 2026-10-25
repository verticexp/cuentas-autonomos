// Guía «¿Cómo descargo el extracto de mi banco?» (components/GuiaExtracto.js). Sin rutas de menú exactas: los bancos cambian
// sus webs y apps a menudo, así que cada uno lleva las palabras que hay que buscar y dónde suele estar. Solo datos, para poder probarlo.

// Lo que lee Fisquo (app/api/banco/importar/route.js): mismos formatos y límites que la subida.
export const FORMATOS_EXTRACTO = [
  ['Norma 43', 'el mejor: trae la cuenta y el saldo (extensiones .n43, .aeb, .q43 o .txt)'],
  ['CSV o Excel (.xlsx)', 'con una columna de fecha, otra de concepto y el importe (o cargo y abono)'],
  ['PDF', 'también vale, pero lo lee la IA y gasta páginas de tu bolsa (máximo 10 páginas y 3 MB)'],
];
export const LIMITES_EXTRACTO = 'Hasta 5 MB y 5.000 movimientos por archivo.';

export const CONSEJOS_EXTRACTO = [
  'Descarga el periodo completo, por ejemplo el mes entero. Si subes dos veces los mismos movimientos, no se duplica nada.',
  'Sube un extracto por cuenta. Fisquo reconoce la cuenta por su IBAN o te pregunta a cuál pertenece.',
  'Un Excel antiguo (.xls) no se lee: ábrelo y guárdalo como .xlsx o CSV.',
];

export const AVISO_MENUS = 'Los nombres de los menús cambian con cada versión de la banca online. Si no ves el botón, busca estas palabras en el buscador de la web o en la ayuda del banco.';

// Lo mismo para casi todos: la banca de empresas suele ofrecer Norma 43; la de particulares, Excel o CSV.
const ESPANOLES = {
  buscar: 'Abre la cuenta y entra en «Movimientos» (o «Extractos»). Busca «Descargar» o «Exportar» y elige el periodo.',
  formato: 'En la banca para empresas suele estar «Norma 43» (también «Cuaderno 43»). En la de particulares, Excel o CSV.',
};

export const BANCOS_EXTRACTO = [
  { id: 'caixabank', nombre: 'CaixaBank', donde: 'En la web o la app de CaixaBank (CaixaBankNow), dentro de la cuenta. Si es de empresa, en su banca online para empresas.', ...ESPANOLES },
  { id: 'santander', nombre: 'Santander', donde: 'En la banca online de Santander, dentro de la cuenta. Si es de empresa, en su banca online para empresas.', ...ESPANOLES },
  { id: 'bbva', nombre: 'BBVA', donde: 'En la web de BBVA, dentro de la cuenta. Si es de empresa, en su banca online para empresas (BBVA Net Cash).', ...ESPANOLES },
  { id: 'sabadell', nombre: 'Sabadell', donde: 'En la banca online de Banco Sabadell, dentro de la cuenta. Si es de empresa, en su banca online para empresas.', ...ESPANOLES },
  { id: 'bankinter', nombre: 'Bankinter', donde: 'En la banca online de Bankinter, dentro de la cuenta. Si es de empresa, en su banca online para empresas.', ...ESPANOLES },
  {
    id: 'ing', nombre: 'ING', donde: 'En la web de ING, dentro de tu cuenta.',
    buscar: 'Entra en los movimientos de la cuenta y busca «Descargar» o «Exportar».',
    formato: 'Excel (.xlsx) o CSV. ING no suele ofrecer Norma 43. Si solo te da un .xls, guárdalo como .xlsx.',
  },
  { id: 'unicaja', nombre: 'Unicaja', donde: 'En la banca online de Unicaja, dentro de la cuenta. Si es de empresa, en su banca online para empresas.', ...ESPANOLES },
  { id: 'kutxabank', nombre: 'Kutxabank', donde: 'En la banca online de Kutxabank (o de su marca local: Kutxa, BBK, Vital), dentro de la cuenta. Si es de empresa, en su banca para empresas.', ...ESPANOLES },
  { id: 'abanca', nombre: 'Abanca', donde: 'En la banca online de Abanca, dentro de la cuenta. Si es de empresa, en su banca online para empresas.', ...ESPANOLES },
  { id: 'ibercaja', nombre: 'Ibercaja', donde: 'En la banca online de Ibercaja, dentro de la cuenta. Si es de empresa, en su banca online para empresas.', ...ESPANOLES },
  {
    id: 'openbank', nombre: 'Openbank', donde: 'En la web o la app de Openbank, dentro de la cuenta.',
    buscar: 'Entra en los movimientos de la cuenta y busca «Descargar» o «Exportar».',
    formato: 'Excel (.xlsx) o CSV; si solo te da PDF, también vale. Openbank no suele ofrecer Norma 43.',
  },
  { id: 'cajamar', nombre: 'Cajamar', donde: 'En la banca online de Cajamar, dentro de la cuenta. Si es de empresa, en su banca online para empresas.', ...ESPANOLES },
  {
    id: 'revolut', nombre: 'Revolut', donde: 'En la app o la web de Revolut (personal o Business), dentro de la cuenta en euros.',
    buscar: 'Busca «Extractos» (o «Estado de cuenta») y elige el periodo y el formato.',
    formato: 'Excel o CSV, o PDF si no hay más. Revolut no suele ofrecer Norma 43.',
  },
  {
    id: 'otro', nombre: 'Otro banco', donde: 'En la banca online de tu banco o caja, dentro de la cuenta que quieres subir.',
    buscar: 'Busca «Movimientos», «Extractos» o «Histórico» y, ahí, «Descargar», «Exportar» o «Exportar a Excel».',
    formato: 'Si eres empresa, pide «Norma 43» (también «Cuaderno 43» o «AEB 43»): es un estándar de la banca española y cualquier oficina te dice si lo tienes. Si no, Excel o CSV.',
  },
];
