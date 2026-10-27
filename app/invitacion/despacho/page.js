import { redirect } from 'next/navigation';
import { usuarioActual } from '@/lib/auth';
import { despachoDe, invitacionDespacho, ROLES_DESPACHO } from '@/lib/despachos';
import { textos } from '@/lib/idiomaServidor';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Invitación a un despacho') }; }

// La invitación a un despacho de quien ya tenía cuenta: se enseña y se acepta con el botón (api/invitacion/despacho).
export default async function InvitacionDespacho({ searchParams }) {
  const tr = await textos();
  const q = (await searchParams) || {};
  const c = typeof q.c === 'string' ? q.c : '';
  const u = await usuarioActual();
  if (!u) redirect(`/login?error=${encodeURIComponent('Entra con tu cuenta y vuelve a abrir el enlace de la invitación.')}`);
  const inv = await invitacionDespacho(c, u.id);
  const d = inv && (await despachoDe(inv.despacho));
  // El nombre del despacho va en negrita: el texto se parte por donde va.
  const invitado = d ? tr('Te han invitado a {despacho} como {rol}. Verás a sus clientes en Mi despacho con tu cuenta de siempre.', { despacho: '\u0001', rol: tr(ROLES_DESPACHO[inv.rol].toLowerCase()) }).split('\u0001') : [];
  return <main className="pagina mk-look">
    <h1 className="titulo">{tr('Invitación a un despacho')}</h1>
    {d ? <form method="post" action="/api/invitacion/despacho" className="grupo-c relleno formulario">
      <p>{invitado[0]}<b>{d.nombre}</b>{invitado[1]}</p>
      <input type="hidden" name="c" value={c} />
      {q.error && <p className="error" role="alert">{tr('No se ha podido aceptar. Pide que te inviten otra vez.')}</p>}
      <button className="boton">{tr('Unirme a {despacho}', { despacho: d.nombre })}</button>
    </form> : <p className="error" role="alert">{tr('Esta invitación ya no es válida: ha caducado, la han anulado o es para otra cuenta. Pide que te inviten otra vez.')}</p>}
  </main>;
}
