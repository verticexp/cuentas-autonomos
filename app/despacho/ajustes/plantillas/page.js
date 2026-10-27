import { requerirDespacho } from '@/lib/despachoPagina';
import { plantillasDe } from '@/lib/plantillasDespacho';
import Volver from '@/components/Volver';
import PlantillasDespacho from '@/components/PlantillasDespacho';
import { textos } from '@/lib/idiomaServidor';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Mensajes guardados · Mi despacho') }; }

// Mensajes guardados (lib/plantillasDespacho.js): se ponen en el chat con un toque o se mandan a varios clientes.
export default async function Plantillas() {
  const tr = await textos();
  const { d } = await requerirDespacho();
  return <main className="pagina mk-look despacho">
    <Volver href="/despacho/ajustes">Ajustes</Volver>
    <h1 className="titulo">{tr('Mensajes guardados')}</h1>
    <p className="desp-sub">{tr('Lo que escribes a menudo a tus clientes. En cada conversación están en el botón de mensajes guardados, y desde Mensajes puedes mandar uno a varios clientes a la vez. Los comparte todo tu equipo.')}</p>
    <PlantillasDespacho plantillas={plantillasDe(d)} />
  </main>;
}
