import { guardar, borrar, leerUno } from '@/lib/redis';
import { crearFactura, guardarCliente, limpiar } from '@/lib/facturas';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { subirFactura } from '@/lib/drive';
import { enviarNomina } from '@/lib/controlat';
import { actividadesDe, fiscalDe } from '@/lib/empresa';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const datos = limpiar(b, actividadesDe(u), fiscalDe(u).tipo === 'sociedad');
  if (datos.error) return error(datos.error);
  const original = b.rectifica && (await leerUno(u, 'facturas', b.rectifica));
  if (b.rectifica && !original) return error('La factura a rectificar no existe');
  const { factura: f, error: e } = await crearFactura(u, datos, { original });
  if (e) return error(e);
  return Response.json({ ok: true, factura: f });
}

// El número y el año no cambian al editar: la numeración debe ser correlativa.
export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const antes = b.id && (await leerUno(u, 'facturas', b.id));
  if (!antes) return error('Esa factura ya no existe', 404);
  if (Object.keys(b).length === 2 && 'cobrada' in b) {
    const f = { ...antes, cobrada: Boolean(b.cobrada) };
    await guardar(u, 'facturas', f);
    await subirFactura(u, f);
    return Response.json({ ok: true });
  }
  if (antes.verifactu) return error('Esta factura ya está registrada en Verifactu: para corregirla, haz una rectificativa');
  const datos = limpiar(b, actividadesDe(u), fiscalDe(u).tipo === 'sociedad');
  if (datos.error) return error(datos.error);
  if (Number(datos.fecha.slice(0, 4)) !== antes.anio) return error(`La fecha debe ser de ${antes.anio}`);
  await guardar(u, 'facturas', { ...antes, evento: undefined, ...datos });
  await guardarCliente(u, datos.cliente);
  await Promise.all([subirFactura(u, { ...antes, evento: undefined, ...datos }), enviarNomina(u, [antes.fecha, datos.fecha])]);
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  const antes = await leerUno(u, 'facturas', id);
  if (antes?.verifactu) return error('Esta factura ya está registrada en Verifactu: no se puede borrar, haz una rectificativa');
  await borrar(u, 'facturas', id);
  if (antes) await enviarNomina(u, [antes.fecha]);
  return Response.json({ ok: true });
}
