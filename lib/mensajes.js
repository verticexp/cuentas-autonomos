// Errores que viajan en la dirección (?error=…) tras enviar un formulario. Solo se enseñan los que la app escribe:
// así nadie puede mandar un enlace a Netto con un texto suyo («llama a este número…») como si fuera de la app.
const CONOCIDOS = new Set([
  'Faltan el nombre o el email',
  'Ese email ya tiene cuenta',
  'La contraseña debe tener al menos 8 caracteres',
  'Esta invitación ya no es válida',
  'Esta invitación ha caducado. Pide otra al administrador.',
  'El pago con tarjeta no está disponible: paga por transferencia.',
  'Esta factura no tiene nada que pagar.',
  'No se pudo abrir el pago. Inténtalo de nuevo o paga por transferencia.',
]);

export const mensajeSeguro = (m) => (!m ? '' : CONOCIDOS.has(String(m)) ? String(m) : 'Algo ha fallado. Vuelve a intentarlo.');
