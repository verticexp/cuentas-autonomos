import { redirect } from 'next/navigation';
import { usuarioActual } from '@/lib/auth';
import { despachoDe, invitacionDespacho, ROLES_DESPACHO } from '@/lib/despachos';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invitación a un despacho' };

// La invitación a un despacho de quien ya tenía cuenta: se enseña y se acepta con el botón (api/invitacion/despacho).
export default async function InvitacionDespacho({ searchParams }) {
  const q = (await searchParams) || {};
  const c = typeof q.c === 'string' ? q.c : '';
  const u = await usuarioActual();
  if (!u) redirect(`/login?error=${encodeURIComponent('Entra con tu cuenta y vuelve a abrir el enlace de la invitación.')}`);
  const inv = await invitacionDespacho(c, u.id);
  const d = inv && (await despachoDe(inv.despacho));
  return <main className="pagina mk-look">
    <h1 className="titulo">Invitación a un despacho</h1>
    {d ? <form method="post" action="/api/invitacion/despacho" className="grupo-c relleno formulario">
      <p>Te han invitado a <b>{d.nombre}</b> como {ROLES_DESPACHO[inv.rol].toLowerCase()}. Verás a sus clientes en Mi despacho con tu cuenta de siempre.</p>
      <input type="hidden" name="c" value={c} />
      {q.error && <p className="error" role="alert">No se ha podido aceptar. Pide que te inviten otra vez.</p>}
      <button className="boton">Unirme a {d.nombre}</button>
    </form> : <p className="error" role="alert">Esta invitación ya no es válida: ha caducado, la han anulado o es para otra cuenta. Pide que te inviten otra vez.</p>}
  </main>;
}
