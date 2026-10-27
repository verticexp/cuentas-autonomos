'use client';

import { createContext, useContext, useMemo } from 'react';
import { traductor } from '@/lib/i18n';

// El idioma de la app en el navegador (lib/i18n.js): el layout raíz pasa el idioma y su diccionario, y cada componente
// cliente traduce con const tr = useT() al pintar.
const Contexto = createContext({ idioma: 'es', dic: null });

export function ProveedorIdioma({ idioma, dic, children }) {
  const valor = useMemo(() => ({ idioma, dic }), [idioma, dic]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useIdioma = () => useContext(Contexto).idioma;

export function useT() {
  const { dic } = useContext(Contexto);
  return useMemo(() => traductor(dic), [dic]);
}
