import { cuerpo, error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { clienteDelDespacho, periodoDe } from '@/lib/despachoApi';
import { cambiarVinculo, registrarAcceso, rolEn, separarCliente } from '@/lib/despachos';
import { cerrarTrimestre, reabrirTrimestre } from '@/lib/cierres';
import { incluirLicencia, planSinLicencia, quitarLicencia, sincronizarLicencias } from '@/lib/licencias';
import { auditar } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';

const SOLO_TITULAR = ['gestor', 'licencia', 'sinLicencia', 'separar'];

// Lo que el despacho hace con un cliente. { empresa, accion, anio?, t?, gestor? }
// cerrar / reabrir: el trimestre (cualquiera del despacho que lo vea). gestor: a quién se asigna (null, nadie).
// licencia / sinLicencia: el despacho paga (o deja de pagar) su plan. separar: dejar de llevarlo.
export async function POST(req) {
  const b = await cuerpo(req);
  const accion = String(b.accion || '');
  const r = await clienteDelDespacho(b.empresa, { titular: SOLO_TITULAR.includes(accion) });
  if (r.res) return r.res;
  const { e, d, ctx, quien } = r;
  const dia = hoy();
  if (accion === 'cerrar' || accion === 'reabrir') {
    const { anio, t } = periodoDe(b.anio, b.t, dia);
    const x = accion === 'cerrar' ? await cerrarTrimestre(ctx, anio, t, quien) : await reabrirTrimestre(ctx, anio, t);
    if (x.error) return error(x.error);
    const texto = accion === 'cerrar' ? `Revisó y cerró el ${t}T ${anio}` : `Reabrió el ${t}T ${anio}`;
    await Promise.all([registrarAcceso(e.id, quien, texto), auditar(ctx, `${d.nombre}: ${texto.toLowerCase()}`)]);
    return Response.json({ ok: true, cierre: x.cierre || null });
  }
  if (accion === 'gestor') {
    const gestor = b.gestor ? String(b.gestor) : null;
    if (gestor && !rolEn(d, gestor)) return error('Esa persona no es de tu despacho');
    const x = await cambiarVinculo(e.id, d.id, (v) => {
      const { gestor: _, ...sin } = v;
      return { vinculo: gestor ? { ...sin, gestor } : sin };
    });
    return x.error ? error(x.error, x.status || 400) : Response.json({ ok: true });
  }
  if (accion === 'licencia' || accion === 'sinLicencia') {
    const x = accion === 'licencia' ? await incluirLicencia(e.id, d, dia) : await quitarLicencia(e.id, d.id, dia);
    if (x.error) return error(x.error, x.status || 400);
    await registrarAcceso(e.id, quien, accion === 'licencia' ? 'Incluyó Fisquo en su cuota' : 'Dejó de incluir Fisquo en su cuota');
    await sincronizarLicencias(d.id, dia).catch((err) => console.warn('[licencias]', err.message));
    return Response.json({ ok: true });
  }
  if (accion === 'separar') {
    const x = await separarCliente(e.id, d.id, { ajustar: (sin, antes) => (antes.despachoCliente?.licencia ? { ...sin, plan: planSinLicencia(sin.plan, dia) } : sin) });
    if (x.error) return error(x.error, x.status || 400);
    await registrarAcceso(e.id, quien, 'Dejó de llevar tus cuentas');
    if (x.antes?.despachoCliente?.licencia) await sincronizarLicencias(d.id, dia).catch(() => null);
    return Response.json({ ok: true });
  }
  return error('Acción no válida');
}
