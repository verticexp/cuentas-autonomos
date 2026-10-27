import { notFound } from 'next/navigation';
import { textos } from '@/lib/idiomaServidor';
import { requerir } from '@/lib/auth';
import { leerUno } from '@/lib/redis';
import { hoy } from '@/lib/formato';
import { FormEmpleado } from '@/components/Nominas';
import { Borrar } from '@/components/Acciones';
import Volver from '@/components/Volver';
import '../../../nominas.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Empleado({ params }) {
  const u = await requerir('nominas');
  const tr = await textos();
  const e = await leerUno(u, 'empleados', (await params).id);
  if (!e) notFound();
  return (
    <main className="pagina mk-look">
      <Volver href="/nominas">Equipo y nóminas</Volver>
      <header className="cabecera"><h1 className="titulo">{e.nombre}</h1></header>
      <p><a className="boton sec" href={`/nominas/empleado/${e.id}/finiquito`}>{e.baja ? tr('Calcular o ver finiquito') : tr('Dar de baja y calcular finiquito')}</a></p>
      <FormEmpleado empleado={e} hoy={hoy()} />
      <p className="nota">{tr('Si deja la empresa, pon la fecha de baja en vez de borrarlo: así se queda su historial.')}</p>
      <div className="acciones-factura"><Borrar url={`/api/empleados?id=${e.id}`} pregunta={tr('¿Borrar a {nombre}? Sus nóminas ya hechas se quedan.', { nombre: e.nombre })} volver="/nominas" /></div>
    </main>
  );
}

export async function generateMetadata({ params }) {
  const u = await requerir('nominas');
  const d = await leerUno(u, 'empleados', (await params).id);
  return { title: d?.nombre || (await textos())('Empleado') };
}
