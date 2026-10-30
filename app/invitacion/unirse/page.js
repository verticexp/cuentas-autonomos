import { redirect } from 'next/navigation';
import { redis } from '@/lib/redis';
import { usuarioActual } from '@/lib/auth';
import { textos } from '@/lib/idiomaServidor';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Invitación a una empresa') }; }

// La invitación a otra empresa de quien ya tenía cuenta (api/usuarios): se enseña y se acepta con el botón
// (api/invitacion/unirse), igual que la de un despacho.
export default async function InvitacionUnirse({ searchParams }) {
  const tr = await textos();
  const q = (await searchParams) || {};
  const c = typeof q.c === 'string' ? q.c : '';
  const u = await usuarioActual();
  if (!u) redirect(`/login?error=${encodeURIComponent('Entra con tu cuenta y vuelve a abrir el enlace de la invitación.')}`);
  const inv = redis && c ? await redis.get(`union:${c}`) : null;
  const emp = inv && inv.usuario === u.id ? await redis.hget('empresas', inv.empresa) : null;
  // El nombre de la empresa va en negrita: el texto se parte por donde va.
  const invitado = emp ? tr('Te han invitado a {empresa}. La verás con tu cuenta de siempre, en el selector de empresas.', { empresa: '\u0001' }).split('\u0001') : [];
  return <main className="pagina mk-look">
    <h1 className="titulo">{tr('Invitación a una empresa')}</h1>
    {emp && !emp.baja ? <form method="post" action="/api/invitacion/unirse" className="grupo-c relleno formulario">
      <p>{invitado[0]}<b>{emp.nombre}</b>{invitado[1]}</p>
      <input type="hidden" name="c" value={c} />
      <button className="boton">{tr('Unirme a {empresa}', { empresa: emp.nombre })}</button>
    </form> : <p className="error" role="alert">{tr('Esta invitación ya no es válida: ha caducado, la han anulado o es para otra cuenta. Pide que te inviten otra vez.')}</p>}
  </main>;
}
