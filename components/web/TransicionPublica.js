'use client';

import { ViewTransition } from 'react';
import '@/app/publico-motion.css';

// Next coordina la captura con el contenido nuevo, sin temporizadores ni bloquear la navegación.
export default function TransicionPublica({ children, acceso = false }) {
  return (
    <ViewTransition name={acceso ? 'netto-acceso' : 'netto-web-pagina'} default="none" update="publico-cambio" share="publico-cambio" enter="publico-entra" exit="publico-sale">
      {children}
    </ViewTransition>
  );
}
