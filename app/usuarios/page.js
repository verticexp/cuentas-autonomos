import { redirect } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { perfilDe, permisosDe, puede } from '@/lib/permisos';
import Usuarios from '@/components/Usuarios';
import Volver from '@/components/Volver';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const yo = await requerir();
  if (!puede(yo, 'usuarios') && !yo.admin) redirect('/ajustes');
  const [todos, empresas] = await Promise.all([redis.hgetall('usuarios'), yo.admin ? redis.hgetall('empresas') : null]);
  const usuarios = Object.values(todos || {});
  const lista = usuarios
    .filter((o) => (o.empresa || o.id) === yo.empresa)
    .map((o) => ({ id: o.id, nombre: o.nombre, email: o.email, rol: o.rol || 'admin', permisos: permisosDe({ rol: o.rol || 'admin', permisos: o.permisos }), perfil: perfilDe({ rol: o.rol || 'admin', permisos: o.permisos }), activo: Boolean(o.pass) }))
    .sort((a, b) => (a.rol === b.rol ? a.nombre.localeCompare(b.nombre) : a.rol === 'admin' ? -1 : 1));
  const listaEmpresas = empresas && Object.values(empresas).map((e) => ({
    id: e.id, nombre: e.nombre, personas: usuarios.filter((o) => (o.empresa || o.id) === e.id).length,
  })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  return (
    <main className="pagina">
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="titulo">Usuarios</h1>
      <Usuarios lista={puede(yo, 'usuarios') ? lista : null} yo={yo.id} empresa={yo.empresaNombre} empresas={listaEmpresas} miEmpresa={yo.empresa} />
    </main>
  );
}
