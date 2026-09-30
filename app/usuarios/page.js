import { requerirAdmin } from '@/lib/auth';
import { redis } from '@/lib/redis';
import Usuarios from '@/components/Usuarios';
import Volver from '@/components/Volver';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const yo = await requerirAdmin();
  const lista = Object.values((await redis.hgetall('usuarios')) || {})
    .map(({ id, nombre, email, admin, pass }) => ({ id, nombre, email, admin: Boolean(admin), activo: Boolean(pass) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  return (
    <main className="pagina">
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="titulo">Usuarios</h1>
      <Usuarios lista={lista} yo={yo.id} />
    </main>
  );
}
