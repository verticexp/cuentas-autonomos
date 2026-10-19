'use client';

import { useState } from 'react';
import { llamar } from './Acciones';
import CampoPassword from './CampoPassword';
import '@/app/login.css';

// Confirmar con la contraseña que se elimina la cuenta (app/ajustes/eliminar-cuenta).
export default function EliminarCuenta({ email }) {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (!window.confirm(`¿Eliminar la cuenta ${email}? No se puede deshacer.`)) return;
    setEnviando(true);
    setMsg('');
    try {
      await llamar('/api/baja/cuenta', { method: 'POST', body: JSON.stringify({ password }) });
      try { localStorage.clear(); sessionStorage.clear(); } catch {}
      window.location.replace('/login');
    } catch (err) { setMsg(err.message); setEnviando(false); }
  };
  return (
    <form className="formulario tarjeta bloque" onSubmit={enviar}>
      <label htmlFor="eliminar-password">Tu contraseña</label>
      <CampoPassword id="eliminar-password" className="campo" value={password} onChange={(e) => setPassword(e.target.value)} />
      {msg && <p className="error" role="alert">{msg}</p>}
      <button className="borrar ancho" disabled={enviando || !password}>{enviando ? 'Eliminando…' : 'Eliminar mi cuenta'}</button>
    </form>
  );
}
