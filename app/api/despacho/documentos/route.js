import { cuerpo, error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { clienteDelDespacho, periodoDe } from '@/lib/despachoApi';
import { registrarAcceso } from '@/lib/despachos';
import { delTrimestre, ordenar, paraGestoria, resumen } from '@/lib/documentos';
import { abiertoPara, adelantarLecturas, corregir, descartar, documentosDe, marcarRevisado, permitir, releer } from '@/lib/documentosServidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Documentos de un cliente «solo documentos» (lib/documentos.js), del lado del despacho. GET ?empresa=&anio=&t= → los del
// trimestre con lo leído y sus avisos (los que aún se leen, siempre, para ver cómo avanzan).
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const { e, ctx, res } = await clienteDelDespacho(q.get('empresa'));
  if (res) return res;
  const { anio, t } = periodoDe(q.get('anio'), q.get('t'), hoy());
  const todos = await documentosDe(ctx);
  await adelantarLecturas(ctx, todos);
  const del = delTrimestre(todos, anio, t);
  const enCurso = todos.filter((d) => ['leyendo', 'cuarentena'].includes(d.estado) && !del.includes(d));
  return Response.json({ anio, t, documentos: ordenar([...del, ...enCurso]).map(paraGestoria), resumen: resumen(del), abierto: await abiertoPara(e) }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST { empresa, id, accion: 'corregir' (datos, tipo) | 'revisado' | 'pendiente' | 'releer' | 'permitir' | 'descartar' }.
export async function POST(req) {
  const b = await cuerpo(req);
  const { e, ctx, quien, res } = await clienteDelDespacho(b.empresa);
  if (res) return res;
  const id = String(b.id || '');
  const acciones = {
    corregir: () => corregir(ctx, id, { ...(b.datos && typeof b.datos === 'object' ? b.datos : {}), ...(b.tipo ? { tipo: b.tipo } : {}) }, quien),
    revisado: () => marcarRevisado(ctx, id, quien, true),
    pendiente: () => marcarRevisado(ctx, id, quien, false),
    releer: () => releer(ctx, id),
    permitir: () => permitir(ctx, id),
    descartar: () => descartar(ctx, id),
  };
  if (!acciones[b.accion]) return error('Acción no válida');
  const r = await acciones[b.accion]();
  if (r.errores) return Response.json({ error: r.error, errores: r.errores }, { status: 400 });
  if (r.error) return error(r.error, r.status || 400);
  if (b.accion === 'descartar') await registrarAcceso(e.id, quien, 'Quitó un documento', r.doc?.nombre || '');
  return Response.json({ ok: true, ...(r.doc && b.accion !== 'descartar' ? { documento: paraGestoria(r.doc) } : {}) });
}
