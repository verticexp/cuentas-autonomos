import Ir from '@/components/Ir';
import { textos } from '@/lib/idiomaServidor';
import { comentariosDe, leidoDe, noLeidos } from '@/lib/comentariosDespacho';
import { peticionesDe, pendientes } from '@/lib/peticionesDespacho';
import '@/app/despacho.css';

// En la cabecera del Resumen del cliente, como en una app de chat: un globo con el número de mensajes de su gestoría
// (lib/despachos.js) sin leer y documentos que le pide, que lleva a la conversación (app/tu-gestoria). Sin nada
// pendiente, el globo sigue ahí, sin número, para escribirle. Sin gestoría, no sale.
export default async function AvisoMensajes({ u }) {
  if (!u?.despachoCliente || u.despachoCliente.pendiente || u.viaDespacho) return null;
  const tr = await textos();
  const [hilos, leido, peticiones] = await Promise.all([comentariosDe(u.empresa, { despacho: u.despachoCliente.id }), leidoDe(u.empresa), peticionesDe(u.empresa, { despacho: u.despachoCliente.id, ctx: u })]);
  const n = noLeidos(hilos, leido, 'cliente');
  const p = pendientes(peticiones).length;
  const total = n + p;
  const partes = [n && (n === 1 ? tr('1 mensaje sin leer') : tr('{n} mensajes sin leer', { n })), p && (p === 1 ? tr('te pide 1 documento') : tr('te pide {p} documentos', { p }))].filter(Boolean);
  const detalle = partes.length === 2 ? tr('{mensajes} y {documentos}', { mensajes: partes[0], documentos: partes[1] }) : partes[0] || '';
  return <Ir href="/tu-gestoria" className={`globo-gestoria${total ? ' con-nuevos' : ''}`} aria-label={`${u.despachoCliente.nombre}${detalle ? `: ${detalle}` : ''}`}>
    <svg viewBox="0 0 24 24" aria-hidden><path d="M5 5h14a2 2 0 012 2v9a2 2 0 01-2 2h-7l-5 4v-4H5a2 2 0 01-2-2V7a2 2 0 012-2z" /></svg>
    {total > 0 && <span className="globo-numero" aria-hidden>{total > 99 ? '99+' : total}</span>}
  </Ir>;
}
