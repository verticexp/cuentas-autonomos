import Vacio from '@/components/Vacio';
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
  const lista = await listarProveedores(u);
  const filtros = (await searchParams) || {};
  const visibles = filtrarFichas(lista.map((p) => ({ ...p, comercial: p.ficha?.comercial, zona: p.ficha?.zona, email: p.ficha?.email })), filtros);
  const debes = lista.reduce((s, p) => s + p.debe, 0);
  return (
    <main className="pagina mk-look fichas-pagina">
      <Volver href="/gastos">Gastos</Volver>
      <div className="ficha-cabecera"><h1 className="titulo">Proveedores</h1>{puede(u, 'gastar') && lista.length > 0 && <Ir className="boton" href="/gastos/proveedores/nuevo">+ Nuevo proveedor</Ir>}</div>
      {lista.length > 0 && <p className="resumen-linea"><span>{lista.length === 1 ? '1 proveedor' : `${lista.length} proveedores`}</span>{debes > 0 && <span className="prov-debe">Les debes <strong>{eur(debes)}</strong></span>}</p>}
      {lista.length > 0 && <FiltrosFichas lista={lista.map((p) => p.ficha || {})} filtros={filtros} />}
      {visibles.length ? (
        <ul className="grupo-lista">
          {visibles.map((p) => (
            <li key={p.clave}>
              <Ir href={`/gastos/proveedores/${encodeURIComponent(p.clave)}`} className="fila ficha-fila">
                <span className="txt">
                  <strong>{p.nombre}</strong>
                  <small>{[p.nif, nombreForma(p.ficha?.formaPago), p.zona, p.comercial, p.n === 1 ? '1 gasto' : `${p.n} gastos`].filter(Boolean).join(' · ')}{p.debe <= 0 && p.ultimo ? ` · último ${fechaCorta(p.ultimo)}` : ''}</small>
                  {p.debe > 0 && <small className="prov-debe">Le debes {eur(p.debe)}</small>}
                </span>
                <span className="imp">{eur(p.total)}</span>
              </Ir>
            </li>
          ))}
        </ul>
      ) : <Vacio icono="cliente" tipo={lista.length ? 'resultados' : 'vacio'} titulo={lista.length ? 'Ningún proveedor con estos filtros' : 'Guarda tu primer proveedor'} accion={lista.length ? { href: '/gastos/proveedores', texto: 'Quitar filtros' } : puede(u, 'gastar') && { href: '/gastos/proveedores/nuevo', texto: 'Crear proveedor' }} secundaria={!lista.length && puede(u, 'empresa') && { href: '/ajustes/importar', texto: 'Importar de Excel' }}>{!lista.length && 'Reúne sus datos y pagos en una ficha.'}</Vacio>}
    </main>
  );
}
