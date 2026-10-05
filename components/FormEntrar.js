'use client';

import { useEffect, useRef, useState } from 'react';
import EntrarLlave from '@/components/EntrarLlave';
import Logo from '@/components/Logo';
import { enfocar, irALaApp, useTrasArranque } from '@/lib/arranque';

// Formulario de la pantalla de entrar. No se pinta hasta que se va la animación de inicio (así el navegador no ofrece
// contraseñas encima) y entra sin recargar el login: si falla, el error sale aquí mismo y lo escrito se queda.
export default function FormEntrar({ errorInicial = '' }) {
  const listo = useTrasArranque();
  const [error, setError] = useState(errorInicial);
  const [enviando, setEnviando] = useState(false);
  const email = useRef(null);
  const pass = useRef(null);

  useEffect(() => { if (listo) enfocar(email.current); }, [listo]);

  async function entrar(e) {
    e.preventDefault();
    setEnviando(true); setError('');
    const r = await fetch('/api/login', { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(e.currentTarget) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (r?.ok) { irALaApp(); return; }
    setEnviando(false);
    setError(d?.error || 'No se ha podido comprobar. Revisa la conexión.');
    pass.current.value = '';
    pass.current.focus();
  }

  if (!listo) return null;
  return (
    <form method="post" action="/api/login" onSubmit={entrar}>
      <h1><Logo className="logo-login" /></h1>
      <p className="login-titulo">Inicia sesión</p>
      {error && <p className="error" role="alert">{error}</p>}
      <label htmlFor="email">Email</label>
      <input ref={email} id="email" name="email" type="email" autoComplete="username webauthn" required />
      <label htmlFor="password">Contraseña</label>
      <input ref={pass} id="password" name="password" type="password" autoComplete="current-password" required />
      <button type="submit" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      <EntrarLlave auto alEntrar={irALaApp} />
      <p className="nota">¿No tienes cuenta? Pide una invitación al administrador.</p>
    </form>
  );
}
