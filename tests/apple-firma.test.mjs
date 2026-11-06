import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { X509Certificate, sign } from 'node:crypto';
import { RAIZ_APPLE_G3, HUELLA_RAIZ_APPLE_G3, verificarJwsApple, decodificarJws } from '../lib/appleFirma.js';
import { firmarComoApple, RAIZ_PRUEBAS } from './apoyo/appleJws.mjs';

const fecha2030 = Date.UTC(2030, 0, 1);
const payload = { transactionId: 'prueba-123', bundleId: 'com.fisquo.pruebas', signedDate: fecha2030 };
const opciones = { raices: [RAIZ_PRUEBAS], ahora: new Date(fecha2030) };
const leerPem = (nombre) => readFileSync(new URL(`./apoyo/apple-pruebas/${nombre}.pem`, import.meta.url), 'utf8');
const cabeceraDe = (jws) => JSON.parse(Buffer.from(jws.split('.')[0], 'base64url'));
const sustituirParte = (jws, posicion, parte) => jws.split('.').map((valor, indice) => indice === posicion ? parte : valor).join('.');

function comprobarFallo(jws, motivo, ajustes = opciones) {
  const resultado = verificarJwsApple(jws, ajustes);
  assert.equal(resultado.ok, false);
  assert.equal(typeof resultado.error, 'string');
  assert.match(resultado.error, motivo);
  assert.deepEqual(Object.keys(resultado).sort(), ['error', 'ok']);
}

// Permite comprobar JSON mal formado con una firma correcta, sin ejecutar herramientas externas.
function firmarTextoPayload(texto) {
  const parte0 = firmarComoApple(payload).split('.')[0];
  const cuerpo = `${parte0}.${Buffer.from(texto).toString('base64url')}`;
  const firma = sign('sha256', Buffer.from(cuerpo), { key: leerPem('hoja-clave'), dsaEncoding: 'ieee-p1363' });
  return `${cuerpo}.${firma.toString('base64url')}`;
}

test('un JWS válido devuelve el payload y la cabecera verificados', () => {
  const jws = firmarComoApple(payload);
  assert.deepEqual(verificarJwsApple(jws, opciones), { ok: true, payload, cabecera: cabeceraDe(jws) });
});

test('alterar un carácter del payload conserva JSON legible pero invalida la firma', () => {
  const jws = firmarComoApple(payload);
  const parte = jws.split('.')[1];
  const posicion = parte.indexOf('c');
  assert.ok(posicion >= 0);
  const alterada = `${parte.slice(0, posicion)}b${parte.slice(posicion + 1)}`;
  assert.doesNotThrow(() => JSON.parse(Buffer.from(alterada, 'base64url')));
  comprobarFallo(sustituirParte(jws, 1, alterada), /Firma inválida/);
});

test('una firma alterada o con longitud distinta de 64 bytes se rechaza', () => {
  const jws = firmarComoApple(payload);
  const firma = Buffer.from(jws.split('.')[2], 'base64url');
  firma[0] ^= 1;
  comprobarFallo(sustituirParte(jws, 2, firma.toString('base64url')), /Firma inválida/);
  for (const longitud of [63, 65]) comprobarFallo(sustituirParte(jws, 2, Buffer.alloc(longitud).toString('base64url')), /Firma inválida/);
});

test('solo se acepta ES256 y una cadena x5c de exactamente tres elementos', () => {
  comprobarFallo(firmarComoApple(payload, { alg: 'ES384' }), /Algoritmo/);
  const { x5c } = cabeceraDe(firmarComoApple(payload));
  for (const cadena of [null, [], x5c.slice(0, 2), [...x5c, x5c[2]], 'cadena']) {
    comprobarFallo(firmarComoApple(payload, { x5c: cadena }), /x5c/);
  }
});

test('x5c rechaza valores que no sean strings, base64 estándar inválido y DER inválido', () => {
  const { x5c } = cabeceraDe(firmarComoApple(payload));
  for (const certificado of [null, 123, {}, '', '???', 'YWJj', `${x5c[0]}\n`, `_${x5c[0].slice(1)}`]) {
    comprobarFallo(firmarComoApple(payload, { x5c: [certificado, ...x5c.slice(1)] }), /Certificado x5c inválido/);
  }
});

test('la raíz de prueba no recibe confianza por defecto', () => {
  assert.deepEqual(verificarJwsApple(firmarComoApple(payload)), { ok: false, error: 'Raíz no de confianza' });
});

test('una lista de raíces admite varias autoridades y falla sin una coincidencia', () => {
  const jws = firmarComoApple(payload);
  assert.equal(verificarJwsApple(jws, { ...opciones, raices: ['PEM inválido', RAIZ_APPLE_G3, RAIZ_PRUEBAS] }).ok, true);
  comprobarFallo(jws, /Raíz no de confianza/, { ...opciones, raices: [] });
  comprobarFallo(jws, /Raíz no de confianza/, { ...opciones, raices: [leerPem('otra-raiz')] });
});

test('un intermedio de otra cadena se rechaza aunque contenga el OID de Apple', () => {
  comprobarFallo(firmarComoApple(payload, { intermedio: 'otro-intermedio' }), /Cadena de certificados/);
});

test('se verifica también la firma de la hoja contra el intermedio', () => {
  const jws = firmarComoApple(payload, { intermedio: 'otro-intermedio', raiz: 'otra-raiz' });
  comprobarFallo(jws, /Cadena de certificados/, { ...opciones, raices: [leerPem('otra-raiz')] });
});

test('la hoja debe contener su OID de Apple', () => {
  comprobarFallo(firmarComoApple(payload, { hoja: 'hoja-sin-oid' }), /OID de Apple en la hoja/);
});

test('el intermedio debe contener su OID de Apple aunque firme correctamente la hoja', () => {
  comprobarFallo(firmarComoApple(payload, { intermedio: 'intermedio-sin-oid' }), /OID de Apple en el intermedio/);
});

test('signedDate fuera de la vigencia de los certificados se rechaza', () => {
  for (const signedDate of [Date.UTC(2046, 0, 1), Date.UTC(2024, 11, 31, 23, 59, 59)]) {
    comprobarFallo(firmarComoApple({ ...payload, signedDate }), /fuera de vigencia/);
  }
});

test('signedDate en 2030 prevalece sobre ahora en 2050', () => {
  assert.equal(verificarJwsApple(firmarComoApple(payload), { ...opciones, ahora: new Date('2050-01-01T00:00:00Z') }).ok, true);
});

test('los extremos de vigencia son inclusivos', () => {
  for (const signedDate of [Date.UTC(2025, 0, 1), Date.UTC(2045, 0, 1)]) {
    assert.equal(verificarJwsApple(firmarComoApple({ ...payload, signedDate }), opciones).ok, true);
  }
});

test('sin signedDate numérico válido se usa ahora', () => {
  for (const signedDate of [undefined, null, '2030', true, {}, 1e300]) {
    const jws = firmarComoApple({ ...payload, signedDate });
    assert.equal(verificarJwsApple(jws, opciones).ok, true);
    comprobarFallo(jws, /fuera de vigencia/, { ...opciones, ahora: new Date('2050-01-01T00:00:00Z') });
  }
  comprobarFallo(firmarComoApple({}), /Fecha de verificación inválida/, { ...opciones, ahora: new Date(NaN) });
});

test('el payload debe ser JSON y un objeto, incluso con firma válida', () => {
  for (const texto of ['{', 'null', '[]', '123', 'true', '"texto"']) {
    comprobarFallo(firmarTextoPayload(texto), /Payload inválido/);
  }
});

test('las entradas basura nunca lanzan y devuelven un error corto', () => {
  const jws = firmarComoApple(payload);
  const cabeceraNoJson = sustituirParte(jws, 0, Buffer.from('no es JSON').toString('base64url'));
  for (const basura of ['', null, 'a.b', 'a.b.c', 123, {}, [], cabeceraNoJson, `${jws}.extra`, `${jws}=`, jws.replace('.', '+.')]) {
    assert.doesNotThrow(() => comprobarFallo(basura, /./));
  }
  for (const texto of ['null', '[]', '123']) {
    comprobarFallo(sustituirParte(jws, 0, Buffer.from(texto).toString('base64url')), /Cabecera inválida/);
  }
  assert.doesNotThrow(() => comprobarFallo(jws, /./, null));
});

test('la raíz real de Apple conserva la huella SHA-256 y el CN esperados', () => {
  const raiz = new X509Certificate(RAIZ_APPLE_G3);
  assert.equal(raiz.fingerprint256, HUELLA_RAIZ_APPLE_G3);
  assert.match(raiz.subject, /(?:^|\n)CN=Apple Root CA - G3(?:\n|$)/);
});

test('los certificados ficticios tienen las fechas y curvas previstas', () => {
  for (const nombre of ['raiz', 'intermedio', 'intermedio-sin-oid', 'hoja', 'hoja-sin-oid', 'otra-raiz', 'otro-intermedio']) {
    const certificado = new X509Certificate(leerPem(nombre));
    assert.equal(Date.parse(certificado.validFrom), Date.UTC(2025, 0, 1), nombre);
    assert.equal(Date.parse(certificado.validTo), Date.UTC(2045, 0, 1), nombre);
    assert.equal(certificado.publicKey.asymmetricKeyDetails.namedCurve, nombre.startsWith('hoja') ? 'prime256v1' : 'secp384r1', nombre);
  }
  const raiz = new X509Certificate(RAIZ_PRUEBAS);
  assert.equal(raiz.subject, 'CN=Fisquo Pruebas Raiz');
  assert.equal(raiz.verify(raiz.publicKey), true);
});

test('decodificarJws extrae el objeto sin comprobar su firma y devuelve null con basura', () => {
  const jws = firmarComoApple(payload);
  assert.deepEqual(decodificarJws(jws), payload);
  assert.deepEqual(decodificarJws(sustituirParte(jws, 2, Buffer.alloc(64).toString('base64url'))), payload);
  for (const basura of ['', null, 123, 'a.b', 'a.b.c', `${jws}.extra`, firmarTextoPayload('null'), firmarTextoPayload('[]'), firmarTextoPayload('{')]) {
    assert.equal(decodificarJws(basura), null);
  }
});
