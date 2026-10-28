'use client';

import { useEffect, useRef, useState } from 'react';
import { vibrar } from '@/lib/haptica';
import { useT } from '@/components/Idioma';
import '@/app/hecho.css';

// Confirmación de «hecho» al estilo de Apple (como el «Hecho» de Apple Pay): un círculo y una ✓ que se dibujan, el texto
// y se va sola. Montada una vez en app/layout.js, sobrevive a la navegación; se lanza con mostrarHecho (lib/hecho.js)
// tras guardar de verdad una factura, un gasto o los tickets escaneados. Un toque la cierra antes.

export default function Hecho() {
  const tr = useT();
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
    let cancelar = () => {};
    const ensenar = ({ texto, detalle }) => {
      limpiar();
      setSaliendo(false);
      setAviso({ texto, detalle, id: ++secuencia.current });
      vibrar('exito');
      // Primero se dibuja la marca; después queda un momento para leerla.
      tiempos.current.push(setTimeout(() => setSaliendo(true), 1700));
      tiempos.current.push(setTimeout(() => setAviso(null), 1900));
    };
    // Con la pantalla ya pintada y el hilo libre: dos fotogramas y, si el navegador lo admite, un hueco sin trabajo.
    const cuandoLibre = (fn) => requestAnimationFrame(() => requestAnimationFrame(() => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 120 }) : setTimeout(fn, 16))));
    const mostrar = (e) => {
      const d = e.detail || {};
      if (typeof d.texto !== 'string' || !d.texto.trim()) return;
      cancelar();
      // Durante un cambio de pantalla (lib/transicion.js) el navegador congela lo que se pinta: se espera a que acabe.
      // Si quien llama va a navegar y la transición aún no ha empezado, se le da un momento para empezar.
      let hecho = false;
      const ir = () => { if (hecho) return; hecho = true; cancelar(); cuandoLibre(() => ensenar(d)); };
      const alFin = () => ir();
      const alInicio = () => { clearTimeout(sinInicio); };
      window.addEventListener('fisquo-vt-fin', alFin);
      window.addEventListener('fisquo-vt-inicio', alInicio);
      const sinInicio = !window.__vtActiva && d.trasNavegar ? setTimeout(() => { if (!window.__vtActiva) ir(); }, 400) : null;
      const tope = setTimeout(ir, 2500); // por si la transición se pierde
      cancelar = () => { clearTimeout(sinInicio); clearTimeout(tope); window.removeEventListener('fisquo-vt-fin', alFin); window.removeEventListener('fisquo-vt-inicio', alInicio); };
      if (!window.__vtActiva && !d.trasNavegar) ir();
    };
    window.addEventListener('fisquo-hecho', mostrar);
    return () => { window.removeEventListener('fisquo-hecho', mostrar); cancelar(); limpiar(); };
  }, []);

  return (
    <div className="hecho-capa" role="status" aria-live="polite" aria-atomic="true">
      {aviso && <div key={aviso.id} className={`hecho-panel${saliendo ? ' hecho-saliendo' : ''}`}>
        <button type="button" className="hecho-cerrar" aria-label={tr('Cerrar confirmación')} onClick={cerrar} />
        <svg className="hecho-marca" viewBox="0 0 80 80" fill="none" aria-hidden="true">
          <circle className="hecho-circulo" cx="40" cy="40" r="33" pathLength="1" />
          <path className="hecho-trazo" d="M24 40l11 11 22-23" pathLength="1" />
        </svg>
        <p className="hecho-texto">{tr(aviso.texto)}</p>
        {aviso.detalle && <p className="hecho-detalle">{tr(aviso.detalle)}</p>}
      </div>}
    </div>
  );
}
