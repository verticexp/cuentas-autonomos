'use client';

import Link from '@/components/web/EnlacePublico';

import { useEffect, useRef, useState } from 'react';
import Logo from '@/components/Logo';
import { enfocar, irALaApp } from '@/lib/arranque';

// Segundo paso al entrar con contraseña (lib/dosPasos.js): el código de 6 cifras de la app de autenticación o, sin el
// móvil, un código de recuperación. Dentro del inicio de sesión (components/FormEntrar.js, alVolver) o en su propia
// página (/login/dos-pasos, sin JavaScript o desde la pantalla de bloqueo). inicio: '0' si viene de la de bloqueo.
export default function FormCodigo({ alVolver = null, errorInicial = '', inicio = true }) {
  const [error, setError] = useState(errorInicial);
  const [enviando, setEnviando] = useState(false);
  const [recuperacion, setRecuperacion] = useState(false);
  const [aviso, setAviso] = useState('');
  const campo = useRef(null);

  useEffect(() => { enfocar(campo.current); }, [recuperacion]);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true); setError('');
    const r = await fetch('/api/login/dos-pasos', { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(e.currentTarget) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (r?.ok) {
      // Con un código de recuperación: cuántos quedan, un momento antes de entrar.
      if (d.aviso) { setAviso(d.aviso); setTimeout(irALaApp, 2500); } else irALaApp();
      return;
    }
    setEnviando(false);
    if (d?.caducado) {
      if (alVolver) alVolver(d.error);
      else location.replace('/login?error=caducado');
      return;
    }
    setError(d?.error || 'No se ha podido comprobar. Revisa la conexión.');
    campo.current.value = '';
    campo.current.focus();
  }

  return (
    <form method="post" action="/api/login/dos-pasos" onSubmit={enviar}>
      <input type="hidden" name="inicio" value={inicio ? '1' : '0'} />
      <h1><Logo className="logo-login" /></h1>
      <p className="login-titulo">Verificación en dos pasos</p>
      <p className="nota" id="codigo-ayuda">{recuperacion
        ? 'Escribe uno de los códigos de recuperación que guardaste al activarla. Cada uno sirve una sola vez.'
        : 'Abre tu app de autenticación y escribe el código de 6 cifras que ves ahora para Fisquo.'}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="nota" role="status">{aviso}</p>}
      <label htmlFor="codigo">{recuperacion ? 'Código de recuperación' : 'Código'}</label>
      <input ref={campo} key={recuperacion ? 'r' : 'c'} id="codigo" name="codigo" required aria-describedby="codigo-ayuda"
        autoComplete={recuperacion ? 'off' : 'one-time-code'} inputMode={recuperacion ? 'text' : 'numeric'} maxLength={recuperacion ? 9 : 6}
        placeholder={recuperacion ? 'abcd-efgh' : '123456'} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="submit" disabled={enviando || Boolean(aviso)}>{enviando ? 'Comprobando…' : 'Entrar'}</button>
      <p className="nota login-cambiar">
        <button type="button" className="enlace" onClick={() => { setRecuperacion(!recuperacion); setError(''); }}>
          {recuperacion ? 'Usar el código de la app' : '¿No tienes el móvil? Usa un código de recuperación'}
        </button>
      </p>
      <p className="nota login-cambiar">
        {alVolver ? <button type="button" className="enlace" onClick={() => alVolver('')}>Volver a la contraseña</button> : <Link href="/login">Volver a la contraseña</Link>}
      </p>
    </form>
  );
}
