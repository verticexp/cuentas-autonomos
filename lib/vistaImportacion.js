export const FILAS_POR_PAGINA = 50;

// Filtrar antes de paginar mantiene accesibles también los errores al final del archivo.
export function vistaImportacion(items, estado = 'todos', pagina = 1) {
  const filtradas = estado === 'todos' ? items : items.filter((x) => x.estado === estado);
  const total = filtradas.length;
  const paginas = Math.max(1, Math.ceil(total / FILAS_POR_PAGINA));
  const actual = Math.min(paginas, Math.max(1, Number.isInteger(pagina) ? pagina : 1));
  const inicio = (actual - 1) * FILAS_POR_PAGINA;
  return { items: filtradas.slice(inicio, inicio + FILAS_POR_PAGINA), total, paginas, pagina: actual, desde: total ? inicio + 1 : 0, hasta: Math.min(inicio + FILAS_POR_PAGINA, total) };
}
