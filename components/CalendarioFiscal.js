'use client';

import { useEffect, useState } from 'react';
import { llamar } from './Acciones';

// «Añadir los plazos a mi calendario» (Impuestos › Qué presentas y cuándo): un enlace privado de suscripción (webcal) que
// el calendario del móvil o del ordenador actualiza solo, con avisos una semana y un día antes (lib/calendarioFiscal.js).
// ruta: el del enlace que ya tiene la empresa (/api/calendario/<token>.ics), si lo tiene; con el origen, al montar.
export default function CalendarioFiscal({ ruta = null }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { if (ruta) setUrl(`${location.origin}${ruta}`); }, [ruta]);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const pedir = async (opciones, despues) => {
    setOcupado(true); setMsg('');
    try { const d = await llamar('/api/calendario', opciones); despues(d); } catch (e) { setMsg(e.message); }
    setOcupado(false);
  };
  const crear = (nuevo = false) => pedir({ method: 'POST', body: JSON.stringify({ nuevo }) }, (d) => { setUrl(d.url); if (nuevo) setMsg('Enlace cambiado: el anterior ya no funciona.'); });
  const quitar = () => pedir({ method: 'DELETE' }, () => { setUrl(null); setMsg('Enlace quitado.'); });
  const copiar = async () => {
    try { await navigator.clipboard.writeText(url); setMsg('Enlace copiado'); } catch { setMsg('No se ha podido copiar: selecciónalo y cópialo a mano.'); }
  };
  if (!url) {
    return (
      <div className="calendario-fiscal">
        <button type="button" className="boton sec" onClick={() => crear()} disabled={ocupado}>{ocupado ? 'Preparando…' : 'Añadir los plazos a mi calendario'}</button>
        <p className="nota">Un enlace privado para el calendario del móvil o del ordenador, con aviso una semana y un día antes de cada plazo.</p>
        {msg && <p className="nota" role="status">{msg}</p>}
      </div>
    );
  }
  return (
    <div className="calendario-fiscal">
      <p className="nota">Suscríbete con este enlace: el calendario se pondrá al día solo. No lo compartas: quien lo tenga ve tus plazos.</p>
      <div className="fila-act">
        <a className="boton sec" href={url.replace(/^https?:/, 'webcal:')}>Abrir en el calendario</a>
        <button type="button" className="boton sec" onClick={copiar}>Copiar el enlace</button>
        <a className="enlace" href={url} download>Descargar .ics</a>
      </div>
      <div className="fila-act">
        <button type="button" className="enlace" onClick={() => crear(true)} disabled={ocupado}>Cambiar el enlace</button>
        <button type="button" className="enlace" onClick={quitar} disabled={ocupado}>Dejar de compartir</button>
      </div>
      {msg && <p className="nota" role="status">{msg}</p>}
    </div>
  );
}
