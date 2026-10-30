'use client';

import { useEffect, useState } from 'react';
import { llamar } from './Acciones';
import '@/app/chat.css';

const ESTADO = { persona: 'Pendiente del equipo', ia: 'Con el asistente', cerrada: 'Resuelta' };
const AUTOR = { cliente: 'Cliente', ia: 'Asistente', equipo: 'Equipo' };
const cuando = (t) => new Date(t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Panel /admin › Soporte: conversaciones del chat de ayuda (app/api/admin/soporte). Las pasadas al equipo, primero.
export default function AdminSoporte() {
  const [cs, setCs] = useState(null);
  const [resp, setResp] = useState({});
  const [msg, setMsg] = useState('');
  const cargar = () => llamar('/api/admin/soporte').then((d) => setCs(d.conversaciones)).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(); }, []);
  const accion = async (cuerpo) => {
    setMsg('');
    try { await llamar('/api/admin/soporte', { method: 'POST', body: JSON.stringify(cuerpo) }); if (cuerpo.texto) setResp({ ...resp, [cuerpo.id]: '' }); await cargar(); }
    catch (e) { setMsg(e.message); }
  };
  if (!cs) return <p className="nota">{msg || 'Cargando…'}</p>;
  if (!cs.length) return <p className="nota">Todavía no ha escrito nadie.</p>;
  return (
    <div className="adm-soporte">
      {msg && <p className="error" role="alert">{msg}</p>}
      {cs.map((c) => (
        <details key={c.id} open={c.estado === 'persona' && c.leidaEquipo === false}>
          <summary>
            <b>{c.empresaNombre || c.nombre}</b>
            {c.estado === 'persona' && c.mensajes.at(-1)?.de === 'equipo'
              ? <span>Respondida · esperando al cliente</span>
              : <span className={c.estado === 'persona' ? 'pendiente' : ''}>{ESTADO[c.estado]}{c.estado === 'persona' && c.leidaEquipo === false ? ' · sin leer' : ''}</span>}
            <small>{c.nombre} &lt;{c.email}&gt; · {cuando(c.actualizada)}</small>
            {c.motivo && <small>Motivo: {c.motivo}</small>}
          </summary>
          <div className="chat">
            <div className="chat-mensajes">
              {c.mensajes.map((m, i) => (
                <div key={i} className="chat-grupo">
                  <div className={`chat-burbuja${m.de === 'equipo' ? ' mia' : ''}`}>
                    <span className="chat-autor">{AUTOR[m.de]}</span>
                    <p>{m.texto}</p>
                    <span className="chat-pie"><time dateTime={m.t}>{cuando(m.t)}</time></span>
                  </div>
                </div>
              ))}
            </div>
            <form className="chat-escribir" onSubmit={(e) => { e.preventDefault(); accion({ id: c.id, texto: resp[c.id] }); }}>
              <textarea className="campo" rows={3} maxLength={2000} value={resp[c.id] || ''} onChange={(e) => setResp({ ...resp, [c.id]: e.target.value })} placeholder="Respuesta (le llega un aviso al móvil)" aria-label="Respuesta" />
              <div className="chat-acciones">
                <button className="boton" disabled={!resp[c.id]?.trim()}>Responder</button>
                {c.estado !== 'cerrada' && <button type="button" className="boton sec" onClick={() => accion({ id: c.id, cerrar: true })}>Marcar resuelta</button>}
              </div>
            </form>
          </div>
        </details>
      ))}
    </div>
  );
}
