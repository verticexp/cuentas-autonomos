// Nombre y tipo del libro diario en el formato del programa de la gestoría (A3, ContaPlus o ContaSol,
// lib/exportarContable.js). Lo exportan Exportar (app/api/exportar/contable) y Mi despacho (app/api/despacho/contable)
// con diarioConCierreDe (lib/contabilidad.js).
export const FORMATOS_DIARIO = ['a3', 'contaplus', 'contasol'];
// ContaSol busca el archivo por su nombre: «APU.ods».
export const nombreDiario = (formato, anio) => (formato === 'a3' ? 'SUENLACE.DAT' : formato === 'contaplus' ? `XDiario-${anio}.txt` : 'APU.ods');
export const tipoDiario = (formato) => (formato === 'contasol' ? 'application/vnd.oasis.opendocument.spreadsheet' : 'text/plain; charset=us-ascii');
// ?digitos= de la petición: los de las subcuentas en el programa de destino (8 si no se dice).
export const digitosDe = (q) => (q.has('digitos') ? Number(q.get('digitos')) : 8);
