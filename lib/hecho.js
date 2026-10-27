// Lanza la confirmación de «hecho» (components/Hecho.js) desde cualquier componente cliente, sin props.
export function mostrarHecho(texto, { detalle } = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('fisquo-hecho', { detail: { texto, detalle } }));
}
