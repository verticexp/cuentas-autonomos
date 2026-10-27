import { redirect } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { listarProveedores } from '@/lib/tercerosServidor';
import { valoresDe } from '@/lib/terceros';
import FichaProveedor from '@/components/FichaProveedor';
import Volver from '@/components/Volver';
import { textos } from '@/lib/idiomaServidor';
import '@/app/fichas.css';
import '@/app/mk.css';

export default async function NuevoProveedor() {
  const u = await requerir('gastos');
  const tr = await textos();
  if (!puede(u, 'gastar')) redirect('/gastos/proveedores');
  const fichas = (await listarProveedores(u)).map((p) => p.ficha);
  return <main className="pagina mk-look fichas-pagina"><Volver href="/gastos/proveedores">{tr('Proveedores')}</Volver><h1 className="titulo">{tr('Nuevo proveedor')}</h1><FichaProveedor comerciales={valoresDe(fichas, 'comercial')} zonas={valoresDe(fichas, 'zona')} /></main>;
}

export async function generateMetadata() {
  return { title: (await textos())('Nuevo proveedor') };
}
