import { redirect } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { listarProveedores } from '@/lib/tercerosServidor';
import { valoresDe } from '@/lib/terceros';
import FichaProveedor from '@/components/FichaProveedor';
import Volver from '@/components/Volver';
import '@/app/fichas.css';
import '@/app/mk.css';

export default async function NuevoProveedor() {
  const u = await requerir('gastos');
  if (!puede(u, 'gastar')) redirect('/gastos/proveedores');
  const fichas = (await listarProveedores(u)).map((p) => p.ficha);
  return <main className="pagina mk-look fichas-pagina"><Volver href="/gastos/proveedores">Proveedores</Volver><h1 className="titulo">Nuevo proveedor</h1><FichaProveedor comerciales={valoresDe(fichas, 'comercial')} zonas={valoresDe(fichas, 'zona')} /></main>;
}
