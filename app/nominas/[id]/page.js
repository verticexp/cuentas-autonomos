import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leerUno } from '@/lib/redis';
import { nombreMes } from '@/lib/nominas';
import { FormNomina } from '@/components/Nominas';
import { Borrar } from '@/components/Acciones';
import Volver from '@/components/Volver';
import '../../nominas.css';

export const dynamic = 'force-dynamic';

export default async function Nomina({ params }) {
  const u = await requerir('nominas');
  const n = await leerUno(u, 'nominas', (await params).id);
  if (!n) notFound();
  return (
    <main className="pagina">
      <Volver href="/nominas">Nóminas</Volver>
      <header className="cabecera"><h1 className="titulo">{n.empleadoNombre}</h1></header>
      <p className="nota">Nómina de {nombreMes(n.mes)}</p>
      <FormNomina nomina={n} />
      <div className="acciones-factura"><Borrar url={`/api/nominas?id=${n.id}`} pregunta="¿Borrar esta nómina? También se quita su gasto." volver="/nominas" /></div>
    </main>
  );
}
