'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Borrar, llamar } from './Acciones';

export default function Usuarios({ lista, yo }) {
  const router = useRouter();
  const [d, setD] = useState({ nombre: '', email: '' });
  const [enlace, setEnlace] = useState('');
  const [error, setError] = useState('');

  const invitar = async (e) => {
    e.preventDefault();
    setError(''); setEnlace('');
    try {
      const r = await llamar('/api/usuarios', { method: 'POST', body: JSON.stringify(d) });
      setEnlace(r.enlace); setD({ nombre: '', email: '' });
      router.refresh();
    } catch (err) { setError(err.message); }
  };

  return (
    <>
      <form className="formulario tarjeta" onSubmit={invitar}>
        <h3>Invitar a alguien</h3>
        <input className="campo" placeholder="Nombre" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required />
        <input className="campo" type="email" placeholder="Email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} required />
        {error && <p className="error">{error}</p>}
        <button className="boton">Crear invitación</button>
        {enlace && (
          <div className="enlace">
            <p className="nota">Envíale este enlace (sirve una sola vez):</p>
            <input className="campo" readOnly value={enlace} onFocus={(e) => e.target.select()} />
            <button type="button" className="boton sec" onClick={() => navigator.clipboard.writeText(enlace)}>Copiar enlace</button>
          </div>
        )}
      </form>
      <ul className="grupo-lista">
        {lista.map((u) => (
          <li key={u.id} className="fila">
            <span className="txt">
              <strong>{u.nombre}{u.admin ? ' · admin' : ''}</strong>
              <small>{u.email}{u.activo ? '' : ' · invitación pendiente'}</small>
            </span>
            {u.id !== yo && !u.admin && <Borrar url={`/api/usuarios?id=${u.id}`} pregunta={`¿Borrar a ${u.nombre} y todas sus facturas y gastos?`} />}
          </li>
        ))}
      </ul>
    </>
  );
}
