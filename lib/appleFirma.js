import { X509Certificate, verify } from 'node:crypto';

export const RAIZ_APPLE_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

export const HUELLA_RAIZ_APPLE_G3 = '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';

// DER: 06 (OID), 0A (10 bytes). 1.2 → 2A; 840 → 86 48; 113635 → 86 F7 63;
// 100.6.11.1 → 64 06 0B 01 y 100.6.2.1 → 64 06 02 01.
const OID_HOJA = Buffer.from('060a2a864886f76364060b01', 'hex');
const OID_INTERMEDIO = Buffer.from('060a2a864886f76364060201', 'hex');

function partesJws(jws) {
  if (typeof jws !== 'string') return null;
  const partes = jws.split('.');
  if (partes.length !== 3 || partes.some((parte) => !/^[A-Za-z0-9_-]+$/.test(parte)
    || Buffer.from(parte, 'base64url').toString('base64url') !== parte)) return null;
  return partes;
}

function objetoJson(parte) {
  const objeto = JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));
  return objeto && typeof objeto === 'object' && !Array.isArray(objeto) ? objeto : null;
}

// Verificación local: comprueba confianza, cadena, OID, firma y vigencia; no consulta revocaciones.
export function verificarJwsApple(jws, opciones = {}) {
  let error = 'JWS inválido';
  try {
    const partes = partesJws(jws);
    if (!partes) return { ok: false, error };

    error = 'Cabecera inválida';
    const cabecera = objetoJson(partes[0]);
    if (!cabecera) return { ok: false, error };
    if (cabecera.alg !== 'ES256') return { ok: false, error: 'Algoritmo no permitido' };
    if (!Array.isArray(cabecera.x5c) || cabecera.x5c.length !== 3) return { ok: false, error: 'Cadena x5c inválida' };

    error = 'Certificado x5c inválido';
    const certificados = cabecera.x5c.map((certificado) => {
      if (typeof certificado !== 'string' || !certificado
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(certificado)) throw new Error(error);
      const der = Buffer.from(certificado, 'base64');
      if (der.toString('base64') !== certificado) throw new Error(error);
      return new X509Certificate(der);
    });
    const [hoja, intermedio, raizRecibida] = certificados;

    error = 'Raíz no de confianza';
    const { raices = [RAIZ_APPLE_G3], ahora = new Date() } = opciones;
    if (!Array.isArray(raices)) return { ok: false, error };
    let raiz;
    for (const pem of raices) {
      try {
        const candidata = new X509Certificate(pem);
        if (candidata.fingerprint256 === raizRecibida.fingerprint256) {
          raiz = candidata;
          break;
        }
      } catch { /* Una raíz mal configurada no concede confianza. */ }
    }
    if (!raiz) return { ok: false, error };

    error = 'Cadena de certificados inválida';
    if (!intermedio.verify(raiz.publicKey) || !intermedio.checkIssued(raiz)
      || !hoja.verify(intermedio.publicKey) || !hoja.checkIssued(intermedio)) return { ok: false, error };

    if (!hoja.raw.includes(OID_HOJA)) return { ok: false, error: 'Falta el OID de Apple en la hoja' };
    if (!intermedio.raw.includes(OID_INTERMEDIO)) return { ok: false, error: 'Falta el OID de Apple en el intermedio' };

    error = 'Firma inválida';
    const firma = Buffer.from(partes[2], 'base64url');
    if (firma.length !== 64 || !verify('sha256', Buffer.from(`${partes[0]}.${partes[1]}`),
      { key: hoja.publicKey, dsaEncoding: 'ieee-p1363' }, firma)) return { ok: false, error };

    error = 'Payload inválido';
    const payload = objetoJson(partes[1]);
    if (!payload) return { ok: false, error };

    error = 'Fecha de verificación inválida';
    const fechaFirmada = typeof payload.signedDate === 'number' ? new Date(payload.signedDate).getTime() : NaN;
    const fecha = Number.isFinite(fechaFirmada) ? fechaFirmada : ahora.getTime();
    if (!Number.isFinite(fecha)) return { ok: false, error };
    if ([hoja, intermedio, raiz].some((certificado) => {
      const desde = Date.parse(certificado.validFrom), hasta = Date.parse(certificado.validTo);
      return !Number.isFinite(desde) || !Number.isFinite(hasta) || fecha < desde || fecha > hasta;
    })) return { ok: false, error: 'Certificado fuera de vigencia' };

    return { ok: true, payload, cabecera };
  } catch { return { ok: false, error }; }
}

// SIN verificar: solo para registros y depuración. Nunca usar su resultado para decidir nada.
export function decodificarJws(jws) {
  try {
    const partes = partesJws(jws);
    return partes ? objetoJson(partes[1]) : null;
  } catch { return null; }
}
