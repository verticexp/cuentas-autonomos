import { desbloqueo, opcionesCookie, opcionesDesbloqueo } from './auth.js';

// Las cookies de una entrada con contraseña (/api/login) o con el segundo paso (/api/login/dos-pasos): la sesión, el
// desbloqueo y, para la gente de un despacho que entra desde la pantalla de inicio de sesión, su propia empresa (desde la
// de bloqueo se sigue donde se estaba). recien: acaba de entrar, sin pantalla de bloqueo.
export async function ponerEntrada(res, token, cuenta, { inicio = true, recien = false } = {}) {
  if (inicio && cuenta?.despacho) res.cookies.set('e', String(cuenta.empresa || cuenta.id), opcionesCookie);
  res.cookies.set('t', token, opcionesCookie);
  res.cookies.set('d', await desbloqueo(token), opcionesDesbloqueo);
  if (recien) res.cookies.set('recien', '1', { path: '/', maxAge: 60, sameSite: 'lax' });
  return res;
}
