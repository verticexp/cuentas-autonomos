import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leerUno } from '@/lib/redis';
import { hoy } from '@/lib/formato';
import FormGasto from '@/components/FormGasto';
import Volver from '@/components/Volver';
import { Borrar } from '@/components/Acciones';

export const dynamic = 'force-dynamic';

export default async function Gasto({ params }) {
  const u = await requerir();
  const id = decodeURIComponent((await params).id);
  const g = await leerUno(u, 'gastos', id);
  if (!g) notFound();
  return (
    <main className="pagina">
      <Volver href="/gastos">Gastos</Volver>
      <FormGasto hoy={hoy()} gasto={g} />
      <div style={{ marginTop: 16 }}><Borrar url={`/api/gastos?id=${encodeURIComponent(g.id)}`} pregunta={`¿Borrar «${g.concepto}»?`} volver="/gastos" /></div>
    </main>
  );
}
