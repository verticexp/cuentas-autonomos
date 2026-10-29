import { redis } from './redis.js';
import { esOrdenador } from './biometria.js';

// La sesión (cookie «t» → sesion:<token>) dura 30 días. Sin dependencias de Next, para usarla también en proxy.js.
export const DURACION = 60 * 60 * 24 * 30;
export const opcionesCookie = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: DURACION };

// En el ordenador la sesión se queda abierta mientras se use: los 30 días cuentan desde la última vez, no desde que se
// entró. Como mucho una vez al día por navegador (cookie «sr»), así no gasta peticiones a Upstash. Si la sesión ya no
// existe (salió, cambió la contraseña), expire no hace nada y usuarioActual la sigue rechazando.
export const RENOVADA = 'sr';
export const toca = ({ ua, token, renovada }) => Boolean(token && !renovada && esOrdenador(ua));
export async function renovarSesion(token) {
  if (!redis) return false;
  await redis.multi().expire(`sesion:${token}`, DURACION).expire(`sesion-credenciales:${token}`, DURACION).exec();
  return true;
}
