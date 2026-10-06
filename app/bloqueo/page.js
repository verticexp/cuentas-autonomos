import { redirect } from 'next/navigation';
import { desbloqueada, usuarioActual } from '@/lib/auth';
import RecargarBloqueo from '@/components/RecargarBloqueo';

export const dynamic = 'force-dynamic';

// Adonde manda el servidor sin desbloquear: solo la pantalla de bloqueo (la pinta app/layout.js), sin datos.
// Al desbloquear se recarga y vuelve a la página de antes.
export default async function PaginaBloqueo({ searchParams }) {
  if (!(await usuarioActual())) redirect('/login');
  const a = String((await searchParams).a || '/');
  if (await desbloqueada()) redirect(/^\/(?![/\\])/.test(a) && !a.startsWith('/bloqueo') ? a : '/');
  return <main className="pagina"><RecargarBloqueo /></main>;
}
