'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cerrarHoja } from '@/lib/transicion';
import { salirSinGuardar } from './useCambiosSinGuardar';

// «OK» de la hoja de Ajustes en el móvil: la hoja baja y se ve otra vez la pantalla de la que se vino (sin ella, «Más»),
// como al arrastrarla hacia abajo (components/ArrastrarAjustes.js, lib/transicion.js cerrarHoja).
// El gesto de volver desde el borde (components/GestoAtras.js) lo usa como el «‹ Atrás» de la hoja.
// Con cambios sin guardar en un formulario de Ajustes, pregunta antes (components/useCambiosSinGuardar.js).
export default function CerrarAjustes() {
  const router = useRouter();
  return (
    <Link href="/mas" className="aj-ok" onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
      e.preventDefault();
      salirSinGuardar(() => cerrarHoja(router));
    }}>OK</Link>
  );
}
