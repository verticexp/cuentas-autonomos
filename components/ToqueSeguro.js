'use client';

import { useEffect } from 'react';

// En el iPhone (Safari y la app), al tocar un hueco donde no hay nada que pulsar, WebKit «ayuda» y lleva el toque al botón o
// enlace más cercano: se pulsaba un botón tocando el espacio en blanco de al lado. Si lo que hay debajo del dedo también
// cuenta como pulsable (un clic que no hace nada), el toque se queda donde cae. WebKit no tiene en cuenta el body ni el html,
// así que va en cada elemento que cuelga del body (la pantalla, las barras), también en los que llegan al navegar.
const nada = () => {};

export default function ToqueSeguro() {
  useEffect(() => {
    const poner = () => { for (const el of document.body.children) if (!el.onclick && el.tagName !== 'SCRIPT') el.onclick = nada; };
    poner();
    const o = new MutationObserver(poner);
    o.observe(document.body, { childList: true });
    return () => o.disconnect();
  }, []);
  return null;
}
