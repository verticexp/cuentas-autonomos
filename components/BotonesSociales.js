'use client';

import { useState } from 'react';

// «Continuar con Google / Apple» en entrar y en crear cuenta. Aún sin conectar: avisan de que llegará pronto.
// En la app de iOS no salen (solo-web): Apple rechaza botones que no funcionan y su botón exige el «Iniciar sesión con Apple» real.
export default function BotonesSociales() {
  const [aviso, setAviso] = useState('');
  return (
    <div className="login-sociales solo-web">
      <button type="button" className="boton-social" onClick={() => setAviso('Entrar con Google llegará pronto.')}>
        <svg viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" /></svg>
        Continuar con Google
      </button>
      <button type="button" className="boton-social" onClick={() => setAviso('Entrar con Apple llegará pronto.')}>
        <svg viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.6 1.3-.1 1.7-.8 3.3-.8 1.5 0 1.9.8 3.3.8 1.4 0 2.2-1.2 3-2.5 1-1.4 1.4-2.7 1.4-2.8 0 0-2.6-1-2.4-4.2zM13.9 4.9c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" /></svg>
        Continuar con Apple
      </button>
      {aviso && <p className="nota login-aviso" role="status">{aviso}</p>}
    </div>
  );
}
