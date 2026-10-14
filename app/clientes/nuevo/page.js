import { redirect } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { listarClientes } from '@/lib/tercerosServidor';
import { valoresDe } from '@/lib/terceros';
import FichaCliente from '@/components/FichaCliente';
import Volver from '@/components/Volver';
import '@/app/fichas.css';
import '@/app/mk.css';

export default async function NuevoCliente() {
  const u = await requerir('facturas');
  if (!puede(u, 'facturar')) redirect('/clientes');
  const lista = await listarClientes(u);
  return <main className="pagina mk-look fichas-pagina"><Volver href="/clientes">Clientes</Volver><h1 className="titulo">Nuevo cliente</h1><FichaCliente puedeRiesgo={puede(u, 'empresa')} comerciales={valoresDe(lista, 'comercial')} zonas={valoresDe(lista, 'zona')} /></main>;
}
