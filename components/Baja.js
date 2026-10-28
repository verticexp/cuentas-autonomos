'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import { useState } from 'react';
import { llamar } from './Acciones';
import { useT } from '@/components/Idioma';

// Confirmar la baja de la empresa con la contraseña (app/ajustes/baja).
export default function Baja({ empresa }) {
  const tr = useT();
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (!(await confirmarAccion({ titulo: tr('Dar de baja la empresa'), texto: tr('¿Dar de baja {empresa}? No se puede deshacer.', { empresa }), aceptar: tr('Dar de baja'), peligro: true }))) return;
    setEnviando(true);
    setMsg('');
    try {
      await llamar('/api/baja', { method: 'POST', body: JSON.stringify({ password }) });
      window.location.replace('/');
    } catch (err) { setMsg(err.message); setEnviando(false); }
  };
  return (
    <form className="formulario tarjeta bloque" onSubmit={enviar} onInvalid={() => setMsg('Escribe tu contraseña para dar de baja la empresa.')}>
      <label>{tr('Tu contraseña')}<input className="campo" type="password" placeholder={tr('Tu contraseña')} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      {msg && <p className="error" role="alert">{tr(msg)}</p>}
      <button type="submit" className="borrar ancho" disabled={enviando}>{enviando ? tr('Dando de baja…') : tr('Dar de baja la empresa')}</button>
    </form>
  );
}
