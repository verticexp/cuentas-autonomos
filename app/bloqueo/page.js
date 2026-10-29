import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { desbloqueada, usuarioActual } from '@/lib/auth';
import RecargarBloqueo from '@/components/RecargarBloqueo';
import { esOrdenador } from '@/lib/biometria';
import { textos } from '@/lib/idiomaServidor';

export const dynamic = 'force-dynamic';

// Adonde manda el servidor sin desbloquear: solo la pantalla de bloqueo (la pinta app/layout.js), sin datos.
// Al desbloquear se recarga y vuelve a la página de antes. En el ordenador no hay bloqueo: vuelve directamente.
export default async function PaginaBloqueo({ searchParams }) {
  if (!(await usuarioActual())) redirect('/login');
  const a = String((await searchParams).a || '/');
  if (esOrdenador((await headers()).get('user-agent')) || (await desbloqueada())) redirect(/^\/(?![/\\])/.test(a) && !a.startsWith('/bloqueo') ? a : '/');
  return <main className="pagina"><RecargarBloqueo /></main>;
}

export async function generateMetadata() { return { title: (await textos())('Desbloquear') }; }
