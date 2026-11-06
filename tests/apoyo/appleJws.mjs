import { readFileSync } from 'node:fs';
import { X509Certificate, sign } from 'node:crypto';

const leerPem = (nombre) => readFileSync(new URL(`./apple-pruebas/${nombre}.pem`, import.meta.url), 'utf8');
const certificadoDer = (nombre) => new X509Certificate(leerPem(nombre)).raw.toString('base64');

export const RAIZ_PRUEBAS = leerPem('raiz');

// Solo firma datos ficticios con las claves falsas de prueba incluidas en el repositorio.
export function firmarComoApple(payload, { hoja = 'hoja', intermedio = 'intermedio', raiz = 'raiz', alg = 'ES256', x5c } = {}) {
  const cabecera = { alg, x5c: x5c === undefined ? [hoja, intermedio, raiz].map(certificadoDer) : x5c };
  const codificar = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
  const cuerpo = `${codificar(cabecera)}.${codificar(payload)}`;
  const firma = sign('sha256', Buffer.from(cuerpo), { key: leerPem(`${hoja}-clave`), dsaEncoding: 'ieee-p1363' });
  return `${cuerpo}.${firma.toString('base64url')}`;
}
