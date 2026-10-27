'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';
import { useT } from '@/components/Idioma';
import { conHuecos } from '@/lib/huecos';

// Equipo de Mi despacho: lista, invitar (titular), cambiar el rol y quitar.
export default function EquipoDespacho({ equipo, titular, yo, sinAsignar = null, t = 0 }) {
  const router = useRouter();
  const tr = useT();
  const [d, setD] = useState({ nombre: '', email: '', rol: 'gestor' });
  const [msg, setMsg] = useState('');
  const [enlace, setEnlace] = useState('');
  const invitar = async (e) => {
    e.preventDefault();
    setMsg('Enviando…'); setEnlace('');
    try {
      const r = await llamar('/api/despacho/equipo', { method: 'POST', body: JSON.stringify(d) });
      setMsg(r.enviado ? `✓ Invitación enviada a ${d.email}` : r.aviso ? `✓ Invitación creada, pero el email no ha salido (${r.aviso}): pásale el enlace` : '✓ Invitación creada');
      if (!r.enviado) setEnlace(r.enlace || '');
      setD({ nombre: '', email: '', rol: 'gestor' }); router.refresh();
    } catch (err) { setMsg(err.message); }
  };
  const cambiarRol = async (x, rol) => { try { await llamar('/api/despacho/equipo', { method: 'PATCH', body: JSON.stringify({ id: x.id, rol }) }); router.refresh(); } catch (err) { setMsg(err.message); } };
  const quitar = async (x) => {
    if (!(await confirmar({ titulo: tr('¿Quitar a {nombre}?', { nombre: x.nombre || x.email }), texto: tr('Dejará de ver a los clientes del despacho. Sus clientes asignados quedan sin asignar.'), aceptar: tr('Quitar'), peligro: true }))) return;
    try { await llamar(`/api/despacho/equipo?id=${encodeURIComponent(x.id)}`, { method: 'DELETE' }); router.refresh(); } catch (err) { setMsg(err.message); }
  };
  return <>
    <ul className="grupo-lista">{equipo.map((x) => <li key={x.id} className="fila">
      <span className="txt"><strong>{x.nombre || x.email}{x.id === yo ? ` ${tr('(tú)')}` : ''}</strong><small>{[x.email, tr(x.rolTexto), x.pendiente && tr('Invitación pendiente')].filter(Boolean).join(' · ')}</small>
        {x.carga && <Carga c={x.carga} t={t} />}</span>
      {titular && x.id !== yo && <span className="desp-acciones desp-equipo-acc">
        <select className="desp-select-celda" aria-label={tr('Rol de {nombre}', { nombre: x.nombre || x.email })} value={x.rol} onChange={(e) => cambiarRol(x, e.target.value)}><option value="gestor">{tr('Gestor')}</option><option value="titular">{tr('Titular')}</option></select>
        <button type="button" className="boton sec desp-mini" onClick={() => quitar(x)}>{tr('Quitar')}</button>
      </span>}
    </li>)}
    {sinAsignar?.clientes > 0 && <li className="fila"><span className="txt"><strong>{tr('Sin asignar')}</strong><small>{tr('Asígnalos en la ficha de cada cliente, en «Quién lo lleva».')}</small><Carga c={sinAsignar} t={t} /></span></li>}
    </ul>
    {titular && <form className="formulario tarjeta" onSubmit={invitar}>
      <h2 className="tarjeta-titulo">{tr('Invitar a alguien del despacho')}</h2>
      <label>{tr('Nombre')}<input className="campo" value={d.nombre} maxLength={60} onChange={(e) => setD({ ...d, nombre: e.target.value })} required /></label>
      <label>{tr('Email')}<input className="campo" type="email" autoComplete="off" value={d.email} maxLength={254} onChange={(e) => setD({ ...d, email: e.target.value })} required /></label>
      <label>{tr('Rol')}<select className="campo" value={d.rol} onChange={(e) => setD({ ...d, rol: e.target.value })}><option value="gestor">{tr('Gestor: ve y revisa clientes')}</option><option value="titular">{tr('Titular: además, equipo, licencias y datos del despacho')}</option></select></label>
      <button className="boton" disabled={msg === 'Enviando…'}>{tr('Invitar')}</button>
    </form>}
    {msg && <p role="status" className={msg.startsWith('✓') || msg === 'Enviando…' ? 'nota' : 'error'}>{tr(msg)}</p>}
    {enlace && <p className="nota">{conHuecos(tr('Enlace de la invitación: {enlace}'), { enlace: <code>{enlace}</code> })}</p>}
  </>;
}

// La carga de una persona: sus clientes y lo que tienen pendiente (lo que pide atención, en color).
function Carga({ c, t }) {
  const tr = useT();
  const partes = [
    [c.clientes, c.clientes === 1 ? tr('1 cliente') : tr('{n} clientes', { n: c.clientes }), false],
    [c.porRevisar, tr('{n} por revisar del {t}T', { n: c.porRevisar, t }), true],
    [c.sinLeer, c.sinLeer === 1 ? tr('1 mensaje sin leer') : tr('{n} mensajes sin leer', { n: c.sinLeer }), true],
    [c.esperan, c.esperan === 1 ? tr('1 documento esperando') : tr('{n} documentos esperando', { n: c.esperan }), false],
  ].filter(([n]) => n > 0);
  if (!partes.length) return <span className="desp-carga"><span>{tr('Sin clientes asignados')}</span></span>;
  return <span className="desp-carga">{partes.map(([, t, aviso]) => <span key={t} className={aviso ? 'aviso' : ''}>{t}</span>)}</span>;
}
