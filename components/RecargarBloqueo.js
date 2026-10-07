'use client';

import { useEffect } from 'react';
import { ABIERTA } from '@/components/Bloqueo';

// Si se llega a /bloqueo navegando dentro de la app, el layout no se vuelve a pintar y el navegador aún la da por
// abierta: se avisa a components/Bloqueo.js para que salga la pantalla de bloqueo (sin recargar).
export default function RecargarBloqueo() {
  useEffect(() => {
    if (!document.documentElement.dataset.abierta) return;
    try { sessionStorage.removeItem(ABIERTA); } catch {}
    window.dispatchEvent(new Event('netto-bloquear'));
  }, []);
  return null;
}
