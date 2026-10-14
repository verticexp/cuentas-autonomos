import { leerUno } from '@/lib/redis';
import { actualizarFactura } from '@/lib/actualizarFactura';
import { borrarFactura, crearFactura, guardarCliente, limpiar } from '@/lib/facturas';
import { numeroFactura } from '@/lib/calculos';
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
  const { factura: f, error: e } = await crearFactura(u, datos, { original, motivo: b.motivoRectificacion, idem: typeof b.idem === 'string' ? `form:${b.idem}` : undefined });
  if (e) return error(e);
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
  if (Object.keys(b).length === 2 && 'cobrada' in b) {
    // La fecha del cobro: para el estado de pago (Ley Crea y Crece) y el asiento del cobro.
    const r = await actualizarFactura(u, antes.id, (actual) => ({ nueva: { ...actual, cobrada: Boolean(b.cobrada), cobro: b.cobrada ? actual.cobro || { fecha: hoy(), metodo: 'manual' } : undefined } }));
    if (r.error) return error(r.error, r.status || 400);
    await secundarios(u, { facturas: [r.factura.id] });
    return Response.json({ ok: true });
  }
  if (antes.verifactu) return error('Esta factura ya está registrada en Verifactu: para corregirla, haz una rectificativa');
  const datos = limpiar(b, actividadesDe(u), fiscalDe(u).tipo === 'sociedad', { rectificativa: Boolean(antes.rectifica || antes.serie === 'R') });
  if (datos.error) return Response.json({ error: datos.error, errores: datos.errores }, { status: 400 });
  if (Number(datos.fecha.slice(0, 4)) !== antes.anio) return error(`La fecha debe ser de ${antes.anio}`);
  // Sobre la factura de ahora: lo cobrado o enviado mientras se editaba se conserva.
  const r = await actualizarFactura(u, antes.id, (actual) => (actual.verifactu ? { error: 'Esta factura ya está registrada en Verifactu: para corregirla, haz una rectificativa' }
    : { nueva: { ...actual, evento: undefined, proyecto: undefined, operacion: undefined, ...datos } }));
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
