import { guardar, borrar, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { leerImporte, r2 } from '@/lib/calculos';
import { SS_EMPRESA, SS_TRABAJADOR } from '@/lib/nominas';

export const dynamic = 'force-dynamic';
const pct = (v, def) => Math.min(100, Math.max(0, v === '' || v === undefined ? def : Number(String(v).replace(',', '.')) || 0));

// Datos de un empleado a partir del formulario (components/FormEmpleado.js).
function limpio(b, antes = {}) {
  const nombre = String(b.nombre || '').trim().slice(0, 80);
  const bruto = r2(leerImporte(b.bruto));
  if (!nombre) return { error: 'Falta el nombre' };
  if (!bruto) return { error: 'Sueldo bruto no válido' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.alta || '')) return { error: 'Fecha de alta no válida' };
  return {
    e: {
      ...antes,
      nombre,
      nif: String(b.nif || '').trim().toUpperCase().slice(0, 15),
      puesto: String(b.puesto || '').trim().slice(0, 60),
      alta: b.alta,
      baja: /^\d{4}-\d{2}-\d{2}$/.test(b.baja || '') ? b.baja : '',
      bruto,
      irpfPct: pct(b.irpfPct, 12),
      ssTrabajadorPct: pct(b.ssTrabajadorPct, SS_TRABAJADOR),
      ssEmpresaPct: pct(b.ssEmpresaPct, SS_EMPRESA),
    },
  };
}

export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const r = limpio(await cuerpo(req), { id: crypto.randomUUID() });
  if (r.error) return error(r.error);
  await guardar(u, 'empleados', r.e);
  return Response.json({ ok: true, empleado: r.e });
}

export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const b = await cuerpo(req);
  const antes = b.id && (await leerUno(u, 'empleados', b.id));
  if (!antes) return error('Ese empleado ya no existe', 404);
  const r = limpio(b, antes);
  if (r.error) return error(r.error);
  await guardar(u, 'empleados', r.e);
  return Response.json({ ok: true });
}

// Borrar solo quita la ficha: sus nóminas ya hechas se quedan (son gastos y retenciones declaradas).
export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  await borrar(u, 'empleados', id);
  return Response.json({ ok: true });
}
