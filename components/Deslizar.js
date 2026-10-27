'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { navegar } from '@/lib/transicion';
import { vibrar } from '@/lib/haptica';
import { avisarCobro } from './AvisoDeshacer';
import { useT } from '@/components/Idioma';
import '@/app/deslizar.css';

// Fila de lista que se desliza a la izquierda (solo con el dedo) y deja ver sus acciones: nada se hace al soltar, sino al
// tocar el botón. Las mismas acciones siguen en la ficha de cada cosa. Lo que se pasa son nombres, no funciones (esto llega
// desde páginas de servidor): cobrada y enviar (facturas), pagada (gastos).
const ACCIONES = {
  cobrada: { nombre: '✓ Cobrar', tono: 'ok' },
  enviar: { nombre: 'Enviar', tono: 'azul' },
  pagada: { nombre: 'Pagado', tono: 'ok' },
};
const ANCHO = 88; // de cada botón, en px
const UMBRAL = 8; // desde cuántos px se decide si el gesto es horizontal o vertical

export default function Deslizar({ id, acciones = [], href, children }) {
  const router = useRouter();
  const tr = useT();
  const lista = acciones.filter((a) => ACCIONES[a]);
  const total = lista.length * ANCHO;
  const [x, setX] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const raiz = useRef(null);
  const gesto = useRef(null);
  const tragar = useRef(false);
  const abierto = total > 0 && !arrastrando && x === -total;

  // Abierta, un toque fuera (o girar la pantalla) la cierra.
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (!raiz.current?.contains(e.target)) setX(0); };
    document.addEventListener('pointerdown', fuera, true);
    return () => document.removeEventListener('pointerdown', fuera, true);
  }, [abierto]);

  if (total === 0) return children;

  const alBajar = (e) => {
    if (e.pointerType === 'mouse' || trabajando) return;
    gesto.current = { x: e.clientX, y: e.clientY, base: abierto ? -total : 0, horizontal: null, id: e.pointerId };
  };
  const alMover = (e) => {
    const g = gesto.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.horizontal === null) {
      if (Math.abs(dy) > UMBRAL && Math.abs(dy) >= Math.abs(dx)) { gesto.current = null; return; }
      if (Math.abs(dx) > UMBRAL && Math.abs(dx) > Math.abs(dy) * 1.5) { g.horizontal = true; setArrastrando(true); try { raiz.current.setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ } } else return;
    }
    setX(Math.max(-total - 24, Math.min(0, g.base + dx)));
  };
  const alSoltar = (e) => {
    const g = gesto.current;
    gesto.current = null;
    if (!g?.horizontal) return;
    tragar.current = true; // el toque que acompaña al gesto no abre la ficha
    setTimeout(() => { tragar.current = false; }, 350);
    setArrastrando(false);
    setX((actual) => (actual < -total * 0.4 ? -total : 0));
    try { raiz.current?.releasePointerCapture?.(e.pointerId); } catch { /* ya liberado */ }
  };
  const alPulsar = (e) => {
    if (e.target.closest?.('.desliz-acciones')) return; // los botones de las acciones, a lo suyo
    if (tragar.current) { e.preventDefault(); e.stopPropagation(); return; }
    if (abierto) { e.preventDefault(); e.stopPropagation(); setX(0); }
  };

  const hacer = async (accion) => {
    if (trabajando) return;
    if (accion === 'enviar') { vibrar(); navegar(router, href, 'adelante'); return; }
    setError(''); setTrabajando(true);
    try {
      if (accion === 'cobrada') { await llamar('/api/facturas', { method: 'PATCH', body: JSON.stringify({ id, accion: 'cobrar' }) }); avisarCobro(id); }
      if (accion === 'pagada') await llamar('/api/gastos', { method: 'PATCH', body: JSON.stringify({ id, pagado: true }) });
      vibrar('exito');
      setX(0);
      router.refresh();
    } catch (err) { setError(err.message); setX(0); } finally { setTrabajando(false); }
  };

  return (
    <><div ref={raiz} className={`desliz${abierto ? ' abierto' : ''}${x !== 0 ? ' mov' : ''}`} onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar} onClickCapture={alPulsar}>
      <div className="desliz-acciones" style={{ width: total }} aria-hidden={!abierto}>
        {lista.map((a) => (
          <button key={a} type="button" className={`desliz-boton ${ACCIONES[a].tono}`} style={{ width: ANCHO }} tabIndex={abierto ? 0 : -1} disabled={trabajando} onClick={() => hacer(a)}>{trabajando && a !== 'enviar' ? '…' : tr(ACCIONES[a].nombre)}</button>
        ))}
      </div>
      <div className="desliz-fila" style={{ transform: `translateX(${x}px)`, transition: arrastrando ? 'none' : undefined }}>{children}</div>
    </div>{error && <p className="error" role="alert">{tr(error)}</p>}</>
  );
}
