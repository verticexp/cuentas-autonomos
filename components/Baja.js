'use client';

import { useState } from 'react';
import { llamar } from './Acciones';

// Confirmar la baja de la empresa con la contraseña (app/ajustes/baja).
export default function Baja({ empresa }) {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (!window.confirm(`¿Dar de baja ${empresa}? No se puede deshacer.`)) return;
    setEnviando(true);
    setMsg('');
    try {
      await llamar('/api/baja', { method: 'POST', body: JSON.stringify({ password }) });
      window.location.href = '/';
    } catch (err) { setMsg(err.message); setEnviando(false); }
  };
  return (
    <form className="formulario tarjeta bloque" onSubmit={enviar}>
      <input className="campo" type="password" placeholder="Tu contraseña" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {msg && <p className="error">{msg}</p>}
      <button className="borrar ancho" disabled={enviando || !password}>{enviando ? 'Dando de baja…' : 'Dar de baja la empresa'}</button>
    </form>
  );
}
