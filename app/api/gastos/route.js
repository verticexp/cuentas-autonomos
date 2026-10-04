import { guardar, borrar, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { subirGasto } from '@/lib/drive';
import { enviarNomina } from '@/lib/controlat';
import { leerImporte, r2 } from '@/lib/calculos';
import { actividadesDe, actividadValida } from '@/lib/empresa';

export const dynamic = 'force-dynamic';

// Proveedor (opcional): nombre y NIF de quien emite el ticket o la factura.
const proveedorDe = (b) => {
  const nombre = String(b.proveedor || '').trim().slice(0, 80);
  const nif = String(b.proveedorNif || '').trim().toUpperCase().slice(0, 20);
  return { ...(nombre ? { proveedor: nombre } : {}), ...(nombre && nif ? { proveedorNif: nif } : {}) };
};

export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  const base = r2(leerImporte(b.base));
  if (!base) return error('Importe no válido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) return error('Fecha no válida');
  if (!String(b.concepto || '').trim()) return error('Falta el concepto');
  const g = {
    id: crypto.randomUUID(),
    fecha: b.fecha,
    actividad: actividadValida(actividadesDe(u), b.actividad),
    concepto: String(b.concepto).trim().slice(0, 140),
    base,
    ivaPct: Math.min(100, Math.max(0, Number(b.ivaPct) || 0)),
    ...proveedorDe(b),
    ...(b.pendiente ? { pendiente: true } : {}),
  };
  await guardar(u, 'gastos', g);
  await Promise.all([subirGasto(u, g), enviarNomina(u, [g.fecha])]);
  return Response.json({ ok: true, gasto: g });
}

export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  const antes = b.id && (await leerUno(u, 'gastos', b.id));
  if (!antes) return error('Ese gasto ya no existe', 404);
  const base = r2(leerImporte(b.base));
  if (!base) return error('Importe no válido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) return error('Fecha no válida');
  if (!String(b.concepto || '').trim()) return error('Falta el concepto');
  const g = { ...antes, fecha: b.fecha, actividad: actividadValida(actividadesDe(u), b.actividad), concepto: String(b.concepto).trim().slice(0, 140), base, ivaPct: Math.min(100, Math.max(0, Number(b.ivaPct) || 0)), proveedor: undefined, proveedorNif: undefined, ...proveedorDe(b), pendiente: b.pendiente ? true : undefined };
  await guardar(u, 'gastos', g);
  await enviarNomina(u, [antes.fecha, g.fecha]);
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  const antes = await leerUno(u, 'gastos', id);
  await borrar(u, 'gastos', id);
  if (antes) await enviarNomina(u, [antes.fecha]);
  return Response.json({ ok: true });
}
