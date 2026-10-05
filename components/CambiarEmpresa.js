'use client';

import { useState } from 'react';

// Cambio rápido de empresa (y alta de otra en la misma cuenta). Al cambiar se vuelve a cargar todo con la nueva empresa.
// variante: «lista» (Ajustes), «lateral» (barra del ordenador) o «chip» (resumen, solo si hay varias).
export default function CambiarEmpresa({ empresas = [], actual, variante = 'lista' }) {
  const [abierto, setAbierto] = useState(variante === 'lista');
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const pedir = async (cuerpo, destino) => {
    setOcupado(true); setMsg('');
    try {
      const r = await fetch('/api/empresas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo cambiar de empresa');
      try { sessionStorage.removeItem('netto-arranque'); } catch {}
      window.location.assign(destino);
    } catch (e) { setMsg(e.message); setOcupado(false); }
  };
  const cambiar = (id) => (id === actual ? setAbierto(variante === 'lista') : pedir({ id }, '/'));
  const crear = (e) => { e.preventDefault(); if (nombre.trim()) pedir({ nueva: nombre }, '/bienvenida'); };
  const nombreActual = empresas.find((x) => x.id === actual)?.nombre || 'Mi empresa';

  const lista = (
    <div className={`emp-lista${ocupado ? ' ocupado' : ''}`} role="listbox" aria-label="Empresas">
      {empresas.map((x) => (
        <button key={x.id} type="button" role="option" aria-selected={x.id === actual} className={`emp-opcion${x.id === actual ? ' activa' : ''}`} onClick={() => cambiar(x.id)}>
          <span className="emp-inicial" aria-hidden>{x.nombre.trim()[0]?.toUpperCase() || '·'}</span>
          <span className="emp-nombre">{x.nombre}</span>
          {x.id === actual && <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12l5 5 9-10" /></svg>}
        </button>
      ))}
      {creando ? (
        <form className="emp-nueva" onSubmit={crear}>
          <input className="campo" autoFocus placeholder="Nombre de la empresa" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre de la nueva empresa" />
          <button className="boton pequeno" disabled={!nombre.trim() || ocupado}>Crear</button>
        </form>
      ) : (
        <button type="button" className="emp-opcion emp-anadir" onClick={() => setCreando(true)}>
          <span className="emp-inicial" aria-hidden>+</span><span className="emp-nombre">Añadir empresa</span>
        </button>
      )}
      {msg && <p className="rojo emp-msg">{msg}</p>}
    </div>
  );

  if (variante === 'lista') return lista;
  return (
    <div className={`emp emp-${variante}${abierto ? ' abierto' : ''}`}>
      <button type="button" className="emp-actual" aria-expanded={abierto} onClick={() => { setAbierto(!abierto); setCreando(false); }}>
        <span className="emp-nombre">{nombreActual}</span>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M7 10l5 5 5-5" /></svg>
      </button>
      {abierto && lista}
    </div>
  );
}
