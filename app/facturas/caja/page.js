import Link from 'next/link';
import { requerir } from '@/lib/auth';
import { leer, leerUno, redis } from '@/lib/redis';
import { numeroFactura } from '@/lib/calculos';
import { totalCierre } from '@/lib/caja';
import { actividadesDe } from '@/lib/empresa';
import { eur, fechaTexto, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import Volver from '@/components/Volver';
import FormCierre from '@/components/FormCierre';
import ImportarVentas from '@/components/ImportarVentas';
import { nombresProyectos } from '@/lib/proyectos';
import '@/app/caja.css';
import '@/app/mk.css';
import { documentos, todasFichas } from '@/lib/indices';

export const dynamic = 'force-dynamic';

// Caja: el cierre del día (ventas del TPV o de la caja registradora) y la importación de ventas de un TPV o una tienda online.
export default async function Caja({ searchParams }) {
  const u = await requerir('facturar');
  const sp = await searchParams;
  if (!redis) return <SinBD />;
  // Informe de capacidad E01: los cierres recientes y los proyectos, desde las fichas (no los documentos).
  const [fichas, productos] = await Promise.all([todasFichas(u, 'facturas'), leer(u, 'productos')]);
  const facturas = fichas.map((f) => ({ proyecto: f.pr }));
  const cierre = sp.id ? await leerUno(u, 'facturas', String(sp.id)) : null;
  const actividades = actividadesDe(u);
  const recientes = await documentos(u, 'facturas', fichas.filter((f) => f.k).sort((a, b) => b.o - a.o).slice(0, 7).map((f) => f.id));
  const lista = (productos || []).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const ver = sp.ver === 'importar' ? 'importar' : 'cierre';
  return (
    <main className="pagina mk-look caja">
      <Volver href={cierre ? `/facturas/${cierre.id}` : '/facturas'}>{cierre ? 'Cierre' : 'Facturas'}</Volver>
      <h1 className="titulo">{cierre?.caja ? `Corregir el cierre ${numeroFactura(cierre)}` : 'Caja'}</h1>
      {!cierre && <nav className="segmentado"><Link href="/facturas/caja" className={ver === 'cierre' ? 'activo' : ''}>Cierre del día</Link><Link href="/facturas/caja?ver=importar" className={ver === 'importar' ? 'activo' : ''}>Importar del TPV</Link></nav>}
      {ver === 'cierre' || cierre ? (
        <>
          <FormCierre hoy={hoy()} actividades={actividades} productos={lista} cierre={cierre?.caja ? cierre : null} ivaDefecto={actividades[0].ivaPct ?? 21} proyectos={nombresProyectos(facturas)} />
          <p className="grupo-pie">Para tiendas con TPV o caja registradora: cada cierre es una factura simplificada de resumen (serie Z) que cuenta en el IVA, la contabilidad (el efectivo en caja, la tarjeta en el banco) y los libros registro. No va a Verifactu: los tiques ya los registra tu TPV.</p>
        </>
      ) : (
        <ImportarVentas actividades={actividades} />
      )}
      {!cierre && recientes.length > 0 && (
        <section className="bloque">
          <h2 className="grupo-t">Últimos cierres</h2>
          <ul className="grupo-lista">
            {recientes.map((f) => <li key={f.id}><Link href={`/facturas/${f.id}`} className="fila"><span className="txt"><strong>{fechaTexto(f.fecha)}</strong><small>{numeroFactura(f)} · efectivo {eur(f.caja.efectivo)} · tarjeta {eur(f.caja.tarjeta)}{f.importado ? ` · importado de ${f.importado}` : ''}</small></span><span className="imp">{eur(totalCierre(f))}</span></Link></li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
