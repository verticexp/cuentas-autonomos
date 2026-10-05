import { NextResponse } from 'next/server';
import { nuevaEmpresa, opcionesCookie } from '@/lib/auth';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { enEmpresa } from '@/lib/membresias';

export const dynamic = 'force-dynamic';

// Cambiar de empresa (la elegida se recuerda en este dispositivo) o crear otra en la misma cuenta.
export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const b = await cuerpo(req);
  let id = String(b.id || '');
  if (b.nueva !== undefined) {
    const r = await nuevaEmpresa(u.id, b.nueva);
    if (r.error) return error(r.error);
    id = r.id;
  } else if (!enEmpresa(u, id)) return error('No tienes acceso a esa empresa', 403);
  const r = NextResponse.json({ ok: true, id });
  r.cookies.set('e', id, opcionesCookie);
  return r;
}
