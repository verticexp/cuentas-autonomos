'use client';

import { useEffect, useState } from 'react';

// Safari y WKWebView reducen el viewport visual al mostrar el teclado.
// El foco por sí solo no basta: también puede haber un teclado físico.
// Cualquier campo de cualquier pantalla (la ficha de un cliente, un buscador, el selector de un desplegable): en una app de
// iOS el teclado tapa la barra de pestañas; en la web, la barra fija se subía encima del teclado.
export const CAMPO_CON_TECLADO = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="color"]), textarea, select, [contenteditable="true"]';
export function observarTecladoFormulario(ventana, documento, actualizar) {
  const vista = ventana.visualViewport;
  if (!vista) return () => {};
  let alto = ventana.innerHeight;
  let ancho = ventana.innerWidth;
  const medir = () => {
    const campo = documento.activeElement;
    const editando = campo?.matches?.(CAMPO_CON_TECLADO);
    if (ancho !== ventana.innerWidth) { ancho = ventana.innerWidth; alto = ventana.innerHeight; }
    if (!editando && vista.scale === 1) alto = ventana.innerHeight;
    // Capacitor puede reducir también innerHeight al abrir el teclado.
    actualizar(Boolean(editando && vista.scale === 1 && Math.max(alto, ventana.innerHeight) - vista.height > 150));
  };
  vista.addEventListener('resize', medir);
  documento.addEventListener('focusin', medir);
  documento.addEventListener('focusout', medir);
  medir();
  return () => {
    vista.removeEventListener('resize', medir);
    documento.removeEventListener('focusin', medir);
    documento.removeEventListener('focusout', medir);
    actualizar(false);
  };
}

// Con { marcar: true } también pone data-teclado en <html> mientras el teclado está fuera, para que cualquier pantalla baje
// sus barras fijas abajo (el total y «Crear» de la factura nueva, «Facturar» de los albaranes) en lugar de subirlas encima
// del teclado (movil.css). Lo marcan TabBar y NavDespacho, que están en todas las pantallas.
export default function useTecladoFormulario(activo, { marcar = false } = {}) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!activo) { setAbierto(false); return; }
    return observarTecladoFormulario(window, document, setAbierto);
  }, [activo]);
  const fuera = activo && abierto;
  useEffect(() => {
    if (!marcar) return;
    document.documentElement.toggleAttribute('data-teclado', fuera);
    return () => document.documentElement.removeAttribute('data-teclado');
  }, [marcar, fuera]);
  return fuera;
}
