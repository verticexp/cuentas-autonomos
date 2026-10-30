'use client';

import { useEffect, useRef, useState } from 'react';
import { llamar } from './Acciones';
import { useT } from '@/components/Idioma';
import useTecladoChat from '@/components/useTecladoChat';
import '@/app/chat.css';

const AUTOR = { ia: 'Asistente de Fisquo', equipo: 'Equipo de Fisquo' };
const hora = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

// Chat de soporte (app/api/soporte/chat), en su propia pantalla (app/ayuda): responde el asistente con IA; si no lo
// resuelve, o se pide, pasa a una persona del equipo, que contesta aquí (de lunes a sábado, de 9:00 a 22:00) y avisa en el
// móvil. Como el chat con la gestoría (components/Chat.js): en el móvil, a pantalla completa, los mensajes en medio y el
// cuadro de escribir pegado al teclado (useTecladoChat).
export default function AyudaChat() {
  const tr = useT();
  const [c, setC] = useState(null);
  const [horario, setHorario] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState('');
  const lista = useRef(null);
  const caja = useRef(null);
  const pegado = useRef(true);
  const alFinal = () => { const l = lista.current; if (l) l.scrollTop = l.scrollHeight; };
  const alDesplazar = () => { const l = lista.current; if (l) pegado.current = l.scrollHeight - l.scrollTop - l.clientHeight < 80; };
  useTecladoChat(lista, '.desp-chat-pagina', { pegado, alFinal });

  const cargar = (d) => { setC(d.conversacion); setHorario(d.horario); };
  useEffect(() => {
    let vivo = true;
    const leer = () => llamar('/api/soporte/chat').then((d) => vivo && cargar(d)).catch(() => {});
    leer();
    // Mientras está con el equipo, mira si ha respondido (cada 30 s y solo con la pantalla a la vista).
    const t = setInterval(() => { if (document.visibilityState === 'visible') leer(); }, 30000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  useEffect(() => { pegado.current = true; alFinal(); }, [c?.mensajes?.length, enviando]);
  // El cuadro crece con lo que se escribe, hasta unas líneas (como en Mensajes).
  useEffect(() => { const t = caja.current; if (!t) return; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 140)}px`; }, [texto]);

  const enviar = async (cuerpo) => {
    if (enviando) return;
    setEnviando(true); setMsg('');
    try { cargar(await llamar('/api/soporte/chat', { method: 'POST', body: JSON.stringify({ ...cuerpo, pagina: document.referrer ? new URL(document.referrer).pathname : '' }) })); if (cuerpo.texto) setTexto(''); }
    catch (e) { setMsg(e.message); }
    setEnviando(false);
  };
  const mandar = (e) => { e.preventDefault(); if (texto.trim()) enviar({ texto }); };
  const mensajes = c?.mensajes || [];
  const conEquipo = c?.estado === 'persona';

  return (
    <div className="chat ayuda-chat">
      <div className="chat-mensajes" ref={lista} onScroll={alDesplazar} aria-live="polite" tabIndex={0} aria-label={tr('Mensajes')}>
        {horario && <p className="chat-dia ayuda-horario">{horario.enHorario ? tr('Equipo conectado ahora. {horario}.', { horario: tr(horario.texto) }) : tr('Ahora responde el asistente. Una persona del equipo vuelve {cuando} ({horario}).', { cuando: tr(horario.vuelve), horario: tr(horario.texto).toLowerCase() })}</p>}
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
        {enviando && !conEquipo && <div className="chat-grupo"><div className="chat-burbuja ayuda-escribiendo" aria-label={tr('Escribiendo…')}><span /><span /><span /></div></div>}
        {conEquipo && <p className="chat-dia">{tr('Tu consulta está con el equipo: te avisamos en el móvil cuando te respondan.')}</p>}
      </div>
      <form className="chat-escribir" onSubmit={mandar}>
        {!conEquipo && mensajes.length > 0 && <button type="button" className="ayuda-persona" disabled={enviando} onClick={() => enviar({ persona: true })}>{tr('Hablar con una persona')}</button>}
        {msg && <p className="error" role="alert">{tr(msg)}</p>}
        <div className="chat-linea">
          <textarea ref={caja} rows={1} maxLength={2000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={tr(conEquipo ? 'Escribe al equipo' : 'Escribe tu duda')} aria-label={tr('Tu mensaje')}
            onFocus={() => { pegado.current = true; setTimeout(alFinal, 300); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(min-width: 1024px)').matches) mandar(e); }} />
          <button className="chat-enviar" aria-label={tr('Enviar')} disabled={!texto.trim() || enviando}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg>
          </button>
        </div>
      </form>
    </div>
  );
}
