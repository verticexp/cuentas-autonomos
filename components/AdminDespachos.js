'use client';

import { useEffect, useState } from 'react';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';
import { eur } from '@/lib/formato';

const euros = (c) => eur(c / 100);

// Panel /admin: los despachos asociados y el alta de uno nuevo (con su titular y su código).
export default function AdminDespachos() {
  const [lista, setLista] = useState(null);
  const [d, setD] = useState({ nombre: '', nif: '', titular: '', email: '', codigo: '' });
  const [msg, setMsg] = useState('');
  const cargar = () => llamar('/api/admin/despachos').then(setLista).catch((e) => setMsg(e.message));
  useEffect(() => { cargar(); }, []);
  const crear = async (e) => {
    e.preventDefault(); setMsg('Creando…');
    try {
      const r = await llamar('/api/admin/despachos', { method: 'POST', body: JSON.stringify(d) });
      setMsg(r.enviado ? `✓ ${r.despacho.nombre} creado. Invitación enviada a ${d.email}.` : `✓ ${r.despacho.nombre} creado.${r.enlace ? ` Enlace para el titular: ${r.enlace}` : ' El titular ya tenía cuenta: verá Mi despacho al entrar.'}${r.aviso ? ` (El email no ha salido: ${r.aviso})` : ''}`);
      setD({ nombre: '', nif: '', titular: '', email: '', codigo: '' }); cargar();
    } catch (err) { setMsg(err.message); }
  };
  const baja = async (x) => {
    if (!(await confirmar({ titulo: `¿Dar de baja «${x.nombre}»?`, texto: `Sus ${x.clientes} clientes dejarán de estar en el despacho (los que tenía incluidos en su cuota tendrán un mes para elegir su plan) y su equipo perderá el acceso al panel. Sus cuentas siguen.`, aceptar: 'Dar de baja', peligro: true }))) return;
    try { await llamar(`/api/admin/despachos?id=${encodeURIComponent(x.id)}`, { method: 'DELETE' }); setMsg(`✓ ${x.nombre} dado de baja`); cargar(); } catch (err) { setMsg(err.message); }
  };
  return <>
    {lista === null ? <p className="nota">Cargando…</p> : lista.length ? <ul className="adm-lista">{lista.map((x) => <li key={x.id}>
      <span>{x.nombre} · {x.codigo} · {x.personas} {x.personas === 1 ? 'persona' : 'personas'}</span>
      <b>{x.clientes} clientes · {x.licencias.aut.total + x.licencias.pym.total} licencias · {euros(x.licencias.importe)}/mes{x.cobro?.activo ? ' · cobro activo' : x.licencias.importe ? ' · sin cobro activo' : ''}{x.personas === 0 ? ' · sin titular' : ''}</b>
      <button type="button" className="boton sec" onClick={() => baja(x)}>Dar de baja</button>
    </li>)}</ul> : <p className="nota">Aún no hay despachos.</p>}
    <form className="formulario" onSubmit={crear}>
      <label>Nombre del despacho<input className="campo" value={d.nombre} maxLength={120} onChange={(e) => setD({ ...d, nombre: e.target.value })} required /></label>
      <label>NIF<input className="campo" value={d.nif} maxLength={20} onChange={(e) => setD({ ...d, nif: e.target.value })} /></label>
      <label>Nombre del titular<input className="campo" value={d.titular} maxLength={60} onChange={(e) => setD({ ...d, titular: e.target.value })} required /></label>
      <label>Email del titular<input className="campo" type="email" value={d.email} maxLength={254} onChange={(e) => setD({ ...d, email: e.target.value })} required /></label>
      <label>Código para sus clientes<input className="campo" value={d.codigo} maxLength={20} placeholder="GESTORIA-LOPEZ" onChange={(e) => setD({ ...d, codigo: e.target.value.toUpperCase() })} required /></label>
      <button className="boton" disabled={msg === 'Creando…'}>Crear despacho</button>
    </form>
    {msg && <p role="status" className={msg.startsWith('✓') || msg === 'Creando…' ? 'nota' : 'error'}>{msg}</p>}
  </>;
}
