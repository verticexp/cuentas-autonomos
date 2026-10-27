import { requisitosIncobrable } from '@/lib/incobrables';
import { leerUno } from '@/lib/redis';
import { actualizarFactura } from '@/lib/actualizarFactura';
import { borrarFactura, crearFactura, fechaFueraDeOrden, guardarCliente, limpiar, marcaRecc } from '@/lib/facturas';
import { fechaDevengo, numeroFactura, pendienteDe } from '@/lib/calculos';
import { conLimiteDe, revisarRiesgo } from '@/lib/tercerosServidor';
import { mismoCliente } from '@/lib/terceros';
import { enlazadosCon } from '@/lib/enlacesBanco';
import { cobrarFactura, deshacerCobro, estadoCobro } from '@/lib/cobroManual';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { hoy } from '@/lib/formato';
import { actividadesDe, fiscalDe, limiteSimplificada, usaIgic, usa303 } from '@/lib/empresa';
import { soltarAlbaranes } from '@/lib/albaranesServidor';
import { secundarios } from '@/lib/trabajos';
import { comprobarCierre } from '@/lib/cierres';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // el envío a Verifactu puede esperar al control de flujo de la AEAT

export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const datos = limpiar(b, actividadesDe(u), fiscalDe(u).tipo === 'sociedad', { rectificativa: Boolean(b.rectifica), igic: usaIgic(fiscalDe(u)), conRecargo: usa303(fiscalDe(u)) && !usaIgic(fiscalDe(u)), reagp: fiscalDe(u).iva === 'reagp', limiteSimplificada: limiteSimplificada(fiscalDe(u)) });
  if (datos.error) return Response.json({ error: datos.error, errores: datos.errores }, { status: 400 });
  const original = b.rectifica && (await leerUno(u, 'facturas', b.rectifica));
  if (b.rectifica && !original) return error('La factura a rectificar no existe');
  // Crédito incobrable (art. 80.Cuatro LIVA): solo en su plazo, en negativo y con el cobro reclamado.
  if (original && b.motivoRectificacion === 'incobrable') {
    const r = requisitosIncobrable({ fechaOriginal: original.fecha, fechaRectificativa: datos.fecha, base: original.base });
    if (r.errores.length) return error(r.errores[0]);
    if (!(datos.base < 0)) return error('Por un impago, la rectificativa va en negativo: resta lo que no te han pagado');
    if (b.reclamado !== true) return error('Para recuperar el IVA de un impagado, antes tienes que reclamar el cobro por vía judicial, con requerimiento notarial o por otro medio fehaciente');
  }
  // idem: clave de idempotencia del formulario (doble clic o reintento tras una respuesta perdida).
  // ordenFechas: si la fecha no sigue el orden de su serie, se avisa (409) y el formulario lo reenvía con forzarOrden
  // cuando la persona lo confirma.
  const { factura: f, error: e, riesgo, ordenFechas } = await crearFactura(u, datos, { original, motivo: b.motivoRectificacion, idem: typeof b.idem === 'string' ? `form:${b.idem}` : undefined, ordenFechas: b.forzarOrden !== true });
  if (e) return riesgo ? Response.json({ error: e, riesgo }, { status: 409 }) : ordenFechas ? Response.json({ error: e, ordenFechas: true }, { status: 409 }) : error(e);
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
  // Cobrar a mano: { id, accion: 'cobrar', fecha?, importe?, forma? } (sin ellos, entera y hoy; forma 'efectivo' para un
  // cobro en efectivo, lib/cobroManual.js FORMAS_COBRO) o { id, accion: 'deshacer' }.
  if (b.accion === 'cobrar' || b.accion === 'deshacer') {
    const r = b.accion === 'cobrar' ? await cobrarFactura(u, antes.id, { fecha: b.fecha, importe: b.importe, forma: b.forma }, hoy()) : await deshacerCobro(u, antes.id);
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
  const datos = limpiar(b, actividadesDe(u), fiscalDe(u).tipo === 'sociedad', { rectificativa: Boolean(antes.rectifica || antes.serie === 'R'), igic: usaIgic(fiscalDe(u)), conRecargo: usa303(fiscalDe(u)) && !usaIgic(fiscalDe(u)), reagp: fiscalDe(u).iva === 'reagp', limiteSimplificada: limiteSimplificada(fiscalDe(u)) });
  if (datos.error) return Response.json({ error: datos.error, errores: datos.errores }, { status: 400 });
  if (Number(datos.fecha.slice(0, 4)) !== antes.anio) return error(`La fecha debe ser de ${antes.anio}`);
  // Trimestre cerrado por la gestoría (lib/cierres.js): ni la fecha de antes ni la nueva pueden caer en él, tampoco las de
  // la operación (cuentan en el trimestre de su devengo, lib/calculos.js fechaDevengo).
  const cerrado = await comprobarCierre(u, antes.fecha, fechaDevengo(antes), datos.fecha, fechaDevengo(datos));
  if (cerrado) return error(cerrado, 409);
  // Al cambiar la fecha, se avisa si deja de seguir el orden de su serie (lib/facturas.js fechaFueraDeOrden); con
  // forzarOrden (confirmado en el formulario) se guarda. Si no se toca la fecha, no se mira.
  if (datos.fecha !== antes.fecha && b.forzarOrden !== true) {
    const fuera = await fechaFueraDeOrden(u, { serie: antes.serie || '', anio: antes.anio, numero: antes.numero, fecha: datos.fecha });
    if (fuera) return Response.json({ error: fuera, ordenFechas: true }, { status: 409 });
  }
  // Sobre la factura de ahora: lo cobrado o enviado mientras se editaba se conserva.
  // Si sube lo que queda por cobrar (o pasa a otro cliente), el cliente no puede quedar por encima de su riesgo máximo.
  const r = await conLimiteDe(u, datos.cliente, () => actualizarFactura(u, antes.id, async (actual) => {
    if (actual.verifactu) return { error: 'Esta factura ya está registrada en Verifactu: para corregirla, haz una rectificativa' };
    // Lo opcional que el formulario ya no manda se quita (volver al español, a euros, quitar el recargo…).
    const nueva = { ...actual, evento: undefined, proyecto: undefined, operacion: undefined, accesoria: undefined, idioma: undefined, divisa: undefined, baseDivisa: undefined, oss: undefined, recargo: undefined, recc: undefined, margen: undefined, cuotasIncluidas: undefined, compensacion: undefined, ...datos };
    // Criterio de caja: se recalcula con la nueva fecha; una rectificativa conserva el de su original.
    Object.assign(nueva, nueva.rectifica ? (actual.recc ? { recc: true } : {}) : marcaRecc(u, nueva));
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
