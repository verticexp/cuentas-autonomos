'use client';

import Link from '@/components/web/EnlacePublico';

import { useEffect, useRef, useState } from 'react';
import BotonesSociales from '@/components/BotonesSociales';
import EntrarLlave from '@/components/EntrarLlave';
import Logo from '@/components/Logo';
import CampoPassword from '@/components/CampoPassword';
import { enfocar, irALaApp, useTrasArranque } from '@/lib/arranque';

// El formulario público ya se ve en el HTML inicial. Si falla, el error aparece aquí y el email se conserva.
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

  return (
    <form method="post" action="/api/login" onSubmit={entrar}>
      <h1><Logo className="logo-login" /></h1>
      <p className="login-titulo">Inicia sesión</p>
      <BotonesSociales />
      <p className="separador"><span>o con tu email</span></p>
      {error && <p className="error" role="alert">{error}</p>}
      <label htmlFor="email">Email</label>
      <input ref={email} id="email" name="email" type="email" autoComplete="username webauthn" required />
      <div className="login-etiqueta">
        <label htmlFor="password">Contraseña</label>
        <Link href="/recuperar">¿Has olvidado la contraseña?</Link>
      </div>
      <CampoPassword ref={pass} id="password" />
      <button type="submit" disabled={enviando}>{enviando ? 'Entrando…' : 'Iniciar sesión'}</button>
      <EntrarLlave auto alEntrar={irALaApp} />
      <p className="nota login-cambiar solo-web">¿No tienes cuenta? <Link href="/registro">Crea una gratis</Link></p>
    </form>
  );
}
