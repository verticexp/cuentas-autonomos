'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { navegar } from '@/lib/transicion';

// Copia el enlace para el cliente (o abre el menú de compartir del móvil).
export function Compartir({ ruta, texto, etiqueta = 'Enviar al cliente', className = 'boton' }) {
  const [hecho, setHecho] = useState(false);
  const compartir = async () => {
    const url = location.origin + ruta;
    try {
      if (navigator.share) await navigator.share({ title: texto, url });
      else { await navigator.clipboard.writeText(url); setHecho(true); }
    } catch { /* cancelado */ }
  };
  return <button type="button" className={className} onClick={compartir}>{hecho ? 'Enlace copiado' : etiqueta}</button>;
}

export function Facturar({ id, tipo, children }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const facturar = async () => {
    setError('');
    setEnviando(true);
    try {
      const d = await llamar('/api/presupuestos/facturar', { method: 'POST', body: JSON.stringify({ id, tipo }) });
      navegar(router, `/facturas/${d.factura.id}`, 'adelante');
    } catch (e) { setError(e.message); setEnviando(false); }
  };
  return <><button type="button" className="boton sec" disabled={enviando} onClick={facturar}>{enviando ? 'Facturando…' : children}</button>{error && <span className="error" role="alert">{error}</span>}</>;
}

export function MarcarAceptado({ id }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const marcar = async () => {
    setError('');
    try { await llamar('/api/presupuestos', { method: 'PATCH', body: JSON.stringify({ id, estado: 'aceptado' }) }); router.refresh(); } catch (e) { setError(e.message); }
  };
  return <><button type="button" className="boton sec" onClick={marcar}>Marcar como aceptado</button>{error && <span className="error" role="alert">{error}</span>}</>;
}

// Lo que ve el cliente en el enlace público.
export function Responder({ token }) {
  const router = useRouter();
  const ayudaId = useId();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const responder = async (acepta) => {
    setError('');
    if (!acepta && !(await confirmarAccion({ titulo: 'Rechazar presupuesto', texto: '¿Rechazar el presupuesto?', aceptar: 'Rechazar', peligro: true }))) return;
    try { await llamar('/api/presupuestos/aceptar', { method: 'POST', body: JSON.stringify({ token, nombre, acepta }) }); router.refresh(); } catch (e) { setError(e.message); }
  };
  return (
    <div className="formulario">
      <label>Tu nombre<input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      {!nombre.trim() && <p id={ayudaId} className="nota">Escribe tu nombre para aceptar o rechazar el presupuesto.</p>}
      <button type="button" className="boton" onClick={() => responder(true)} disabled={!nombre.trim()} aria-describedby={!nombre.trim() ? ayudaId : undefined}>Aceptar presupuesto</button>
      <button type="button" className="borrar" onClick={() => responder(false)} disabled={!nombre.trim()} aria-describedby={!nombre.trim() ? ayudaId : undefined}>Rechazar</button>
    </div>
  );
}

// Cambia el enlace público (portal o presupuesto): el anterior deja de funcionar. Para cuando se ha reenviado por error.
export function CambiarEnlace({ datos, pregunta }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const cambiar = async () => {
    setError('');
    if (!(await confirmarAccion({ titulo: 'Cambiar enlace', texto: pregunta, aceptar: 'Cambiar enlace', peligro: true }))) return;
    setEnviando(true);
    try { await llamar('/api/enlaces', { method: 'POST', body: JSON.stringify(datos) }); router.refresh(); } catch (e) { setError(e.message); }
    setEnviando(false);
  };
  return <><button type="button" className="boton sec" disabled={enviando} onClick={cambiar}>{enviando ? 'Cambiando…' : 'Cambiar enlace'}</button>{error && <span className="error" role="alert">{error}</span>}</>;
}
