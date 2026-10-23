'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur, fechaCorta } from '@/lib/formato';
import '@/app/chat.css';

// Chat entre el despacho y su cliente (lib/comentariosDespacho.js): los mensajes en orden, los míos a la derecha, con la
// fecha de cada día y una raya en «Nuevos» donde empieza lo que no había leído. Una pregunta sobre una factura o un gasto
// lleva su etiqueta y se le puede responder aparte; lo demás va a la conversación general.
// mensajes: mensajesDe(hilos) · lado: 'despacho' | 'cliente' · leidoAntes: hasta cuándo había leído este lado.
// enviar: { url, metodo, extra } (POST /api/despacho/comentarios con la empresa, o PUT /api/tu-despacho).
// docs: { facturas, gastos } para preguntar por un documento (solo el despacho) · docInicial: 'gasto:id' o 'factura:id'.
// leer: { url, metodo, cuerpo? } para marcar como leído al abrirlo (desde aquí y no al pintar la página: la app precarga
// las pantallas y daría por leído lo que nadie ha visto).
const hora = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
function dia(iso, hoy) {
  const d = iso.slice(0, 10);
  if (d === hoy) return 'Hoy';
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  if (d === ayer) return 'Ayer';
  const t = new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return t[0].toUpperCase() + t.slice(1);
}

export default function Chat({ mensajes, lado, leidoAntes = '', enviar, leer, docs = null, docInicial = '', nombreOtro, vacio }) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [doc, setDoc] = useState(docInicial);
  const [respondiendo, setRespondiendo] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const lista = useRef(null);
  const caja = useRef(null);
  const hoy = new Date().toISOString().slice(0, 10);
  // La raya de «Nuevos» se queda donde estaba al abrir, aunque al marcarlo leído la página se recargue.
  const [leidoAlAbrir] = useState(leidoAntes);
  const primeroNuevo = useMemo(() => mensajes.find((m) => m.lado !== lado && m.fecha > leidoAlAbrir)?.fecha, [mensajes, lado, leidoAlAbrir]);

  // Lo último a la vista, dentro de la caja de mensajes (sin mover la página).
  useEffect(() => { const l = lista.current; if (l) l.scrollTop = l.scrollHeight; }, [mensajes.length]);
  // Abierto: lo del otro lado queda leído (y el número de «Mensajes» se pone al día).
  const sinLeer = mensajes.some((m) => m.lado !== lado && m.fecha > leidoAntes);
  useEffect(() => {
    if (!leer || !sinLeer) return;
    fetch(leer.url, { method: leer.metodo, headers: { 'Content-Type': 'application/json' }, ...(leer.cuerpo ? { body: JSON.stringify(leer.cuerpo) } : {}) }).then(() => router.refresh()).catch(() => {});
  }, [leer?.url, sinLeer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (docInicial) caja.current?.focus({ preventScroll: true }); }, [docInicial]);
  // El cuadro crece con el texto (hasta unas seis líneas).
  useEffect(() => { const t = caja.current; if (!t) return; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 160)}px`; }, [texto]);

  const opciones = docs ? [...docs.facturas.map((f) => ({ v: `factura:${f.id}`, t: `Factura ${f.texto} · ${eur(f.total)}` })), ...docs.gastos.map((g) => ({ v: `gasto:${g.id}`, t: `${fechaCorta(g.fecha)} · ${g.texto} · ${eur(g.total)}` }))] : [];
  const sobre = respondiendo ? respondiendo.doc?.texto : doc ? opciones.find((o) => o.v === doc)?.t : '';

  const mandar = async (e) => {
    e?.preventDefault();
    if (!texto.trim() || ocupado) return;
    setOcupado(true); setError('');
    const [tipo, id] = doc ? doc.split(':') : [];
    try {
      await llamar(enviar.url, { method: enviar.metodo, body: JSON.stringify({ ...enviar.extra, texto, ...(respondiendo ? { hilo: respondiendo.hilo } : tipo ? { doc: { tipo, id } } : {}) }) });
      setTexto(''); setDoc(''); setRespondiendo(null);
      router.refresh();
    } catch (err) { setError(err.message); }
    setOcupado(false);
  };
  const resolver = async (m, resuelto) => {
    try { await llamar(enviar.url, { method: 'PATCH', body: JSON.stringify({ ...enviar.extra, id: m.hilo, resuelto }) }); router.refresh(); } catch (err) { setError(err.message); }
  };

  let diaAnterior = '';
  return <div className="chat">
    <div ref={lista} className="chat-mensajes" role="log" aria-label={`Mensajes con ${nombreOtro}`}>
      {mensajes.length === 0 && <p className="chat-vacio">{vacio}</p>}
      {mensajes.map((m, i) => {
        const mio = m.lado === lado;
        const cabecera = dia(m.fecha, hoy);
        const nuevoDia = cabecera !== diaAnterior;
        diaAnterior = cabecera;
        return <div key={`${m.hilo}-${m.fecha}-${i}`} className="chat-grupo">
          {nuevoDia && <p className="chat-dia"><span>{cabecera}</span></p>}
          {m.fecha === primeroNuevo && <p className="chat-nuevos"><span>Nuevos</span></p>}
          <div className={`chat-burbuja${mio ? ' mia' : ''}${m.resuelto && m.doc ? ' resuelta' : ''}`}>
            {m.doc && m.primero && <span className="chat-sobre"><svg viewBox="0 0 24 24" aria-hidden><path d="M7 3h7l4 4v14H7zM14 3v4h4" /></svg>{m.doc.texto}</span>}
            {m.doc && !m.primero && <span className="chat-sobre respuesta">Sobre {m.doc.texto}</span>}
            {!mio && <b className="chat-autor">{m.nombre || nombreOtro}</b>}
            <p>{m.texto}</p>
            <span className="chat-pie">
              {m.doc && m.primero && !m.resuelto && <button type="button" onClick={() => { setRespondiendo(m); setDoc(''); caja.current?.focus(); }}>Responder aquí</button>}
              {m.doc && m.primero && lado === 'despacho' && <button type="button" onClick={() => resolver(m, !m.resuelto)}>{m.resuelto ? 'Reabrir' : 'Marcar resuelta'}</button>}
              {m.doc && m.primero && m.resuelto && <span>Resuelta</span>}
              <time dateTime={m.fecha}>{hora(m.fecha)}</time>
            </span>
          </div>
        </div>;
      })}
    </div>
    <form className="chat-escribir" onSubmit={mandar}>
      {sobre && <p className="chat-contexto"><span>{respondiendo ? 'Respondiendo a' : 'Preguntas por'}: <b>{sobre}</b></span><button type="button" aria-label="Quitar" onClick={() => { setRespondiendo(null); setDoc(''); }}>×</button></p>}
      {docs && !respondiendo && !doc && opciones.length > 0 && <label className="chat-adjuntar">
        <span className="sr">Preguntar por una factura o un gasto</span>
        <select value="" onChange={(e) => setDoc(e.target.value)}>
          <option value="">+ Preguntar por una factura o un gasto…</option>
          {docs.facturas.length > 0 && <optgroup label="Facturas">{opciones.filter((o) => o.v.startsWith('factura')).map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}</optgroup>}
          {docs.gastos.length > 0 && <optgroup label="Gastos">{opciones.filter((o) => o.v.startsWith('gasto')).map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}</optgroup>}
        </select>
      </label>}
      <div className="chat-linea">
        <textarea ref={caja} rows={1} value={texto} maxLength={2000} placeholder="Escribe un mensaje" aria-label="Mensaje" onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(min-width: 1024px)').matches) mandar(e); }} />
        <button className="chat-enviar" aria-label="Enviar" disabled={!texto.trim() || ocupado}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg>
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </div>;
}
