'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GLOSARIO } from '@/lib/glosario';
import { useT } from '@/components/Idioma';
import '@/app/hoja.css';
import './Termino.css';

// Diálogo nativo: mantiene el foco dentro, admite Escape y deja inerte el fondo.
// El portal evita que lo recorten las tarjetas, las tablas o un formulario padre.
function Definicion({ termino, id, origen, cerrar }) {
  const tr = useT();
  const dialogo = useRef(null);
  const panel = useRef(null);
  const [posicion, setPosicion] = useState({});
  useEffect(() => {
    const nodo = dialogo.current;
    const boton = origen.current;
    nodo.showModal();
    const colocar = () => {
      if (!boton || !window.matchMedia('(min-width: 1024px)').matches) return;
      const r = boton.getBoundingClientRect();
      const { width, height } = panel.current.getBoundingClientRect();
      const x = Math.max(16, Math.min(r.left, window.innerWidth - width - 16));
      const y = r.bottom + 8 + height <= window.innerHeight - 16 ? r.bottom + 8 : Math.max(16, r.top - height - 8);
      setPosicion({ '--termino-x': `${x}px`, '--termino-y': `${y}px` });
    };
    colocar();
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('resize', colocar);
    window.addEventListener('scroll', colocar, true);
    return () => {
      window.removeEventListener('resize', colocar);
      window.removeEventListener('scroll', colocar, true);
      nodo.close();
      document.body.style.overflow = previo;
      if (boton?.isConnected) boton.focus({ preventScroll: true });
    };
  }, [origen]);
  return createPortal(
    <dialog ref={dialogo} id={`${id}-dialogo`} className="hoja termino-hoja" aria-labelledby={`${id}-titulo`} aria-describedby={`${id}-definicion`}
      onClick={(e) => e.stopPropagation()}
      onCancel={(e) => { e.preventDefault(); e.stopPropagation(); cerrar(); }}>
      <button type="button" className="hoja-fondo" aria-label={tr('Cerrar')} tabIndex={-1} onClick={cerrar} />
      <div ref={panel} className="hoja-panel" style={posicion}>
        <span className="hoja-asa" aria-hidden="true" />
        <h2 className="hoja-t" id={`${id}-titulo`}>{tr(termino.t)}</h2>
        <p id={`${id}-definicion`} className="termino-definicion">{tr(termino.d)}</p>
        <button type="button" className="hoja-cerrar" onClick={cerrar} autoFocus>{tr('Cerrar')}</button>
      </div>
    </dialog>, document.body
  );
}

export default function Termino({ id, children }) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef(null);
  const uid = useId();
  const termino = GLOSARIO[id];
  if (!termino) return children;
  return <>
    <button ref={boton} type="button" className="termino" aria-haspopup="dialog" aria-expanded={abierto}
      aria-controls={abierto ? `${uid}-dialogo` : undefined}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAbierto((v) => !v); }}>{children}</button>
    {abierto && <Definicion termino={termino} id={uid} origen={boton} cerrar={() => setAbierto(false)} />}
  </>;
}
