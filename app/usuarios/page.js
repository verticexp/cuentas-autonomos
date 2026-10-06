import { redirect } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { perfilDe, permisosDe, puede } from '@/lib/permisos';
import Usuarios from '@/components/Usuarios';
import Volver from '@/components/Volver';
import { membresias } from '@/lib/membresias';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const yo = await requerir();
  if (!puede(yo, 'usuarios') && !yo.admin) redirect('/ajustes');
  const [todos, empresas] = await Promise.all([redis.hgetall('usuarios'), yo.admin ? redis.hgetall('empresas') : null]);
  const usuarios = Object.values(todos || {});
  const lista = usuarios
    .filter((o) => membresias(o)[yo.empresa])
    .map((o) => ({ o, m: membresias(o)[yo.empresa] }))
    .map(({ o, m }) => ({ id: o.id, nombre: o.nombre, email: o.email, rol: m.rol || 'admin', permisos: permisosDe(m), perfil: perfilDe(m), activo: Boolean(o.pass) }))
    .sort((a, b) => (a.rol === b.rol ? a.nombre.localeCompare(b.nombre) : a.rol === 'admin' ? -1 : 1));
  const listaEmpresas = empresas && Object.values(empresas).map((e) => ({
    id: e.id, nombre: e.nombre, personas: usuarios.filter((o) => membresias(o)[e.id]).length,
  })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  return (
    <main className="pagina">
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="titulo">Usuarios</h1>
      <Usuarios lista={puede(yo, 'usuarios') ? lista : null} yo={yo.id} empresa={yo.empresaNombre} empresas={listaEmpresas} miEmpresa={yo.empresa} soyAdmin={yo.rol === 'admin'} />
    </main>
  );
}
