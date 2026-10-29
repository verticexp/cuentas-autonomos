import { requerirDespacho } from '@/lib/despachoPagina';
import { clientesVisibles, equipoDe, solicitudesDe } from '@/lib/despachos';
import { filasClientes } from '@/lib/panelDespacho';
import { periodoDe } from '@/lib/despachoApi';
import { hoy } from '@/lib/formato';
import Pestanas from '@/components/Pestanas';
import Vacio from '@/components/Vacio';
import PanelDespacho from '@/components/PanelDespacho';
import SolicitudesDespacho from '@/components/SolicitudesDespacho';
import { textos } from '@/lib/idiomaServidor';
import { conHuecos } from '@/lib/huecos';
import Ir from '@/components/Ir';
import { esSoloDocumentos } from '@/lib/perfilDocumentos';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Mi despacho') }; }

// Tres pestañas, como Facturas (caben en el móvil): revisados incluye los ya presentados. En curso: el trimestre que aún
// no ha terminado (se ve en la lista).
const PESTANAS = ['todos', 'listo', 'revisado'];
const TEXTO = { todos: 'Todos', listo: 'Por revisar', revisado: 'Revisados' };
const enPestana = (f, e) => e === 'todos' || f.estado === e || (e === 'revisado' && f.estado === 'presentado');

// Mi despacho: todos los clientes con el estado de su trimestre. Las cifras de cada uno llegan después (PanelDespacho).
export default async function Despacho({ searchParams }) {
  const tr = await textos();
  const { u, d, rol } = await requerirDespacho();
  const q = (await searchParams) || {};
  const dia = hoy();
  const { anio, t } = periodoDe(q.anio, q.t, dia);
  const estado = PESTANAS.includes(q.estado) ? q.estado : 'todos';
  const [todos, equipo, solicitudes] = await Promise.all([clientesVisibles(d, u.id), equipoDe(d), rol === 'titular' ? solicitudesDe(d) : []]);
  // Los clientes «solo documentos» (lib/documentos.js) tienen su propia lista: no llevan trimestre, IVA ni IRPF en Fisquo.
  const clientes = todos.filter((c) => !esSoloDocumentos(c.empresa));
  const docs = todos.length - clientes.length;
  const filas = (await filasClientes(clientes, anio, t, dia)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const cuenta = (e) => filas.filter((f) => enPestana(f, e)).length;
  const url = (e) => `/despacho?anio=${anio}&t=${t}${e === 'todos' ? '' : `&estado=${e}`}`;
  return <main className="pagina mk-look despacho">
    {/* La pestaña es «Clientes»: el nombre del despacho ya va en el selector de arriba (y se repetía aquí en grande) */}
    <h1 className="titulo">{tr('Clientes')}</h1>
    <p className="resumen-linea desp-linea">
      <span>{rol === 'gestor' && d.soloAsignados
        ? (filas.length === 1 ? tr('1 cliente asignados a ti · {t}T {anio}', { t, anio }) : tr('{n} clientes asignados a ti · {t}T {anio}', { n: filas.length, t, anio }))
        : (filas.length === 1 ? tr('1 cliente · {t}T {anio}', { t, anio }) : tr('{n} clientes · {t}T {anio}', { n: filas.length, t, anio }))}</span>
      {filas.length > 0 && <a href={`/api/despacho/paquete?todos=1&anio=${anio}&t=${t}`} download>{tr('Descargar todos los paquetes del {t}T ›', { t })}</a>}
    </p>
    <SolicitudesDespacho solicitudes={solicitudes} />
    <p className="desp-linea desp-docs-acceso"><Ir prefetch={false} href="/despacho/solo-documentos">{docs ? (docs === 1 ? tr('1 cliente «solo documentos» ›') : tr('{n} clientes «solo documentos» ›', { n: docs })) : tr('Clientes que solo envían documentos ›')}</Ir></p>
    {filas.length ? <>
      <Pestanas etiqueta="Estado del trimestre" items={PESTANAS.map((e) => ({ href: url(e), texto: TEXTO[e], n: e === 'todos' ? 0 : cuenta(e), activo: e === estado, tono: e === 'listo' ? 'aviso' : undefined }))} />
      <div className="pestanas-panel">
        <PanelDespacho filas={filas.filter((f) => enPestana(f, estado))} equipo={equipo} anio={anio} t={t} estado={estado} hoy={dia} />
      </div>
    </> : <Vacio icono="usuarios" titulo={tr('Aún no tienes clientes en Fisquo')}>
      <p>{conHuecos(tr('Pásales tu código {codigo}: al registrarse con él tienen 3 meses gratis y te piden acceso a sus cuentas, que aceptas aquí. Si ya usan Fisquo, lo escriben en Ajustes › Tu gestoría.'), { codigo: <b>{d.codigo}</b> })}</p>
    </Vacio>}
  </main>;
}
