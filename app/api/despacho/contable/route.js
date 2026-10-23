import { error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { clienteDelDespacho } from '@/lib/despachoApi';
import { registrarAcceso } from '@/lib/despachos';
import { diarioDe, FORMATOS_DIARIO, tipoDiario } from '@/lib/diarioContable';
import { auditar } from '@/lib/auditoria';
import { concurrencia, respuesta429 } from '@/lib/limite';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Libro diario del cliente para el programa del despacho. ?empresa=&anio=&formato=a3|contaplus|contasol&codigo=
// codigo: el número de esa empresa en A3 (no el id de Fisquo).
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const { e, ctx, quien, res } = await clienteDelDespacho(q.get('empresa'));
  if (res) return res;
  const fecha = hoy();
  const anio = q.has('anio') ? Number(q.get('anio')) : Number(fecha.slice(0, 4));
  const formato = q.get('formato');
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return error('Año no válido');
  if (!FORMATOS_DIARIO.includes(formato)) return error('Formato no válido: a3, contaplus o contasol');
  // Una exportación a la vez por cliente (lee y contabiliza su año entero).
  const r = await concurrencia('exportar', e.id, 1, 120000, () => diarioDe(ctx, { anio, formato, codigo: q.get('codigo') || 1, fecha }));
  if (r?.ocupado) return respuesta429(5, 'Ya hay una exportación en curso para este cliente. Espera a que termine.');
  if (r.error) return error(r.error);
  await Promise.all([registrarAcceso(e.id, quien, 'Exportó la contabilidad', `${r.nombre} · ${anio}`), auditar(ctx, 'Exportación contable (despacho)', `${r.nombre} · ${anio} · ${formato}`)]);
  return new Response(r.contenido, { headers: { 'Content-Type': tipoDiario(formato), 'Content-Disposition': `attachment; filename="${r.nombre}"`, 'Cache-Control': 'no-store' } });
}
