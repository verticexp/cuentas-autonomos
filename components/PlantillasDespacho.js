'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';
import useEnvio from './useEnvio';

// Editar los mensajes guardados del despacho (app/despacho/ajustes/plantillas): cada uno con su nombre y su texto.
export default function PlantillasDespacho({ plantillas }) {
  const [enviando, envolver] = useEnvio();
  const router = useRouter();
  const [editando, setEditando] = useState(null); // { id?, titulo, texto }
  const [msg, setMsg] = useState('');
  const guardar = async (e) => {
    e.preventDefault(); setMsg('');
    try { await llamar('/api/despacho/plantillas', { method: 'POST', body: JSON.stringify(editando) }); setEditando(null); setMsg('✓ Guardado'); router.refresh(); } catch (err) { setMsg(err.message); }
  };
  const borrar = async (p) => {
    if (!(await confirmar({ titulo: `¿Borrar «${p.titulo}»?`, aceptar: 'Borrar', peligro: true }))) return;
    try { await llamar(`/api/despacho/plantillas?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' }); router.refresh(); } catch (err) { setMsg(err.message); }
  };
  const formulario = <form className="formulario tarjeta" onSubmit={envolver(guardar)}>
    <label>Nombre<input className="campo" value={editando?.titulo || ''} maxLength={60} placeholder="Por ejemplo: Subir los tickets" onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} required /></label>
    <label>Mensaje<textarea className="campo" rows={5} value={editando?.texto || ''} maxLength={2000} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} required /></label>
    <div className="desp-acciones"><button className="boton" disabled={enviando}>Guardar</button><button type="button" className="boton sec" onClick={() => setEditando(null)}>Cancelar</button></div>
  </form>;
  return <>
    <ul className="grupo-lista desp-plantillas">
      {plantillas.map((p) => <li key={p.id} className="fila">
        {editando?.id === p.id ? formulario : <>
          <span className="txt"><strong>{p.titulo}</strong><small>{p.texto}</small></span>
          <span className="desp-acciones">
            <button type="button" className="boton sec desp-mini" onClick={() => setEditando({ id: p.id, titulo: p.titulo, texto: p.texto })}>Cambiar</button>
            <button type="button" className="boton sec desp-mini" onClick={() => borrar(p)}>Borrar</button>
          </span>
        </>}
      </li>)}
    </ul>
    {editando && !editando.id ? formulario : <button type="button" className="boton" onClick={() => setEditando({ titulo: '', texto: '' })}>Nuevo mensaje guardado</button>}
    {msg && <p role="status" className={msg.startsWith('✓') ? 'nota guardado' : 'error'}>{msg}</p>}
  </>;
}
