'use client';

import { useState } from 'react';
import { llamar } from './Acciones';
import { confirmar } from './Confirmar';

// Panel /admin: quitar la verificación en dos pasos de una cuenta (app/api/admin/dos-pasos), para quien ha perdido el
// móvil y los códigos de recuperación.
export default function AdminDosPasos() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const quitar = async (e) => {
    e.preventDefault();
    if (!(await confirmar({ titulo: `¿Quitar la verificación en dos pasos de ${email}?`, texto: 'Hazlo solo si has comprobado por otra vía que quien lo pide es el titular de la cuenta. Podrá entrar solo con la contraseña.', aceptar: 'Quitar', peligro: true }))) return;
    setMsg('Quitando…');
    try { await llamar('/api/admin/dos-pasos', { method: 'POST', body: JSON.stringify({ email }) }); setMsg(`✓ Quitada. ${email} ya puede entrar con su contraseña.`); setEmail(''); } catch (err) { setMsg(err.message); }
  };
  return (
    <form className="formulario" onSubmit={quitar}>
      <label>Email de la cuenta<input className="campo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label>
      <button className="boton sec" disabled={!email}>Quitar la verificación en dos pasos</button>
      {msg && <p className="nota" role="status">{msg}</p>}
    </form>
  );
}
