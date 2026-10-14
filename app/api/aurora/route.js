import { usuarioApi, error } from '@/lib/api';
import { crearAurora } from '@/lib/aurora';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  const { res } = await usuarioApi({ admin: true });
  if (res) return res;
  const r = await crearAurora();
  if (r.error) return error(r.error, r.status);
  return Response.json(r, { headers: { 'Cache-Control': 'no-store' } });
}
