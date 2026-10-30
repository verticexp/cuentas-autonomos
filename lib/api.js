import { redis } from './redis.js';
import { bloqueoDe, bloquearPorEmail, desbloqueada, usuarioActual } from './auth.js';
import { puede } from './permisos.js';
import { escrituraLibre, SOLO_LECTURA, SOLO_LECTURA_APP, soloLectura, funcionDeRuta } from './planes.js';
import { esApp, mensajePlan } from './app.js';
import { usarFuncion } from './usoPlan.js';
import { NO_PERMITIDO, permitidoDocumentos, soloDocumentos } from './perfilDocumentos.js';
import { headers } from 'next/headers';

export const error = (msg, status = 400) => Response.json({ error: msg }, { status });
export async function cuerpo(req) {
  try {
    const b = await req.json();
    return b && typeof b === 'object' && !Array.isArray(b) && [Object.prototype, null].includes(Object.getPrototypeOf(b)) ? b : {};
  } catch { return {}; }
}

// Devuelve el usuario o una respuesta de error lista para devolver.
// admin: solo el administrador de la app (crea empresas). permiso: el que hace falta dentro de la empresa (o una lista: todos).
export async function usuarioApi({ admin = false, permiso, funcion, escritura = false, cuentaPersonal = false, revocacion = false } = {}) {
  if (!redis) return { res: error('Base de datos no conectada', 503) };
  const u = await usuarioActual();
  if (!u || (admin && !u.admin)) return { res: error('No autorizado', 401) };
  if (bloquearPorEmail(u)) return { res: error('Confirma tu email para seguir: te hemos enviado un enlace.', 403) };
  // Bloqueo de pantalla (auditoría F07): la API exige lo mismo que las páginas. Sin desbloqueo, 423 (la app lo pide
  // otra vez); desbloquear va por /api/login y /api/passkey, que no pasan por aquí.
  let ua = '';
  try { ua = (await headers()).get('user-agent') || ''; } catch { /* fuera de una petición (tests) */ }
  const modo = bloqueoDe(u, ua);
  if (modo !== 'off' && !(await desbloqueada())) {
    if (modo === 'activo') return { res: Response.json({ error: 'La app está bloqueada: desbloquéala para seguir.', bloqueada: true }, { status: 423 }) };
    console.warn(`[bloqueo] API sin desbloqueo: ${u.id}`);
  }
  // Cliente «solo documentos» (lib/perfilDocumentos.js): fuera de sus rutas, nada, aunque la ruta no pida permiso.
  if (soloDocumentos(u)) {
    let h = null;
    try { h = await headers(); } catch { /* fuera de una petición (tests) */ }
    if (!permitidoDocumentos(h?.get('x-ruta'))) return { res: error(NO_PERMITIDO, 403) };
  }
  if (permiso && !puede(u, permiso)) return { res: error('No tienes permiso para esto. Pídeselo al administrador de tu empresa.', 403) };
  // Prueba acabada sin pagar (lib/planes.js): solo lectura. x-metodo y x-ruta los pone siempre proxy.js.
  if (soloLectura(u.plan)) {
    let h = null;
    try { h = await headers(); } catch { /* fuera de una petición (tests) */ }
    const metodo = h?.get('x-metodo') || 'GET';
    const ruta = (h?.get('x-ruta') || '').split('?')[0];
    const personal = cuentaPersonal && ruta === '/api/cuenta' && metodo === 'PATCH';
    // Revocar una conexión sigue disponible aunque el plan esté en solo lectura.
    const revocar = revocacion && ruta === '/api/ajustes/api' && metodo === 'DELETE';
    if ((escritura || !['GET', 'HEAD'].includes(metodo)) && !personal && !revocar && !escrituraLibre(ruta)) {
      return { res: Response.json({ error: esApp(h?.get('user-agent')) ? SOLO_LECTURA_APP : SOLO_LECTURA, soloLectura: true }, { status: 402 }) };
    }
  }
  let cabeceras = null;
  try { cabeceras = await headers(); } catch { /* fuera de una petición */ }
  const modulo = funcion || funcionDeRuta(cabeceras?.get('x-ruta'), cabeceras?.get('x-metodo') || 'GET');
  if (modulo) {
    const no = await usarFuncion(u, modulo);
    if (no) return { res: error(mensajePlan(no, cabeceras?.get('user-agent')), 403) };
  }
  return { u };
}
