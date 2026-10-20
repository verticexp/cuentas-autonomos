// Tope «redondo» para el eje de una gráfica: el menor de 1, 2, 3, 4, 5, 6, 8 o 10 × 10ⁿ que llega al valor, para que
// las marcas (tope, mitad y 0) salgan en cifras limpias (40 k / 20 k / 0) y no en 32,3 k / 16,1 k. Sin datos: 0.
const PASOS = [1, 2, 3, 4, 5, 6, 8, 10];

export function topeRedondo(v) {
  if (!(v > 0)) return 0;
  const mag = 10 ** Math.floor(Math.log10(v));
  return PASOS.map((p) => p * mag).find((t) => t >= v - 1e-9);
}
