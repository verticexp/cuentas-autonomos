import Vacio from '@/components/Vacio';
import Link from 'next/link';
import Ir from '@/components/Ir';
import { requerir } from '@/lib/auth';
import { clave, leer, leerUno, redis } from '@/lib/redis';
import { numeroFactura } from '@/lib/calculos';
import { diasSinCerrar, fondoInicial, totalCierre } from '@/lib/caja';
import { festivoNacional } from '@/lib/festivos';
import DiaSinCaja from '@/components/DiaSinCaja';
import { actividadesDe, fiscalDe, usaIgic } from '@/lib/empresa';
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
  const igic = usaIgic(fiscalDe(u));
  const recientes = await documentos(u, 'facturas', fichas.filter((f) => f.k).sort((a, b) => b.o - a.o).slice(0, 7).map((f) => f.id));
  const lista = (productos || []).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const ver = sp.ver === 'importar' ? 'importar' : 'cierre';
  // Días sin cierre (lib/caja.js): los que se suelen abrir, de las dos últimas semanas, sin los marcados como «no abrí».
  const h = hoy();
  const cerrados = Object.keys((await redis.hgetall(clave(u, 'cajaCerrados'))) || {});
  const sinCerrar = cierre ? [] : diasSinCerrar(fichas.filter((f) => f.k).map((f) => f.f), h, { cerrados, festivo: festivoNacional }).reverse();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha || '') && sp.fecha <= h ? sp.fecha : h;
  // Fondo con el que se abre: lo contado en el último arqueo (de los cierres recientes) anterior al día del cierre.
  const fondo = fondoInicial(recientes, cierre?.fecha || fecha);
  return (
    <main className="pagina mk-look caja">
      <Volver href={cierre ? `/facturas/${cierre.id}` : '/facturas'}>{cierre ? 'Cierre' : 'Facturas'}</Volver>
      <h1 className="titulo">{cierre?.caja ? `Corregir el cierre ${numeroFactura(cierre)}` : 'Caja'}</h1>
      {!cierre && <nav className="segmentado" aria-label="Vista de caja"><Ir href="/facturas/caja" tipo="fundido" className={ver === 'cierre' ? 'activo' : ''}>Cierre del día</Ir><Ir href="/facturas/caja?ver=importar" tipo="fundido" className={ver === 'importar' ? 'activo' : ''}>Importar del TPV</Ir></nav>}
      {sinCerrar.length > 0 && ver === 'cierre' && (
        <section className="bloque caja-sin" id="sin-cerrar">
          <h2 className="grupo-t">{sinCerrar.length === 1 ? 'Un día sin cierre' : `${sinCerrar.length} días sin cierre`}</h2>
          <ul className="grupo-lista">
            {sinCerrar.map((d) => <li key={d} className="fila caja-sin-dia"><span className="txt"><strong>{fechaTexto(d)}</strong><small>{new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' })}</small></span><span className="caja-sin-acc"><Ir href={`/facturas/caja?fecha=${d}#nuevo-cierre`} tipo="fundido" className="boton pequeno">Apuntar</Ir><DiaSinCaja fecha={d} /></span></li>)}
          </ul>
          <p className="grupo-pie">Son los días en que sueles abrir y no tienen cierre. Si no abriste, márcalo y no se vuelve a avisar.</p>
        </section>
      )}
      {ver === 'cierre' || cierre ? (
        <>
          <div id="nuevo-cierre"><FormCierre key={cierre?.id || fecha} igic={igic} hoy={h} fecha={fecha} fondo={fondo} actividades={actividades} productos={lista} cierre={cierre?.caja ? cierre : null} ivaDefecto={actividades[0].ivaPct ?? (igic ? 7 : 21)} proyectos={nombresProyectos(facturas)} /></div>
          <p className="grupo-pie">Para tiendas con TPV o caja registradora: cada cierre es una factura simplificada de resumen (serie Z) que cuenta en el {igic ? 'IGIC' : 'IVA'}, la contabilidad (el efectivo en caja, la tarjeta en el banco) y los libros registro. No va a Verifactu: los tiques ya los registra tu TPV.</p>
        </>
      ) : (
        <ImportarVentas actividades={actividades} />
      )}
      {!cierre && (
        <section className="bloque">
          <h2 className="grupo-t">Últimos cierres</h2>
          {!recientes.length && <Vacio compacto icono="factura" titulo="Aún no hay cierres" accion={{ href: '/facturas/caja#nuevo-cierre', texto: 'Añadir cierre' }} />}
          <ul className="grupo-lista">
            {recientes.map((f) => <li key={f.id}><Link href={`/facturas/${f.id}`} className="fila"><span className="txt"><strong>{fechaTexto(f.fecha)}</strong><small>{numeroFactura(f)} · efectivo {eur(f.caja.efectivo)} · tarjeta {eur(f.caja.tarjeta)}{f.importado ? ` · importado de ${f.importado}` : ''}</small></span><span className="imp">{eur(totalCierre(f))}</span></Link></li>)}
          </ul>
        </section>
      )}
    </main>
  );
}

export const metadata = { title: 'Caja' };
