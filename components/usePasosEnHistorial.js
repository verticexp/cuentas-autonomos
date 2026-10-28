'use client';

import { useEffect, useRef } from 'react';
import { crearPasosHistorial } from '@/lib/pasosHistorial';

// Pasos de un formulario en el historial (lib/pasosHistorial.js): avanzar apila una entrada, «Atrás» de la pantalla y el
// del sistema retroceden por el historial. bloqueado: mientras se guarda, atrás no cambia de paso.
export default function usePasosEnHistorial({ paso, base, total, bloqueado, cambiarPaso }) {
  const actual = useRef(null);
  actual.current = { paso, bloqueado, cambiarPaso };
  const historial = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pasos = crearPasosHistorial(window.history, {
      base, total,
      leerPaso: () => actual.current.paso,
      estaBloqueado: () => actual.current.bloqueado,
      cambiarPaso: (n) => {
        actual.current.paso = n;
        actual.current.cambiarPaso(n);
      },
    });
    historial.current = pasos;
    pasos.iniciar();
    // Cada paso es una entrada: con la recolocación automática, al volver el navegador llevaba la pantalla a la altura de la
    // entrada (abajo, donde estaba «Siguiente») justo cuando cambiaba el paso. Cada formulario coloca la pantalla él mismo.
    const recolocacion = window.history.scrollRestoration;
    try { window.history.scrollRestoration = 'manual'; } catch { /* sin soporte: da igual */ }
    window.addEventListener('popstate', pasos.alVolver);
    return () => {
      window.removeEventListener('popstate', pasos.alVolver);
      try { window.history.scrollRestoration = recolocacion; } catch { /* sin soporte */ }
      historial.current = null;
    };
  }, [base, total]);

  return {
    avanzar: (n) => historial.current?.avanzar(n),
    atras: () => historial.current?.atras(),
    saltar: (n) => historial.current?.saltar(n),
  };
}
