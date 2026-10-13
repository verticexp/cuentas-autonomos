'use client';

import { useState } from 'react';
import Logo from '@/components/Logo';

const AVISO = 'Si existe una cuenta con ese email, te llegará un enlace';

export default function Recuperar({ token = '' }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setError('');
    const form = new FormData(e.currentTarget);
    if (token && form.get('password') !== form.get('repetir')) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch('/api/recuperar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token ? { token, password: form.get('password') } : { email: form.get('email') }),
      });
      const d = await r.json();
      if (r.ok && d.ok) setHecho(true);
      else setError(d.error || 'No se ha podido completar. Vuelve a intentarlo.');
    } catch {
      setError('No se ha podido conectar. Revisa la conexión y vuelve a intentarlo.');
    } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar}>
      <Logo className="logo-login" />
      <h1 className="login-titulo">{token ? 'Elige una nueva contraseña' : 'Recupera tu contraseña'}</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {hecho ? (
        <p role="status">{token ? 'Contraseña cambiada. Hemos cerrado todas tus sesiones. Vuelve a iniciar sesión con la nueva contraseña.' : `${AVISO}. El enlace caduca en 30 minutos. Revisa también la carpeta de spam.`}</p>
      ) : (
        <>
          {token ? (
            <>
              <p className="nota" id="ayuda-password">Al menos 10 caracteres y distinta de la anterior.</p>
              <label htmlFor="password">Nueva contraseña</label>
              <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} aria-describedby="ayuda-password" required />
              <label htmlFor="repetir">Repite la nueva contraseña</label>
              <input id="repetir" name="repetir" type="password" autoComplete="new-password" minLength={10} required />
            </>
          ) : (
            <>
              <p className="nota" id="ayuda-email">{AVISO}.</p>
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" aria-describedby="ayuda-email" required />
            </>
          )}
          <button type="submit" disabled={enviando}>{enviando ? 'Enviando…' : token ? 'Guardar contraseña' : 'Enviar enlace'}</button>
        </>
      )}
      <p className="nota"><a href="/login">Volver a iniciar sesión</a></p>
    </form>
  );
}
