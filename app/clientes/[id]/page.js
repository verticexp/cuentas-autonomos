import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { detalleCliente, listarClientes } from '@/lib/tercerosServidor';
import { valoresDe } from '@/lib/terceros';
import { numeroFactura, pendienteDe } from '@/lib/calculos';
import { eur, fechaCorta } from '@/lib/formato';
import { numeroDoc } from '@/lib/albaranes';
import { riesgoAlbaran } from '@/lib/riesgo';
import FichaCliente from '@/components/FichaCliente';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import { UsoRiesgo } from '@/components/FichaCliente';
import '@/app/fichas.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Cliente({ params }) {
  const u = await requerir('facturas');
  const id = decodeURIComponent((await params).id);
  const detalle = await detalleCliente(u, id);
  if (!detalle) notFound();
  const lista = await listarClientes(u);
  const editar = puede(u, 'facturar');
  const facturas = (docs) => <ul className="grupo-lista">{docs.map((f) => <li key={f.id}><Ir className="fila ficha-fila ficha-doc" href={`/facturas/${encodeURIComponent(f.id)}`}><span className="txt"><strong>{numeroFactura(f)}</strong><small>{fechaCorta(f.fecha)}</small></span><span className="imp">Pendiente {eur(pendienteDe(f))}</span></Ir></li>)}</ul>;
  return <main className="pagina mk-look fichas-pagina"><Volver href="/clientes">Clientes</Volver><h1 className="titulo">{detalle.cliente.nombre}</h1>
    <UsoRiesgo cliente={detalle.cliente} panel />
    {editar && <Ir className="boton ficha-nueva-factura" href="/facturas/nueva">Nueva factura</Ir>}
    <section className="bloque"><h2 className="ficha-titulo">Datos del cliente</h2><FichaCliente cliente={detalle.cliente} editar={editar} puedeRiesgo={puede(u, 'empresa')} comerciales={valoresDe(lista, 'comercial')} zonas={valoresDe(lista, 'zona')} borrar={!detalle.facturas.length && !detalle.pendientes.length} /></section>
    <section className="bloque"><h2 className="ficha-titulo">Pendiente de cobro</h2>{detalle.pendientes.length ? facturas(detalle.pendientes) : <p className="nota">No hay facturas pendientes de cobro.</p>}</section>
    {detalle.albaranes.length > 0 && <section className="bloque"><h2 className="ficha-titulo">Albaranes sin facturar</h2><p className="nota">Cuentan en su riesgo hasta que se facturen.</p><ul className="grupo-lista">{detalle.albaranes.map((a) => <li key={a.id}><Ir className="fila ficha-fila" href={`/albaranes/${encodeURIComponent(a.id)}`}><span className="txt"><strong>{numeroDoc(a)}</strong><small>{fechaCorta(a.fecha)}</small></span><span className="imp">{eur(riesgoAlbaran(a))}</span></Ir></li>)}</ul></section>}
    <section className="bloque"><h2 className="ficha-titulo">Últimas facturas</h2>{detalle.facturas.length ? facturas(detalle.facturas) : <p className="nota">Este cliente aún no tiene facturas.</p>}</section>
  </main>;
}
