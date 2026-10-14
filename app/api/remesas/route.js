import { randomUUID } from 'node:crypto';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { leer, leerUno, guardar, borrar } from '@/lib/redis';
import { actualizarFactura } from '@/lib/actualizarFactura';
import { auditar } from '@/lib/auditoria';
import { hoy, eur } from '@/lib/formato';
import { claveProveedor } from '@/lib/proveedores';
import { aplicarCobroRemesa, clienteId, fechaValida, prepararCuenta, prepararDomiciliacion, prepararCobros, prepararPagos } from '@/lib/remesas';

export const dynamic = 'force-dynamic';
const PERMISO = { domiciliacion: 'facturar', borrarDomiciliacion: 'facturar', cuentaProveedor: 'gastar', cobros: 'facturar', pagos: 'gastar' };

export async function POST(req) {
  const b = await cuerpo(req);
  const accion = typeof b?.accion === 'string' && Object.hasOwn(PERMISO, b.accion) ? b.accion : '';
  const { u, res } = await usuarioApi({ permiso: PERMISO[accion] });
  if (res) return res;
  if (!accion) return error('Acción de remesa no válida');
  try {
    if (accion === 'domiciliacion' || accion === 'borrarDomiciliacion') {
      if (typeof b.cliente !== 'string' || !b.cliente.trim()) return error('Falta el cliente');
      const id = clienteId(b.cliente);
      if (accion === 'borrarDomiciliacion') {
        await borrar(u, 'domiciliaciones', id);
        return Response.json({ ok: true });
      }
      const cliente = await leerUno(u, 'clientes', id) || (await leer(u, 'facturas')).find((f) => clienteId(f.cliente?.nombre) === id)?.cliente;
      if (!cliente) return error('Ese cliente ya no existe', 404);
      const anterior = await leerUno(u, 'domiciliaciones', id);
      const d = prepararDomiciliacion({ ...b, cliente, anterior, hoy: hoy() });
      if (d.error) return error(d.error);
      await guardar(u, 'domiciliaciones', d);
      return Response.json({ ok: true });
    }
    if (accion === 'cuentaProveedor') {
      if (typeof b.clave !== 'string' || !b.clave.trim()) return error('Falta el proveedor');
      const gasto = (await leer(u, 'gastos')).find((g) => g.proveedor && claveProveedor(g) === b.clave);
      if (!gasto) return error('Ese proveedor ya no existe', 404);
      const c = prepararCuenta({ id: b.clave, nombre: typeof b.nombre === 'string' && b.nombre.trim() ? b.nombre : gasto.proveedor, iban: b.iban, bic: b.bic });
      if (c.error) return error(c.error);
      await guardar(u, 'cuentasProv', c);
      return Response.json({ ok: true });
    }
    if (!fechaValida(b.fecha) || b.fecha < hoy()) return error('Elige una fecha de cobro o ejecución válida, desde hoy');
    if (b.marcar !== undefined && typeof b.marcar !== 'boolean') return error('La opción de marcar debe ser verdadera o falsa');
    const cobros = accion === 'cobros';
    const [documentos, cuentas] = await Promise.all([leer(u, cobros ? 'facturas' : 'gastos'), leer(u, cobros ? 'domiciliaciones' : 'cuentasProv')]);
    const id = randomUUID().replaceAll('-', '');
    const creada = new Date().toISOString();
    const noMarcadas = [];
    const datos = { ids: cobros ? b.facturas : b.gastos, emisor: u.emisor, fecha: b.fecha, id, ahora: creada };
    const r = cobros ? prepararCobros({ ...datos, facturas: documentos, domiciliaciones: cuentas }) : prepararPagos({ ...datos, gastos: documentos, cuentasProv: cuentas });
    if (r.error) return error(r.error);
    if (b.marcar) {
      const importes = new Map(r.operaciones.map((o) => [o.id, o.importe]));
      for (const d of r.documentos) {
        if (!cobros) { await guardar(u, 'gastos', { ...d, pendiente: undefined, pagado: b.fecha }); continue; }
        // El cobro se apunta como un pago de la factura (sin perder los anteriores) y solo si el saldo sigue siendo el
        // del recibo: si cambió mientras tanto, no se marca y se avisa.
        const recibo = importes.get(d.id);
        const m = await actualizarFactura(u, d.id, (f) => aplicarCobroRemesa(f, { fecha: b.fecha, importe: recibo, remesa: id }));
        if (m.error) noMarcadas.push({ id: d.id, error: m.error });
      }
    }
    // Tras el primer adeudo (FRST) de un mandato, los siguientes van como recurrentes (RCUR), se marquen o no las facturas.
    if (cobros) {
      const clientes = new Set(r.documentos.map((f) => clienteId(f.cliente?.nombre)));
      for (const d of cuentas.filter((x) => clientes.has(x.id) && !x.usado)) await guardar(u, 'domiciliaciones', { ...d, usado: true });
    }
    await guardar(u, 'remesas', { id, tipo: accion, fecha: b.fecha, creada, total: r.total, numero: r.numero, docs: r.documentos.map((d) => d.id), msgId: id, por: u.id });
    await auditar(u, 'Remesa SEPA', `${accion} · ${b.fecha} · ${r.numero} operaciones · ${eur(r.total)}${b.marcar ? ' · marcadas' : ''}`);
    return new Response(r.xml, { headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="remesa-${accion}-${b.fecha}.xml"`,
      'X-Remesa': encodeURIComponent(JSON.stringify({ numero: r.numero, total: r.total, errores: r.errores, noMarcadas })),
      'Cache-Control': 'no-store',
    } });
  } catch {
    return error('No se ha podido completar la remesa. Revisa el historial y el estado de los documentos antes de volver a intentarlo.', 500);
  }
}
