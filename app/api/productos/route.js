import { randomBytes } from 'node:crypto';
import { guardar, borrar } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { r2 } from '@/lib/calculos';
import { importeEscrito } from '@/lib/validacion';

export const dynamic = 'force-dynamic';
const MAX_IMPORTE = 1000000000;
const MAX_CANTIDAD = 1000000;

// Catálogo de productos y servicios: para rellenar las líneas de factura en un toque (y, con inventario, su stock).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const nombre = String(b.nombre || '').trim().slice(0, 200);
  if (!nombre) return error('Falta el nombre');
  const n = importeEscrito(b.precio);
  const precio = r2(n);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_IMPORTE || !precio) return error('Escribe un precio mayor que 0 y de hasta 1.000.000.000 € (por ejemplo, 25,50).');
  const coste = importeEscrito(b.coste, 0), minimo = importeEscrito(b.minimo, 0), maximo = importeEscrito(b.maximo, 0);
  if (!Number.isFinite(coste) || coste < 0 || coste > MAX_IMPORTE) return error('Escribe un coste entre 0 y 1.000.000.000 € (por ejemplo, 12,50).');
  if (![minimo, maximo].every((v) => Number.isFinite(v) && v >= 0 && v <= MAX_CANTIDAD)) return error('Escribe cantidades mínimas y máximas entre 0 y 1.000.000 (por ejemplo, 10).');
  const ivaPct = importeEscrito(b.ivaPct, 0);
  if (!Number.isFinite(ivaPct) || ivaPct < 0 || ivaPct > 100) return error('Escribe un porcentaje de IVA entre 0 y 100 (por ejemplo, 21).');
  // Inventario (opcional): referencia, código de barras, coste, mínimo y máximo, proveedor habitual; o servicio (sin stock).
  const txt = (v, n) => String(v || '').trim().slice(0, n);
  const num = (v) => { const n = r2(v); return n > 0 ? n : undefined; };
  const p = { id: /^[a-f0-9]{12}$/.test(b.id || '') ? b.id : randomBytes(6).toString('hex'), nombre, precio, ivaPct,
    ...(txt(b.sku, 30) ? { sku: txt(b.sku, 30) } : {}), ...(txt(b.codigo, 30) ? { codigo: txt(b.codigo, 30) } : {}), ...(txt(b.proveedor, 80) ? { proveedor: txt(b.proveedor, 80) } : {}),
    ...(num(coste) ? { coste: num(coste) } : {}), ...(num(minimo) ? { minimo: num(minimo) } : {}), ...(num(maximo) ? { maximo: num(maximo) } : {}),
    ...(b.servicio ? { servicio: true } : {}) };
  await guardar(u, 'productos', p);
  return Response.json({ ok: true, producto: p });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  await borrar(u, 'productos', req.nextUrl.searchParams.get('id') || '');
  return Response.json({ ok: true });
}
