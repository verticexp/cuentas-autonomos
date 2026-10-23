import { notFound } from 'next/navigation';
import { identidadDoc } from '@/lib/documento';
import { requerir } from '@/lib/auth';
import { leerUno } from '@/lib/redis';
import { numeroFactura } from '@/lib/calculos';
import { nombreArchivoDoc } from '@/lib/formato';
import Volver from '@/components/Volver';
import VistaA4 from '@/components/VistaA4';
import DescargarPdf from '@/components/DescargarPdf';
import FacturaA4 from '@/components/FacturaA4';
import '../../../factura.css';
import { faltanDatosFactura } from '@/lib/empresa';
import Ir from '@/components/Ir';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const u = await requerir('facturas');
  const f = u && (await leerUno(u, 'facturas', (await params).id));
  return { title: f ? nombreArchivoDoc(numeroFactura(f), f.cliente.nombre).replace(/ /g, '-') : 'Factura' };
}

export default async function PDF({ params }) {
  const u = await requerir('facturas');
  const f = await leerUno(u, 'facturas', (await params).id);
  if (!f) notFound();
  const c = f.cliente;
  const { emisor: EMISOR, marca } = await identidadDoc(u, f);
  const faltan = faltanDatosFactura(EMISOR);
  if (faltan.length) {
    return <main className="aviso"><h1>Faltan datos para el PDF</h1><p>Toda factura lleva tu nombre, NIF y dirección. Te falta: {faltan.join(', ')}.</p><p><Ir href="/ajustes/facturacion" className="boton">Completar en Ajustes › Datos de la empresa</Ir></p></main>;
  }

  const nombre = `${nombreArchivoDoc(numeroFactura(f), c.nombre)}.pdf`;
  return (
    <div className="pdf-fondo" style={{ paddingTop: 0 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', marginBottom: 12 }}>
        <div style={{ marginBottom: -8 }}><Volver href={`/facturas/${f.id}`}>Factura {numeroFactura(f)}</Volver></div>
        <DescargarPdf id={f.id} nombre={nombre} />
      </div>
      <VistaA4><FacturaA4 f={f} e={EMISOR} marca={marca} /></VistaA4>
    </div>
  );
}
