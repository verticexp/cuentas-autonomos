import Ir from '@/components/Ir';
import { textos } from '@/lib/idiomaServidor';
import { comentariosDe, leidoDe, noLeidos } from '@/lib/comentariosDespacho';
import { peticionesDe, pendientes } from '@/lib/peticionesDespacho';
import '@/app/despacho.css';

// En el Resumen del cliente: si su gestoría (lib/despachos.js) le ha escrito y no lo ha leído, o le ha pedido algún
// documento, un aviso que lleva a la conversación (app/tu-gestoria).
export default async function AvisoMensajes({ u }) {
  if (!u?.despachoCliente || u.despachoCliente.pendiente || u.viaDespacho) return null;
  const tr = await textos();
  const [hilos, leido, peticiones] = await Promise.all([comentariosDe(u.empresa, { despacho: u.despachoCliente.id }), leidoDe(u.empresa), peticionesDe(u.empresa, { despacho: u.despachoCliente.id, ctx: u })]);
  const n = noLeidos(hilos, leido, 'cliente');
  const p = pendientes(peticiones).length;
  if (!n && !p) return null;
  const detalle = [n && (n === 1 ? tr('1 mensaje sin leer') : tr('{n} mensajes sin leer', { n })), p && (p === 1 ? tr('te pide 1 documento') : tr('te pide {p} documentos', { p }))].filter(Boolean).join(' · ');
  return <Ir href="/tu-gestoria" className="aviso-mensajes">
    <span className="aviso-mensajes-ico" aria-hidden><svg viewBox="0 0 24 24"><path d="M5 5h14a2 2 0 012 2v9a2 2 0 01-2 2h-7l-5 4v-4H5a2 2 0 01-2-2V7a2 2 0 012-2z" /></svg></span>
    <span className="txt"><strong>{p && !n ? tr('{nombre} te pide algo', { nombre: u.despachoCliente.nombre }) : tr('{nombre} te ha escrito', { nombre: u.despachoCliente.nombre })}</strong><small>{detalle[0].toUpperCase() + detalle.slice(1)}</small></span>
  </Ir>;
}
