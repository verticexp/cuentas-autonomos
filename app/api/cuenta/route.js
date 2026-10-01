import { cookies } from 'next/headers';
import { actualizarUsuario, cambiarPassword, opcionesCookie } from '@/lib/auth';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { puede } from '@/lib/permisos';
import { colorValido, logoValido } from '@/lib/marca';
import { actividadesDe, limpiarActividades, limpiarFiscal } from '@/lib/empresa';
import { leer, redis } from '@/lib/redis';

const CAMPOS = ['nombre', 'nif', 'direccion', 'ciudad', 'iban'];

export async function PATCH(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const b = await cuerpo(req);
  const sin = (p) => !puede(u, p) && error('No tienes permiso para esto. Pídeselo al administrador de tu empresa.', 403);
  if (b.presentado) {
    if (sin('resumen')) return sin('resumen');
    const { anio, t, importe } = b.presentado;
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100 || ![1, 2, 3, 4].includes(t)) return error('Trimestre no válido');
    const pagos = { ...(u.pagos130 || {}) };
    pagos[anio] = { ...(pagos[anio] || {}) };
    if (importe === null) delete pagos[anio][t];
    else pagos[anio][t] = Math.max(0, Number(importe) || 0);
    await actualizarUsuario(u, { pagos130: pagos });
    return Response.json({ ok: true });
  }
  if (b.marca) {
    if (sin('empresa')) return sin('empresa');
    const color = b.marca.color ? colorValido(b.marca.color) : null;
    const logo = b.marca.logo ? logoValido(b.marca.logo) : null;
    if (b.marca.color && !color) return error('Color no válido');
    if (b.marca.logo && !logo) return error('El logo debe ser una imagen PNG o JPG de menos de 300 KB');
    await actualizarUsuario(u, { marca: { color, logo } });
    return Response.json({ ok: true });
  }
  // Cuestionario: situación fiscal, actividades y datos de facturación.
  if (b.configuracion) {
    if (sin('empresa')) return sin('empresa');
    const c = b.configuracion;
    const facturas = (await leer(u, 'facturas')) || [];
    const conFacturas = new Set(facturas.map((f) => f.actividad));
    const antes = Array.isArray(u.actividades) && u.actividades.length ? u.actividades : (u.pendiente ? [] : actividadesDe(u));
    const a = limpiarActividades(c.actividades, antes, conFacturas);
    if (a.error) return error(a.error);
    const e = c.emisor || {};
    if (!String(e.nombre || '').trim()) return error('Falta el nombre o la razón social');
    const emisor = { ...(u.emisor || {}), ...Object.fromEntries(CAMPOS.map((k) => [k, String(e[k] || '').trim().slice(0, 120)])) };
    emisor.plazo = Math.max(0, Math.min(365, Number(e.plazo ?? emisor.plazo) || 30));
    await actualizarUsuario(u, { fiscal: limpiarFiscal(c.fiscal), actividades: a.actividades, emisor, pendiente: false });
    const emp = await redis.hget('empresas', u.empresa);
    if (emp && emisor.nombre) await redis.hset('empresas', { [u.empresa]: { ...emp, nombre: emisor.nombre } });
    return Response.json({ ok: true, actividades: a.actividades });
  }
  if (b.drive) {
    if (sin('empresa')) return sin('empresa');
    const url = String(b.drive.url || '').trim();
    if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) return error('La URL debe ser la de la aplicación web de Apps Script (acaba en /exec)');
    await actualizarUsuario(u, { drive: url ? { url, token: String(b.drive.token || '').trim().slice(0, 100) } : null });
    return Response.json({ ok: true });
  }
  if (b.nueva !== undefined) {
    const r = await cambiarPassword(u, b.actual, b.nueva);
    if (r.error) return error(r.error);
    (await cookies()).set('t', r.token, opcionesCookie);
    return Response.json({ ok: true });
  }
  if (sin('empresa')) return sin('empresa');
  const emisor = Object.fromEntries(CAMPOS.map((k) => [k, String(b[k] || '').trim().slice(0, 120)]));
  emisor.plazo = Math.max(0, Math.min(365, Number(b.plazo) || 30));
  emisor.limite = Math.max(0, Number(b.limite) || 0);
  await actualizarUsuario(u, { emisor });
  return Response.json({ ok: true });
}
