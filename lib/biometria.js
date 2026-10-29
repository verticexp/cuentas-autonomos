// Cómo llamar a la llave de acceso en cada dispositivo: «llave de acceso» no lo entiende casi nadie, «Face ID» sí.
// Solo depende del user agent, así se puede probar sin navegador (tests/biometria.test.mjs).
export function nombreBiometria(ua = '') {
  if (/iPhone/.test(ua)) return 'Face ID';
  if (/iPad|Macintosh/.test(ua)) return 'Touch ID';
  if (/Android/.test(ua)) return 'huella';
  if (/Windows/.test(ua)) return 'Windows Hello';
  return 'llave de acceso';
}

// Ordenador: Mac, Windows, Linux o ChromeOS, y ni móvil, ni tablet, ni la app de iOS (su user agent lleva «iPhone»). Ahí
// no hay Face ID ni pantalla de bloqueo: la sesión se queda abierta, como en cualquier web. Un user agent desconocido
// (o ninguno) no cuenta como ordenador: sigue con el bloqueo, si la persona lo tiene. Safari del iPad se presenta como
// Mac: en el navegador se distingue con enOrdenador (pantalla táctil); el servidor, que solo ve el user agent, lo trata
// como un ordenador.
export const esOrdenador = (ua = '') => /Macintosh|Windows NT|X11|CrOS/.test(ua || '') && !/iPhone|iPad|iPod|Android|Mobile|FisquoApp\//.test(ua || '');
export const enOrdenador = () => esOrdenador(navigator.userAgent) && !(navigator.maxTouchPoints > 1);
