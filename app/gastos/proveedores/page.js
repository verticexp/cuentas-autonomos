import { requerir } from '@/lib/auth';
import { listarProveedores } from '@/lib/tercerosServidor';
import { filtrarFichas, nombreForma } from '@/lib/terceros';
import { puede } from '@/lib/permisos';
import { eur, fechaCorta } from '@/lib/formato';
import { FiltrosFichas } from '@/components/FichaCliente';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import '@/app/proveedores.css';
import '@/app/fichas.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Proveedores({ searchParams }) {
  const u = await requerir('gastos');
  const lista = (await listarProveedores(u)).map((p) => ({ ...p, comercial: p.ficha?.comercial, zona: p.ficha?.zona, email: p.ficha?.email }));
  const filtros = await searchParams || {};
  const visibles = filtrarFichas(lista, filtros);
  const debes = lista.reduce((s, p) => s + p.debe, 0);
  return <main className="pagina mk-look fichas-pagina">
    <Volver href="/gastos">Gastos</Volver>
    <div className="ficha-cabecera"><h1 className="titulo">Proveedores</h1>{puede(u, 'gastar') && <Ir className="boton" href="/gastos/proveedores/nuevo">+ Nuevo proveedor</Ir>}</div>
    <p className="resumen-linea">{lista.length} proveedores · <span className={debes > 0 ? 'prov-debe' : ''}>Les debes <strong>{eur(debes)}</strong></span></p>
    <FiltrosFichas lista={lista} filtros={filtros} />
    {visibles.length ? <ul className="grupo-lista">{visibles.map((p) => <li key={p.clave}><Ir className="fila ficha-fila" href={`/gastos/proveedores/${encodeURIComponent(p.clave)}`}><span className="txt"><strong>{p.nombre}</strong><small>{[p.nif, nombreForma(p.ficha?.formaPago), p.zona, p.comercial, `${p.n} ${p.n === 1 ? 'gasto' : 'gastos'}`].filter(Boolean).join(' · ')}{p.debe > 0 ? <span className="prov-debe"> · debes {eur(p.debe)}</span> : p.ultimo ? ` · último ${fechaCorta(p.ultimo)}` : ''}</small></span><span className="imp">{eur(p.total)}</span></Ir></li>)}</ul>
      : <div className="vacio"><p>{lista.length ? 'No hay proveedores con estos filtros' : 'Aún no hay proveedores'}</p><p>{lista.length ? 'Prueba con otro nombre o cambia los filtros.' : 'Crea una ficha o escribe el proveedor al apuntar un gasto para verlo aquí.'}</p></div>}
  </main>;
}
