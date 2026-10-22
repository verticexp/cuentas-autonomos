import { createHash, randomBytes } from 'crypto';
import { redis } from './redis.js';
import { borrarLlaves, cambiarUsuario, cifrar, comprobar, limpiarEmail, cerrarSesiones } from './auth.js';
import { emailListo } from './email.js';
import { enviarCorreo } from './correos.js';
import { contrasenaCambiada } from './avisosCorreo.js';
import { pasado, MUCHOS } from './limite.js';
import { auditar } from './auditoria.js';
import { validarContrasenaSegura } from './contrasenaFiltrada.js';

const DURACION = 30 * 60;
const CADUCADO = 'El enlace ha caducado o ya se ha usado';
const hash = (s) => createHash('sha256').update(s).digest('hex');
const soltar = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

// El mismo cerrojo para emitir y usar: dos peticiones no pueden usar el enlace a la vez,
// ni una petición de otro enlace puede invalidarlo a mitad del cambio de contraseña.
async function conCerrojo(id, hacer) {
  const k = `recuperar-cerrojo:${id}`;
  const dueño = randomBytes(16).toString('hex');
  // Hasta 4 s de espera: cifrar la contraseña nueva lleva su tiempo y la segunda petición debe ver el resultado de la primera.
  for (let i = 0; i < 80; i++) {
    if (await redis.set(k, dueño, { nx: true, ex: 60 })) {
      try { return await hacer(); }
      finally { await redis.eval(soltar, [k], [dueño]); }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Recuperación ocupada');
}

// La ruta ejecuta todo esto con after(): ni la consulta ni el proveedor de email
// influyen en el tiempo de respuesta público. Los límites también dan { ok: true }.
export async function solicitarRecuperacion({ email, ip, origen }) {
  try {
    if (!redis) return { ok: true };
    const e = limpiarEmail(typeof email === 'string' ? email : '');
    const [porIp, porEmail] = await Promise.all([
      pasado('recuperar-ip', ip || 'desconocida', 20, 3600),
      pasado('recuperar-email', hash(e), 5, 3600),
    ]);
    if (porIp || porEmail || !e) return { ok: true };
    const id = await redis.hget('emails', e);
    if (!id) return { ok: true };
    const envio = await conCerrojo(id, async () => {
      const u = await redis.hget('usuarios', id);
      if (!u) return null;
      const token = randomBytes(32).toString('hex');
      const sha = hash(token);
      const anterior = await redis.get(`recuperar-usuario:${id}`);
      const tx = redis.multi();
      if (anterior) tx.del(`recuperar:${anterior}`);
      tx.set(`recuperar:${sha}`, id, { ex: DURACION });
      tx.set(`recuperar-usuario:${id}`, sha, { ex: DURACION });
      await tx.exec();
      return { para: u.email, token };
    });
    if (envio) {
      if (!emailListo()) console.warn('[recuperar] El envío de emails no está configurado.');
      else {
        const enlace = new URL('/recuperar', origen);
        enlace.searchParams.set('t', envio.token);
        const r = await enviarCorreo('recuperar-contrasena', { para: envio.para, datos: { url: enlace.href } });
        if (r.error) console.warn('[recuperar] No se ha podido enviar el email.');
      }
    }
  } catch {
    // No registrar el error del proveedor: podría contener el enlace o datos personales.
    console.warn('[recuperar] No se ha podido preparar o enviar el enlace.');
  }
  return { ok: true };
}

export async function recuperarPassword(token, password, ip) {
  if (await pasado('recuperar-cambio-ip', ip || 'desconocida', 20, 3600)) return { error: MUCHOS, bloqueado: true };
  if (!redis || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return { error: CADUCADO };
  const sha = hash(token);
  const k = `recuperar:${sha}`;
  const id = await redis.get(k);
  if (!id) return { error: CADUCADO };
  return conCerrojo(id, async () => {
    if ((await redis.get(k)) !== id || (await redis.get(`recuperar-usuario:${id}`)) !== sha) return { error: CADUCADO };
    const u = await redis.hget('usuarios', id);
    if (!u) return { error: CADUCADO };
    const segura = await validarContrasenaSegura(password, { email: u.email, nombre: u.nombre });
    if (!segura.ok) return { error: segura.error };
    if (await comprobar(password, u.pass)) return { error: 'La nueva contraseña debe ser distinta de la anterior' };
    const pass = await cifrar(password);
    if (!(await cambiarUsuario(id, (x) => ({ ...x, pass })))) return { error: CADUCADO };
    await cerrarSesiones(id);
    await borrarLlaves(id);
    await redis.del(k, `recuperar-usuario:${id}`);
    await auditar(u, 'Contraseña recuperada');
    await contrasenaCambiada(u);
    return { ok: true };
  });
}
