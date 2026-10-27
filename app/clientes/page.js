import Vacio from '@/components/Vacio';
import { requerir } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { listarClientes } from '@/lib/tercerosServidor';
import { filtrarFichas, nombreForma } from '@/lib/terceros';
import { eur } from '@/lib/formato';
import Ir from '@/components/Ir';
import Volver from '@/components/Volver';
import { textos } from '@/lib/idiomaServidor';
import { FiltrosFichas, UsoRiesgo } from '@/components/FichaCliente';
import '@/app/fichas.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Clientes({ searchParams }) {
  const tr = await textos();
  const u = await requerir('facturas');
  const lista = await listarClientes(u);
  const filtros = await searchParams || {};
  const visibles = filtrarFichas(lista, filtros);
  return <main className="pagina mk-look fichas-pagina">
    <Volver href="/mas">Más</Volver>
    <div className="ficha-cabecera"><h1 className="titulo">{tr('Clientes')}</h1>{puede(u, 'facturar') && lista.length > 0 && <Ir className="boton" href="/clientes/nuevo">{tr('+ Nuevo cliente')}</Ir>}</div>
    {lista.length > 0 && <p className="resumen-linea">{lista.length === 1 ? tr('1 cliente') : tr('{n} clientes', { n: lista.length })} · {tr('Te deben {importe}', { importe: eur(lista.reduce((s, c) => s + c.riesgo, 0)) })} · {tr('{n} por encima de su límite', { n: lista.filter((c) => c.excedido).length })}</p>}
    {lista.length > 0 && <FiltrosFichas lista={lista} filtros={filtros} />}
    {visibles.length ? <ul className="grupo-lista">{visibles.map((c) => <li key={c.id}><Ir className="fila ficha-fila" href={`/clientes/${encodeURIComponent(c.id)}`}><span className="txt"><strong>{c.nombre}</strong><small>{[c.nif, c.zona, c.comercial, tr(nombreForma(c.formaCobro))].filter(Boolean).join(' · ') || tr('Sin datos de contacto')}</small></span><UsoRiesgo cliente={c} /></Ir></li>)}</ul>
      : <Vacio icono="cliente" tipo={lista.length ? 'resultados' : 'vacio'} titulo={lista.length ? tr('Ningún cliente con estos filtros') : tr('Guarda tu primer cliente')} accion={lista.length ? { href: '/clientes', texto: tr('Quitar filtros') } : puede(u, 'facturar') && { href: '/clientes/nuevo', texto: tr('Crear cliente') }} secundaria={!lista.length && puede(u, 'empresa') && { href: '/ajustes/importar', texto: tr('Importar de Excel') }}>{!lista.length && tr('Ten sus datos a mano para la próxima factura.')}</Vacio>}
  </main>;
}

export async function generateMetadata() { return { title: (await textos())('Clientes') }; }
