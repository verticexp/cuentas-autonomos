// Frases traducidas con un elemento dentro (una cifra en negrita, un enlace): la frase se traduce entera, con su {hueco}, y
// aquí se parte por los huecos para meter cada elemento. Así cada idioma pone el elemento donde le toca.
// conHuecos(tr('Cobrado {pagado} de {total} · faltan {pendiente}'), { pagado: eur(x), total: eur(y), pendiente: <strong>{eur(z)}</strong> })
import { Fragment, createElement } from 'react';

export function conHuecos(texto, nodos) {
  return String(texto).split(/(\{\w+\})/).map((parte, i) => {
    const m = /^\{(\w+)\}$/.exec(parte);
    const valor = m && m[1] in nodos ? nodos[m[1]] : parte;
    return createElement(Fragment, { key: i }, valor);
  });
}
