import { requerirDespacho } from '@/lib/despachoPagina';
import { clientesVisibles } from '@/lib/despachos';
import { filasClientes } from '@/lib/panelDespacho';
import { periodoDe } from '@/lib/despachoApi';
import { plantillasDe } from '@/lib/plantillasDespacho';
import { hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import Vacio from '@/components/Vacio';
import EscribirVarios from '@/components/EscribirVarios';
import { ESTADOS_TEXTO } from '@/components/despachoTextos';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Escribir a varios · Mi despacho' };

// Un mismo mensaje a varios clientes: cada uno lo recibe en su conversación (api/despacho/comentarios/varios).
export default async function Varios() {
  const { u, d } = await requerirDespacho();
  const dia = hoy();
  const { anio, t } = periodoDe(undefined, undefined, dia);
  const filas = (await filasClientes(await clientesVisibles(d, u.id), anio, t, dia)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return <main className="pagina mk-look despacho">
    <Volver href="/despacho/mensajes">Mensajes</Volver>
    <h1 className="titulo">Escribir a varios</h1>
    <p className="desp-sub">Cada cliente lo recibe en su conversación, como si le escribieras solo a él. Nadie ve a quién más se lo has mandado.</p>
    {!filas.length ? <Vacio icono="usuarios" titulo="Aún no tienes clientes a quienes escribir" accion={{ href: '/despacho/ajustes', texto: 'Invitar a un cliente' }}>Cuando tus clientes te den acceso a sus cuentas, podrás mandarles el mismo mensaje a varios a la vez desde aquí.</Vacio> : <EscribirVarios clientes={filas.map((f) => ({ id: f.id, nombre: f.nombre, estado: ESTADOS_TEXTO[f.estado], porRevisar: f.estado === 'listo' }))} plantillas={plantillasDe(d)} trimestre={`${t}T`} />}
  </main>;
}
