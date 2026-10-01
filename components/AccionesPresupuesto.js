'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';

// Copia el enlace para el cliente (o abre el menú de compartir del móvil).
export function Compartir({ ruta, texto }) {
  const [hecho, setHecho] = useState(false);
  const compartir = async () => {
    const url = location.origin + ruta;
    try {
      if (navigator.share) await navigator.share({ title: texto, url });
      else { await navigator.clipboard.writeText(url); setHecho(true); }
    } catch { /* cancelado */ }
  };
  return <button className="boton" onClick={compartir}>{hecho ? 'Enlace copiado' : 'Enviar al cliente'}</button>;
}

export function Facturar({ id, tipo, children }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const facturar = async () => {
    setEnviando(true);
    try {
      const d = await llamar('/api/presupuestos/facturar', { method: 'POST', body: JSON.stringify({ id, tipo }) });
      router.push(`/facturas/${d.factura.id}`);
    } catch (e) { alert(e.message); setEnviando(false); }
  };
  return <button className="boton sec" disabled={enviando} onClick={facturar}>{enviando ? 'Facturando…' : children}</button>;
}

export function MarcarAceptado({ id }) {
  const router = useRouter();
  const marcar = async () => {
    try { await llamar('/api/presupuestos', { method: 'PATCH', body: JSON.stringify({ id, estado: 'aceptado' }) }); router.refresh(); } catch (e) { alert(e.message); }
  };
  return <button className="boton sec" onClick={marcar}>Marcar como aceptado</button>;
}

// Lo que ve el cliente en el enlace público.
export function Responder({ token }) {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const responder = async (acepta) => {
    setError('');
    if (!acepta && !confirm('¿Rechazar el presupuesto?')) return;
    try { await llamar('/api/presupuestos/aceptar', { method: 'POST', body: JSON.stringify({ token, nombre, acepta }) }); router.refresh(); } catch (e) { setError(e.message); }
  };
  return (
    <div className="formulario">
      <label>Tu nombre<input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos" /></label>
      {error && <p className="error">{error}</p>}
      <button className="boton" onClick={() => responder(true)} disabled={!nombre.trim()}>Aceptar presupuesto</button>
      <button className="borrar" onClick={() => responder(false)} disabled={!nombre.trim()}>Rechazar</button>
    </div>
  );
}
