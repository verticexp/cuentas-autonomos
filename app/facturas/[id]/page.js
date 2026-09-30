import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leer, leerUno } from '@/lib/redis';
import { apartar, numeroFactura, vencida, vencimiento } from '@/lib/calculos';
import { eur } from '@/lib/formato';
import { fechaCorta, hoy } from '@/lib/formato';
import FormFactura from '@/components/FormFactura';
import Volver from '@/components/Volver';
import { Borrar, Cobrada } from '@/components/Acciones';
import { puede } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

export default async function Factura({ params }) {
  const u = await requerir('facturas');
  const { id } = await params;
  const [f, clientes] = await Promise.all([leerUno(u, 'facturas', id), leer(u, 'clientes')]);
  if (!f) notFound();
  const editar = puede(u, 'facturar');
  return (
    <main className="pagina">
      <Volver href="/facturas">Facturas</Volver>
      <header className="cabecera">
        <h1 className="titulo">Factura {numeroFactura(f)}</h1>
        {editar ? <Cobrada id={f.id} cobrada={f.cobrada} /> : <span className={`estado ${f.cobrada ? 'ok' : 'pend'}`}>{f.cobrada ? 'Cobrada' : 'Pendiente'}</span>}
      </header>
      <div className="acciones-factura">
        <Link href={`/facturas/${f.id}/pdf`} className="boton">Ver / descargar PDF</Link>
        {editar && <>
        <Link href={`/facturas/nueva?duplica=${f.id}`} className="boton sec">Duplicar</Link>
        {!f.serie && <Link href={`/facturas/nueva?rectifica=${f.id}`} className="boton sec">Rectificar</Link>}
        <Borrar url={`/api/facturas?id=${f.id}`} pregunta={`¿Borrar la factura ${numeroFactura(f)}? Hacienda exige numeración correlativa: si ya la has enviado, mejor haz una rectificativa.`} volver="/facturas" />
        </>}
      </div>
      {f.base > 0 && (() => { const a = apartar(f); return <p className="aviso-plazo"><strong>De esta factura, aparta {eur(a.total)} para Hacienda</strong><span>IVA {eur(a.iva)} + IRPF que te faltará en el 130 ≈ {eur(a.irpf)}</span></p>; })()}
      {f.rectifica && <p className="nota">Rectifica la factura {f.rectifica.numero}.</p>}
      {!f.cobrada && <p className={vencida(f, u.emisor?.plazo, hoy()) ? 'error' : 'nota'}>Vence el {fechaCorta(vencimiento(f, u.emisor?.plazo))}.</p>}
      <fieldset className="solo-ver" disabled={!editar}><FormFactura key={JSON.stringify(f)} factura={f} clientes={clientes} /></fieldset>
    </main>
  );
}
