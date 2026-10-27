import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leer, leerUno } from '@/lib/redis';
import { hoy } from '@/lib/formato';
import FiniquitoNomina from '@/components/FiniquitoNomina';
import Volver from '@/components/Volver';
import '../../../../nominas.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Finiquito' };

export default async function Finiquito({ params }) {
  const u = await requerir('nominas');
  const e = await leerUno(u, 'empleados', (await params).id);
  if (!e) notFound();
  const nominas = (await leer(u, 'nominas')) || [];
  const existente = nominas.find((n) => n.empleado === e.id && n.tipo === 'finiquito');
  return <main className="pagina mk-look">
    <Volver href={`/nominas/empleado/${e.id}`}>{e.nombre}</Volver>
    <header className="cabecera"><h1 className="titulo">Finiquito</h1></header>
    <p>{e.nombre}</p>
    <FiniquitoNomina empleado={e} hoy={hoy()} existente={existente?.id} />
  </main>;
}
