'use client';

import { useEffect } from 'react';

// Registra el service worker (app/sw) en la web instalada como app: sin él, «Compartir con Fisquo» del móvil (Web Share
// Target, app/manifest.js) no llega a la bandeja. En la app de iOS no (no lo usa) ni en el navegador normal.
export default function RegistrarSw() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !matchMedia('(display-mode: standalone)').matches || document.documentElement.dataset.app === 'ios') return;
    navigator.serviceWorker.register('/sw', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
