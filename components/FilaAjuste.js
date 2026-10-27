'use client';

import { usePathname } from 'next/navigation';
import Ir from '@/components/Ir';

// Una fila de la lista de Ajustes (components/ListaAjustes.js): icono de color, el nombre y su valor en gris a la derecha.
// En el ordenador la lista va a la izquierda, como en los Ajustes del Sistema del Mac, y marca la pantalla abierta.
// tono del valor: 'rojo' si hay que hacer algo (faltan datos, la prueba acaba). destructiva: el nombre en rojo.
export default function FilaAjuste({ href, tono, icono, titulo, valor, aviso = false, descarga = false, destructiva = false }) {
  const path = usePathname();
  const activa = !descarga && path === href.split('?')[0];
  const dentro = (
    <>
      <span className="mas-ico" data-tono={tono}><svg viewBox="0 0 24 24" aria-hidden>{icono}</svg></span>
      <span className={`txt${destructiva ? ' aj-rojo' : ''}`}>{titulo}</span>
      {valor && <span className="mas-valor" data-tono={aviso ? 'rojo' : undefined}>{valor}</span>}
    </>
  );
  if (descarga) return <a href={href} download className="celda ir mas-fila">{dentro}</a>;
  return <Ir href={href} className={`celda ir mas-fila${activa ? ' activa' : ''}`} aria-current={activa ? 'page' : undefined}>{dentro}</Ir>;
}
