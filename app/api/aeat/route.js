import { usuarioApi } from '@/lib/api';
import { actividadesDe, fiscalDe, usa130, usa303 } from '@/lib/empresa';
import { casillas303, liquidaciones303, minoracion130, resumenAnual } from '@/lib/calculos';
import { declarante, fichero130, fichero303, nombreFichero } from '@/lib/ficheroAeat';
import { datosImpuestos } from '@/lib/datosImpuestos';
import { hoy } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Fichero del 303 o del 130 para importarlo en el formulario de la Sede. ?modelo=303|130&anio=2026&t=3
// Mismos datos y cálculos que la página de Modelos (app/modelos/page.js).
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const q = req.nextUrl.searchParams;
  const modelo = q.get('modelo');
  const anio = Number(q.get('anio')) || Number(hoy().slice(0, 4));
  const t = Number(q.get('t'));
  if (!['303', '130'].includes(modelo) || ![1, 2, 3, 4].includes(t)) return Response.json({ error: 'Modelo o trimestre no válido' }, { status: 400 });
  const f = fiscalDe(u);
  if (modelo === '303' ? !usa303(f) : !usa130(f)) return Response.json({ error: `Según tus ajustes no presentas el ${modelo}` }, { status: 400 });
  const yo = declarante(u.emisor);
  if (yo.error) return Response.json({ error: yo.error }, { status: 400 });

  const { facturas, gastos } = await datosImpuestos(u, anio);
  const h = hoy();
  const hasta = h < `${anio}-12-31` ? h : `${anio}-12-31`;
  let r;
  try {
    if (modelo === '303') r = fichero303(yo, anio, t, casillas303(facturas, gastos, anio, t), liquidaciones303(facturas, gastos, anio)[t - 1]);
    else {
      const ids = actividadesDe(u).map((a) => a.id);
      const minoracion = minoracion130(u.rend130?.[anio - 1]);
      r = fichero130(yo, anio, resumenAnual(facturas, gastos, anio, u.pagos130?.[anio] || {}, ids, { ivaCoste: !usa303(f), hasta, minoracion }).trimestres[t - 1]);
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 422 });
  }
  // La Sede espera ISO-8859-1 (la Ñ en un byte).
  const bytes = Uint8Array.from(r.contenido, (ch) => { const c = ch.charCodeAt(0); return c < 256 ? c : 32; });
  return new Response(bytes, { headers: { 'Content-Type': 'text/plain; charset=iso-8859-1', 'Content-Disposition': `attachment; filename="${nombreFichero(modelo, anio, t)}"` } });
}
