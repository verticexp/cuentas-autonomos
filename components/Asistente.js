'use client';

import { useEffect, useRef, useState } from 'react';

// Chat con el asistente: la conversación vive en la pantalla (no se guarda) y cada respuesta dice de dónde salen las cifras.
export default function Asistente({ listo, ejemplos }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const fin = useRef(null);
  useEffect(() => { if (mensajes.length) fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [mensajes, pensando]);

  const enviar = async (pregunta) => {
    const p = pregunta.trim();
    if (!p || pensando) return;
    const historial = mensajes.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMensajes((m) => [...m, { role: 'user', content: p }]);
    setTexto('');
    setPensando(true);
    try {
      const r = await fetch('/api/asistente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: p, historial }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'El asistente no responde ahora');
      setMensajes((m) => [...m, { role: 'assistant', content: d.respuesta, fuentes: d.fuentes || [], aviso: d.sinComprobar }]);
    } catch (e) {
      setMensajes((m) => [...m, { role: 'assistant', content: e.message, error: true }]);
    } finally { setPensando(false); }
  };

  if (!listo) return <div className="vacio"><p>Aún no está activado</p><p>Falta configurar la clave de la IA (ANTHROPIC_API_KEY) en Vercel.</p></div>;
  return (
    <div className="asi">
      {!mensajes.length && (
        <div className="asi-ejemplos">
          {ejemplos.map((e) => <button key={e} type="button" onClick={() => enviar(e)}>{e}</button>)}
          {!ejemplos.length && <p className="asi-nota">Con tus permisos no hay datos que consultar. Pídeselos al administrador de tu empresa.</p>}
        </div>
      )}
      <ul className="asi-lista" aria-live="polite">
        {mensajes.map((m, i) => (
          <li key={i} className={`asi-msg ${m.role}${m.error ? ' error' : ''}`}>
            <p>{m.content.replace(/\*\*/g, '')}</p>
            {m.fuentes?.length > 0 && <small className="asi-fuentes">Datos de Netto: {m.fuentes.join(' · ')}</small>}
          </li>
        ))}
        {pensando && <li className="asi-msg assistant pensando" aria-label="Pensando"><span /><span /><span /></li>}
      </ul>
      <div ref={fin} />
      <form className="asi-form" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
        <input className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pregunta por tus cuentas" maxLength={500} aria-label="Tu pregunta" />
        <button className="boton pequeno" disabled={!texto.trim() || pensando} aria-label="Enviar">Enviar</button>
      </form>
    </div>
  );
}
