'use client';

import { useRef, useState } from 'react';

// Un formulario que se envía: mientras la petición va en vuelo, el botón de enviar queda deshabilitado y un segundo envío
// (doble clic, Intro dos veces) no sale. Uso:
//   const [enviando, envolver] = useEnvio();
//   <form onSubmit={envolver(guardar)}> … <button disabled={enviando}>Guardar</button>
// `guardar` puede ser async: el botón se libera al terminar, también si falla. El evento se pasa tal cual (preventDefault
// funciona: la función se llama en el mismo turno).
export default function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const enCurso = useRef(false);
  const envolver = (fn) => async (...args) => {
    if (enCurso.current) { args[0]?.preventDefault?.(); return undefined; }
    enCurso.current = true;
    setEnviando(true);
    try { return await fn(...args); } finally { enCurso.current = false; setEnviando(false); }
  };
  return [enviando, envolver];
}
