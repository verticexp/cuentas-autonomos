'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { anterior, instalarHistorial, volverA } from '@/lib/transicion';

// Cabecera de las páginas legales: «Fisquo» lleva a la portada; si se llegó desde otra pantalla (Ajustes › Ayuda, el
// login…), «‹ Atrás» vuelve a ella en vez de abrir el resumen encima (dentro de la app no hay otra forma de volver).
export default function VolverLegal() {
  const router = useRouter();
  const [atras, setAtras] = useState(false);
  useEffect(() => { instalarHistorial(); setAtras(Boolean(anterior())); }, []);
  const alPulsar = (e) => {
    if (!atras || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    volverA(router, '/');
  };
  return <a className="legal-volver" href="/" onClick={alPulsar}>{atras ? '‹ Atrás' : 'Fisquo'}</a>;
}
