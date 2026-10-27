import { cuerpo, error, usuarioApi } from '@/lib/api';
import { activar, desactivar, dosPasosActivo, empezarAlta, nuevosCodigos } from '@/lib/dosPasos';

// Ajustes › Seguridad › Verificación en dos pasos (components/DosPasos.js): empezar (QR y clave), activar con el primer
// código, desactivar (contraseña y código) y códigos de recuperación nuevos. Es de cada persona, no de la empresa.
export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (!u.pass) return error('La verificación en dos pasos es para entrar con contraseña: tu cuenta no tiene.');
  const b = await cuerpo(req);
  const codigo = String(b.codigo || '').trim().slice(0, 12);
  if (b.accion === 'empezar') {
    if (dosPasosActivo(u)) return error('Ya la tienes activada.');
    return Response.json(await empezarAlta(u));
  }
  const r = b.accion === 'activar' ? await activar(u, codigo)
    : b.accion === 'desactivar' ? await desactivar(u, b.password, codigo)
    : b.accion === 'codigos' ? await nuevosCodigos(u, codigo)
    : { error: 'Acción no válida' };
  return r.error ? error(r.error) : Response.json(r);
}
