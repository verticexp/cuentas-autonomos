'use client';

import { useEffect, useRef, useState } from 'react';
import { vibrar } from '@/lib/haptica';
import '@/app/hecho.css';

// Confirmación de «hecho» al estilo de Apple (como el «Hecho» de Apple Pay): un círculo y una ✓ que se dibujan, el texto
// y se va sola. Montada una vez en app/layout.js, sobrevive a la navegación; se lanza con mostrarHecho (lib/hecho.js)
// tras guardar de verdad una factura, un gasto o los tickets escaneados. Un toque la cierra antes.

export default function Hecho() {
  const [aviso, setAviso] = useState(null);
  const [saliendo, setSaliendo] = useState(false);
  const tiempos = useRef([]);
  const secuencia = useRef(0);
  const limpiar = () => { tiempos.current.forEach(clearTimeout); tiempos.current = []; };
  const cerrar = () => {
    limpiar();
    setSaliendo(true);
    tiempos.current.push(setTimeout(() => setAviso(null), 180));
  };

  useEffect(() => {
    const mostrar = (e) => {
      if (typeof e.detail?.texto !== 'string' || !e.detail.texto.trim()) return;
      limpiar();
      setSaliendo(false);
      setAviso({ texto: e.detail.texto, detalle: e.detail.detalle, id: ++secuencia.current });
      vibrar('exito');
      // Primero se dibuja la marca; después queda un momento para leerla.
      tiempos.current.push(setTimeout(() => setSaliendo(true), 1700));
      tiempos.current.push(setTimeout(() => setAviso(null), 1880));
    };
    window.addEventListener('fisquo-hecho', mostrar);
    return () => { window.removeEventListener('fisquo-hecho', mostrar); limpiar(); };
  }, []);

  return (
    <div className="hecho" role="status" aria-live="polite" aria-atomic="true">
      {aviso && <div key={aviso.id} className={`hecho-panel${saliendo ? ' hecho-saliendo' : ''}`}>
        <button type="button" className="hecho-cerrar" aria-label="Cerrar confirmación" onClick={cerrar} />
        <svg className="hecho-marca" viewBox="0 0 80 80" fill="none" aria-hidden="true">
          <circle className="hecho-circulo" cx="40" cy="40" r="33" pathLength="1" />
          <path className="hecho-trazo" d="M24 40l11 11 22-23" pathLength="1" />
        </svg>
        <p className="hecho-texto">{aviso.texto}</p>
        {aviso.detalle && <p className="hecho-detalle">{aviso.detalle}</p>}
      </div>}
    </div>
  );
}
