import { notFound } from 'next/navigation';
import { textos, idiomaActual } from '@/lib/idiomaServidor';
import { conHuecos } from '@/lib/huecos';
import { mesEnIdioma } from '@/lib/textos/mes';
import { requerir } from '@/lib/auth';
import { leerUno } from '@/lib/redis';
import { hhmm } from '@/lib/jornada';
import { eur } from '@/lib/formato';
import Ir from '@/components/Ir';
import { FormNomina } from '@/components/Nominas';
import { Borrar } from '@/components/Acciones';
import Volver from '@/components/Volver';
import '../../nominas.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Nomina({ params }) {
  const u = await requerir('nominas');
  const tr = await textos();
  const idioma = await idiomaActual();
  const n = await leerUno(u, 'nominas', (await params).id);
  if (!n) notFound();
  return (
    <main className="pagina mk-look">
      <Volver href="/nominas">Equipo y nóminas</Volver>
      <header className="cabecera"><h1 className="titulo">{n.empleadoNombre}</h1></header>
      <p className="nota">{tr(n.tipo === 'finiquito' ? 'Finiquito de {mes}' : 'Nómina de {mes}', { mes: mesEnIdioma(n.mes, idioma) })}</p>
      {n.horas && (
        <p className="nota nomina-horas">
          {conHuecos(
            n.extras ? tr('{enlace}: {trabajadas} h trabajadas de {teoricas} h de su jornada · {extra} h extra pagadas ({importe}, incluidas en el bruto)', { trabajadas: hhmm(n.horas.trabajadas), teoricas: hhmm(n.horas.teoricas), extra: hhmm(n.horas.extra), importe: eur(n.extras.importe) })
              : n.horas.extra > 0 ? tr('{enlace}: {trabajadas} h trabajadas de {teoricas} h de su jornada · {extra} h por encima de su jornada', { trabajadas: hhmm(n.horas.trabajadas), teoricas: hhmm(n.horas.teoricas), extra: hhmm(n.horas.extra) })
              : tr('{enlace}: {trabajadas} h trabajadas de {teoricas} h de su jornada', { trabajadas: hhmm(n.horas.trabajadas), teoricas: hhmm(n.horas.teoricas) }),
            { enlace: <Ir href={`/jornada?mes=${n.mes}`}>{tr('Registro de jornada')}</Ir> },
          )}
        </p>
      )}
      {!n.agrupada && <p><a className="boton sec" href={`/api/nominas/recibo?id=${encodeURIComponent(n.id)}`}>{tr('Descargar el recibo (PDF)')}</a></p>}
      <FormNomina nomina={n} />
      <div className="acciones-factura"><Borrar url={`/api/nominas?id=${n.id}`} pregunta={tr('¿Borrar esta nómina? También se quita su gasto.')} volver="/nominas" /></div>
    </main>
  );
}

export async function generateMetadata({ params }) {
  const u = await requerir('nominas');
  const tr = await textos();
  const d = await leerUno(u, 'nominas', (await params).id);
  return { title: d ? tr('Nómina · {mes}', { mes: mesEnIdioma(d.mes, await idiomaActual()) }) : tr('Nómina') };
}
