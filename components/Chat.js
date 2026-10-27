'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { diaDe, eur, fechaConDia, fechaCorta, hoy as hoyMadrid, hora } from '@/lib/formato';
import VistaDocumento from './VistaDocumento';
import AccionesDocumento from './AccionesDocumento';
import { useT } from '@/components/Idioma';
import '@/app/chat.css';

// Chat entre el despacho y su cliente (lib/comentariosDespacho.js): los mensajes en orden, los míos a la derecha, con la
// fecha de cada día y una raya en «Nuevos» donde empieza lo que no había leído. Una pregunta sobre una factura o un gasto
// lleva su etiqueta y se le puede responder aparte; lo demás va a la conversación general.
// mensajes: mensajesDe(hilos) · lado: 'despacho' | 'cliente' · leidoAntes: hasta cuándo había leído este lado.
// enviar: { url, metodo, extra } (POST /api/despacho/comentarios con la empresa, o PUT /api/tu-despacho).
// docs: { facturas, gastos } para preguntar por un documento (solo el despacho) · docInicial: 'gasto:id' o 'factura:id'.
// leer: { url, metodo, cuerpo? } para marcar como leído al abrirlo (desde aquí y no al pintar la página: la app precarga
// las pantallas y daría por leído lo que nadie ha visto).
// vista: URL de la vista previa de documentos (api/despacho/documento?empresa=… o api/tu-despacho/documento): tocar la
// factura o el gasto de una pregunta la abre sin salir del chat (components/VistaDocumento.js).
// comprobar: URL (GET) que devuelve los hilos ({ hilos } o { comentarios }) para ver si hay algo nuevo sin recargar la
// pantalla entera: recargarla cada 30 segundos costaba unas 100 consultas a la base de datos cada vez.
// Cuántos mensajes hay, el último y cuántos están en preguntas resueltas: si cambia algo, hay que recargar.
const firma = (lista) => `${lista.length}|${lista.reduce((m, x) => (x.fecha > m ? x.fecha : m), '')}|${lista.filter((x) => x.resuelto).length}`;
const ESPERA = 60000;
function dia(iso, hoy, tr) {
  const d = diaDe(iso);
  if (d === hoy) return tr('Hoy');
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  if (d === ayer) return tr('Ayer');
  const t = fechaConDia(d);
  return t[0].toUpperCase() + t.slice(1);
}

export default function Chat({ mensajes, lado, leidoAntes = '', enviar, leer, comprobar, vista, plantillas = [], docs = null, docInicial = '', nombreOtro, vacio }) {
  const router = useRouter();
  const tr = useT();
  const [texto, setTexto] = useState('');
  const [doc, setDoc] = useState(docInicial);
  const [respondiendo, setRespondiendo] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [ver, setVer] = useState(null);
  const [guardados, setGuardados] = useState(false);
  const [error, setError] = useState('');
  const lista = useRef(null);
  const caja = useRef(null);
  const hoy = hoyMadrid();
  // La raya de «Nuevos» se queda donde estaba al abrir, aunque al marcarlo leído la página se recargue.
  const [leidoAlAbrir] = useState(leidoAntes);
  // Solo se animan los mensajes que llegan con la conversación abierta (antes, todos se movían en cada recarga).
  const [vistos] = useState(mensajes.length);
  const primeroNuevo = useMemo(() => mensajes.find((m) => m.lado !== lado && m.fecha > leidoAlAbrir)?.fecha, [mensajes, lado, leidoAlAbrir]);

  // Lo último a la vista, dentro de la caja de mensajes (sin mover la página).
  const alFinal = () => { const l = lista.current; if (l) l.scrollTop = l.scrollHeight; };
  useEffect(alFinal, [mensajes.length]);
  // Si se estaba viendo lo último (con margen), al cambiar el alto se sigue viendo lo último.
  const pegado = useRef(true);
  const alDesplazar = () => { const l = lista.current; if (l) pegado.current = l.scrollHeight - l.scrollTop - l.clientHeight < 80; };
  // Teclado del móvil, como WhatsApp: la conversación a pantalla completa (.desp-chat-pagina, chat.css) se ajusta al hueco
  // que de verdad queda a la vista. iOS no encoge la pantalla al sacar el teclado: la desplaza hacia arriba y la
  // conversación quedaba por debajo, con los mensajes fuera de la vista. visualViewport dice cuánto se ve y desde dónde.
  useEffect(() => {
    const vv = window.visualViewport;
    const pagina = lista.current?.closest('.desp-chat-pagina');
    if (!vv || !pagina) return undefined;
    const movil = matchMedia('(max-width: 1023.98px)');
    const tactil = matchMedia('(pointer: coarse)');
    // Teclado fuera: escribiendo en la página con el dedo (en algunos iPhone la pantalla entera encoge con el teclado y el
    // alto por sí solo no lo dice) o la parte visible bastante más baja que la pantalla.
    const conTeclado = () => (tactil.matches && pagina.contains(document.activeElement) && document.activeElement.matches('textarea, input:not([type="checkbox"]):not([type="radio"])'))
      || vv.height < window.innerHeight * 0.8;
    let marco = 0;
    const ajustar = () => {
      cancelAnimationFrame(marco);
      marco = requestAnimationFrame(() => {
        if (!movil.matches) { pagina.style.height = ''; pagina.style.top = ''; pagina.classList.remove('con-teclado'); return; }
        pagina.style.height = `${Math.round(vv.height)}px`;
        pagina.style.top = `${Math.round(vv.offsetTop)}px`;
        pagina.classList.toggle('con-teclado', conTeclado());
        if (pegado.current) alFinal();
      });
    };
    vv.addEventListener('resize', ajustar);
    vv.addEventListener('scroll', ajustar);
    movil.addEventListener('change', ajustar);
    pagina.addEventListener('focusin', ajustar);
    pagina.addEventListener('focusout', ajustar);
    ajustar();
    return () => {
      cancelAnimationFrame(marco);
      vv.removeEventListener('resize', ajustar);
      vv.removeEventListener('scroll', ajustar);
      movil.removeEventListener('change', ajustar);
      pagina.removeEventListener('focusin', ajustar);
      pagina.removeEventListener('focusout', ajustar);
      pagina.style.height = ''; pagina.style.top = ''; pagina.classList.remove('con-teclado');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Lo nuevo llega solo: cada minuto, si la pantalla está a la vista y no se está escribiendo, se miran los mensajes (una
  // consulta pequeña) y solo si ha cambiado algo se recarga la pantalla.
  const actual = firma(mensajes);
  useEffect(() => {
    if (!comprobar) return undefined;
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible' || caja.current?.value) return;
      const d = await fetch(comprobar, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const hilos = d?.hilos || d?.comentarios;
      if (Array.isArray(hilos) && firma(hilos.flatMap((c) => (c.hilo || []).map((m) => ({ fecha: m.fecha, resuelto: Boolean(c.resuelto) })))) !== actual) router.refresh();
    }, ESPERA);
    return () => clearInterval(t);
  }, [comprobar, actual, router]);
  // Abierto: lo del otro lado queda leído (y el número de «Mensajes» se pone al día).
  const sinLeer = mensajes.some((m) => m.lado !== lado && m.fecha > leidoAntes);
  useEffect(() => {
    if (!leer || !sinLeer) return;
    fetch(leer.url, { method: leer.metodo, headers: { 'Content-Type': 'application/json' }, ...(leer.cuerpo ? { body: JSON.stringify(leer.cuerpo) } : {}) }).then(() => router.refresh()).catch(() => {});
  }, [leer?.url, sinLeer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (docInicial) caja.current?.focus({ preventScroll: true }); }, [docInicial]);
  // El cuadro crece con el texto (hasta unas seis líneas).
  useEffect(() => { const t = caja.current; if (!t) return; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 160)}px`; }, [texto]);

  const opciones = docs ? [...docs.facturas.map((f) => ({ v: `factura:${f.id}`, t: tr('Factura {texto} · {total}', { texto: f.texto, total: eur(f.total) }) })), ...docs.gastos.map((g) => ({ v: `gasto:${g.id}`, t: `${fechaCorta(g.fecha)} · ${g.texto} · ${eur(g.total)}` }))] : [];
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
    <div ref={lista} className="chat-mensajes" role="log" aria-label={tr('Mensajes con {nombre}', { nombre: nombreOtro })} tabIndex={0} onScroll={alDesplazar}>
      {mensajes.length === 0 && <p className="chat-vacio">{vacio}</p>}
      {mensajes.map((m, i) => {
        const mio = m.lado === lado;
        const cabecera = dia(m.fecha, hoy, tr);
        const nuevoDia = cabecera !== diaAnterior;
        diaAnterior = cabecera;
        return <div key={`${m.hilo}-${m.fecha}-${i}`} className={`chat-grupo${i >= vistos ? ' nueva' : ''}`}>
          {nuevoDia && <p className="chat-dia"><span>{cabecera}</span></p>}
          {m.fecha === primeroNuevo && <p className="chat-nuevos"><span>{tr('Nuevos')}</span></p>}
          <div className={`chat-burbuja${mio ? ' mia' : ''}${m.resuelto && m.doc && m.doc.tipo !== 'informe' ? ' resuelta' : ''}`}>
            {m.doc && m.primero && <Sobre doc={m.doc} vista={vista} alVer={setVer}><svg viewBox="0 0 24 24" aria-hidden><path d="M7 3h7l4 4v14H7zM14 3v4h4" /></svg>{m.doc.texto}</Sobre>}
            {m.doc && !m.primero && <Sobre doc={m.doc} vista={vista} alVer={setVer} respuesta>{tr('Sobre {doc}', { doc: m.doc.texto })}</Sobre>}
            {mio ? <span className="sr">{tr('Tú:')}</span> : <b className="chat-autor">{m.nombre || nombreOtro}</b>}
            <p>{m.texto}</p>
            <span className="chat-pie">
              {m.doc && m.doc.tipo !== 'informe' && m.primero && !m.resuelto && <button type="button" aria-label={tr('Responder sobre {doc}', { doc: m.doc.texto })} onClick={() => { setRespondiendo(m); setDoc(''); caja.current?.focus(); }}>{tr('Responder aquí')}</button>}
              {m.doc && m.doc.tipo !== 'informe' && m.primero && lado === 'despacho' && <button type="button" aria-label={m.resuelto ? tr('Reabrir la pregunta sobre {doc}', { doc: m.doc.texto }) : tr('Marcar como resuelta la pregunta sobre {doc}', { doc: m.doc.texto })} onClick={() => resolver(m, !m.resuelto)}>{m.resuelto ? tr('Reabrir') : tr('Marcar resuelta')}</button>}
              {m.doc && m.doc.tipo !== 'informe' && m.primero && m.resuelto && <span>{tr('Resuelta')}</span>}
              <time dateTime={m.fecha}>{hora(m.fecha)}</time>
            </span>
          </div>
        </div>;
      })}
    </div>
    <form className="chat-escribir" onSubmit={mandar}>
      {sobre && <p className="chat-contexto"><span>{respondiendo ? tr('Respondiendo a') : tr('Preguntas por')}: <b>{sobre}</b></span>
        {vista && <button type="button" className="chat-ver" onClick={() => { const [tipo, docId] = respondiendo ? [respondiendo.doc.tipo, respondiendo.doc.id] : doc.split(':'); setVer({ tipo, id: docId }); }}>{tr('Ver')}</button>}
        <button type="button" aria-label={tr('Quitar el documento')} onClick={() => { setRespondiendo(null); setDoc(''); }}>×</button></p>}
      {guardados && <div className="chat-guardados" role="group" aria-label={tr('Mensajes guardados')}>
        {plantillas.map((p) => <button key={p.id} type="button" onClick={() => { setTexto(p.texto); setGuardados(false); caja.current?.focus(); }}><b>{p.titulo}</b><span>{p.texto}</span></button>)}
      </div>}
      <div className="chat-linea">
        {plantillas.length > 0 && <button type="button" className="chat-adjuntar chat-boton-guardados" aria-expanded={guardados} aria-label={tr('Mensajes guardados')} title={tr('Mensajes guardados')} onClick={() => setGuardados(!guardados)}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M6 3h12v18l-6-4-6 4z" /></svg>
        </button>}
        {docs && !respondiendo && !doc && opciones.length > 0 && <label className="chat-adjuntar" title={tr('Preguntar por una factura o un gasto')}>
          {/* Un documento con «?», no un clip: no adjunta un archivo, pregunta por una factura o un gasto que ya está en Fisquo */}
          <svg viewBox="0 0 24 24" aria-hidden><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9.8 11.2a2.2 2.2 0 1 1 3.1 2c-.6.3-.9.8-.9 1.4v.4M12 17.6v.1" /></svg>
          <span className="sr">{tr('Preguntar por una factura o un gasto')}</span>
          <select value="" onChange={(e) => setDoc(e.target.value)}>
            <option value="">{tr('Preguntar por una factura o un gasto…')}</option>
            {docs.facturas.length > 0 && <optgroup label={tr('Facturas')}>{opciones.filter((o) => o.v.startsWith('factura')).map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}</optgroup>}
            {docs.gastos.length > 0 && <optgroup label={tr('Gastos')}>{opciones.filter((o) => o.v.startsWith('gasto')).map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}</optgroup>}
          </select>
        </label>}
        <textarea ref={caja} rows={1} value={texto} maxLength={2000} placeholder={tr('Mensaje')} aria-label={tr('Mensaje')} onChange={(e) => setTexto(e.target.value)} onFocus={() => { pegado.current = true; setTimeout(alFinal, 300); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(min-width: 1024px)').matches) mandar(e); }} />
        <button className="chat-enviar" aria-label={tr('Enviar')} disabled={!texto.trim() || ocupado}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg>
        </button>
      </div>
      {error && <p className="error" role="alert">{tr(error)}</p>}
    </form>
    {vista && <VistaDocumento base={vista} doc={ver} alCerrar={() => setVer(null)}
      acciones={(d, cerrar) => <AccionesDocumento d={d} lado={lado} empresa={enviar.extra?.empresa} alHacer={() => { cerrar(); router.refresh(); }} />} />}
  </div>;
}

// La cita de la factura o el gasto de una pregunta: con vista previa, se toca para verlo.
function Sobre({ doc, vista, alVer, respuesta = false, children }) {
  const tr = useT();
  const clase = `chat-sobre${respuesta ? ' respuesta' : ''}`;
  // El informe del trimestre (api/…/informe): se abre el PDF.
  if (vista && doc.tipo === 'informe' && /^\d{4}-[1-4]$/.test(doc.id)) {
    const [anio, t] = doc.id.split('-');
    const url = `${vista.replace('/documento', '/informe')}${vista.includes('?') ? '&' : '?'}anio=${anio}&t=${t}`;
    return <a className={`${clase} toca`} href={url} target="_blank" rel="noopener">{children}<span className="chat-sobre-ver" aria-hidden>{tr('Abrir ›')}</span></a>;
  }
  if (!vista || !['factura', 'gasto'].includes(doc.tipo)) return <span className={clase}>{children}</span>;
  return <button type="button" className={`${clase} toca`} onClick={() => alVer({ tipo: doc.tipo, id: doc.id })} aria-label={tr('Ver {doc}', { doc: doc.texto })}>{children}<span className="chat-sobre-ver" aria-hidden>{tr('Ver ›')}</span></button>;
}
