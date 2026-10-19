'use client';

import Link from '@/components/web/EnlacePublico';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Icono from '@/components/web/Icono';

// Páginas que ya son un formulario o no venden el alta.
const SIN_BARRA = ['/contacto', '/gestorias'];

// Botón fijo abajo en el móvil: aparece pasada la primera pantalla y se retira al llegar a la llamada final o al pie.
export default function BarraCta() {
  const ruta = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const f = () => {
      const fin = document.querySelector('.web-cta-final, .web-pie');
      setVisible(window.scrollY > window.innerHeight * 0.8 && (!fin || fin.getBoundingClientRect().top > window.innerHeight));
    };
    f();
    addEventListener('scroll', f, { passive: true });
    addEventListener('resize', f);
    return () => { removeEventListener('scroll', f); removeEventListener('resize', f); };
  }, [ruta]);

  if (SIN_BARRA.includes(ruta)) return null;
  return (
    <div className={`web-barra-cta${visible ? ' visible' : ''}`} inert={!visible}>
      <span>1 mes gratis<small>Sin tarjeta</small></span>
      <Link href="/registro" className="web-btn">Empieza gratis<Icono n="flecha" className="ico web-flecha" /></Link>
    </div>
  );
}
