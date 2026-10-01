import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { siguienteNumero } from '@/lib/calculos';
import { hoy } from '@/lib/formato';
import { actividadesDe } from '@/lib/empresa';
import { numeroPresupuesto } from '@/lib/presupuestos';
import SinBD from '@/components/SinBD';
import Volver from '@/components/Volver';
import FormPresupuesto from '@/components/FormPresupuesto';

export const dynamic = 'force-dynamic';

export default async function Nuevo() {
  const u = await requerir('facturar');
  const [presupuestos, clientes] = await Promise.all([leer(u, 'presupuestos'), leer(u, 'clientes')]);
  if (!presupuestos) return <SinBD />;
  const h = hoy();
  const anio = Number(h.slice(0, 4));
  return (
    <main className="pagina">
      <Volver href="/presupuestos">Presupuestos</Volver>
      <h1 className="titulo">Nuevo presupuesto</h1>
      <FormPresupuesto clientes={clientes} actividades={actividadesDe(u)} hoy={h} numero={numeroPresupuesto({ numero: siguienteNumero(presupuestos, anio, 'P'), anio })} />
    </main>
  );
}
