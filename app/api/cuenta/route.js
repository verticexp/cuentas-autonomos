import { cookies } from 'next/headers';
import { actualizarUsuario, cambiarPassword, opcionesCookie } from '@/lib/auth';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { colorValido, logoValido } from '@/lib/marca';

const CAMPOS = ['nombre', 'nif', 'direccion', 'ciudad', 'iban'];

export async function PATCH(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const b = await cuerpo(req);
  if (b.presentado) {
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
    const color = b.marca.color ? colorValido(b.marca.color) : null;
    const logo = b.marca.logo ? logoValido(b.marca.logo) : null;
    if (b.marca.color && !color) return error('Color no válido');
    if (b.marca.logo && !logo) return error('El logo debe ser una imagen PNG o JPG de menos de 300 KB');
    await actualizarUsuario(u, { marca: { color, logo } });
    return Response.json({ ok: true });
  }
  if (b.drive) {
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
  const emisor = Object.fromEntries(CAMPOS.map((k) => [k, String(b[k] || '').trim().slice(0, 120)]));
  emisor.plazo = Math.max(0, Math.min(365, Number(b.plazo) || 30));
  emisor.limite = Math.max(0, Number(b.limite) || 0);
  await actualizarUsuario(u, { emisor });
  return Response.json({ ok: true });
}
