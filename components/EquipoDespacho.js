'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';

// Equipo de Mi despacho: lista, invitar (titular), cambiar el rol y quitar.
export default function EquipoDespacho({ equipo, titular, yo, sinAsignar = null, trimestre = '' }) {
  const router = useRouter();
  const [d, setD] = useState({ nombre: '', email: '', rol: 'gestor' });
  const [msg, setMsg] = useState('');
  const [enlace, setEnlace] = useState('');
  const invitar = async (e) => {
    e.preventDefault();
    setMsg('Enviando…'); setEnlace('');
    try {
      const r = await llamar('/api/despacho/equipo', { method: 'POST', body: JSON.stringify(d) });
      setMsg(r.enviado ? `✓ Invitación enviada a ${d.email}` : `✓ Invitación creada${r.aviso ? `, pero el email no ha salido (${r.aviso}): pásale el enlace` : ''}`);
      if (!r.enviado) setEnlace(r.enlace || '');
      setD({ nombre: '', email: '', rol: 'gestor' }); router.refresh();
    } catch (err) { setMsg(err.message); }
  };
  const cambiarRol = async (x, rol) => { try { await llamar('/api/despacho/equipo', { method: 'PATCH', body: JSON.stringify({ id: x.id, rol }) }); router.refresh(); } catch (err) { setMsg(err.message); } };
  const quitar = async (x) => {
    if (!(await confirmar({ titulo: `¿Quitar a ${x.nombre || x.email}?`, texto: 'Dejará de ver a los clientes del despacho. Sus clientes asignados quedan sin asignar.', aceptar: 'Quitar', peligro: true }))) return;
    try { await llamar(`/api/despacho/equipo?id=${encodeURIComponent(x.id)}`, { method: 'DELETE' }); router.refresh(); } catch (err) { setMsg(err.message); }
  };
  return <>
    <ul className="grupo-lista">{equipo.map((x) => <li key={x.id} className="fila">
      <span className="txt"><strong>{x.nombre || x.email}{x.id === yo ? ' (tú)' : ''}</strong><small>{[x.email, x.rolTexto, x.pendiente && 'Invitación pendiente'].filter(Boolean).join(' · ')}</small>
        {x.carga && <Carga c={x.carga} trimestre={trimestre} />}</span>
      {titular && x.id !== yo && <span className="desp-acciones desp-equipo-acc">
        <select className="desp-select-celda" aria-label={`Rol de ${x.nombre || x.email}`} value={x.rol} onChange={(e) => cambiarRol(x, e.target.value)}><option value="gestor">Gestor</option><option value="titular">Titular</option></select>
        <button type="button" className="boton sec desp-mini" onClick={() => quitar(x)}>Quitar</button>
      </span>}
    </li>)}
    {sinAsignar?.clientes > 0 && <li className="fila"><span className="txt"><strong>Sin asignar</strong><small>Asígnalos en la ficha de cada cliente, en «Quién lo lleva».</small><Carga c={sinAsignar} trimestre={trimestre} /></span></li>}
    </ul>
    {titular && <form className="formulario tarjeta" onSubmit={invitar}>
      <h2 className="tarjeta-titulo">Invitar a alguien del despacho</h2>
      <label>Nombre<input className="campo" value={d.nombre} maxLength={60} onChange={(e) => setD({ ...d, nombre: e.target.value })} required /></label>
      <label>Email<input className="campo" type="email" autoComplete="off" value={d.email} maxLength={254} onChange={(e) => setD({ ...d, email: e.target.value })} required /></label>
      <label>Rol<select className="campo" value={d.rol} onChange={(e) => setD({ ...d, rol: e.target.value })}><option value="gestor">Gestor: ve y revisa clientes</option><option value="titular">Titular: además, equipo, licencias y datos del despacho</option></select></label>
      <button className="boton" disabled={msg === 'Enviando…'}>Invitar</button>
    </form>}
    {msg && <p role="status" className={msg.startsWith('✓') || msg === 'Enviando…' ? 'nota' : 'error'}>{msg}</p>}
    {enlace && <p className="nota">Enlace de la invitación: <code>{enlace}</code></p>}
  </>;
}

// La carga de una persona: sus clientes y lo que tienen pendiente (lo que pide atención, en color).
function Carga({ c, trimestre }) {
  const partes = [
    [c.clientes, c.clientes === 1 ? '1 cliente' : `${c.clientes} clientes`, false],
    [c.porRevisar, `${c.porRevisar} por revisar del ${trimestre}`, true],
    [c.sinLeer, c.sinLeer === 1 ? '1 mensaje sin leer' : `${c.sinLeer} mensajes sin leer`, true],
    [c.esperan, c.esperan === 1 ? '1 documento esperando' : `${c.esperan} documentos esperando`, false],
  ].filter(([n]) => n > 0);
  if (!partes.length) return <span className="desp-carga"><span>Sin clientes asignados</span></span>;
  return <span className="desp-carga">{partes.map(([, t, aviso]) => <span key={t} className={aviso ? 'aviso' : ''}>{t}</span>)}</span>;
}
