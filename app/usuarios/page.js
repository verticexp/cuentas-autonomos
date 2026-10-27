import { redirect } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { PERFILES, perfilDe, permisosDe, puede } from '@/lib/permisos';
import Usuarios from '@/components/Usuarios';
import Volver from '@/components/Volver';
import { membresias } from '@/lib/membresias';
import { textos } from '@/lib/idiomaServidor';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }) {
  const tr = await textos();
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
  // ?invitar=gestoria: llega desde Ajustes › Tu gestoría, con su nombre y email ya puestos y el perfil Gestoría.
  const { invitar } = await searchParams;
  const gestoria = invitar === 'gestoria' && PERFILES.find((p) => p.id === 'gestoria');
  const inicial = gestoria ? { nombre: yo.gestoria?.nombre || '', email: yo.gestoria?.email || '', rol: 'miembro', permisos: gestoria.permisos } : null;
  return (
    <main className="pagina mk-look">
      <Volver href="/ajustes">{tr('Ajustes')}</Volver>
      <h1 className="titulo">{tr('Usuarios')}</h1>
      <Usuarios lista={puede(yo, 'usuarios') ? lista : null} yo={yo.id} empresa={yo.empresaNombre} empresas={listaEmpresas} miEmpresa={yo.empresa} soyAdmin={yo.rol === 'admin'} inicial={inicial} />
    </main>
  );
}

export async function generateMetadata() { return { title: (await textos())('Usuarios') }; }
