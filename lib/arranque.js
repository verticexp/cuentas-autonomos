'use client';

import { useEffect, useState } from 'react';

// Aviso de que la pantalla de inicio (components/Arranque.js) ya se va: hasta entonces no se pinta el formulario de
// entrar, así el navegador no ofrece contraseñas ni llaves de acceso encima de la animación.
export const AVISO = 'netto-arranque-fuera';

const yaFuera = () => document.documentElement.dataset.arranque === 'visto' || window.__arranqueFuera === true;

export function avisarFin() {
  window.__arranqueFuera = true;
  window.dispatchEvent(new Event(AVISO));
}

export function useTrasArranque() {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    if (yaFuera()) { setListo(true); return undefined; }
    const ya = () => setListo(true);
    window.addEventListener(AVISO, ya, { once: true });
    return () => window.removeEventListener(AVISO, ya);
  }, []);
  return listo;
}

export function TrasArranque({ children }) {
  return useTrasArranque() ? children : null;
}

// Con ratón (ordenador) el cursor va solo al campo; en el móvil no, que sacaría el teclado.
export function enfocar(el) {
  if (el && !el.value && matchMedia('(pointer: fine)').matches) el.focus({ preventScroll: true });
}

// Al entrar desde el login: la app se abre con la entrada animada y sin pantalla de bloqueo (components/Bloqueo.js).
export function irALaApp() {
  document.cookie = 'recien=1; path=/; max-age=60; samesite=lax';
  try { sessionStorage.setItem('netto-arranque', '1'); } catch {}
  document.documentElement.dataset.saliendo = '1';
  setTimeout(() => location.replace('/'), 420);
}
