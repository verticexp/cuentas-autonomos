import Espacio from '@/components/Espacio';
import { requerirDespacho } from '@/lib/despachoPagina';
import { clientesVisibles, equipoDe } from '@/lib/despachos';
import { filasClientes } from '@/lib/panelDespacho';
import { periodoDe } from '@/lib/despachoApi';
import { hoy } from '@/lib/formato';
import Pestanas from '@/components/Pestanas';
import Vacio from '@/components/Vacio';
import PanelDespacho from '@/components/PanelDespacho';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi despacho' };

// Tres pestañas, como Facturas (caben en el móvil): revisados incluye los ya presentados. En curso: el trimestre que aún
// no ha terminado (se ve en la lista).
const PESTANAS = ['todos', 'listo', 'revisado'];
const TEXTO = { todos: 'Todos', listo: 'Por revisar', revisado: 'Revisados' };
const enPestana = (f, e) => e === 'todos' || f.estado === e || (e === 'revisado' && f.estado === 'presentado');

// Mi despacho: todos los clientes con el estado de su trimestre. Las cifras de cada uno llegan después (PanelDespacho).
export default async function Despacho({ searchParams }) {
  const { u, d, rol } = await requerirDespacho();
  const q = (await searchParams) || {};
  const dia = hoy();
  const { anio, t } = periodoDe(q.anio, q.t, dia);
  const estado = PESTANAS.includes(q.estado) ? q.estado : 'todos';
  const [clientes, equipo] = await Promise.all([clientesVisibles(d, u.id), equipoDe(d)]);
  const filas = (await filasClientes(clientes, anio, t, dia)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const cuenta = (e) => filas.filter((f) => enPestana(f, e)).length;
  const url = (e) => `/despacho?anio=${anio}&t=${t}${e === 'todos' ? '' : `&estado=${e}`}`;
  return <main className="pagina mk-look despacho">
    {rol === 'titular' && <Espacio actual="despacho" className="espacio-movil" />}
    <h1 className="titulo">{d.nombre}</h1>
    <p className="resumen-linea desp-linea">
      <span>{filas.length === 1 ? '1 cliente' : `${filas.length} clientes`}{rol === 'gestor' && d.soloAsignados ? ' asignados a ti' : ''} · {t}T {anio}</span>
      {filas.length > 0 && <a href={`/api/despacho/paquete?todos=1&anio=${anio}&t=${t}`} download>Descargar todos los paquetes del {t}T ›</a>}
    </p>
    {filas.length ? <>
      <Pestanas etiqueta="Estado del trimestre" items={PESTANAS.map((e) => ({ href: url(e), texto: TEXTO[e], n: e === 'todos' ? 0 : cuenta(e), activo: e === estado, tono: e === 'listo' ? 'aviso' : undefined }))} />
      <div className="pestanas-panel">
        <PanelDespacho filas={filas.filter((f) => enPestana(f, estado))} equipo={equipo} anio={anio} t={t} estado={estado} hoy={dia} />
      </div>
    </> : <Vacio icono="usuarios" titulo="Aún no tienes clientes en Fisquo">
      <p>Pásales tu código <b>{d.codigo}</b>: al registrarse con él tienen 3 meses gratis y te dan acceso a sus cuentas. Si ya usan Fisquo, lo escriben en Ajustes › Tu gestoría.</p>
    </Vacio>}
  </main>;
}
