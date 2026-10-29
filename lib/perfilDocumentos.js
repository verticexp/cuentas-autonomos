// La puerta del perfil «solo documentos» (lib/documentos.js), sin dependencias: la usan lib/api.js usuarioApi, lib/auth.js
// requerir, lib/permisos.js inicioDe y el layout raíz. Quien entra con ese perfil solo puede usar /documentos, aunque
// escriba otra dirección: el resto de la app le responde 403 (API) o le devuelve a /documentos (pantallas).
export const esSoloDocumentos = (e) => Boolean(e?.documentos?.despacho);
// La persona del cliente, no la gestoría que lo mira desde su panel (contextoCliente lleva viaDespacho).
export const soloDocumentos = (u) => esSoloDocumentos(u) && !u?.viaDespacho;

// Pantallas: /documentos (las de entrar, salir e invitación son públicas). API: sus documentos (también las peticiones de
// su gestoría) y lo básico de su cuenta: contraseña y nombre, idioma, dos pasos, llaves de acceso y avisos.
export const PANTALLAS_DOCUMENTOS = /^\/documentos(\/|$)/;
export const API_DOCUMENTOS = /^\/api\/(documentos(\/[a-z-]+)?|cuenta|idioma|logout|dos-pasos(\/[a-z-]+)?|passkey(\/[a-z-]+)?|push|dispositivo|bloqueo)$/;
export const permitidoDocumentos = (ruta) => {
  const r = String(ruta || '').split('?')[0];
  return PANTALLAS_DOCUMENTOS.test(r) || API_DOCUMENTOS.test(r);
};
export const NO_PERMITIDO = 'Tu acceso a Fisquo es solo para enviar documentos a tu gestoría.';
