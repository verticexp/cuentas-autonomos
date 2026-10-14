import { usuarioApi, error } from '@/lib/api';
import { auroraIncompleta, crearAurora } from '@/lib/aurora';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const { res } = await usuarioApi({ admin: true });
  if (res) return res;
  const jsonLua = await redis.eval(`local a=cjson.decode('[1,2,3,4,5,null,{"ixa":"x"}]'); local b=cjson.decode('[1,2,3,4,5,"",{"ixa":"x"}]'); return cjson.encode({conNull=type(a[7]),conTexto=type(b[7])})`, [], []);
  return Response.json({ cargaIncompleta: await auroraIncompleta(), jsonLua }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST() {
  const { res } = await usuarioApi({ admin: true });
  if (res) return res;
  const r = await crearAurora();
  if (r.error) return error(r.error, r.status);
  return Response.json(r, { headers: { 'Cache-Control': 'no-store' } });
}
