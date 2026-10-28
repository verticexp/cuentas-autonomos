// Lanza la confirmación de «hecho» (components/Hecho.js) desde cualquier componente cliente, sin props.
// trasNavegar: quien llama va a cambiar de pantalla justo después (crear una factura abre su ficha): la confirmación
// espera a que la pantalla nueva esté pintada, para que se vea entera y fluida.
export function mostrarHecho(texto, { detalle, trasNavegar = false } = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('fisquo-hecho', { detail: { texto, detalle, trasNavegar } }));
}
