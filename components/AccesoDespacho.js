import Ir from '@/components/Ir';
import { despachoDe, rolEn } from '@/lib/despachos';
import { noLeidosDespacho } from '@/lib/mensajesDespacho';
import '@/app/despacho.css';

// Para la gente de un despacho que está en su propia empresa: la puerta a Mi despacho, bien a la vista (en el móvil no
// hay barra lateral). Va arriba del Resumen, de «Más» y de Ajustes, con los mensajes sin leer de sus clientes.
export default async function AccesoDespacho({ u }) {
  if (!u?.despacho || u.viaDespacho) return null;
  const d = await despachoDe(u.despacho).catch(() => null);
  if (!rolEn(d, u.id)) return null;
  const n = await noLeidosDespacho(d, u.id).catch(() => 0);
  return <Ir href="/despacho" className="acceso-despacho">
    <span className="acceso-despacho-ico" aria-hidden><svg viewBox="0 0 24 24"><path d="M4 21V8l8-5 8 5v13" /><path d="M9 21v-6h6v6" /></svg></span>
    <span className="txt"><strong>Ir a Mi despacho</strong><small>{d.nombre}</small></span>
    {n > 0 && <b className="acceso-despacho-n"><span aria-hidden>{n > 99 ? '99+' : n}</span><span className="sr">{n === 1 ? '1 mensaje nuevo' : `${n} mensajes nuevos`}</span></b>}
  </Ir>;
}
