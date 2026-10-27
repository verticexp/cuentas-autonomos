'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import { useState } from 'react';
import { llamar } from './Acciones';
import CampoPassword from './CampoPassword';
import { useT } from '@/components/Idioma';
import '@/app/login.css';

// Confirmar con la contraseña que se elimina la cuenta (app/ajustes/eliminar-cuenta).
export default function EliminarCuenta({ email }) {
  const tr = useT();
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (!(await confirmarAccion({ titulo: tr('Eliminar mi cuenta'), texto: tr('¿Eliminar la cuenta {email}? No se puede deshacer.', { email }), aceptar: tr('Eliminar cuenta'), peligro: true }))) return;
    setEnviando(true);
    setMsg('');
    try {
      await llamar('/api/baja/cuenta', { method: 'POST', body: JSON.stringify({ password }) });
      try { localStorage.clear(); sessionStorage.clear(); } catch {}
      window.location.replace('/login');
    } catch (err) { setMsg(err.message); setEnviando(false); }
  };
  return (
    <form className="formulario tarjeta bloque" onSubmit={enviar} onInvalid={() => setMsg('Escribe tu contraseña para eliminar tu cuenta.')}>
      <label htmlFor="eliminar-password">{tr('Tu contraseña')}</label>
      <CampoPassword id="eliminar-password" className="campo" value={password} onChange={(e) => setPassword(e.target.value)} />
      {msg && <p className="error" role="alert">{tr(msg)}</p>}
      <button type="submit" className="borrar ancho" disabled={enviando}>{enviando ? tr('Eliminando…') : tr('Eliminar mi cuenta')}</button>
    </form>
  );
}
