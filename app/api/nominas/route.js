import { guardar, borrar, leer, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { leerImporte, r2 } from '@/lib/calculos';
import { actividadesDe, actividadValida } from '@/lib/empresa';
import { gastoDeNomina } from '@/lib/nominas';
import { enviarNomina } from '@/lib/controlat';

export const dynamic = 'force-dynamic';

// Cada nómina guarda también su gasto (bruto + Seguridad Social de la empresa), con id nomina-<id>.
async function guardarConGasto(u, n) {
  await guardar(u, 'nominas', n);
  const g = gastoDeNomina(n, actividadValida(actividadesDe(u)));
  await guardar(u, 'gastos', g);
  await enviarNomina(u, [g.fecha]);
}

// Genera las nóminas de un mes para los empleados de alta ese mes (las que ya existan no se tocan).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const { mes } = await cuerpo(req);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '')) return error('Mes no válido');
  const [empleados, nominas] = await Promise.all([leer(u, 'empleados'), leer(u, 'nominas')]);
  const activos = (empleados || []).filter((e) => e.alta.slice(0, 7) <= mes && (!e.baja || e.baja.slice(0, 7) >= mes));
  if (!activos.length) return error('No hay empleados de alta ese mes');
  const hechas = new Set((nominas || []).filter((n) => n.mes === mes).map((n) => n.empleado));
  const nuevas = activos.filter((e) => !hechas.has(e.id)).map((e) => ({
    id: crypto.randomUUID(), mes, empleado: e.id, empleadoNombre: e.nombre,
    bruto: e.bruto, irpfPct: e.irpfPct, ssTrabajadorPct: e.ssTrabajadorPct, ssEmpresaPct: e.ssEmpresaPct, pagada: false,
  }));
  for (const n of nuevas) await guardarConGasto(u, n);
  return Response.json({ ok: true, creadas: nuevas.length });
}

// Corregir una nómina (pagas extra, horas, otro % de IRPF) o marcarla como pagada.
export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const b = await cuerpo(req);
  const antes = b.id && (await leerUno(u, 'nominas', b.id));
  if (!antes) return error('Esa nómina ya no existe', 404);
  const n = { ...antes };
  if ('pagada' in b) n.pagada = Boolean(b.pagada);
  if ('bruto' in b) {
    n.bruto = r2(leerImporte(b.bruto));
    if (!n.bruto) return error('Sueldo bruto no válido');
    for (const k of ['irpfPct', 'ssTrabajadorPct', 'ssEmpresaPct']) n[k] = Math.min(100, Math.max(0, Number(String(b[k]).replace(',', '.')) || 0));
  }
  await guardarConGasto(u, n);
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  const antes = id && (await leerUno(u, 'nominas', id));
  if (!antes) return error('Esa nómina ya no existe', 404);
  await Promise.all([borrar(u, 'nominas', id), borrar(u, 'gastos', `nomina-${id}`)]);
  await enviarNomina(u, [gastoDeNomina(antes, '').fecha]);
  return Response.json({ ok: true });
}
