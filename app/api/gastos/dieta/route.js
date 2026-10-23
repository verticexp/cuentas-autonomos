import { comprobarCierre } from '@/lib/cierres';
import { guardar } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { actividadesDe, actividadValida, fiscalDe, usaIgic } from '@/lib/empresa';
import { calcularDieta, conceptoDieta } from '@/lib/dietas';
import { fechaReal } from '@/lib/validacion';
import { secundarios } from '@/lib/trabajos';

export const dynamic = 'force-dynamic';

// Kilometraje o dietas: el importe lo calcula el servidor con los límites vigentes (lib/dietas.js).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  if (!fechaReal(b.fecha)) return error('Fecha no válida');
  // Una sociedad no tiene «titular» en el IRPF: sus socios y empleados cobran dietas.
  const c = calcularDieta({ ...b, quien: fiscalDe(u).tipo === 'sociedad' ? 'empleado' : b.quien }, { igic: usaIgic(fiscalDe(u)) });
  if (c.error) return error(c.error);
  const persona = String(b.persona || '').trim().slice(0, 60);
  const motivo = String(b.motivo || '').trim().slice(0, 80);
  const { base, ivaPct, impuesto, ...dieta } = c;
  const g = {
    id: crypto.randomUUID(), fecha: b.fecha, actividad: actividadValida(actividadesDe(u), b.actividad),
    concepto: [conceptoDieta(c), persona, motivo].filter(Boolean).join(' · ').slice(0, 140), base, ivaPct, ...(impuesto ? { impuesto } : {}),
    dieta: { ...dieta, ...(persona ? { persona } : {}), ...(motivo ? { motivo } : {}) },
  };
  const cerrado = await comprobarCierre(u, g.fecha);
  if (cerrado) return error(cerrado, 409);
  await guardar(u, 'gastos', g);
  await secundarios(u, { gastos: [g.id], meses: [g.fecha] });
  return Response.json({ ok: true, gasto: g });
}
