import { requerir } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { listarClientes } from '@/lib/tercerosServidor';
import { filtrarFichas, nombreForma } from '@/lib/terceros';
import { eur } from '@/lib/formato';
import Ir from '@/components/Ir';
import Volver from '@/components/Volver';
import { FiltrosFichas, UsoRiesgo } from '@/components/FichaCliente';
import '@/app/fichas.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Clientes({ searchParams }) {
  const u = await requerir('facturas');
  const lista = await listarClientes(u);
  const filtros = await searchParams || {};
  const visibles = filtrarFichas(lista, filtros);
  return <main className="pagina mk-look fichas-pagina">
    <Volver href="/mas">Más</Volver>
    <div className="ficha-cabecera"><h1 className="titulo">Clientes</h1>{puede(u, 'facturar') && <Ir className="boton" href="/clientes/nuevo">+ Nuevo cliente</Ir>}</div>
    <p className="resumen-linea">{lista.length} clientes · Te deben {eur(lista.reduce((s, c) => s + c.riesgo, 0))} · {lista.filter((c) => c.excedido).length} por encima de su límite</p>
    <FiltrosFichas lista={lista} filtros={filtros} />
    {visibles.length ? <ul className="grupo-lista">{visibles.map((c) => <li key={c.id}><Ir className="fila ficha-fila" href={`/clientes/${encodeURIComponent(c.id)}`}><span className="txt"><strong>{c.nombre}</strong><small>{[c.nif, c.zona, c.comercial, nombreForma(c.formaCobro)].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</small></span><UsoRiesgo cliente={c} /></Ir></li>)}</ul>
      : <div className="vacio"><p>{lista.length ? 'No hay clientes con estos filtros' : 'Aún no hay clientes'}</p><p>{lista.length ? 'Prueba con otro nombre o cambia los filtros.' : 'Crea tu primera ficha para tener sus datos y cobros a mano.'}</p></div>}
  </main>;
}
