import { requerirDespacho } from '@/lib/despachoPagina';
import { conversaciones } from '@/lib/mensajesDespacho';
import { hoy } from '@/lib/formato';
import Ir from '@/components/Ir';
import Vacio from '@/components/Vacio';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mensajes · Mi despacho' };

const cuando = (iso, dia) => (iso.slice(0, 10) === dia ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }));

// Mensajes: una conversación por cliente, como una app de mensajería. Arriba, las que tienen algo sin leer.
export default async function Mensajes() {
  const { u, d } = await requerirDespacho();
  const dia = hoy();
  const lista = await conversaciones(d, u.id);
  const conMensajes = lista.filter((c) => c.ultimo), sin = lista.filter((c) => !c.ultimo);
  const fila = (c) => <li key={c.id}>
    <Ir className={`fila desp-conversacion${c.noLeidos ? ' nueva' : ''}`} href={`/despacho/mensajes/${encodeURIComponent(c.id)}`}>
      <span className="desp-avatar" aria-hidden>{c.nombre.trim()[0]?.toUpperCase() || '·'}</span>
      <span className="txt">
        <strong>{c.nombre}</strong>
        <small>{c.ultimo ? `${c.ultimo.lado === 'despacho' ? 'Tú: ' : ''}${c.ultimo.doc && c.ultimo.primero ? `(${c.ultimo.doc.texto}) ` : ''}${c.ultimo.texto}` : 'Aún no habéis hablado'}</small>
      </span>
      <span className="desp-conversacion-v">
        {c.ultimo && <time dateTime={c.ultimo.fecha}>{cuando(c.ultimo.fecha, dia)}</time>}
        {c.noLeidos > 0 && <b aria-label={`${c.noLeidos} sin leer`}>{c.noLeidos}</b>}
      </span>
    </Ir>
  </li>;
  return <main className="pagina mk-look despacho">
    <h1 className="titulo">Mensajes</h1>
    <p className="desp-sub">Habla con tus clientes sin salir de Fisquo. Les llega a su app, en Tu gestoría, y te contestan aquí.</p>
    {lista.length > 1 && <div className="desp-acciones desp-mensajes-acciones">
      <Ir className="boton sec" href="/despacho/mensajes/varios">Escribir a varios</Ir>
      <Ir className="boton sec" href="/despacho/ajustes/plantillas">Mensajes guardados</Ir>
    </div>}
    {conMensajes.length > 0 && <ul className="grupo-lista desp-conversaciones">{conMensajes.map(fila)}</ul>}
    {sin.length > 0 && <section className="grupo" aria-labelledby="msg-sin">
      <h2 className="grupo-t" id="msg-sin">Empezar una conversación</h2>
      <ul className="grupo-lista desp-conversaciones">{sin.map(fila)}</ul>
    </section>}
    {!lista.length && <Vacio icono="usuarios" titulo="Aún no tienes clientes">Cuando un cliente te dé acceso, podrás escribirle desde aquí.</Vacio>}
  </main>;
}
