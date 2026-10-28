'use client';

import Logo from '@/components/Logo';
import { useT } from '@/components/Idioma';
import '@/app/entrar.css';

// Mitad izquierda de la pantalla de entrar en el ordenador: el verde y el logo de la pantalla de inicio, en el mismo
// sitio y tamaño, para que la animación de inicio se recoja aquí sin saltos (components/Arranque.js). En el móvil no sale.
export default function PanelMarca() {
  const tr = useT();
  return (
    <div className="login-marca" aria-hidden>
      <Logo className="login-marca-logo" />
      <p className="login-lema">{tr('Tu negocio, en orden.')}</p>
    </div>
  );
}
