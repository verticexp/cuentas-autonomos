'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { alPulsar } from '@/lib/transicion';

// Enlace con transición (ver lib/transicion.js). Un onClick propio se suma a la transición, no la sustituye.
// Precarga solo de lo que se va a abrir: la pantalla se pide en cuanto el dedo toca o el ratón pasa por encima, así llega
// antes de soltar. Precargar al verse (lo de Link) pedía en segundo plano la pantalla entera de cada fila de una lista (cada
// factura, cada gasto): decenas de consultas a la base de datos y, en el móvil, descargas que frenaban la pantalla que sí se
// abría. prefetch={false} se acepta por compatibilidad: ya es lo de siempre.
// scroll={false}, como en Link: no sube la pantalla (lo que lleva a otra pestaña de la misma pantalla).
export default function Ir({ href, tipo = 'adelante', prefetch, scroll, onClick, children, ...resto }) { // eslint-disable-line no-unused-vars
  const router = useRouter();
  const ir = alPulsar(router, href, tipo, undefined, scroll === false ? { scroll: false } : undefined);
  const precargar = () => { if (!String(href).startsWith('#')) router.prefetch(href); }; // un ancla de esta pantalla no tiene nada que precargar
  return (
    <Link href={href} prefetch={false} scroll={scroll} onPointerDown={precargar} onMouseEnter={precargar} {...resto} onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) ir(e); }}>
      {children}
    </Link>
  );
}
