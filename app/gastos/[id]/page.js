import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leerUno } from '@/lib/redis';
import { hoy } from '@/lib/formato';
import FormGasto from '@/components/FormGasto';
import Volver from '@/components/Volver';
import { Borrar } from '@/components/Acciones';
import { puede } from '@/lib/permisos';
import { actividadesDe, fiscalDe } from '@/lib/empresa';
import { eur } from '@/lib/formato';

export const dynamic = 'force-dynamic';

export default async function Gasto({ params }) {
  const u = await requerir('gastos');
  const id = decodeURIComponent((await params).id);
  const g = await leerUno(u, 'gastos', id);
  if (!g) notFound();
  return (
    <main className="pagina">
      <Volver href="/gastos">Gastos</Volver>
      <fieldset className="solo-ver" disabled={!puede(u, 'gastar')}><FormGasto hoy={hoy()} gasto={g} actividades={actividadesDe(u)} alquiler={fiscalDe(u).alquiler} retenciones={fiscalDe(u).trabajadores} /></fieldset>
      {g.dieta && <p className="nota">{g.dieta.quien === 'titular' ? `Pagaste ${eur(g.dieta.pagado)}; deducible ${eur(g.dieta.deducible)}${g.dieta.exceso ? `, ${eur(g.dieta.exceso)} por encima del límite` : ''}.` : `Exento para el trabajador: ${eur(g.dieta.exento)}${g.dieta.exceso ? `; los ${eur(g.dieta.exceso)} de más van en su nómina con retención` : ''}.`}</p>}
      {puede(u, 'gastar') && <div style={{ marginTop: 16 }}><Borrar url={`/api/gastos?id=${encodeURIComponent(g.id)}`} pregunta={`¿Borrar «${g.concepto}»?`} volver="/gastos" /></div>}
    </main>
  );
}
