import Link from 'next/link';
import { notFound } from 'next/navigation';
import { identidadDoc } from '@/lib/documento';
import { requerir } from '@/lib/auth';
import { leerUno } from '@/lib/redis';
import { NOMBRE, numeroDoc } from '@/lib/albaranes';
import { nombreArchivo } from '@/lib/pdfAlbaran';
import Volver from '@/components/Volver';
import VistaA4 from '@/components/VistaA4';
import DescargarPdf from '@/components/DescargarPdf';
import AlbaranA4 from '@/components/AlbaranA4';
import '../../../factura.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const u = await requerir('facturar');
  const d = u && (await leerUno(u, 'albaranes', (await params).id));
  return { title: d ? nombreArchivo(d).replace(/\.pdf$/, '').replace(/ /g, '-') : 'Albarán' };
}

export default async function PDF({ params, searchParams }) {
  const u = await requerir('facturar');
  const d = await leerUno(u, 'albaranes', (await params).id);
  if (!d || !['albaran', 'pedido'].includes(d.tipo)) notFound();
  const valorado = (await searchParams)?.precios !== '0';
  const { emisor: e, marca } = await identidadDoc(u, d);
  if (!e.nombre) {
    return <main className="aviso"><h1>Faltan tus datos de empresa</h1><p>Rellena tu nombre, NIF y dirección en <a href="/ajustes">Ajustes</a> para generar el PDF.</p></main>;
  }
  const pedido = d.pedido ? await leerUno(u, 'albaranes', d.pedido) : null;
  const url = `/api/albaranes/pdf?id=${encodeURIComponent(d.id)}${valorado ? '' : '&precios=0'}`;
  return (
    <div className="pdf-fondo" style={{ paddingTop: 0 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', marginBottom: 12 }}>
        <div style={{ marginBottom: -8 }}><Volver href={`/albaranes/${d.id}`}>{NOMBRE[d.tipo]} {numeroDoc(d)}</Volver></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <Link href={`/albaranes/${d.id}/pdf${valorado ? '?precios=0' : ''}`} className="boton pequeno sec" replace>{valorado ? 'Ocultar precios' : 'Mostrar precios'}</Link>
          <DescargarPdf id={d.id} nombre={nombreArchivo(d)} url={url} />
        </div>
      </div>
      <VistaA4><AlbaranA4 d={d} e={e} marca={marca} valorado={valorado} pedido={pedido} /></VistaA4>
    </div>
  );
}
