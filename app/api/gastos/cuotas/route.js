import { redis, clave, leerUno } from '@/lib/redis';
import { leerRango } from '@/lib/indices';
import { actividadesDe } from '@/lib/empresa';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { r2 } from '@/lib/calculos';
import { importeEscrito } from '@/lib/validacion';
import { fusionarCuotas, idCuota, mesesEntre } from '@/lib/cuotas';

const MAX_CUOTA = 1000000;

// Crea la cuota de autónomos de cada mes (sin IVA) desde el mes indicado hasta el actual, siempre con el id del mes
// (lib/cuotas.js): si un mes ya estaba (del formulario o del banco), se actualiza en vez de duplicarlo, y las cuotas
// repetidas de esos meses se unen en una. El concepto, igual que el de las que llegan del banco: el mes ya está en la fecha
// (con «2026-10» detrás salía cortado en el móvil).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  const n = importeEscrito(b.importe);
  const importe = r2(n);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_CUOTA || !importe) return error('Escribe una cuota mayor que 0 y de hasta 1.000.000 € (por ejemplo, 300,50).');
  if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(b.desde || '')) return error('Mes de inicio no válido');
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 7);
  const meses = mesesEntre(b.desde, hoy);
  if (!meses.length) return error('El mes de inicio es posterior al actual');
  const { guardar, borrar } = fusionarCuotas(await leerRango(u, 'gastos', `${b.desde}-01`, `${hoy}-31`));
  const existentes = new Map(guardar.map((g) => [g.id, g]));
  const nuevos = {};
  for (const g of guardar) nuevos[g.id] = g;
  for (const mes of meses) {
    const [y, m] = mes.split('-').map(Number);
    const antes = existentes.get(idCuota(mes)) || (await leerUno(u, 'gastos', idCuota(mes)));
    nuevos[idCuota(mes)] = { ...(antes || { fecha: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10), actividad: actividadesDe(u)[0].id, concepto: 'Cuota de autónomos', ivaPct: 0 }), id: idCuota(mes), base: importe };
  }
  const tx = redis.multi().hset(clave(u, 'gastos'), nuevos);
  if (borrar.length) tx.hdel(clave(u, 'gastos'), ...borrar);
  // Los movimientos del banco que apuntaban a una cuota repetida pasan a apuntar a la del mes.
  for (const g of guardar) {
    const mov = g.banco && (await leerUno(u, 'banco', g.banco));
    if (mov?.enlace?.tipo === 'gasto' && mov.enlace.id !== g.id) tx.hset(clave(u, 'banco'), { [mov.id]: { ...mov, enlace: { ...mov.enlace, id: g.id } } });
  }
  await tx.exec();
  return Response.json({ ok: true, meses: meses.length, unidas: borrar.length });
}
