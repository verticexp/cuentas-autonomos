'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';
import { fechaCorta } from '@/lib/formato';
import '@/app/despacho.css';

const horaDe = (iso) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Una pregunta de la gestoría con su hilo y el formulario para responder.
function Pregunta({ c, alCambiar }) {
  const [texto, setTexto] = useState('');
  const [msg, setMsg] = useState('');
  const enviar = async (cuerpo) => {
    setMsg('');
    try { await llamar('/api/tu-despacho', { method: 'PATCH', body: JSON.stringify({ id: c.id, ...cuerpo }) }); setTexto(''); alCambiar(); } catch (e) { setMsg(e.message); }
  };
  return <li className={c.resuelto ? 'resuelto' : ''}>
    <span className="doc">{c.doc ? c.doc.texto : `${c.t}T ${c.anio}`}{c.resuelto ? ' · Resuelta' : ''}</span>
    {c.hilo.map((m, i) => <p key={i} className="msg"><b>{m.lado === 'despacho' ? `${m.nombre || 'Tu gestoría'} (gestoría)` : m.nombre || 'Tú'}</b> <small>{horaDe(m.fecha)}</small><br />{m.texto}</p>)}
    {!c.resuelto && <form onSubmit={(e) => { e.preventDefault(); if (texto.trim()) enviar({ texto }); }}>
      <textarea className="campo" rows={1} maxLength={2000} value={texto} placeholder="Tu respuesta" aria-label="Tu respuesta" onChange={(e) => setTexto(e.target.value)} />
      <button className="boton" disabled={!texto.trim()}>Responder</button>
    </form>}
    {msg && <p className="error" role="alert">{msg}</p>}
  </li>;
}

// Ajustes › Tu gestoría: el despacho que lleva tus cuentas en Fisquo (lib/despachos.js). Le das acceso con su código,
// ves lo que hace y le respondes; puedes quitárselo cuando quieras.
export default function TuDespacho({ despacho, accesos = [], comentarios = [], codigo: codigoInicial = '' }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState(codigoInicial);
  const [nombre, setNombre] = useState('');
  const [msg, setMsg] = useState('');
  const buscar = async (e) => {
    e.preventDefault(); setMsg(''); setNombre('');
    try { const r = await llamar(`/api/tu-despacho?codigo=${encodeURIComponent(codigo.trim())}`); setNombre(r.nombre); } catch (err) { setMsg(err.message); }
  };
  const dar = async () => {
    setMsg('');
    try { await llamar('/api/tu-despacho', { method: 'POST', body: JSON.stringify({ codigo: codigo.trim() }) }); router.replace('/ajustes/gestoria'); router.refresh(); } catch (err) { setMsg(err.message); }
  };
  const quitar = async () => {
    if (!(await confirmar({ titulo: `¿Quitar el acceso a ${despacho.nombre}?`, texto: `Dejará de ver tus cuentas al momento.${despacho.licencia ? ' Como tu gestoría pagaba tu plan, tendrás un mes de prueba para elegir el tuyo.' : ''}`, aceptar: 'Quitar el acceso', peligro: true }))) return;
    try { await llamar('/api/tu-despacho', { method: 'DELETE' }); router.refresh(); } catch (err) { setMsg(err.message); }
  };
  const abiertas = comentarios.filter((c) => !c.resuelto);

  if (!despacho) return <section className="grupo" aria-labelledby="td-t">
    <h2 className="grupo-t" id="td-t">Tu gestoría en Fisquo</h2>
    <div className="grupo-c relleno">
      <p>Si tu gestoría trabaja con Fisquo, dale acceso con su código: verá tus cuentas, revisará cada trimestre y podrá preguntarte aquí. Tú ves todo lo que hace y se lo puedes quitar cuando quieras.</p>
      <form className="desp-codigo" onSubmit={buscar}>
        <input className="campo" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={20} placeholder="Código de tu gestoría" aria-label="Código de tu gestoría" value={codigo} onChange={(e) => { setCodigo(e.target.value); setNombre(''); }} />
        <button className="boton sec" disabled={!codigo.trim()}>Buscar</button>
      </form>
      {nombre && <div className="desp-codigo-ok"><span>Es <b>{nombre}</b>.</span><button type="button" className="boton" onClick={dar}>Dar acceso a {nombre}</button></div>}
      {msg && <p className="error" role="alert">{msg}</p>}
    </div>
  </section>;

  return <>
    <section className="grupo" aria-labelledby="td-t">
      <h2 className="grupo-t" id="td-t">Tu gestoría en Fisquo</h2>
      <div className="grupo-c relleno">
        <p><b>{despacho.nombre}</b> lleva tus cuentas en Fisquo desde el {fechaCorta(String(despacho.desde).slice(0, 10))}.{despacho.licencia ? ' Fisquo va incluido en lo que te cobra tu gestoría: no pagas nada a Fisquo.' : ''}</p>
        <p className="nota">Entra con el perfil Gestoría: ve tus facturas, gastos, nóminas, contabilidad e impuestos. Cuando revisa un trimestre lo cierra: ya no se pueden cambiar sus facturas ni sus gastos hasta que lo reabra.</p>
        <button type="button" className="boton sec desp-mini" onClick={quitar}>Quitar el acceso</button>
        {msg && <p className="error" role="alert">{msg}</p>}
      </div>
    </section>
    <section className="grupo" aria-labelledby="td-p">
      <h2 className="grupo-t" id="td-p">Preguntas de tu gestoría{abiertas.length ? ` (${abiertas.length})` : ''}</h2>
      <div className="grupo-c relleno">
        {comentarios.length ? <ul className="desp-hilo">{comentarios.map((c) => <Pregunta key={c.id} c={c} alCambiar={() => router.refresh()} />)}</ul> : <p className="nota">No te ha preguntado nada todavía.</p>}
      </div>
    </section>
    <section className="grupo" aria-labelledby="td-a">
      <h2 className="grupo-t" id="td-a">Lo que ha hecho en tus cuentas</h2>
      <div className="grupo-c relleno">
        {accesos.length ? <ul className="desp-registro">{accesos.map((a, i) => <li key={i}><span>{a.nombre}{a.despacho ? ` (${a.despacho})` : ''}: {a.accion}{a.detalle ? ` · ${a.detalle}` : ''}</span><small>{horaDe(a.fecha)}</small></li>)}</ul> : <p className="nota">Todavía nada.</p>}
      </div>
    </section>
  </>;
}
