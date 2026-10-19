// Solo servidor (usa node:crypto): FormRegistro importa contrasena.js en el navegador.
// Have I Been Pwned por k-anonimato: solo sale el prefijo de 5 caracteres del SHA-1; si la API falla, no bloquea.
import { createHash } from 'node:crypto';
import { validarContrasena } from './contrasena.js';

const ERROR_FILTRADA = 'Esa contraseña aparece en filtraciones de datos conocidas. Elige otra.';

export async function contrasenaFiltrada(pass, { fetch: fetchFn = globalThis.fetch, timeoutMs = 2500 } = {}) {
  try {
    if (typeof fetchFn !== 'function') return false;
    if ((process.env.HIBP === 'off' || process.env.NODE_ENV === 'test') && fetchFn === globalThis.fetch) return false;
    const hash = createHash('sha1').update(String(pass ?? ''), 'utf8').digest('hex').toUpperCase();
    const prefijo = hash.slice(0, 5);
    const sufijo = hash.slice(5);
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, Math.max(0, timeoutMs));
    });
    try {
      const response = await Promise.race([
        fetchFn(`https://api.pwnedpasswords.com/range/${prefijo}`, {
          headers: { 'Add-Padding': 'true' }, signal: controller.signal,
        }),
        timeout,
      ]);
      if (!response?.ok || typeof response.text !== 'function') return false;
      const body = await Promise.race([response.text(), timeout]);
      if (typeof body !== 'string') return false;
      return body.split(/\r?\n/).some((linea) => {
        const [hashSufijo, conteo] = linea.trim().split(':');
        return hashSufijo?.toUpperCase() === sufijo && Number(conteo) > 0;
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export async function validarContrasenaSegura(pass, datos, opciones) {
  const validacion = validarContrasena(pass, datos);
  if (!validacion.ok) return validacion;
  if (await contrasenaFiltrada(pass, opciones)) {
    return { ...validacion, ok: false, error: ERROR_FILTRADA, faltan: [...validacion.faltan, ERROR_FILTRADA] };
  }
  return validacion;
}
