// Cómo llamar a la llave de acceso en cada dispositivo: «llave de acceso» no lo entiende casi nadie, «Face ID» sí.
// Solo depende del user agent, así se puede probar sin navegador (tests/biometria.test.mjs).
export function nombreBiometria(ua = '') {
  if (/iPhone/.test(ua)) return 'Face ID';
  if (/iPad|Macintosh/.test(ua)) return 'Touch ID';
  if (/Android/.test(ua)) return 'huella';
  if (/Windows/.test(ua)) return 'Windows Hello';
  return 'llave de acceso';
}
