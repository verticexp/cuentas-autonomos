import { requerirDespacho } from '@/lib/despachoPagina';
import { conversaciones } from '@/lib/mensajesDespacho';
import { diaDe, fechaCorta, hoy, hora } from '@/lib/formato';
import Ir from '@/components/Ir';
import Vacio from '@/components/Vacio';
import Avatar from '@/components/Avatar';
import { textos } from '@/lib/idiomaServidor';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Mensajes · Mi despacho') }; }

// Como en el chat («Hoy», «Ayer», el día de la semana) y no la fecha entera para lo de esta semana.
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
function cuando(tr, iso, dia) {
  const d = diaDe(iso);
  const hace = Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 864e5);
  if (hace <= 0) return hora(iso);
  if (hace === 1) return tr('Ayer');
  if (hace < 7) return tr(DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]);
  return fechaCorta(d);
}

// Mensajes: una conversación por cliente, como una app de mensajería. Arriba, las que tienen algo sin leer.
export default async function Mensajes() {
  const tr = await textos();
  const { u, d } = await requerirDespacho();
  const dia = hoy();
  const lista = await conversaciones(d, u.id);
  const conMensajes = lista.filter((c) => c.ultimo), sin = lista.filter((c) => !c.ultimo);
  const fila = (c) => <li key={c.id}>
    <Ir prefetch={false} className={`fila desp-conversacion${c.noLeidos ? ' nueva' : ''}`} href={`/despacho/mensajes/${encodeURIComponent(c.id)}`}>
      <Avatar nombre={c.nombre} size={40} />
      <span className="txt">
        <strong>{c.nombre}</strong>
        <small>{c.ultimo ? ((mensaje) => (c.ultimo.lado === 'despacho' ? tr('Tú: {mensaje}', { mensaje }) : mensaje))(`${c.ultimo.doc && c.ultimo.primero ? `(${c.ultimo.doc.texto}) ` : ''}${c.ultimo.texto}`) : tr('Aún no habéis hablado')}</small>
      </span>
      <span className="desp-conversacion-v">
        {c.ultimo && <time dateTime={c.ultimo.fecha}>{cuando(tr, c.ultimo.fecha, dia)}</time>}
        {c.noLeidos > 0 && <b aria-label={tr('{n} sin leer', { n: c.noLeidos })}>{c.noLeidos}</b>}
      </span>
    </Ir>
  </li>;
  return <main className="pagina mk-look despacho">
    <h1 className="titulo">{tr('Mensajes')}</h1>
    <p className="desp-sub">{tr('Habla con tus clientes sin salir de Fisquo. Les llega a su app, en Tu gestoría, y te contestan aquí.')}</p>
    {lista.length > 1 && <div className="desp-acciones desp-mensajes-acciones">
      <Ir prefetch={false} className="boton sec" href="/despacho/mensajes/varios">{tr('Escribir a varios')}</Ir>
      <Ir prefetch={false} className="boton sec" href="/despacho/ajustes/plantillas">{tr('Mensajes guardados')}</Ir>
    </div>}
    {conMensajes.length > 0 && <ul className="grupo-lista desp-conversaciones">{conMensajes.map(fila)}</ul>}
    {sin.length > 0 && <section className="grupo" aria-labelledby="msg-sin">
      <h2 className="grupo-t" id="msg-sin">{tr('Empezar una conversación')}</h2>
      <ul className="grupo-lista desp-conversaciones">{sin.map(fila)}</ul>
    </section>}
    {!lista.length && <Vacio icono="usuarios" titulo={tr('Aún no tienes clientes')}>{tr('Cuando un cliente te dé acceso, podrás escribirle desde aquí.')}</Vacio>}
  </main>;
}
