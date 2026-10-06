import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leerUno } from '@/lib/redis';
import { numeroFactura } from '@/lib/calculos';
import Volver from '@/components/Volver';
import VistaA4 from '@/components/VistaA4';
import DescargarPdf from '@/components/DescargarPdf';
import FacturaA4 from '@/components/FacturaA4';
import '../../../factura.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const u = await requerir('facturas');
  const f = u && (await leerUno(u, 'facturas', (await params).id));
  return { title: f ? `${numeroFactura(f)}-${f.cliente.nombre.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}` : 'Factura' };
}

export default async function PDF({ params }) {
  const u = await requerir('facturas');
  const f = await leerUno(u, 'facturas', (await params).id);
  if (!f) notFound();
  const c = f.cliente;
  const EMISOR = u.emisor || {};
  if (!EMISOR.nif || !EMISOR.iban) {
    return <main className="aviso"><h1>Faltan tus datos de facturación</h1><p>Rellena tu nombre, NIF, dirección e IBAN en <a href="/ajustes">Ajustes</a> para generar el PDF.</p></main>;
  }

  const nombre = `${numeroFactura(f)} ${c.nombre.toUpperCase().replace(/[^A-Z0-9ÀÈÉÍÒÓÚÇÑ ]+/g, '').trim()}.pdf`;
  return (
    <div className="pdf-fondo" style={{ paddingTop: 0 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', marginBottom: 12 }}>
        <div style={{ marginBottom: -8 }}><Volver href={`/facturas/${f.id}`}>Factura {numeroFactura(f)}</Volver></div>
        <DescargarPdf id={f.id} nombre={nombre} />
      </div>
      <VistaA4><FacturaA4 f={f} e={EMISOR} marca={u.marca} /></VistaA4>
    </div>
  );
}
