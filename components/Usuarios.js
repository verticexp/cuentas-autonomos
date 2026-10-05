'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import Avatar from './Avatar';
import { PERFILES, PERMISOS, limpiarPermisos } from '@/lib/permisos';

// Perfil de serie o permisos a medida.
function ElegirPermisos({ rol, permisos, cambiar }) {
  const perfil = rol === 'admin' ? 'admin' : PERFILES.find((p) => p.id !== 'admin' && limpiarPermisos(p.permisos).join() === limpiarPermisos(permisos).join())?.id || 'propio';
  return (
    <>
      <div className="chips perfiles" role="radiogroup" aria-label="Perfil">
        {PERFILES.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={perfil === p.id} className={perfil === p.id ? 'activo' : ''}
            onClick={() => cambiar(p.id === 'admin' ? 'admin' : 'miembro', p.permisos)}>{p.nombre}</button>
        ))}
        <span className={`chip-info${perfil === 'propio' ? ' activo' : ''}`}>Personalizado</span>
      </div>
      {rol !== 'admin' && (
        <div className="permisos">
          {PERMISOS.map((p) => {
            const on = limpiarPermisos(permisos).includes(p.id);
            return (
              <label key={p.id} className="permiso">
                <input type="checkbox" checked={on} onChange={() => cambiar('miembro', on ? permisos.filter((x) => x !== p.id && !(p.id === 'facturas' && x === 'facturar') && !(p.id === 'gastos' && x === 'gastar')) : [...permisos, p.id])} />
                <span><strong>{p.nombre}</strong><small>{p.detalle}</small></span>
              </label>
            );
          })}
        </div>
      )}
      {rol === 'admin' && <p className="nota">Puede hacerlo todo, también gestionar usuarios.</p>}
    </>
  );
}

function Enlace({ url }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="enlace">
      <p className="nota">Envíale este enlace para que elija su contraseña (vale 7 días y una sola vez):</p>
      <input className="campo" readOnly value={url} onFocus={(e) => e.target.select()} />
      <button type="button" className="boton sec" onClick={() => { navigator.clipboard.writeText(url); setCopiado(true); }}>{copiado ? 'Copiado' : 'Copiar enlace'}</button>
    </div>
  );
}

function Persona({ o, yo, onCambio }) {
  const [abierta, setAbierta] = useState(false);
  const [rol, setRol] = useState(o.rol);
  const [permisos, setPermisos] = useState(o.permisos);
  const [msg, setMsg] = useState('');
  const [enlace, setEnlace] = useState('');
  const soyYo = o.id === yo;

  const guardar = async () => {
    setMsg('Guardando…');
    try { await llamar('/api/usuarios', { method: 'PATCH', body: JSON.stringify({ id: o.id, rol, permisos }) }); setMsg(''); setAbierta(false); onCambio(); }
    catch (e) { setMsg(e.message); }
  };
  const quitar = async () => {
    if (!confirm(`¿Quitar el acceso a ${o.nombre}? Sus facturas y gastos se quedan en la empresa.`)) return;
    try { await llamar(`/api/usuarios?id=${o.id}`, { method: 'DELETE' }); onCambio(); } catch (e) { setMsg(e.message); }
  };
  const reenviar = async () => {
    try { setEnlace((await llamar('/api/usuarios', { method: 'POST', body: JSON.stringify({ reenviar: o.id }) })).enlace); } catch (e) { setMsg(e.message); }
  };

  return (
    <li className={abierta ? 'abierta' : ''}>
      <button type="button" className="fila" onClick={() => !soyYo && setAbierta(!abierta)} aria-expanded={abierta} disabled={soyYo}>
        <Avatar nombre={o.nombre} />
        <span className="txt"><strong>{o.nombre}{soyYo ? ' (tú)' : ''}</strong><small>{o.email}</small></span>
        <span className="imp-col">
          <span className={`pastilla ${o.rol === 'admin' ? 'p-admin' : 'p-perfil'}`}>{o.perfil}</span>
          {!o.activo && <span className="pastilla p-pendiente">Invitado</span>}
        </span>
      </button>
      {abierta && (
        <div className="persona-editar">
          <ElegirPermisos rol={rol} permisos={permisos} cambiar={(r, p) => { setRol(r); setPermisos(r === 'admin' ? [] : limpiarPermisos(p)); }} />
          {msg && <p className={msg === 'Guardando…' ? 'nota' : 'error'}>{msg}</p>}
          <div className="botones-fila">
            <button type="button" className="boton" onClick={guardar}>Guardar permisos</button>
            {!o.activo && <button type="button" className="boton sec" onClick={reenviar}>Nuevo enlace</button>}
            <button type="button" className="borrar" onClick={quitar}>Quitar acceso</button>
          </div>
          {enlace && <Enlace url={enlace} />}
        </div>
      )}
    </li>
  );
}

export default function Usuarios({ lista, yo, empresa, empresas, miEmpresa }) {
  const router = useRouter();
  const [d, setD] = useState({ nombre: '', email: '', rol: 'miembro', permisos: PERFILES[1].permisos });
  const [enlace, setEnlace] = useState('');
  const [yaTiene, setYaTiene] = useState('');
  const [error, setError] = useState('');
  const [nueva, setNueva] = useState({ empresaNueva: '', nombre: '', email: '' });
  const [enlaceEmpresa, setEnlaceEmpresa] = useState('');

  const invitar = async (e) => {
    e.preventDefault();
    setError(''); setEnlace(''); setYaTiene('');
    try {
      const r = await llamar('/api/usuarios', { method: 'POST', body: JSON.stringify(d) });
      if (r.existente) setYaTiene(`${r.existente} ya tenía cuenta en Netto: verá ${empresa} al cambiar de empresa.`);
      else setEnlace(r.enlace);
      setD({ ...d, nombre: '', email: '' });
      router.refresh();
    } catch (err) { setError(err.message); }
  };
  const crearEmpresa = async (e) => {
    e.preventDefault();
    setError(''); setEnlaceEmpresa('');
    try {
      const r = await llamar('/api/usuarios', { method: 'POST', body: JSON.stringify(nueva) });
      setEnlaceEmpresa(r.enlace); setNueva({ empresaNueva: '', nombre: '', email: '' });
      router.refresh();
    } catch (err) { setError(err.message); }
  };

  return (
    <>
      {lista && (
        <>
          <p className="rotulo">Personas de {empresa}. Toca a alguien para cambiar lo que puede hacer.</p>
          <ul className="grupo-lista personas">
            {lista.map((o) => <Persona key={o.id} o={o} yo={yo} onCambio={() => router.refresh()} />)}
          </ul>

          <form className="formulario tarjeta bloque" onSubmit={invitar} style={{ marginTop: 16 }}>
            <h3>Invitar a alguien</h3>
            <input className="campo" placeholder="Nombre" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required />
            <input className="campo" type="email" placeholder="Email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} required />
            <p className="rotulo" style={{ margin: '4px 0 0' }}>Qué podrá hacer</p>
            <ElegirPermisos rol={d.rol} permisos={d.permisos} cambiar={(rol, permisos) => setD({ ...d, rol, permisos: rol === 'admin' ? [] : limpiarPermisos(permisos) })} />
            {error && <p className="error">{error}</p>}
            <button className="boton">Crear invitación</button>
            {enlace && <Enlace url={enlace} />}
            {yaTiene && <p className="nota">{yaTiene}</p>}
          </form>
        </>
      )}

      {empresas && (
        <section className="bloque">
          <h2 className="subtitulo">Empresas</h2>
          <p className="rotulo">Solo tú ves esto: cada empresa tiene sus facturas, sus gastos y sus usuarios.</p>
          <ul className="grupo-lista">
            {empresas.map((e) => (
              <li key={e.id} className="fila">
                <Avatar nombre={e.nombre} />
                <span className="txt"><strong>{e.nombre}{e.id === miEmpresa ? ' (la tuya)' : ''}</strong><small>{e.personas === 1 ? '1 persona' : `${e.personas} personas`}</small></span>
                {e.id !== miEmpresa && (
                  <button type="button" className="borrar" onClick={async () => {
                    if (!confirm(`¿Borrar ${e.nombre} con todos sus usuarios, facturas y gastos? No se puede deshacer.`)) return;
                    try { await llamar(`/api/usuarios?empresa=${e.id}`, { method: 'DELETE' }); router.refresh(); } catch (err) { alert(err.message); }
                  }}>Borrar</button>
                )}
              </li>
            ))}
          </ul>
          <form className="formulario tarjeta" onSubmit={crearEmpresa} style={{ marginTop: 16 }}>
            <h3>Dar de alta una empresa</h3>
            <input className="campo" placeholder="Nombre de la empresa" value={nueva.empresaNueva} onChange={(e) => setNueva({ ...nueva, empresaNueva: e.target.value })} required />
            <input className="campo" placeholder="Nombre de su administrador" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} required />
            <input className="campo" type="email" placeholder="Email del administrador" value={nueva.email} onChange={(e) => setNueva({ ...nueva, email: e.target.value })} required />
            <button className="boton">Crear empresa e invitación</button>
            {enlaceEmpresa && <Enlace url={enlaceEmpresa} />}
          </form>
        </section>
      )}
    </>
  );
}
