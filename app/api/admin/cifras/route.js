import { accesoCifras } from '@/lib/secreto';
import { leerResumenAdmin } from '@/lib/adminServidor';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const status = accesoCifras(req);
  const headers = { 'Cache-Control': 'no-store' };
  if (status) return new Response(null, { status, headers });
  const hoy = new Date();
  let r;
  try { ({ resumen: r } = await leerResumenAdmin(hoy)); }
  catch { return new Response(null, { status: 503, headers }); }
  const k = r.kpis;
  // Lista explícita también en los objetos anidados: nunca se devuelven filas ni datos de personas.
  return Response.json({
    generado: hoy.toISOString(), excluidas: k.excluidas, mrr: k.mrr / 100, arr: k.arr / 100,
    pago: r.porEstado.pago, impago: r.porEstado.impago, prueba: r.porEstado.prueba,
    conversion: k.conversion, altasMes: k.altasMes, bajasMes: k.bajasMes, bajasPct: k.bajasPct, bajasDesde: k.bajasDesde, bajasMesParcial: k.bajasMesParcial,
    pruebasQueAcabanEn7: k.pruebasQueAcabanEn7, activos7: k.activos7, activos30: k.activos30,
    altasSemanas: r.altas.map(({ desde, n }) => ({ desde, n })),
    bajasSemanas: r.bajasSemanas.map(({ desde, hasta, n, completa }) => ({ desde, hasta, n, completa })),
    origenes: r.origenes.map(({ origen, total, prueba, pagan, conversion }) => ({ origen, total, prueba, pagan, conversion })),
  }, { headers });
}
