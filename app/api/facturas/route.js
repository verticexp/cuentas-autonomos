import { leerUno } from '@/lib/redis';
import { actualizarFactura } from '@/lib/actualizarFactura';
import { borrarFactura, crearFactura, guardarCliente, limpiar } from '@/lib/facturas';
import { numeroFactura, pendienteDe } from '@/lib/calculos';
import { conLimiteDe, revisarRiesgo } from '@/lib/tercerosServidor';
import { mismoCliente } from '@/lib/terceros';
import { enlazadosCon } from '@/lib/enlacesBanco';
import { cobrarFactura, deshacerCobro, estadoCobro } from '@/lib/cobroManual';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { hoy } from '@/lib/formato';
import { actividadesDe, fiscalDe } from '@/lib/empresa';
import { soltarAlbaranes } from '@/lib/albaranesServidor';
import { secundarios } from '@/lib/trabajos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // el envío a Verifactu puede esperar al control de flujo de la AEAT

export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const datos = limpiar(b, actividadesDe(u), fiscalDe(u).tipo === 'sociedad', { rectificativa: Boolean(b.rectifica) });
  if (datos.error) return Response.json({ error: datos.error, errores: datos.errores }, { status: 400 });
  const original = b.rectifica && (await leerUno(u, 'facturas', b.rectifica));
  if (b.rectifica && !original) return error('La factura a rectificar no existe');
  // idem: clave de idempotencia del formulario (doble clic o reintento tras una respuesta perdida).
  const { factura: f, error: e, riesgo } = await crearFactura(u, datos, { original, motivo: b.motivoRectificacion, idem: typeof b.idem === 'string' ? `form:${b.idem}` : undefined });
  if (e) return riesgo ? Response.json({ error: e, riesgo }, { status: 409 }) : error(e);
  return Response.json({ ok: true, factura: f });
}

// El número y el año no cambian al editar: la numeración debe ser correlativa.
export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const antes = b.id && (await leerUno(u, 'facturas', b.id));
  if (!antes) return error('Esa factura ya no existe', 404);
  if (antes.caja) return error('Es un cierre de caja: corrígelo desde Caja');
  // Cobrar a mano: { id, accion: 'cobrar', fecha?, importe? } (sin ellos, entera y hoy) o { id, accion: 'deshacer' }.
  if (b.accion === 'cobrar' || b.accion === 'deshacer') {
    const r = b.accion === 'cobrar' ? await cobrarFactura(u, antes.id, { fecha: b.fecha, importe: b.importe }, hoy()) : await deshacerCobro(u, antes.id);
    if (r.error) return error(r.error, r.status || 400);
    await secundarios(u, { facturas: [r.factura.id] });
    return Response.json({ ok: true, ...estadoCobro(r.factura), ...(r.extra || {}) });
  }
  if (Object.keys(b).length === 2 && 'cobrada' in b) {
    // Lo cobrado por el banco se deshace desde Banco: si no, el movimiento queda emparejado con una factura sin cobrar.
    if (!b.cobrada && (await enlazadosCon(u, 'factura', antes.id)).length) return error('Este cobro está enlazado con un movimiento del banco: deshaz primero el emparejamiento en Banco', 409);
    // La fecha del cobro: para el estado de pago (Ley Crea y Crece) y el asiento del cobro.
    // Volver a dejarla sin cobrar suma riesgo al cliente: no puede pasar de su riesgo máximo.
    const r = await conLimiteDe(u, antes.cliente, () => actualizarFactura(u, antes.id, async (actual) => {
      const nueva = { ...actual, cobrada: Boolean(b.cobrada), cobro: b.cobrada ? actual.cobro || { fecha: hoy(), metodo: 'manual' } : undefined };
      const { bloqueo } = await revisarRiesgo(u, actual.cliente, pendienteDe(nueva) - pendienteDe(actual));
      return bloqueo ? { error: bloqueo.error, status: 409 } : { nueva };
    }));
    if (r.error) return error(r.error, r.status || 400);
    await secundarios(u, { facturas: [r.factura.id] });
    return Response.json({ ok: true });
  }
  if (antes.verifactu) return error('Esta factura ya está registrada en Verifactu: para corregirla, haz una rectificativa');
  const datos = limpiar(b, actividadesDe(u), fiscalDe(u).tipo === 'sociedad', { rectificativa: Boolean(antes.rectifica || antes.serie === 'R') });
  if (datos.error) return Response.json({ error: datos.error, errores: datos.errores }, { status: 400 });
  if (Number(datos.fecha.slice(0, 4)) !== antes.anio) return error(`La fecha debe ser de ${antes.anio}`);
  // Sobre la factura de ahora: lo cobrado o enviado mientras se editaba se conserva.
  // Si sube lo que queda por cobrar (o pasa a otro cliente), el cliente no puede quedar por encima de su riesgo máximo.
  const r = await conLimiteDe(u, datos.cliente, () => actualizarFactura(u, antes.id, async (actual) => {
    if (actual.verifactu) return { error: 'Esta factura ya está registrada en Verifactu: para corregirla, haz una rectificativa' };
    const nueva = { ...actual, evento: undefined, proyecto: undefined, operacion: undefined, ...datos };
    const mas = pendienteDe(nueva) - (mismoCliente(actual.cliente, nueva.cliente) ? pendienteDe(actual) : 0);
    const { bloqueo } = await revisarRiesgo(u, nueva.cliente, mas);
    return bloqueo ? { error: bloqueo.error, status: 409 } : { nueva };
  }));
  if (r.error) return error(r.error, r.status || 400);
  await guardarCliente(u, datos.cliente);
  await secundarios(u, { facturas: [r.factura.id], meses: [antes.fecha, datos.fecha] });
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  // El número no se libera y queda constancia de la borrada (lib/facturas.js borrarFactura).
  const r = await borrarFactura(u, id).catch((e) => ({ error: e.message }));
  if (r.error) return error(r.error, r.status || 400);
  const antes = r.factura;
  // Sus albaranes vuelven a estar por facturar.
  await soltarAlbaranes(u, antes);
  await auditar(u, 'Factura borrada', `${numeroFactura(antes)} · ${antes.cliente?.nombre || ''} · ${antes.base} € sin IVA`);
  await secundarios(u, { meses: [antes.fecha] });
  return Response.json({ ok: true });
}
