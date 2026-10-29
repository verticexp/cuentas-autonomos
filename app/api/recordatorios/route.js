import { secretoCron } from '@/lib/secreto';
import { redis } from '@/lib/redis';
import { hoy } from '@/lib/formato';
import { purgarBajas } from '@/lib/baja';
import { planificarDia, resumenTanda } from '@/lib/trabajosTareas';
import { tanda } from '@/lib/trabajos';
import { sincronizarTodas, TARIFA } from '@/lib/licencias';
import { avisoFinOferta } from '@/lib/avisosCorreo';
import { sincronizarPaneles } from '@/lib/panelDocumentos';

const euros = (cent) => `${String(cent / 100).replace('.', ',')} €`;

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lo llama Vercel cada mañana (vercel.json → crons, con CRON_SECRET). Informe de capacidad E04: no hace el trabajo de
// todas las empresas en una sola función; lo planifica (un trabajo por empresa y tarea: índices y totales al día,
// recordatorios de cobro, avisos
// en el móvil, envíos de Verifactu pendientes, avisos del mes de prueba y el paquete trimestral a la gestoría) y lo procesa en tandas encadenadas (la primera aquí, las siguientes en app/api/trabajos).
export async function GET(req) {
  if (!secretoCron(req)) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!redis) return Response.json({ ok: true, planificados: 0, motivo: 'sin base de datos' });
  const inicio = Date.now();
  const dia = hoy();
  // Empresas dadas de baja cuyo plazo legal de conservación ha acabado: se borran del todo.
  const bajas = await purgarBajas(dia);
  // Licencias de los despachos: las de los clientes cuyos días gratis acaban hoy empiezan a contar (lib/licencias.js).
  const despachos = await sincronizarTodas(dia, { avisar: (d) => avisoFinOferta(d, { aut: euros(TARIFA.aut[0].cent), pym: euros(TARIFA.pym[0].cent) }) }).catch((e) => { console.warn('[licencias]', e.message); return 0; });
  // Panel «solo documentos» (lib/panelDocumentos.js): el tramo, según los clientes que tenga hoy (también baja de tramo).
  await sincronizarPaneles().catch((e) => console.warn('[panel]', e.message));
  const planificados = await planificarDia(dia, req.nextUrl.origin, ['indices', 'recordatorios', 'push', 'verifactu', 'prueba', 'gestoria']);
  // La primera tanda, aquí mismo (su resumen va en la respuesta); si queda trabajo, encadena las siguientes.
  const r = await tanda(req.nextUrl.origin, 0, { hasta: inicio + 50000 });
  return Response.json({ ok: true, planificados, bajas, despachos, ...resumenTanda(r) });
}
