'use client';

import { useEffect, useRef, useState } from 'react';
import { llamar } from './Acciones';
import { useT } from '@/components/Idioma';
import '@/app/chat.css';

const AUTOR = { ia: 'Asistente de Fisquo', equipo: 'Equipo de Fisquo' };
const hora = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

// Ajustes › Ayuda: chat de soporte (app/api/soporte/chat). Responde el asistente con IA; si no lo resuelve, o se pide,
// pasa a una persona del equipo, que contesta aquí (de lunes a sábado, de 9:00 a 22:00) y avisa en el móvil.
export default function AyudaChat() {
  const tr = useT();
  const [c, setC] = useState(null);
  const [horario, setHorario] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState('');
  const lista = useRef(null);

  const cargar = (d) => { setC(d.conversacion); setHorario(d.horario); };
  useEffect(() => {
    let vivo = true;
    const leer = () => llamar('/api/soporte/chat').then((d) => vivo && cargar(d)).catch(() => {});
    leer();
    // Mientras está con el equipo, mira si ha respondido (cada 30 s y solo con la pestaña a la vista).
    const t = setInterval(() => { if (document.visibilityState === 'visible') leer(); }, 30000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  useEffect(() => { lista.current?.scrollTo({ top: lista.current.scrollHeight }); }, [c?.mensajes?.length, enviando]);

  const enviar = async (cuerpo) => {
    setEnviando(true); setMsg('');
    try { cargar(await llamar('/api/soporte/chat', { method: 'POST', body: JSON.stringify({ ...cuerpo, pagina: document.referrer ? new URL(document.referrer).pathname : '' }) })); if (cuerpo.texto) setTexto(''); }
    catch (e) { setMsg(e.message); }
    setEnviando(false);
  };
  const mensajes = c?.mensajes || [];
  const conEquipo = c?.estado === 'persona';

  return (
    <section className="grupo" aria-labelledby="soporte-t">
      <h2 className="grupo-t" id="soporte-t">{tr('Chat de ayuda')}</h2>
      <div className="chat">
        {horario && <p className="nota">{horario.enHorario ? tr('Equipo conectado ahora. {horario}.', { horario: tr(horario.texto) }) : tr('Ahora responde el asistente. Una persona del equipo vuelve {cuando} ({horario}).', { cuando: tr(horario.vuelve), horario: tr(horario.texto).toLowerCase() })}</p>}
        <div className="chat-mensajes" ref={lista} aria-live="polite">
          {horario && !mensajes.length && <p className="chat-vacio">{tr('Cuéntanos qué te pasa o qué quieres hacer. Te responde al momento el asistente y, si hace falta, una persona del equipo.')}</p>}
          {mensajes.map((m, i) => (
            <div key={i} className="chat-grupo">
              <div className={`chat-burbuja${m.de === 'cliente' ? ' mia' : ''}`}>
                {m.de !== 'cliente' && <span className="chat-autor">{tr(AUTOR[m.de])}</span>}
                <p>{m.texto}</p>
                <span className="chat-pie"><time dateTime={m.t}>{hora(m.t)}</time></span>
              </div>
            </div>
          ))}
          {enviando && !conEquipo && <div className="chat-grupo"><div className="chat-burbuja"><p>{tr('Escribiendo…')}</p></div></div>}
        </div>
        <form className="chat-escribir" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) enviar({ texto }); }}>
          <textarea className="campo" rows={2} maxLength={2000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={tr(conEquipo ? 'Escribe al equipo' : 'Escribe tu duda')} aria-label={tr('Tu mensaje')} />
          <div className="chat-acciones">
            <button className="boton" disabled={!texto.trim() || enviando}>{tr('Enviar')}</button>
            {!conEquipo && mensajes.length > 0 && <button type="button" className="boton sec" disabled={enviando} onClick={() => enviar({ persona: true })}>{tr('Hablar con una persona')}</button>}
          </div>
          {conEquipo && <p className="nota">{tr('Tu consulta está con el equipo: te avisamos en el móvil cuando te respondan.')}</p>}
          {msg && <p className="error" role="alert">{tr(msg)}</p>}
        </form>
      </div>
    </section>
  );
}
