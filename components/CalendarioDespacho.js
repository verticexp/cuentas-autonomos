'use client';

import { useState } from 'react';
import { useT } from '@/components/Idioma';

// «En tu calendario» (Mi despacho › Plazos): suscribirse a los plazos de los clientes (lib/calendarioIcs.js) con un enlace
// personal que se puede anular.
export default function CalendarioDespacho({ token, url: inicial }) {
  const tr = useT();
  const [url, setUrl] = useState(token ? inicial : '');
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const webcal = url?.replace(/^https?:/, 'webcal:');

  async function cambiar(metodo) {
    setOcupado(true);
    setMensaje('');
    try {
      const res = await fetch('/api/despacho/calendario', { method: metodo });
      const datos = await res.json();
      if (!res.ok) throw new Error(datos.error || 'No se pudo cambiar el enlace.');
      setUrl(metodo === 'DELETE' ? '' : datos.url);
      if (metodo === 'DELETE') setMensaje('Has dejado de compartir los plazos.');
    } catch (e) { setMensaje(e.message || 'No se pudo cambiar el enlace.'); }
    finally { setOcupado(false); }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(url); setMensaje('Enlace copiado.'); }
    catch { setMensaje('No se pudo copiar el enlace. Inténtalo de nuevo.'); }
  }

  return <section className="grupo" aria-labelledby="calendario-titulo">
    <h2 className="grupo-t" id="calendario-titulo">{tr('En tu calendario')}</h2>
    <div className="grupo-c">
      <div className="celda">
        <div className="desp-acciones">
          {url ? <>
            <a className="boton" href={webcal}>{tr('Abrir en el calendario')}</a>
            <a className="boton sec" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer">{tr('Google Calendar')}</a>
            <button className="boton sec" type="button" onClick={copiar} disabled={ocupado}>{tr('Copiar enlace')}</button>
            <button className="boton sec" type="button" onClick={() => cambiar('DELETE')} disabled={ocupado}>{ocupado ? tr('Guardando…') : tr('Dejar de compartir')}</button>
          </> : <button className="boton" type="button" onClick={() => cambiar('POST')} disabled={ocupado}>{ocupado ? tr('Creando enlace…') : tr('Añadir los plazos a mi calendario')}</button>}
        </div>
      </div>
    </div>
    <p className="grupo-pie">{url ? tr('Se actualiza solo. Es secreto: quien tenga el enlace ve los nombres de tus clientes y sus plazos, sin contraseña. No lo compartas; si se te escapa, pulsa «Dejar de compartir» y crea uno nuevo.') : tr('Los plazos de tus clientes en Google Calendar, Apple o Outlook, con un aviso 3 días antes. Se actualizan solos.')}</p>
    <p className="grupo-pie" role="status" aria-live="polite">{tr(mensaje)}</p>
  </section>;
}
