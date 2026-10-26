'use client';

import { useState } from 'react';

// Cambio rápido de empresa. Al cambiar se vuelve a cargar todo con la nueva empresa.
// variante: «lista» (Ajustes), «lateral» (barra del ordenador) o «chip» (resumen, solo si hay varias).
// Otra empresa se da de alta como cualquier cliente: /registro?nueva=1, con su plan y su prueba, sin repetir la cuenta.
// Las empresas gratis (Fundador) solo las da de alta el administrador de Fisquo desde /admin.
export default function CambiarEmpresa({ empresas = [], actual, variante = 'lista' }) {
  const [abierto, setAbierto] = useState(variante === 'lista');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const pedir = async (cuerpo, destino) => {
    setOcupado(true); setMsg('');
    try {
      const r = await fetch('/api/empresas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido cambiar de empresa. Revisa la conexión e inténtalo otra vez.');
      try { sessionStorage.removeItem('fisquo-arranque'); } catch {}
      window.location.replace(destino);
    } catch (e) { setMsg(e.message); setOcupado(false); }
  };
  const cambiar = (id) => (id === actual ? setAbierto(variante === 'lista') : pedir({ id }, '/'));
  const nombreActual = empresas.find((x) => x.id === actual)?.nombre || 'Mi empresa';

  const lista = (
    <div className={`emp-lista${ocupado ? ' ocupado' : ''}`} role="group" aria-label="Empresas">
      {empresas.map((x) => (
        <button key={x.id} type="button" aria-current={x.id === actual ? 'true' : undefined} className={`emp-opcion${x.id === actual ? ' activa' : ''}`} onClick={() => cambiar(x.id)}>
          <span className="emp-inicial" aria-hidden>{x.nombre.trim()[0]?.toUpperCase() || '·'}</span>
          <span className="emp-nombre">{x.nombre}</span>
          {x.id === actual && <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12l5 5 9-10" /></svg>}
        </button>
      ))}
      <a className="emp-opcion emp-anadir solo-web" href="/registro?nueva=1">
        <span className="emp-inicial" aria-hidden>+</span><span className="emp-nombre">Añadir empresa</span>
      </a>
      {msg && <p className="rojo emp-msg" role="alert">{msg}</p>}
    </div>
  );

  if (variante === 'lista') return lista;
  return (
    <div className={`emp emp-${variante}${abierto ? ' abierto' : ''}`}>
      <button type="button" className="emp-actual" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <span className="emp-nombre">{nombreActual}</span>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M7 10l5 5 5-5" /></svg>
      </button>
      {abierto && lista}
    </div>
  );
}
