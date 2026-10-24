import { redirect } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { comentariosDe, leidoDe, mensajesDe } from '@/lib/comentariosDespacho';
import { peticionesDe, pendientes } from '@/lib/peticionesDespacho';
import Volver from '@/components/Volver';
import Avatar from '@/components/Avatar';
import Chat from '@/components/Chat';
import PeticionesCliente from '@/components/PeticionesCliente';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tu gestoría · Mensajes' };

// La conversación del cliente con su gestoría, como la del despacho (app/despacho/mensajes/[empresa]): en el móvil, a
// pantalla completa. Arriba, lo que la gestoría le ha pedido, con su botón para subirlo.
export default async function TuGestoria() {
  const u = await requerir('resumen');
  if (!u.despachoCliente || u.viaDespacho) redirect('/ajustes/gestoria');
  const despacho = u.despachoCliente;
  const [hilos, leido, peticiones] = await Promise.all([comentariosDe(u.empresa, { despacho: despacho.id }), leidoDe(u.empresa), peticionesDe(u.empresa, { despacho: despacho.id, ctx: u })]);
  return <main className="pagina mk-look despacho desp-chat-pagina">
    <header className="chat-cabecera">
      <Volver href="/ajustes/gestoria">Tu gestoría</Volver>
      <span className="chat-quien">
        <Avatar nombre={despacho.nombre} size={36} />
        <span><h1 className="chat-nombre">{despacho.nombre}</h1><small>Tu gestoría</small></span>
      </span>
    </header>
    <PeticionesCliente peticiones={pendientes(peticiones)} compacta />
    <Chat mensajes={mensajesDe(hilos)} lado="cliente" leidoAntes={leido.cliente || ''} nombreOtro={despacho.nombre}
      enviar={{ url: '/api/tu-despacho', metodo: 'PUT', extra: {} }} leer={{ url: '/api/tu-despacho', metodo: 'PATCH', cuerpo: { leer: true } }} comprobar="/api/tu-despacho" vista="/api/tu-despacho/documento"
      vacio={`Escribe a ${despacho.nombre} cuando quieras: le llega a su Fisquo. Si te pregunta por una factura o un gasto, lo verás aquí.`} />
  </main>;
}
