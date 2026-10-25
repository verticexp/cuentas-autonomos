import { notFound } from 'next/navigation';
import { proyectosDe } from '@/lib/stockServidor';
import { requerir } from '@/lib/auth';
import { leer, leerUno } from '@/lib/redis';
import { hoy } from '@/lib/formato';
import FormGasto from '@/components/FormGasto';
import Volver from '@/components/Volver';
import { Borrar } from '@/components/Acciones';
import { puede } from '@/lib/permisos';
import { usaIgic, actividadesDe, fiscalDe, trimestresPresentados } from '@/lib/empresa';
import { eur } from '@/lib/formato';
import { veSueldos } from '@/lib/nominas';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Gasto({ params }) {
  const u = await requerir('gastos');
  const id = decodeURIComponent((await params).id);
  const [g, productos] = await Promise.all([leerUno(u, 'gastos', id), leer(u, 'productos')]);
  const stockProductos = fiscalDe(u).inventario ? (productos || []).filter((p) => !p.servicio).sort((a, b) => a.nombre.localeCompare(b.nombre)) : [];
  // La nómina de una persona, solo con el permiso «Nóminas» (Codex H2).
  if (!g || (g.nomina && !veSueldos(u))) notFound();
  return (
    <main className="pagina mk-look gastos-formulario">
      <Volver href="/gastos">Gastos</Volver>
      <fieldset className="solo-ver" disabled={!puede(u, 'gastar')}><FormGasto presentados={trimestresPresentados(u)} igic={usaIgic(fiscalDe(u))} especial={Object.values(u.prorrata?.especial || {}).some(Boolean)} recargo={fiscalDe(u).iva === 'recargo'} hoy={hoy()} gasto={g} actividades={actividadesDe(u)} alquiler={fiscalDe(u).alquiler} retenciones={fiscalDe(u).trabajadores} regimen={fiscalDe(u).tipo} productos={stockProductos} proyectos={puede(u, 'gastar') ? await proyectosDe(u) : []} /></fieldset>
      {g.dieta && <p className="nota">{g.dieta.quien === 'titular' ? `Pagaste ${eur(g.dieta.pagado)}; deducible ${eur(g.dieta.deducible)}${g.dieta.exceso ? `, ${eur(g.dieta.exceso)} por encima del límite` : ''}.` : `Exento para el trabajador: ${eur(g.dieta.exento)}${g.dieta.exceso ? `; los ${eur(g.dieta.exceso)} de más van en su nómina con retención` : ''}.`}</p>}
      {puede(u, 'gastar') && <div style={{ marginTop: 16 }}><Borrar url={`/api/gastos?id=${encodeURIComponent(g.id)}`} pregunta={`¿Borrar «${g.concepto}»?`} volver="/gastos" /></div>}
    </main>
  );
}

export async function generateMetadata({ params }) {
  const u = await requerir('gastos');
  const d = await leerUno(u, 'gastos', decodeURIComponent((await params).id));
  return { title: d && !(d.nomina && !veSueldos(u)) ? `Gasto · ${d.concepto}` : 'Gasto' };
}
