import { requerirDespacho } from '@/lib/despachoPagina';
import { clientesVisibles, equipoDe, ROLES_DESPACHO } from '@/lib/despachos';
import EquipoDespacho from '@/components/EquipoDespacho';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Equipo · Mi despacho' };

// Las personas del despacho, cuántos clientes lleva cada una y, para el titular, invitar, cambiar el rol o quitar.
export default async function Equipo() {
  const { u, d, rol } = await requerirDespacho();
  const [equipo, clientes] = await Promise.all([equipoDe(d), clientesVisibles(d, u.id)]);
  const cartera = (id) => clientes.filter((c) => c.empresa.despachoCliente?.gestor === id).length;
  return <main className="pagina mk-look despacho">
    <h1 className="titulo">Equipo</h1>
    <p className="desp-sub">{d.soloAsignados ? 'Cada gestor ve solo los clientes que tiene asignados; el titular, todos.' : 'Todo el equipo ve a todos los clientes. Puedes limitarlo en Ajustes.'}</p>
    <EquipoDespacho equipo={equipo.map((x) => ({ ...x, rolTexto: ROLES_DESPACHO[x.rol], clientes: cartera(x.id) }))} titular={rol === 'titular'} yo={u.id} />
  </main>;
}
