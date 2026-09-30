import Link from 'next/link';
import { requerir } from '@/lib/auth';
import Ajustes from '@/components/Ajustes';
import Controlat from '@/components/Controlat';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const u = await requerir();
  return (
    <main className="pagina">
      <h1 className="titulo">Ajustes</h1>
      <p className="nota">{u.nombre} · {u.email}</p>
      <Ajustes emisor={u.emisor || {}} drive={u.drive} driveError={u.driveError} />
      <Controlat activo={Boolean(u.controlat)} />
      {u.admin && <Link href="/usuarios" className="boton sec ancho">Usuarios e invitaciones</Link>}
      <form method="post" action="/api/logout"><button className="borrar ancho">Cerrar sesión</button></form>
    </main>
  );
}
