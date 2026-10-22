'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { confirmar } from './Confirmar';
import { crearSinGuardar } from '@/lib/sinGuardar';
import { alNavegar, anterior, apilados, direccionEn, instalarHistorial, posicion, volverA } from '@/lib/transicion';

// «¿Salir sin guardar?» en toda la app (lib/sinGuardar.js): un solo gestor por página, que instala GestoAtras (en el layout) o
// el primer formulario que lo usa. Recargar o cerrar la pestaña con cambios lo avisa el navegador (beforeunload).
const PREGUNTA = { titulo: '¿Salir sin guardar?', texto: 'Tienes cambios sin guardar. Si sales ahora, se perderán.', aceptar: 'Salir sin guardar', cancelar: 'Seguir editando' };
let gestor = null, router = null;
const visible = (el) => el.getClientRects().length > 0;
const avisarAlSalir = (e) => { e.preventDefault(); e.returnValue = ''; };

export function instalarSinGuardar(r) {
  if (r) router = r;
  if (gestor || typeof window === 'undefined') return gestor;
  instalarHistorial();
  gestor = crearSinGuardar({
    history, apilados, direccionEn,
    aqui: () => `${location.pathname}${location.search}`,
    posicion: () => (Number.isInteger(history.state?.__idx) ? history.state.__idx : posicion()),
    preguntar: (textos) => confirmar({ ...PREGUNTA, ...textos, peligro: true }),
    // Como el gesto (components/GestoAtras.js): a la pantalla anterior o, si se abrió esta directamente, a la de su «‹ Atrás».
    salir: () => {
      const enlace = [...document.querySelectorAll('a.volver')].find(visible)?.getAttribute('href');
      if (anterior() || enlace) volverA(router, enlace || '/', 'atras');
      else history.back();
    },
    bloqueada: () => !document.documentElement.dataset.abierta && Boolean(document.querySelector('.pantalla-bloqueo')),
    alCambiar: (sucio) => { if (sucio) addEventListener('beforeunload', avisarAlSalir); else removeEventListener('beforeunload', avisarAlSalir); },
  });
  addEventListener('popstate', gestor.alVolver);
  // Toques y teclas de verdad (los que cuentan como activación para el navegador): Escape y el ratón al soltar, no.
  const tocar = (e) => {
    if (!e.isTrusted || (e.type === 'keydown' && e.key === 'Escape') || (e.type === 'pointerup' && e.pointerType === 'mouse')) return;
    gestor.tocar();
  };
  for (const tipo of ['keydown', 'mousedown', 'pointerup', 'touchend']) addEventListener(tipo, tocar, true);
  alNavegar(gestor.antesDeNavegar);
  return gestor;
}

export const hayCambiosSinGuardar = () => Boolean(gestor?.sucio());
export const hayAvisoEncima = () => Boolean(gestor?.encima());

// «‹ Atrás», «Cancelar»…: con cambios sin guardar, pregunta antes de hacer accion (textos: los de la pregunta, si no es salir).
export function salirSinGuardar(accion, textos) {
  if (!gestor) { accion(); return Promise.resolve(true); }
  return gestor.salirSinGuardar(accion, textos);
}

// Ya confirmado de otra forma (borrar, descartar): quita el aviso sin preguntar.
export const soltarCambios = () => gestor?.soltarCambios() ?? Promise.resolve();

// valor: lo que se perdería al salir (se compara con el del principio). Devuelve:
// - guardado(): lo de ahora queda como guardado (la ficha que sigue en pantalla vuelve a avisar con los cambios siguientes).
// - soltar(): deja de avisar hasta que el formulario vuelva a estar como al principio (guardado y vaciado, o descartado).
// Las dos quitan la entrada de aviso del historial: esperarlas antes de navegar o refrescar tras guardar.
export default function useCambiosSinGuardar(valor) {
  const r = useRouter();
  const clave = JSON.stringify(valor ?? null);
  const base = useRef(clave);
  const actual = useRef(clave);
  actual.current = clave;
  const fuente = useRef(null);
  const sucio = clave !== base.current;
  useEffect(() => {
    const f = instalarSinGuardar(r).registrar();
    fuente.current = f;
    return () => { f.quitar(); fuente.current = null; };
  }, [r]);
  useEffect(() => { fuente.current?.poner(sucio); }, [sucio]);
  return {
    sucio,
    guardado() {
      base.current = actual.current;
      fuente.current?.poner(false);
      return gestor?.soltar() ?? Promise.resolve();
    },
    soltar() {
      fuente.current?.suspender();
      return gestor?.soltar() ?? Promise.resolve();
    },
  };
}
