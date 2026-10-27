import { requerirDespacho } from '@/lib/despachoPagina';
import { clientesVisibles, equipoDe, ROLES_DESPACHO } from '@/lib/despachos';
import Volver from '@/components/Volver';
import EquipoDespacho from '@/components/EquipoDespacho';
import { filasClientes } from '@/lib/panelDespacho';
import { conversaciones } from '@/lib/mensajesDespacho';
import { peticionesDe, pendientes } from '@/lib/peticionesDespacho';
import { periodoDe } from '@/lib/despachoApi';
import { hoy } from '@/lib/formato';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Equipo · Mi despacho' };

// Las personas del despacho y la carga de cada una (sus clientes, los trimestres por revisar, los mensajes sin leer y los
// documentos que esperan), para repartir el trabajo; para el titular, invitar, cambiar el rol o quitar.
export default async function Equipo() {
  const { u, d, rol } = await requerirDespacho();
  const dia = hoy();
  const { anio, t } = periodoDe(undefined, undefined, dia);
  const [equipo, clientes] = await Promise.all([equipoDe(d), clientesVisibles(d, u.id)]);
  const [filas, conv, peticiones] = await Promise.all([
    filasClientes(clientes, anio, t, dia), conversaciones(d, u.id), Promise.all(clientes.map((c) => peticionesDe(c.id, { despacho: d.id }).catch(() => []))),
  ]);
  const estado = Object.fromEntries(filas.map((f) => [f.id, f.estado]));
  const sinLeer = Object.fromEntries(conv.map((c) => [c.id, c.noLeidos]));
  const esperan = Object.fromEntries(clientes.map((c, i) => [c.id, pendientes(peticiones[i]).length]));
  const carga = (id) => {
    const suyos = clientes.filter((c) => (c.empresa.despachoCliente?.gestor || null) === id);
    return { clientes: suyos.length, porRevisar: suyos.filter((c) => estado[c.id] === 'listo').length, sinLeer: suyos.reduce((s, c) => s + (sinLeer[c.id] || 0), 0), esperan: suyos.reduce((s, c) => s + (esperan[c.id] || 0), 0) };
  };
  const cartera = (id) => carga(id).clientes;
  return <main className="pagina mk-look despacho">
    <div className="volver-movil"><Volver href="/despacho/ajustes">Ajustes</Volver></div>
    <h1 className="titulo">Equipo</h1>
    <p className="desp-sub">{d.soloAsignados ? 'Cada gestor ve solo los clientes que tiene asignados; el titular, todos.' : 'Todo el equipo ve a todos los clientes. Puedes limitarlo en Ajustes.'}</p>
    <EquipoDespacho equipo={equipo.map((x) => ({ ...x, rolTexto: ROLES_DESPACHO[x.rol], clientes: cartera(x.id), carga: carga(x.id) }))} sinAsignar={carga(null)} trimestre={`${t}T`} titular={rol === 'titular'} yo={u.id} />
  </main>;
}
