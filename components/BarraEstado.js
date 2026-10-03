'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Color de la barra de estado del móvil (hora, batería): verde en el resumen y en la pantalla de inicio,
// del color del fondo en el resto. iOS pone el texto en blanco o negro según el color, así siempre se lee.
export default function BarraEstado() {
  const path = usePathname();
  useEffect(() => {
    const html = document.documentElement;
    const poner = () => {
      const oscuro = matchMedia('(prefers-color-scheme: dark)').matches;
      const verde = oscuro ? '#102521' : '#0F1F1B';
      const papel = oscuro ? '#08110F' : '#F3F4F1';
      const inicio = document.getElementById('arranque') && html.dataset.arranque !== 'visto';
      const bloqueada = !html.dataset.abierta && document.querySelector('.pantalla-bloqueo');
      const color = inicio || (location.pathname === '/' && !bloqueada) ? verde : papel;
      const metas = document.querySelectorAll('meta[name="theme-color"]');
      if (metas.length === 1 && metas[0].content === color && !metas[0].media) return;
      // Se cambia la etiqueta entera: Safari vuelve a leerla y repinta la barra
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
      const m = document.createElement('meta');
      m.name = 'theme-color';
      m.content = color;
      document.head.appendChild(m);
    };
    poner();
    const o = new MutationObserver(poner);
    o.observe(html, { attributes: true, attributeFilter: ['data-abierta', 'data-arranque'] });
    o.observe(document.body, { childList: true });
    o.observe(document.head, { childList: true }); // Next vuelve a poner su theme-color al cambiar de pantalla
    const oscuro = matchMedia('(prefers-color-scheme: dark)');
    oscuro.addEventListener('change', poner);
    return () => { o.disconnect(); oscuro.removeEventListener('change', poner); };
  }, [path]);
  return null;
}
