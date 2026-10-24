'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';
import { navegar } from '@/lib/transicion';

// Elegir clientes (todos, los que tienen el trimestre por revisar o uno a uno), un mensaje guardado o uno nuevo, y enviar.
export default function EscribirVarios({ clientes, plantillas = [], trimestre }) {
  const router = useRouter();
  const [elegidos, setElegidos] = useState(new Set());
  const [texto, setTexto] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cambiar = (id) => setElegidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todos = elegidos.size === clientes.length;
  const enviar = async (e) => {
    e.preventDefault();
    if (!elegidos.size || !texto.trim()) return;
    if (!(await confirmar({ titulo: `¿Enviar a ${elegidos.size === 1 ? '1 cliente' : `${elegidos.size} clientes`}?`, texto: texto.trim().slice(0, 300), aceptar: 'Enviar' }))) return;
    setOcupado(true); setMsg('');
    try {
      const r = await llamar('/api/despacho/comentarios/varios', { method: 'POST', body: JSON.stringify({ empresas: [...elegidos], texto }) });
      setMsg(`✓ Enviado a ${r.enviados === 1 ? '1 cliente' : `${r.enviados} clientes`}`);
      setTexto(''); setElegidos(new Set());
      setTimeout(() => navegar(router, '/despacho/mensajes', 'atras'), 900);
    } catch (err) { setMsg(err.message); }
    setOcupado(false);
  };
  return <form onSubmit={enviar}>
    <section className="grupo" aria-labelledby="varios-a">
      <h2 className="grupo-t" id="varios-a">A quién ({elegidos.size} de {clientes.length})</h2>
      <div className="desp-chips-plantillas">
        <button type="button" onClick={() => setElegidos(todos ? new Set() : new Set(clientes.map((c) => c.id)))}>{todos ? 'Ninguno' : 'Todos'}</button>
        {clientes.some((c) => c.porRevisar) && <button type="button" onClick={() => setElegidos(new Set(clientes.filter((c) => c.porRevisar).map((c) => c.id)))}>Por revisar del {trimestre}</button>}
      </div>
      <div className="desp-varios-clientes">
        {clientes.map((c) => <label key={c.id}><input type="checkbox" checked={elegidos.has(c.id)} onChange={() => cambiar(c.id)} /><span>{c.nombre}</span><small>{c.estado}</small></label>)}
      </div>
    </section>
    <section className="grupo" aria-labelledby="varios-m">
      <h2 className="grupo-t" id="varios-m">Mensaje</h2>
      {plantillas.length > 0 && <div className="desp-chips-plantillas" role="group" aria-label="Mensajes guardados">
        {plantillas.map((p) => <button key={p.id} type="button" onClick={() => setTexto(p.texto)}>{p.titulo}</button>)}
      </div>}
      <textarea className="campo" rows={6} value={texto} maxLength={2000} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe el mensaje o elige uno guardado" aria-label="Mensaje" />
    </section>
    <button className="boton" disabled={ocupado || !elegidos.size || !texto.trim()}>{ocupado ? 'Enviando…' : `Enviar${elegidos.size ? ` a ${elegidos.size === 1 ? '1 cliente' : `${elegidos.size} clientes`}` : ''}`}</button>
    {msg && <p role="status" className={msg.startsWith('✓') ? 'nota guardado' : 'error'}>{msg}</p>}
  </form>;
}
