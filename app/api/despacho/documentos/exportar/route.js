import { error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { clienteDelDespacho, periodoDe } from '@/lib/despachoApi';
import { registrarAcceso } from '@/lib/despachos';
import { digitosDe, FORMATOS_DIARIO, tipoDiario } from '@/lib/diarioContable';
import { diarioDocumentos, documentosDe } from '@/lib/documentosServidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Los documentos revisados del trimestre de un cliente «solo documentos», para el programa de contabilidad del despacho
// (el mismo formato que app/api/despacho/contable). ?empresa=&anio=&t=&formato=a3|contaplus|contasol&codigo=&digitos=
// Se puede exportar aunque el panel esté en pausa: lo que ya hay es de la gestoría.
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const { e, ctx, quien, res } = await clienteDelDespacho(q.get('empresa'));
  if (res) return res;
  const formato = q.get('formato');
  if (!FORMATOS_DIARIO.includes(formato)) return error('Formato no válido: a3, contaplus o contasol');
  const { anio, t } = periodoDe(q.get('anio'), q.get('t'), hoy());
  const r = diarioDocumentos(ctx, await documentosDe(ctx), { anio, t, formato, codigo: q.get('codigo') || 1, digitos: digitosDe(q), fecha: hoy() });
  if (!r.n) return error('No hay documentos revisados en este trimestre: márcalos como revisados para exportarlos.', 404);
  await registrarAcceso(e.id, quien, 'Exportó sus documentos', `${t}T ${anio} · ${formato}`);
  return new Response(r.contenido, { headers: { 'Content-Type': tipoDiario(formato), 'Content-Disposition': `attachment; filename="${r.nombre}"`, 'Cache-Control': 'no-store' } });
}
