import { cuerpo, error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { puede } from '@/lib/permisos';
import { borrarFichaCliente, guardarFichaCliente } from '@/lib/tercerosServidor';
import { tieneLimite } from '@/lib/riesgo';
import { eur } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const fallo = (r) => Response.json({ error: r.error, ...(r.errores ? { errores: r.errores } : {}) }, { status: r.status || 400 });

// Ficha de cliente (lib/terceros.js): { id?, nombre, nif, direccion, ciudad, email, pais, telefono, formaCobro, plazo,
// comercial, zona, riesgoMax, notas, vinculo, vinculoModulos }. Con id se cambia ese cliente (su nombre no cambia); sin
// id, se crea uno nuevo.
// El riesgo máximo solo lo cambia quien tiene el permiso «empresa» (administrador).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const r = await guardarFichaCliente(u, b, { id: b.id ? String(b.id) : undefined, puedeRiesgo: puede(u, 'empresa') });
  if (r.error) return fallo(r);
  const c = r.cliente;
  await auditar(u, r.nuevo ? 'Cliente nuevo' : 'Ficha de cliente guardada', `${c.nombre}${tieneLimite(c) ? ` · riesgo máximo ${eur(c.riesgoMax)}` : ''}`);
  return Response.json({ ok: true, cliente: c });
}

// ?id= : borra la ficha de un cliente sin facturas.
export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  const r = await borrarFichaCliente(u, id);
  if (r.error) return fallo(r);
  await auditar(u, 'Ficha de cliente borrada', r.cliente.nombre);
  return Response.json({ ok: true });
}
