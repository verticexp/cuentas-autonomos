import { PLANES } from '../components/web/datos.js';

// Precios de Fisquo para las comparativas, leídos de la oferta pública (components/web/datos.js) para que nunca
// contradigan la página de precios.
export function preciosFisquo() {
  const aut = PLANES.aut.map((p) => p.p), pym = PLANES.pym.map((p) => p.p);
  const todos = [...aut, ...pym];
  return { aut, pym, min: Math.min(...todos), max: Math.max(...todos) };
}

// Sustituye {min}, {max}, {aut} y {pym} por los precios de entrada y de techo de Fisquo.
export function rellenar(texto, precios = preciosFisquo()) {
  const v = { min: precios.min, max: precios.max, aut: precios.aut[0], pym: precios.pym[0] };
  return texto.replace(/\{(min|max|aut|pym)\}/g, (_, k) => String(v[k]));
}

export const euros = (n) => `${n.toLocaleString('es-ES')} €`;
export const listaPrecios = (lista) => lista.map((n) => `${n}`).join(' · ');
