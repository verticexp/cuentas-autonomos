'use client';

import { useT } from '@/components/Idioma';

import { confirmar as confirmarAccion } from './Confirmar';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { navegar } from '@/lib/transicion';

// Copia el enlace para el cliente (o abre el menú de compartir del móvil).
export function Compartir({ ruta, texto, etiqueta = 'Enviar al cliente', className = 'boton' }) {
  const tr = useT();
  const [hecho, setHecho] = useState(false);
  const compartir = async () => {
    const url = location.origin + ruta;
    try {
      if (navigator.share) await navigator.share({ title: texto, url });
      else { await navigator.clipboard.writeText(url); setHecho(true); }
    } catch { /* cancelado */ }
  };
  return <button type="button" className={className} onClick={compartir}>{(hecho ? tr("Enlace copiado") : tr(etiqueta))}</button>;
}

export function Facturar({ id, tipo, children }) {
  const tr = useT();
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
  return <><button type="button" className="boton sec" disabled={enviando} onClick={facturar}>{(enviando ? tr("Facturando…") : children)}</button>{error && <span className="error" role="alert">{tr(error)}</span>}</>;
}

export function MarcarAceptado({ id }) {
  const tr = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const marcar = async () => {
    setError('');
    try { await llamar('/api/presupuestos', { method: 'PATCH', body: JSON.stringify({ id, estado: 'aceptado' }) }); router.refresh(); } catch (e) { setError(e.message); }
  };
  return <><button type="button" className="boton sec" onClick={marcar}>{tr("Marcar como aceptado")}</button>{error && <span className="error" role="alert">{tr(error)}</span>}</>;
}

// Lo que ve el cliente en el enlace público.
export function Responder({ token }) {
  const tr = useT();
  const router = useRouter();
  const ayudaId = useId();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const responder = async (acepta) => {
    setError('');
    if (!acepta && !(await confirmarAccion({ titulo: tr("Rechazar presupuesto"), texto: tr("¿Rechazar el presupuesto?"), aceptar: tr("Rechazar"), peligro: true }))) return;
    try { await llamar('/api/presupuestos/aceptar', { method: 'POST', body: JSON.stringify({ token, nombre, acepta }) }); router.refresh(); } catch (e) { setError(e.message); }
  };
  return (
    <div className="formulario">
      <label>{tr("Tu nombre")}<input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={tr("Nombre y apellidos")} /></label>
      {error && <p className="error" role="alert">{tr(error)}</p>}
      {!nombre.trim() && <p id={ayudaId} className="nota">{tr("Escribe tu nombre para aceptar o rechazar el presupuesto.")}</p>}
      <button type="button" className="boton" onClick={() => responder(true)} disabled={!nombre.trim()} aria-describedby={!nombre.trim() ? ayudaId : undefined}>{tr("Aceptar presupuesto")}</button>
      <button type="button" className="borrar" onClick={() => responder(false)} disabled={!nombre.trim()} aria-describedby={!nombre.trim() ? ayudaId : undefined}>{tr("Rechazar")}</button>
    </div>
  );
}

// Cambia el enlace público (portal o presupuesto): el anterior deja de funcionar. Para cuando se ha reenviado por error.
// etiqueta: qué enlace cambia («del presupuesto», «del portal»), para no tener dos botones iguales en la misma pantalla.
export function CambiarEnlace({ datos, pregunta, etiqueta = 'Cambiar enlace' }) {
  const tr = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const cambiar = async () => {
    setError('');
    if (!(await confirmarAccion({ titulo: tr("Cambiar enlace"), texto: tr(pregunta), aceptar: tr("Cambiar enlace"), peligro: true }))) return;
    setEnviando(true);
    try { await llamar('/api/enlaces', { method: 'POST', body: JSON.stringify(datos) }); router.refresh(); } catch (e) { setError(e.message); }
    setEnviando(false);
  };
  return <><button type="button" className="boton sec" disabled={enviando} onClick={cambiar}>{(enviando ? tr("Cambiando…") : tr(etiqueta))}</button>{error && <span className="error" role="alert">{tr(error)}</span>}</>;
}
