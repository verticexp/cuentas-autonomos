'use client';

import { createContext, useContext, useMemo } from 'react';
import { traductor } from '@/lib/i18n';

// El idioma de la app en el navegador (lib/i18n.js): el layout raíz pasa el idioma y su diccionario, y cada componente
// cliente traduce con const tr = useT() al pintar.
const Contexto = createContext({ idioma: 'es', dic: null });

// Lo que se pinta fuera del árbol de React de la página (el diálogo de components/Confirmar.js tiene su propia raíz) no ve el
// contexto: lee el último idioma con traductorActual(). Solo en el navegador; en el servidor cada petición tiene el suyo.
let actual = { idioma: 'es', dic: null };
export const traductorActual = () => traductor(actual.dic, actual.idioma);

export function ProveedorIdioma({ idioma, dic, children }) {
  if (typeof window !== 'undefined') actual = { idioma, dic };
  const valor = useMemo(() => ({ idioma, dic }), [idioma, dic]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useIdioma = () => useContext(Contexto).idioma;

export function useT() {
  const { idioma, dic } = useContext(Contexto);
  return useMemo(() => traductor(dic, idioma), [dic, idioma]);
}
