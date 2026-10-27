import QRCode from 'qrcode';
import { redis } from './redis.js';
import { RETO_DOS_PASOS, cambiarUsuario, comprobar, credencialesDe, crearSesion } from './auth.js';
import { auditar } from './auditoria.js';
import { contarVentana } from './limite.js';
import { buscarRecuperacion, claveLegible, codigosRecuperacion, comprobarTotp, huellaRecuperacion, nuevoSecreto, uriOtpauth } from './totp.js';

// Verificación en dos pasos para quien entra con contraseña (Ajustes › Seguridad): además de la contraseña, el código de
// 6 cifras de una app de autenticación (lib/totp.js) o uno de los diez códigos de recuperación. Face ID ya es otra forma
// de entrar (la llave de acceso exige el dispositivo y la cara o la huella), así que no lo pide.
// usuarios[id].dosPasos: { secreto, desde, ultimo (último paso aceptado), recuperacion: [huellas] }.
// dos-pasos-alta:<id>: la clave mientras se activa (15 minutos). reto-dos-pasos:<reto>: «id:huella de la contraseña»
// entre la contraseña y el código (lib/auth.js entrar).
const ALTA = 900;
const CADUCADO = 'Ha pasado demasiado tiempo. Vuelve a escribir tu email y contraseña.';
const MAL = 'El código no es correcto. Escribe el que se ve ahora en la app (cambia cada 30 segundos).';
const MUCHOS = 'Demasiados intentos. Espera 15 minutos.';

export const dosPasosActivo = (u) => Boolean(u?.dosPasos?.secreto);

export async function empezarAlta(u) {
  const secreto = nuevoSecreto();
  await redis.set(`dos-pasos-alta:${u.id}`, secreto, { ex: ALTA });
  const uri = uriOtpauth({ secreto, email: u.email });
  return { clave: claveLegible(secreto), uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

export async function activar(u, codigo) {
  if (Number(await contarVentana(`intentos-dos-pasos-alta:${u.id}`, 900)) > 10) return { error: MUCHOS };
  const secreto = await redis.get(`dos-pasos-alta:${u.id}`);
  if (!secreto) return { error: 'Ha pasado demasiado tiempo: vuelve a empezar.' };
  const paso = comprobarTotp(String(secreto), codigo);
  if (paso === null) return { error: 'El código no coincide. Comprueba que el móvil tiene la hora en automático y escribe el que se ve ahora.' };
  const codigos = codigosRecuperacion();
  const hecho = await cambiarUsuario(u.id, (x) => ({ ...x, dosPasos: { secreto: String(secreto), desde: new Date().toISOString(), ultimo: paso, recuperacion: codigos.map(huellaRecuperacion) } }));
  if (!hecho) return { error: 'No se ha podido activar. Vuelve a intentarlo.' };
  await redis.del(`dos-pasos-alta:${u.id}`, `intentos-dos-pasos-alta:${u.id}`);
  await auditar(u, 'Verificación en dos pasos activada');
  return { ok: true, codigos };
}

// El segundo paso de una persona: un código de la app (cada uno vale una vez) o uno de recuperación (se gasta).
// Hasta 10 intentos cada 15 minutos por persona, se entre desde donde se entre.
export async function comprobarSegundo(id, codigo) {
  const intentos = `intentos-dos-pasos:${id}`;
  if (Number(await contarVentana(intentos, 900)) > 10) return { bloqueado: true };
  let metodo = null, quedan = null;
  const hecho = await cambiarUsuario(id, (x) => {
    const d = x.dosPasos;
    if (!d?.secreto) return null;
    const paso = comprobarTotp(d.secreto, codigo, { ultimo: d.ultimo ?? -1 });
    if (paso !== null) { metodo = 'app'; return { ...x, dosPasos: { ...d, ultimo: paso } }; }
    const i = buscarRecuperacion(d.recuperacion, codigo);
    if (i < 0) return null;
    metodo = 'recuperacion'; quedan = d.recuperacion.length - 1;
    return { ...x, dosPasos: { ...d, recuperacion: d.recuperacion.filter((_, j) => j !== i) } };
  });
  if (!hecho || !metodo) return { ok: false };
  await redis.del(intentos);
  return { ok: true, metodo, quedan };
}

// Del reto (cookie «reto» de /api/login) a la sesión. Cinco códigos mal con el mismo reto: vuelta a la contraseña.
export async function completarReto(reto, codigo) {
  if (typeof reto !== 'string' || !/^[\w-]{20,40}$/.test(reto)) return { caducado: true, error: CADUCADO };
  const k = `reto-dos-pasos:${reto}`;
  const v = await redis.get(k);
  if (!v) return { caducado: true, error: CADUCADO };
  const [id, huella] = String(v).split(':');
  if (Number(await contarVentana(`${k}:fallos`, RETO_DOS_PASOS)) > 5) { await redis.del(k); return { caducado: true, error: CADUCADO }; }
  const r = await comprobarSegundo(id, codigo);
  if (r.bloqueado) return { bloqueado: true, error: MUCHOS };
  if (!r.ok) return { error: MAL };
  await redis.del(k, `${k}:fallos`);
  const u = await redis.hget('usuarios', id);
  if (!u || credencialesDe(u.pass) !== huella) return { caducado: true, error: CADUCADO };
  const token = await crearSesion(id, u.pass);
  return token ? { token, id, metodo: r.metodo, quedan: r.quedan } : { caducado: true, error: CADUCADO };
}

// Quitarla pide la contraseña y un código: con la sesión abierta en un dispositivo ajeno no basta.
export async function desactivar(u, password, codigo) {
  if (!(await comprobar(String(password || ''), u.pass))) return { error: 'La contraseña no es correcta.' };
  const r = await comprobarSegundo(u.id, codigo);
  if (r.bloqueado) return { error: MUCHOS };
  if (!r.ok) return { error: MAL };
  await cambiarUsuario(u.id, ({ dosPasos, ...x }) => x); // eslint-disable-line no-unused-vars
  await auditar(u, 'Verificación en dos pasos desactivada');
  return { ok: true };
}

export async function nuevosCodigos(u, codigo) {
  const r = await comprobarSegundo(u.id, codigo);
  if (r.bloqueado) return { error: MUCHOS };
  if (!r.ok) return { error: MAL };
  const codigos = codigosRecuperacion();
  await cambiarUsuario(u.id, (x) => (x.dosPasos ? { ...x, dosPasos: { ...x.dosPasos, recuperacion: codigos.map(huellaRecuperacion) } } : null));
  await auditar(u, 'Códigos de recuperación nuevos (los anteriores ya no valen)');
  return { ok: true, codigos };
}
