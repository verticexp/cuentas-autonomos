'use client';

import { useState } from 'react';

export default function CalendarioDespacho({ token, url: inicial }) {
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
    <h2 className="grupo-t" id="calendario-titulo">En tu calendario</h2>
    <div className="grupo-c">
      <div className="celda">
        <div className="desp-acciones">
          {url ? <>
            <a className="boton" href={webcal}>Abrir en el calendario</a>
            <a className="boton sec" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer">Google Calendar</a>
            <button className="boton sec" type="button" onClick={copiar} disabled={ocupado}>Copiar enlace</button>
            <button className="boton sec" type="button" onClick={() => cambiar('DELETE')} disabled={ocupado}>{ocupado ? 'Guardando…' : 'Dejar de compartir'}</button>
          </> : <button className="boton" type="button" onClick={() => cambiar('POST')} disabled={ocupado}>{ocupado ? 'Creando enlace…' : 'Añadir los plazos a mi calendario'}</button>}
        </div>
      </div>
    </div>
    {url && <p className="grupo-pie">Se actualiza solo. Quien tenga el enlace ve tus plazos: no lo compartas.</p>}
    <p className="grupo-pie" role="status" aria-live="polite">{mensaje}</p>
  </section>;
}
