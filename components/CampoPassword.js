'use client';

import { forwardRef, useState } from 'react';

// Contraseña con botón para verla: en el móvil es lo que más errores al teclear evita. El botón no se enfoca con el
// tabulador (del campo se pasa a «Entrar»), pero sí se anuncia y se pulsa.
const CampoPassword = forwardRef(function CampoPassword({ id, autoComplete = 'current-password', ...resto }, ref) {
  const [ver, setVer] = useState(false);
  return (
    <div className="campo-pass">
      <input ref={ref} id={id} name="password" type={ver ? 'text' : 'password'} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} required {...resto} />
      <button type="button" className="ver-pass" tabIndex={-1} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={ver} onClick={() => setVer(!ver)}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
          {ver && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  );
});

export default CampoPassword;
