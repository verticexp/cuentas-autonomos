import Ir from '@/components/Ir';
import { comentariosDe, leidoDe, noLeidos } from '@/lib/comentariosDespacho';
import '@/app/despacho.css';

// En el Resumen del cliente: si su gestoría (lib/despachos.js) le ha escrito y no lo ha leído, un aviso que lleva al chat.
export default async function AvisoMensajes({ u }) {
  if (!u?.despachoCliente || u.viaDespacho) return null;
  const [hilos, leido] = await Promise.all([comentariosDe(u.empresa, { despacho: u.despachoCliente.id }), leidoDe(u.empresa)]);
  const n = noLeidos(hilos, leido, 'cliente');
  if (!n) return null;
  return <Ir href="/ajustes/gestoria" className="aviso-mensajes">
    <span className="aviso-mensajes-ico" aria-hidden><svg viewBox="0 0 24 24"><path d="M5 5h14a2 2 0 012 2v9a2 2 0 01-2 2h-7l-5 4v-4H5a2 2 0 01-2-2V7a2 2 0 012-2z" /></svg></span>
    <span className="txt"><strong>{u.despachoCliente.nombre} te ha escrito</strong><small>{n === 1 ? 'Tienes 1 mensaje sin leer' : `Tienes ${n} mensajes sin leer`}</small></span>
  </Ir>;
}
