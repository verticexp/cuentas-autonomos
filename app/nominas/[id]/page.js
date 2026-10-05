import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leerUno } from '@/lib/redis';
import { nombreMes } from '@/lib/nominas';
import { hhmm } from '@/lib/jornada';
import { eur } from '@/lib/formato';
import Ir from '@/components/Ir';
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
      {n.horas && (
        <p className="nota nomina-horas">
          <Ir href={`/jornada?mes=${n.mes}`}>Registro de jornada</Ir>: {hhmm(n.horas.trabajadas)} h trabajadas de {hhmm(n.horas.teoricas)} h de su jornada
          {n.extras ? ` · ${hhmm(n.horas.extra)} h extra pagadas (${eur(n.extras.importe)}, incluidas en el bruto)` : n.horas.extra > 0 ? ` · ${hhmm(n.horas.extra)} h por encima de su jornada` : ''}
        </p>
      )}
      <FormNomina nomina={n} />
      <div className="acciones-factura"><Borrar url={`/api/nominas?id=${n.id}`} pregunta="¿Borrar esta nómina? También se quita su gasto." volver="/nominas" /></div>
    </main>
  );
}
