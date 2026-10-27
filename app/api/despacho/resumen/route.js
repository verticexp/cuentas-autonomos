import { error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { clienteDelDespacho, periodoDe } from '@/lib/despachoApi';
import { resumenCliente } from '@/lib/panelDespacho';
import { concurrencia, respuesta429 } from '@/lib/limite';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Resumen del trimestre de un cliente para su fila del panel (lo pide la pantalla de cuatro en cuatro). ?empresa=&anio=&t=
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const { ctx, d, res } = await clienteDelDespacho(q.get('empresa'));
  if (res) return res;
  const { anio, t } = periodoDe(q.get('anio'), q.get('t'), hoy());
  // Como mucho seis a la vez por despacho: el primer cálculo de un cliente lee todos sus datos.
  const r = await concurrencia('despacho-resumen', d.id, 6, 60000, async () => {
    try { return Response.json(await resumenCliente(ctx, anio, t, hoy())); } catch (e) { console.error('[despacho/resumen]', e); return error('No se ha podido calcular el resumen de este cliente', 500); }
  });
  return r?.ocupado ? respuesta429(2, 'Calculando otros clientes: espera un momento.') : r;
}
