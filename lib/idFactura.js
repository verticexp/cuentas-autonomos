// El número visible puede llevar ceros de relleno; la clave guardada no los lleva.
export function normalizarIdFactura(id) {
  if (typeof id !== 'string') return id;
  return id.replace(/^([A-Z]{0,3}[0-9]{4}-)0+([0-9]+)$/, '$1$2');
}
