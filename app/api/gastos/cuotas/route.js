import { redis, clave } from '@/lib/redis';
import { actividadesDe } from '@/lib/empresa';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { leerImporte, r2 } from '@/lib/calculos';

// Crea la cuota de autónomos de cada mes (sin IVA) desde el mes indicado hasta el actual.
// Si un mes ya estaba, lo actualiza en vez de duplicarlo.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  const importe = r2(leerImporte(b.importe));
  if (!importe) return error('Importe no válido');
  if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(b.desde || '')) return error('Mes de inicio no válido');
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 7);
  const nuevos = {};
  for (let [y, m] = b.desde.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= hoy; m === 12 ? (y++, m = 1) : m++) {
    const mes = `${y}-${String(m).padStart(2, '0')}`;
    const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    nuevos[`cuota-${mes}`] = { id: `cuota-${mes}`, fecha: ultimo, actividad: actividadesDe(u)[0].id, concepto: `Cuota de autónomos ${mes}`, base: importe, ivaPct: 0 };
  }
  if (!Object.keys(nuevos).length) return error('El mes de inicio es posterior al actual');
  await redis.hset(clave(u, 'gastos'), nuevos);
  return Response.json({ ok: true, meses: Object.keys(nuevos).length });
}
