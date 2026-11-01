import { cuerpo, error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { borrarFichaProveedor, guardarFichaProveedor } from '@/lib/tercerosServidor';

export const dynamic = 'force-dynamic';

const fallo = (r) => Response.json({ error: r.error, ...(r.errores ? { errores: r.errores } : {}) }, { status: r.status || 400 });

// Ficha de proveedor (lib/terceros.js): { id?, nombre, nif, direccion, ciudad, email, pais, telefono, formaPago, plazo,
// comercial, zona, notas, vinculo, vinculoModulos }. id es la clave del proveedor (la de /gastos/proveedores/<clave>): con
// ficha, se cambia (su nombre
// no cambia); sin ella, se crea. Sin id, un proveedor nuevo con la clave de su NIF o nombre.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  const r = await guardarFichaProveedor(u, b, { id: b.id ? String(b.id) : undefined });
  if (r.error) return fallo(r);
  await auditar(u, r.nuevo ? 'Proveedor nuevo' : 'Ficha de proveedor guardada', r.ficha.nombre);
  return Response.json({ ok: true, ficha: r.ficha });
}

// ?id= : borra la ficha (el proveedor sigue saliendo de sus gastos, sin ficha).
export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  const r = await borrarFichaProveedor(u, id);
  if (r.error) return fallo(r);
  await auditar(u, 'Ficha de proveedor borrada', r.ficha.nombre);
  return Response.json({ ok: true });
}
