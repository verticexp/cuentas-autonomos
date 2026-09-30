import Link from 'next/link';
import { requerir } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { perfilDe, puede } from '@/lib/permisos';
import Ajustes from '@/components/Ajustes';
import Controlat from '@/components/Controlat';
import Marca from '@/components/Marca';
import Avatar from '@/components/Avatar';
import FaceId from '@/components/FaceId';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const u = await requerir();
  const llaves = Object.entries((await redis.hgetall(`passkeys:${u.id}`)) || {}).map(([id, k]) => ({ id, nombre: k.nombre, creada: k.creada, usada: k.usada || null }));
  const empresa = puede(u, 'empresa');
  return (
    <main className="pagina">
      <h1 className="titulo">Ajustes</h1>
      <div className="perfil">
        <Avatar nombre={u.nombre} size={48} />
        <div><strong>{u.nombre}</strong><small>{u.email}</small><small>{perfilDe(u)} en {u.empresaNombre}</small></div>
      </div>
      {(puede(u, 'usuarios') || u.admin) && <Link href="/usuarios" className="boton sec ancho" style={{ marginBottom: 14 }}>Usuarios y permisos</Link>}
      <FaceId lista={llaves} />
      {empresa && <Marca marca={u.marca} nombre={u.emisor?.nombre} />}
      <Ajustes emisor={u.emisor || {}} drive={u.drive} driveError={u.driveError} empresa={empresa} />
      {empresa && <Controlat activo={Boolean(u.controlat)} />}
      <form method="post" action="/api/logout"><button className="borrar ancho">Cerrar sesión</button></form>
    </main>
  );
}
