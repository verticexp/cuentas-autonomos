'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import '@/app/cobro.css';

const SEGUNDOS = 7;

// Aviso con «Deshacer» tras cobrar de un deslizamiento (components/Deslizar.js lo pide con avisarCobro). Va aparte de la fila:
// al refrescar la lista la fila puede cambiar de sitio o desaparecer, y el aviso tiene que seguir. Uno por pantalla.
export function avisarCobro(id) {
  window.dispatchEvent(new CustomEvent('fisquo-cobro', { detail: { id } }));
}

export default function AvisoDeshacer() {
  const router = useRouter();
  const [aviso, setAviso] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const reloj = useRef(null);

  useEffect(() => {
    const alCobrar = (e) => {
      clearTimeout(reloj.current);
      setError(''); setAviso(e.detail);
      reloj.current = setTimeout(() => setAviso(null), SEGUNDOS * 1000);
    };
    window.addEventListener('fisquo-cobro', alCobrar);
    return () => { window.removeEventListener('fisquo-cobro', alCobrar); clearTimeout(reloj.current); };
  }, []);

  if (!aviso || typeof document === 'undefined') return null;
  const deshacer = async () => {
    if (trabajando) return;
    setTrabajando(true); setError('');
    try {
      await llamar('/api/facturas', { method: 'PATCH', body: JSON.stringify({ id: aviso.id, accion: 'deshacer' }) });
      clearTimeout(reloj.current); setAviso(null); router.refresh();
    } catch (e) { setError(e.message); } finally { setTrabajando(false); }
  };
  return createPortal(
    <div className="aviso-deshacer" role="status" aria-live="polite">
      <span>{error || 'Factura cobrada'}</span>
      {!error && <button type="button" disabled={trabajando} onClick={deshacer}>{trabajando ? '…' : 'Deshacer'}</button>}
      <button type="button" className="aviso-cerrar" aria-label="Cerrar aviso" onClick={() => setAviso(null)}>×</button>
    </div>,
    document.body,
  );
}
