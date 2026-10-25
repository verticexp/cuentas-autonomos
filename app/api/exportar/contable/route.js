import { DETALLE } from '@/lib/permisos';
import { error, usuarioApi } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { auditar } from '@/lib/auditoria';
import { FORMATOS_DIARIO, tipoDiario } from '@/lib/diarioContable';

import { diarioConCierreDe } from '@/lib/contabilidad';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: DETALLE });
  if (res) return res;
  const q = req.nextUrl.searchParams;
  const fecha = hoy();
  const anio = q.has('anio') ? Number(q.get('anio')) : Number(fecha.slice(0, 4));
  const formato = q.get('formato');
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return error('Año no válido');
  if (!FORMATOS_DIARIO.includes(formato)) return error('Formato no válido: a3, contaplus o contasol');
  // Código en la gestoría: ?empresa=123; no es el identificador interno de Fisquo.
  const r = await diarioConCierreDe(u, { anio, formato, codigo: q.get('empresa') ?? 1, fecha });
  if (r.error) return error(r.error);
  await auditar(u, 'Exportación contable', `${r.nombre} · ${anio} · ${formato}`);
  return new Response(r.contenido, { headers: { 'Content-Type': tipoDiario(formato), 'Content-Disposition': `attachment; filename="${r.nombre}"`, 'Cache-Control': 'no-store' } });
}
