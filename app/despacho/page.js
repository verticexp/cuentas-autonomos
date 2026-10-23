import { requerirDespacho } from '@/lib/despachoPagina';
import { clientesVisibles, equipoDe } from '@/lib/despachos';
import { ESTADOS, filasClientes } from '@/lib/panelDespacho';
import { periodoDe } from '@/lib/despachoApi';
import { hoy } from '@/lib/formato';
import Pestanas from '@/components/Pestanas';
import Vacio from '@/components/Vacio';
import PanelDespacho from '@/components/PanelDespacho';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi despacho' };

const PESTANAS = ['todos', 'listo', 'revisado', 'presentado', 'curso'];

// Mi despacho: todos los clientes con el estado de su trimestre. Las cifras de cada uno llegan después (PanelDespacho).
export default async function Despacho({ searchParams }) {
  const { u, d, rol } = await requerirDespacho();
  const q = (await searchParams) || {};
  const dia = hoy();
  const { anio, t } = periodoDe(q.anio, q.t, dia);
  const estado = PESTANAS.includes(q.estado) ? q.estado : 'todos';
  const [clientes, equipo] = await Promise.all([clientesVisibles(d, u.id), equipoDe(d)]);
  const filas = (await filasClientes(clientes, anio, t, dia)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const cuenta = (e) => filas.filter((f) => e === 'todos' || f.estado === e).length;
  const url = (e) => `/despacho?anio=${anio}&t=${t}${e === 'todos' ? '' : `&estado=${e}`}`;
  return <main className="pagina mk-look despacho">
    <div className="desp-cabecera">
      <div>
        <h1 className="titulo">{d.nombre}</h1>
        <p className="desp-sub">{filas.length === 1 ? '1 cliente' : `${filas.length} clientes`}{rol === 'gestor' && d.soloAsignados ? ' asignados a ti' : ''} · {t}T {anio}</p>
      </div>
    </div>
    {filas.length ? <>
      <Pestanas etiqueta="Estado del trimestre" items={PESTANAS.map((e) => ({ href: url(e), texto: e === 'todos' ? 'Todos' : ESTADOS[e], n: e === 'todos' ? 0 : cuenta(e), activo: e === estado, tono: e === 'listo' ? 'aviso' : undefined }))} />
      <div className="pestanas-panel">
        <PanelDespacho filas={filas.filter((f) => estado === 'todos' || f.estado === estado)} equipo={equipo} anio={anio} t={t} estado={estado} hoy={dia} />
      </div>
    </> : <Vacio icono="usuarios" titulo="Aún no tienes clientes en Fisquo">
      <p>Pásales tu código <b>{d.codigo}</b>: al registrarse con él tienen 3 meses gratis y te dan acceso a sus cuentas. Si ya usan Fisquo, lo escriben en Ajustes › Tu gestoría.</p>
    </Vacio>}
  </main>;
}
