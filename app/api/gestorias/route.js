import { NextResponse } from 'next/server';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { crearGestoria, desactivarGestoria, listarGestorias } from '@/lib/gestorias';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (!u.admin) return error('Solo el administrador de Fisquo puede gestionar gestorías', 403);
  return NextResponse.json(await listarGestorias());
}

export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (!u.admin) return error('Solo el administrador de Fisquo puede gestionar gestorías', 403);
  const b = await cuerpo(req);
  if (!b || typeof b !== 'object' || Array.isArray(b)) return error('Faltan datos de la gestoría.');
  const r = b.desactivar !== undefined ? await desactivarGestoria(b.desactivar) : await crearGestoria(b);
  if (r.error) return error(r.error);
  return NextResponse.json(r);
}
