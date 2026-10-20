'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Color de la barra de estado del móvil (hora, batería): acompaña a la cabecera del resumen,
// al arranque de marca o al fondo de la pantalla. iOS pone el texto en blanco o negro según el color, así siempre se lee.
export default function BarraEstado() {
  const path = usePathname();
  useEffect(() => {
    const html = document.documentElement;
    const poner = () => {
      const oscuro = html.dataset.tema === 'oscuro' || (
        html.dataset.tema !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches
      );
      const cabecera = oscuro ? '#242629' : '#0F1F1B';
      const papel = oscuro ? '#111214' : '#F3F4F1';
      const inicio = document.getElementById('arranque') && html.dataset.arranque !== 'visto';
      const bloqueada = !html.dataset.abierta && document.querySelector('.pantalla-bloqueo');
      const color = inicio ? '#0F1F1B' : (location.pathname === '/' && !bloqueada) ? cabecera : papel;
      // Solo se cambia el color de las etiquetas que ya hay (son de Next: quitarlas rompía la navegación)
      const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
      if (!metas.length) { const m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); metas.push(m); }
      for (const m of metas) {
        if (m.content !== color) m.content = color;
        if (m.media) m.removeAttribute('media');
      }
    };
    poner();
    const o = new MutationObserver(poner);
    o.observe(html, { attributes: true, attributeFilter: ['data-abierta', 'data-arranque'] });
    o.observe(document.body, { childList: true });
    o.observe(document.head, { childList: true }); // por si Next vuelve a poner su theme-color al cambiar de pantalla
    const oscuro = matchMedia('(prefers-color-scheme: dark)');
    oscuro.addEventListener('change', poner);
    window.addEventListener('fisquo-tema', poner);
    return () => {
      o.disconnect();
      oscuro.removeEventListener('change', poner);
      window.removeEventListener('fisquo-tema', poner);
    };
  }, [path]);
  return null;
}
