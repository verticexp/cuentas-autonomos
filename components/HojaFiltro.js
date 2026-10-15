'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHojaDeslizable } from '@/components/useHojaDeslizable';
import '@/app/hoja.css';
import '@/app/filtros.css';

// Botón «Filtrar» (móvil) y la hoja con las opciones. Las opciones son enlaces normales (?a=…&estado=…), que llegan
// ya pintados desde el servidor: tocar uno cambia el filtro y cierra la hoja. Sin JavaScript, las opciones no se ven;
// por eso en la pantalla siguen también los filtros de siempre para el ordenador.
export default function HojaFiltro({ titulo = 'Filtrar', etiqueta = 'Filtrar', activos = 0, children }) {
  const [abierta, setAbierta] = useState(false);
  const boton = useRef(null);
  const panel = useRef(null);
  const cerrar = useHojaDeslizable(panel, abierta, () => setAbierta(false));

  // Hoja abierta: el fondo no se mueve, Escape la cierra y el foco entra en ella y vuelve al botón al cerrar.
  useEffect(() => {
    if (!abierta) return undefined;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const origen = boton.current;
    panel.current?.querySelector('a, button')?.focus();
    const teclas = (e) => {
      if (e.key === 'Escape') { cerrar(); return; }
      if (e.key !== 'Tab') return;
      const dentro = [...panel.current.querySelectorAll('a, button')];
      const [primero, ultimo] = [dentro[0], dentro.at(-1)];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener('keydown', teclas);
    return () => { document.removeEventListener('keydown', teclas); document.body.style.overflow = anterior; origen?.focus?.({ preventScroll: true }); };
  }, [abierta, cerrar]);

  return (
    <>
      <button ref={boton} type="button" className="filtro-boton" aria-haspopup="dialog" aria-expanded={abierta} onClick={() => setAbierta(true)}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        {etiqueta}
        {activos > 0 && <span className="filtro-n" aria-label={activos === 1 ? '1 filtro activo' : `${activos} filtros activos`}>{activos}</span>}
      </button>
      {/* En el <body>: la barra fija tiene desenfoque, y eso ancla a ella cualquier capa fija que lleve dentro. */}
      {abierta && createPortal(
        <div className="hoja">
          <button type="button" className="hoja-fondo" aria-label="Cerrar" tabIndex={-1} onClick={cerrar} />
          <div className="hoja-panel" role="dialog" aria-modal="true" aria-label={titulo} ref={panel} onClick={(e) => { if (e.target.closest('a')) setAbierta(false); }}>
            <span className="hoja-asa" aria-hidden />
            <p className="hoja-t">{titulo}</p>
            {children}
            <button type="button" className="hoja-cerrar" onClick={cerrar}>Cerrar</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
