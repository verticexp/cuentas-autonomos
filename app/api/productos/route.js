import { randomBytes } from 'node:crypto';
import { guardar, borrar } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { leerImporte, r2 } from '@/lib/calculos';

export const dynamic = 'force-dynamic';

// Catálogo de productos y servicios: para rellenar las líneas de factura en un toque.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const nombre = String(b.nombre || '').trim().slice(0, 200);
  if (!nombre) return error('Falta el nombre');
  const precio = r2(leerImporte(b.precio) || 0);
  if (!precio) return error('Precio no válido');
  const p = { id: /^[a-f0-9]{12}$/.test(b.id || '') ? b.id : randomBytes(6).toString('hex'), nombre, precio, ivaPct: Math.min(100, Math.max(0, Number(b.ivaPct) || 0)) };
  await guardar(u, 'productos', p);
  return Response.json({ ok: true, producto: p });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  await borrar(u, 'productos', req.nextUrl.searchParams.get('id') || '');
  return Response.json({ ok: true });
}
