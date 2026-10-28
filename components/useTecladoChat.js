'use client';

import { useEffect } from 'react';

// Teclado del móvil en una conversación a pantalla completa, como WhatsApp (el chat con la gestoría, components/Chat.js,
// y el asistente, components/Asistente.js). iOS no encoge la pantalla al sacar el teclado: la desplaza hacia arriba y
// la conversación quedaba por debajo, con la cabecera fuera de la vista. visualViewport dice cuánto se ve y desde dónde:
// la página (selector) se ajusta a ese hueco y lleva .con-teclado mientras está fuera.
// lista: la caja de mensajes (lo único que se desplaza); pegado: si se estaba viendo lo último, se sigue viendo.
export default function useTecladoChat(lista, selector, { pegado, alFinal }) {
  useEffect(() => {
    const vv = window.visualViewport;
    const pagina = lista.current?.closest(selector);
    if (!vv || !pagina) return undefined;
    const movil = matchMedia('(max-width: 1023.98px)');
    const tactil = matchMedia('(pointer: coarse)');
    // Teclado fuera: escribiendo en la página con el dedo (en algunos iPhone la pantalla entera encoge con el teclado y el
    // alto por sí solo no lo dice) o la parte visible bastante más baja que la pantalla.
    const conTeclado = () => (tactil.matches && pagina.contains(document.activeElement) && document.activeElement.matches('textarea, input:not([type="checkbox"]):not([type="radio"])'))
      || vv.height < window.innerHeight * 0.8;
    let marco = 0;
    const ajustar = () => {
      cancelAnimationFrame(marco);
      marco = requestAnimationFrame(() => {
        if (!movil.matches) { pagina.style.height = ''; pagina.style.top = ''; pagina.classList.remove('con-teclado'); return; }
        pagina.style.height = `${Math.round(vv.height)}px`;
        pagina.style.top = `${Math.round(vv.offsetTop)}px`;
        pagina.classList.toggle('con-teclado', conTeclado());
        if (pegado.current) alFinal();
      });
    };
    vv.addEventListener('resize', ajustar);
    vv.addEventListener('scroll', ajustar);
    movil.addEventListener('change', ajustar);
    pagina.addEventListener('focusin', ajustar);
    pagina.addEventListener('focusout', ajustar);
    ajustar();
    return () => {
      cancelAnimationFrame(marco);
      vv.removeEventListener('resize', ajustar);
      vv.removeEventListener('scroll', ajustar);
      movil.removeEventListener('change', ajustar);
      pagina.removeEventListener('focusin', ajustar);
      pagina.removeEventListener('focusout', ajustar);
      pagina.style.height = ''; pagina.style.top = ''; pagina.classList.remove('con-teclado');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
