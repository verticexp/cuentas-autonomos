'use client';

import Link from '@/components/web/EnlacePublico';

import { useEffect, useRef, useState } from 'react';
import BotonesSociales from '@/components/BotonesSociales';
import EntrarLlave from '@/components/EntrarLlave';
import Logo from '@/components/Logo';
import CampoPassword from '@/components/CampoPassword';
import FormCodigo from '@/components/FormCodigo';
import { enfocar, irALaApp, useTrasArranque } from '@/lib/arranque';
import { useT } from '@/components/Idioma';

// El formulario público ya se ve en el HTML inicial. Si falla, el error aparece aquí y el email se conserva.
export default function FormEntrar({ errorInicial = '', listos = {} }) {
  const tr = useT();
  const listo = useTrasArranque();
  const [error, setError] = useState(errorInicial);
  const [enviando, setEnviando] = useState(false);
  // Con la verificación en dos pasos, tras la contraseña se pide el código (components/FormCodigo.js).
  const [codigo, setCodigo] = useState(false);
  const email = useRef(null);
  const pass = useRef(null);

  useEffect(() => { if (listo) enfocar(email.current); }, [listo]);

  async function entrar(e) {
    e.preventDefault();
    setEnviando(true); setError('');
    const r = await fetch('/api/login', { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(e.currentTarget) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (r?.ok && d?.segundoPaso) { setEnviando(false); setCodigo(true); return; }
    if (r?.ok) { irALaApp(); return; }
    setEnviando(false);
    setError(d?.error || 'No se ha podido comprobar. Revisa la conexión.');
    pass.current.value = '';
    pass.current.focus();
  }

  if (codigo) return <FormCodigo alVolver={(msg) => { setCodigo(false); setError(msg); }} />;
  return (
    <form method="post" action="/api/login" onSubmit={entrar}>
      <input type="hidden" name="inicio" value="1" />
      <h1><Logo className="logo-login" /></h1>
      <p className="login-titulo">{tr('Inicia sesión')}</p>
      <BotonesSociales listos={listos} alError={setError} />
      {(listos.google || listos.apple) && <p className="separador"><span>{tr('o con tu email')}</span></p>}
      {error && <p className="error" role="alert">{tr(error)}</p>}
      <label htmlFor="email">{tr('Email')}</label>
      <input ref={email} id="email" name="email" type="email" autoComplete="username webauthn" required />
      <div className="login-etiqueta">
        <label htmlFor="password">{tr('Contraseña')}</label>
        <Link href="/recuperar">{tr('¿Has olvidado la contraseña?')}</Link>
      </div>
      <CampoPassword ref={pass} id="password" />
      <button type="submit" disabled={enviando}>{enviando ? tr('Entrando…') : tr('Iniciar sesión')}</button>
      <EntrarLlave auto alEntrar={irALaApp} />
      <p className="nota login-cambiar solo-web">{tr('¿No tienes cuenta?')} <Link href="/registro">{tr('Crea una gratis')}</Link></p>
    </form>
  );
}
