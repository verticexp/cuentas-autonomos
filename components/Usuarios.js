'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import Avatar from './Avatar';
import { PERFILES, PERMISOS, limpiarPermisos } from '@/lib/permisos';
import '@/app/invitaciones.css';
import useEnvio from './useEnvio';

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

// r: lo que devuelve la API al invitar (enlace, y si el email salió o el aviso de por qué no).
function Enlace({ r }) {
  const [copiado, setCopiado] = useState(false);
  const url = r.enlace;
  return (
    <div className="enlace-invitacion">
      {r.enviado && <p className="invit-enviada" role="status">Invitación enviada a {r.email}.</p>}
      {r.aviso && <p className="invit-aviso" role="alert"><strong>La invitación está lista, pero el email no ha salido.</strong> {r.aviso}. Cópiale el enlace y envíaselo tú.</p>}
      <p className="nota">{r.enviado ? 'También puedes copiarle el enlace' : 'Envíale este enlace para que elija su contraseña'} (vale 7 días y una sola vez):</p>
      <input className="campo" readOnly aria-label="Enlace de la invitación" value={url} onFocus={(e) => e.target.select()} />
      <button type="button" className="boton sec" onClick={() => { navigator.clipboard.writeText(url); setCopiado(true); }}>{copiado ? 'Copiado' : 'Copiar enlace'}</button>
    </div>
  );
}

function Persona({ o, yo, soyAdmin, onCambio }) {
  const [abierta, setAbierta] = useState(false);
  const [rol, setRol] = useState(o.rol);
  const [permisos, setPermisos] = useState(o.permisos);
  const [msg, setMsg] = useState('');
  const [enlace, setEnlace] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const soyYo = o.id === yo;

  const guardar = async () => {
    setMsg('Guardando…');
    try { await llamar('/api/usuarios', { method: 'PATCH', body: JSON.stringify({ id: o.id, rol, permisos }) }); setMsg(''); setAbierta(false); onCambio(); }
    catch (e) { setMsg(e.message); }
  };
  const quitar = async () => {
    if (!(await confirmarAccion({ titulo: 'Quitar acceso', texto: `¿Quitar el acceso a ${o.nombre}? Sus facturas y gastos se quedan en la empresa.`, aceptar: 'Quitar', peligro: true }))) return;
    try { await llamar(`/api/usuarios?id=${o.id}`, { method: 'DELETE' }); onCambio(); } catch (e) { setMsg(e.message); }
  };
  const reenviar = async () => {
    setEnviando(true); setMsg('');
    try { setEnlace(await llamar('/api/usuarios', { method: 'POST', body: JSON.stringify({ reenviar: o.id }) })); } catch (e) { setMsg(e.message); }
    setEnviando(false);
  };

  return (
    <li className={abierta ? 'abierta' : ''}>
      <button type="button" className="fila" onClick={() => !soyYo && setAbierta(!abierta)} aria-expanded={abierta} disabled={soyYo} aria-describedby={soyYo ? `persona-${o.id}-propia` : undefined}>
        <Avatar nombre={o.nombre} />
        <span className="txt"><strong>{o.nombre}{soyYo ? ' (tú)' : ''}</strong><small>{o.email}</small></span>
        <span className="imp-col">
          <span className={`pastilla ${o.rol === 'admin' ? 'p-admin' : 'p-perfil'}`}>{o.perfil}</span>
          {!o.activo && <span className="pastilla p-pendiente">Invitado</span>}
        </span>
      </button>
      {soyYo && <p id={`persona-${o.id}-propia`} className="nota">No puedes cambiar tus propios permisos.</p>}
      {!o.activo && !soyYo && soyAdmin && (
        <div className="invit-pendiente">
          <span>Invitación pendiente</span>
          <button type="button" className="boton sec" onClick={reenviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Reenviar invitación'}</button>
        </div>
      )}
      {!o.activo && !abierta && (msg || enlace) && (
        <div className="invit-resultado">
          {msg && <p className="error" role="alert">{msg}</p>}
          {enlace && <Enlace r={enlace} />}
        </div>
      )}
      {abierta && (
        <div className="persona-editar">
          <ElegirPermisos rol={rol} permisos={permisos} cambiar={(r, p) => { setRol(r); setPermisos(r === 'admin' ? [] : limpiarPermisos(p)); }} />
          {msg && <p className={msg === 'Guardando…' ? 'nota' : 'error'}>{msg}</p>}
          <div className="botones-fila">
            <button type="button" className="boton" onClick={guardar}>Guardar permisos</button>
            <button type="button" className="borrar" onClick={quitar}>Quitar acceso</button>
          </div>
          {enlace && <Enlace r={enlace} />}
        </div>
      )}
    </li>
  );
}

export default function Usuarios({ lista, yo, empresa, empresas, miEmpresa, soyAdmin, inicial = null }) {
  const [invitando, envolverInvitar] = useEnvio();
  const [creando, envolverEmpresa] = useEnvio();
  const router = useRouter();
  const [d, setD] = useState(inicial || { nombre: '', email: '', rol: 'miembro', permisos: PERFILES[1].permisos });
  // Si llega con la invitación ya rellenada (Ajustes › Tu gestoría), el formulario a la vista.
  useEffect(() => { if (inicial) document.getElementById('invitar')?.scrollIntoView({ block: 'center' }); }, [Boolean(inicial)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [enlace, setEnlace] = useState(null);
  const [yaTiene, setYaTiene] = useState('');
  const [error, setError] = useState('');
  const [nueva, setNueva] = useState({ empresaNueva: '', nombre: '', email: '' });
  const [enlaceEmpresa, setEnlaceEmpresa] = useState(null);
  const [errorEmpresa, setErrorEmpresa] = useState('');

  const invitar = async (e) => {
    e.preventDefault();
    setError(''); setEnlace(null); setYaTiene('');
    try {
      const r = await llamar('/api/usuarios', { method: 'POST', body: JSON.stringify(d) });
      if (r.pendiente) setYaTiene(`${r.email} ya tenía cuenta en Fisquo: ${r.enviado ? 'le hemos enviado' : 'mándale'} un enlace para que acepte unirse a ${empresa}${r.enviado ? '' : `: ${r.enlace}`}.`);
      else setEnlace(r);
      setD({ ...d, nombre: '', email: '' });
      router.refresh();
    } catch (err) { setError(err.message); }
  };
  const crearEmpresa = async (e) => {
    e.preventDefault();
    setErrorEmpresa(''); setEnlaceEmpresa(null);
    try {
      const r = await llamar('/api/usuarios', { method: 'POST', body: JSON.stringify(nueva) });
      setEnlaceEmpresa(r); setNueva({ empresaNueva: '', nombre: '', email: '' });
      router.refresh();
    } catch (err) { setErrorEmpresa(err.message); }
  };

  return (
    <>
      {lista && (
        <>
          <p className="rotulo">Personas de {String(empresa || '').replace(/\.$/, '')}. Toca a alguien para cambiar lo que puede hacer.</p>
          <ul className="grupo-lista personas">
            {lista.map((o) => <Persona key={o.id} o={o} yo={yo} soyAdmin={soyAdmin} onCambio={() => router.refresh()} />)}
          </ul>

          {soyAdmin && <form id="invitar" className="formulario tarjeta bloque" onSubmit={envolverInvitar(invitar)} style={{ marginTop: 16 }}>
            <h3>Invitar a alguien</h3>
            <label>Nombre<input className="campo" placeholder="Nombre" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required /></label>
            <label>Email<input autoComplete="email" className="campo" type="email" placeholder="Email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} required /></label>
            <p className="rotulo" style={{ margin: '4px 0 0' }}>Qué podrá hacer</p>
            <ElegirPermisos rol={d.rol} permisos={d.permisos} cambiar={(rol, permisos) => setD({ ...d, rol, permisos: rol === 'admin' ? [] : limpiarPermisos(permisos) })} />
            {error && <p className="error" role="alert">{error}</p>}
            <button className="boton" disabled={invitando}>Crear y enviar invitación</button>
            {enlace && <Enlace r={enlace} />}
            {yaTiene && <p className="nota">{yaTiene}</p>}
          </form>}
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
                    if (!(await confirmarAccion({ titulo: 'Borrar empresa', texto: `¿Borrar ${e.nombre} con todos sus usuarios, facturas y gastos? No se puede deshacer.`, aceptar: 'Borrar empresa', peligro: true }))) return;
                    setErrorEmpresa('');
                    try { await llamar(`/api/usuarios?empresa=${e.id}`, { method: 'DELETE' }); router.refresh(); } catch (err) { setErrorEmpresa(err.message); }
                  }}>Borrar</button>
                )}
              </li>
            ))}
          </ul>
          {errorEmpresa && <p className="error" role="alert">{errorEmpresa}</p>}
          <form className="formulario tarjeta" onSubmit={envolverEmpresa(crearEmpresa)} style={{ marginTop: 16 }}>
            <h3>Dar de alta una empresa</h3>
            <label>Nombre de la empresa<input className="campo" placeholder="Nombre de la empresa" value={nueva.empresaNueva} onChange={(e) => setNueva({ ...nueva, empresaNueva: e.target.value })} required /></label>
            <label>Nombre de su administrador<input className="campo" placeholder="Nombre de su administrador" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} required /></label>
            <label>Email del administrador<input autoComplete="email" className="campo" type="email" placeholder="Email del administrador" value={nueva.email} onChange={(e) => setNueva({ ...nueva, email: e.target.value })} required /></label>
            <button className="boton" disabled={creando}>Crear empresa e invitación</button>
            {enlaceEmpresa && <Enlace r={enlaceEmpresa} />}
          </form>
        </section>
      )}
    </>
  );
}
