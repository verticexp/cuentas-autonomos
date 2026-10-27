import { textos } from '@/lib/idiomaServidor';
import { sinFuncion } from '@/lib/planes';
import SinPlan from '@/components/SinPlan';
import { requerir } from '@/lib/auth';
import { leer, leerUno } from '@/lib/redis';
import { albaranDePedido, numeroDoc, siguiente } from '@/lib/albaranes';
import { actividadesDe } from '@/lib/empresa';
import { inventario } from '@/lib/inventario';
import { datosStock } from '@/lib/stockServidor';
import { hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import Volver from '@/components/Volver';
import FormDoc from '@/components/FormDoc';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';

// Pedido o albarán nuevo. ?pedido=ID: el albarán de lo que falta por servir de ese pedido.
export default async function Nuevo({ searchParams }) {
  const tr = await textos();
  const u = await requerir('facturar');
  if (sinFuncion(u.plan, 'albaranes')) return <SinPlan usuario={u} funcion="albaranes" />;
  const sp = await searchParams;
  const datos = await datosStock(u);
  if (datos.sinBD) return <SinBD />;
  const clientes = ((await leer(u, 'clientes')) || []).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const pedido = sp.pedido ? await leerUno(u, 'albaranes', String(sp.pedido)) : null;
  const tipo = pedido ? 'albaran' : sp.tipo === 'albaran' ? 'albaran' : 'pedido';
  const h = hoy();
  const plantilla = pedido?.tipo === 'pedido' ? albaranDePedido(pedido, datos.albaranes, h) : null;
  const stock = Object.fromEntries(inventario(datos, { hoy: h }).productos.map((p) => [p.id, p.stock]));
  const anio = Number(h.slice(0, 4));
  return (
    <main className="pagina mk-look">
      <Volver href={pedido ? `/albaranes/${pedido.id}` : `/albaranes${tipo === 'albaran' ? '?ver=albaranes' : ''}`} />
      <h1 className="titulo">{(tipo === 'pedido' ? tr("Nuevo pedido") : (pedido ? tr("Entrega del pedido {v1}", { v1: numeroDoc(pedido) }) : tr("Nuevo albarán")))}</h1>
      <FormDoc tipo={tipo} plantilla={plantilla} clientes={clientes} productos={datos.productos.sort((a, b) => a.nombre.localeCompare(b.nombre))} stock={stock} hoy={h}
        ivaPct={actividadesDe(u)[0].ivaPct ?? 21} numero={numeroDoc({ tipo, anio, numero: siguiente(datos.albaranes, tipo, anio) })} />
    </main>
  );
}

// La pestaña dice lo mismo que el título: la entrega de un pedido o un albarán (?tipo=albaran); si no, un pedido.
export async function generateMetadata({ searchParams }) {
  const tr = await textos();
  const sp = await searchParams;
  return { title: (sp.pedido ? tr("Entrega de un pedido") : (sp.tipo === 'albaran' ? tr("Nuevo albarán") : tr("Nuevo pedido"))) };
}
