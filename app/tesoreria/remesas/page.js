import { usarFuncion } from '@/lib/usoPlan';
import SinPlan from '@/components/SinPlan';
import { requerir } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { leer } from '@/lib/redis';
import { importes, numeroFactura, saldoDe } from '@/lib/calculos';
import { claveProveedor } from '@/lib/proveedores';
import { clienteId } from '@/lib/remesas';
import { hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import SinAcceso from '@/components/SinAcceso';
import SinBD from '@/components/SinBD';
import Remesas from '@/components/Remesas';
import '@/app/mk.css';
import '@/app/remesas.css';

export const dynamic = 'force-dynamic';

export default async function PaginaRemesas() {
  const u = await requerir();
  if (await usarFuncion(u, 'remesas')) return <SinPlan usuario={u} funcion="remesas" />;
  const cobros = puede(u, 'facturar'), pagos = puede(u, 'gastar');
  if (!cobros && !pagos) return <SinAcceso texto="Necesitas permiso para facturar o apuntar gastos para gestionar remesas." />;
  const [facturas, gastos, domiciliaciones, cuentasProv, historial] = await Promise.all([
    cobros ? leer(u, 'facturas') : [], pagos ? leer(u, 'gastos') : [],
    cobros ? leer(u, 'domiciliaciones') : [], pagos ? leer(u, 'cuentasProv') : [], leer(u, 'remesas'),
  ]);
  if (!historial || (cobros && !facturas) || (pagos && !gastos)) return <SinBD />;
  const fechaHoy = hoy();
  const fechaCobro = new Date(Date.parse(`${fechaHoy}T12:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10);
  const faltaEmisor = !u.emisor?.iban || !u.emisor?.nombre || (cobros && !u.emisor?.nif);
  return (
    <main className="pagina mk-look remesas">
      <Volver href="/tesoreria">Tesorería</Volver>
      <h1 className="titulo">Remesas SEPA</h1>
      <p className="nota">Sube el archivo a la banca online de tu banco (Remesas / Adeudos SEPA o Transferencias en fichero).</p>
      {faltaEmisor && <p className="nota">Completa tus datos de facturación (nombre, IBAN y NIF) en <Ir href="/ajustes">Ajustes</Ir> para preparar remesas.</p>}
      <Remesas puedeCobrar={cobros} puedePagar={pagos} hoy={fechaHoy} fechaCobro={fechaCobro}
        emisorCobros={Boolean(u.emisor?.iban && u.emisor?.nombre && u.emisor?.nif)} emisorPagos={Boolean(u.emisor?.iban && u.emisor?.nombre)}
        facturas={facturas.filter((f) => !f.cobrada && !f.caja && saldoDe(f) > 0).map((f) => ({ id: f.id, grupo: clienteId(f.cliente?.nombre), nombre: f.cliente?.nombre || 'Sin cliente', concepto: `Factura ${numeroFactura(f)}`, fecha: f.fecha, importe: saldoDe(f) }))}
        gastos={gastos.filter((g) => g.pendiente === true).map((g) => ({ id: g.id, grupo: g.proveedor ? claveProveedor(g) : '', nombre: g.proveedor || 'Sin proveedor', concepto: g.concepto || 'Gasto', fecha: g.fecha, importe: importes(g).total }))}
        domiciliaciones={domiciliaciones || []} cuentasProv={cuentasProv || []}
        historial={historial.filter((r) => (r.tipo === 'cobros' && cobros) || (r.tipo === 'pagos' && pagos)).sort((a, b) => b.creada.localeCompare(a.creada)).slice(0, 50)} />
    </main>
  );
}
