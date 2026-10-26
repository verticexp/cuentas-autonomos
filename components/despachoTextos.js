// Textos de Mi despacho que usan a la vez el servidor y el navegador (sin dependencias de servidor).
export const ESTADOS_TEXTO = {
  curso: 'En curso',
  listo: 'Por revisar',
  revisado: 'Revisado',
  cambios: 'Cambios tras el cierre',
  presentado: 'Presentado',
};

// El registro de accesos (lib/despachos.js registrarAcceso) se escribe para el cliente («Entró en tus cuentas», «Te ha
// pedido un documento»), que lo lee en Ajustes › Tu gestoría. En la ficha del cliente lo lee el despacho.
export const accionParaDespacho = (accion = '') => String(accion)
  .replace(/^Te ha /, 'Le ha ')
  .replace(/\btus cuentas\b/g, 'sus cuentas')
  .replace(/\ben su cuota\b/g, 'en tu cuota');
