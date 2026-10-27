import { cuerpo, error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { clienteDelDespacho, miDespacho, periodoDe } from '@/lib/despachoApi';
import { aceptarCliente, cambiarVinculo, registrarAcceso, rolEn, separarCliente } from '@/lib/despachos';
import { cerrarTrimestre, reabrirTrimestre } from '@/lib/cierres';
import { incluirLicencia, planSinLicencia, quitarLicencia, sincronizarLicencias } from '@/lib/licencias';
import { auditar } from '@/lib/auditoria';
import { redis } from '@/lib/redis';
import { escribir, marcarLeido, responder } from '@/lib/comentariosDespacho';
import { invalidarNoLeidos } from '@/lib/mensajesDespacho';
import { avisarCliente } from '@/lib/avisosDespacho';
import { rangoTrimestre } from '@/lib/cierres';

export const dynamic = 'force-dynamic';

const SOLO_TITULAR = ['gestor', 'licencia', 'sinLicencia', 'separar'];

// Lo que el despacho hace con un cliente. { empresa, accion, anio?, t?, gestor? }
// cerrar / reabrir: el trimestre (cualquiera del despacho que lo vea). gestor: a quién se asigna (null, nadie).
// licencia / sinLicencia: el despacho paga (o deja de pagar) su plan. separar: dejar de llevarlo.
export async function POST(req) {
  const b = await cuerpo(req);
  const accion = String(b.accion || '');
  // aceptar / rechazar: una solicitud (se unió con el código y aún no la ve nadie del despacho). Solo el titular.
  if (accion === 'aceptar' || accion === 'rechazar') return solicitud(b.empresa, accion);
  const r = await clienteDelDespacho(b.empresa, { titular: SOLO_TITULAR.includes(accion) });
  if (r.res) return r.res;
  const { e, d, ctx, quien } = r;
  const dia = hoy();
  if (accion === 'cerrar' || accion === 'reabrir') {
    const { anio, t } = periodoDe(b.anio, b.t, dia);
    const x = accion === 'cerrar' ? await cerrarTrimestre(ctx, anio, t, quien) : await reabrirTrimestre(ctx, anio, t);
    if (x.error) return error(x.error);
    const texto = accion === 'cerrar' ? `Revisó y cerró el ${t}T ${anio}` : `Reabrió el ${t}T ${anio}`;
    await Promise.all([registrarAcceso(e.id, quien, texto), auditar(ctx, `${d.nombre}: ${texto.toLowerCase()}`, '', { enGestoria: false })]);
    return Response.json({ ok: true, cierre: x.cierre || null });
  }
  // informe: le manda al chat el informe del trimestre (PDF, api/despacho/informe y api/tu-despacho/informe).
  if (accion === 'informe') {
    const { anio, t } = periodoDe(b.anio, b.t, dia);
    const doc = { tipo: 'informe', id: `${anio}-${t}`, texto: `Informe del ${t}T ${anio}`, fecha: rangoTrimestre(anio, t)[1] };
    const m = await escribir(e.id, quien, 'despacho', { texto: `📊 Te he preparado el informe del ${t}T ${anio}: lo que has facturado y gastado, lo que pagas de impuestos y cómo va el año. Tócalo para abrirlo.`, doc, despacho: d.id });
    if (m.error) return error(m.error, m.status || 400);
    // No es una pregunta: no cuenta entre las que quedan por resolver.
    await responder(e.id, m.comentario.id, quien, 'despacho', { resuelto: true, despacho: d.id });
    await redis.hset(`despacho-informes:${e.id}`, { [`${anio}-${t}`]: { fecha: new Date().toISOString(), por: quien.nombre || '', despacho: d.id } });
    await marcarLeido(e.id, 'despacho');
    await invalidarNoLeidos(d.id);
    await registrarAcceso(e.id, quien, 'Te ha enviado el informe del trimestre', `${t}T ${anio}`);
    avisarCliente(e, { titulo: `${d.nombre}: informe del ${t}T ${anio}`, cuerpo: 'Lo que has facturado, lo que pagas de impuestos y cómo va el año.' });
    return Response.json({ ok: true });
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

async function solicitud(empresaId, accion) {
  const r = await miDespacho({ titular: true });
  if (r.res) return r.res;
  const { d, quien } = r;
  const e = empresaId && (await redis.hget('empresas', String(empresaId)));
  if (!e || e.despachoCliente?.id !== d.id || !e.despachoCliente.pendiente) return error('Esa solicitud ya no existe', 404);
  if (accion === 'rechazar') {
    const x = await separarCliente(e.id, d.id);
    if (x.error) return error(x.error, x.status || 400);
    await registrarAcceso(e.id, quien, 'No aceptó llevar tus cuentas');
    return Response.json({ ok: true });
  }
  const x = await aceptarCliente(e.id, d.id);
  if (x.error) return error(x.error, x.status || 400);
  await registrarAcceso(e.id, quien, 'Aceptó llevar tus cuentas');
  avisarCliente(e, { titulo: `${d.nombre} ya lleva tus cuentas`, cuerpo: 'Ha aceptado tu solicitud: desde ahora ve tus cuentas y puedes escribirle.' });
  return Response.json({ ok: true });
}
