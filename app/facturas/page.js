import Link from 'next/link';
import { enviarLuego } from '@/lib/verifactuEnvio';
import Ir from '@/components/Ir';
import { requerir } from '@/lib/auth';
import { leer, redis } from '@/lib/redis';
import { contar, documentos, fichasRango, pagina, totales, vencidaFicha, vencidas as vencidasHoy } from '@/lib/indices';
import { importes, numeroFactura, r2, vencida } from '@/lib/calculos';
import { actividadesDe, nombresActividad } from '@/lib/empresa';
import FilaFactura from '@/components/FilaFactura';
import { eur, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import { puede } from '@/lib/permisos';
import Deslizable from '@/components/Deslizable';
import Buscar from '@/components/Buscar';
import HojaFiltro from '@/components/HojaFiltro';
import '@/app/recurrentes.css';
import '@/app/filtros.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';
const diaMes = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default async function Facturas({ searchParams }) {
  const u = await requerir('facturas');
  enviarLuego(u); // Verifactu: si quedó algo por enviar (control de flujo de la AEAT), ahora
  // Informe de capacidad E01: la lista va por páginas sobre el índice (lib/indices.js), sin descargar el histórico.
  // «Por cobrar» y las vencidas salen de las facturas sin cobrar, no de la página visible.
  if (!redis) return <SinBD />;
  const ACTIVIDADES = nombresActividad(actividadesDe(u));
  const { a, estado, q, desde } = await searchParams;
  const buscado = String(q || '').trim().toLowerCase();
  const h = hoy();
  const plazo = u.emisor?.plazo;
  // E06: «Por cobrar» sale del total precalculado y las vencidas, del índice por vencimiento (no de todas las pendientes).
  const [total, { pc }, vencidas, recurrentes] = await Promise.all([contar(u, 'facturas'), totales(u, 'facturas', ['pc']), vencidasHoy(u, plazo, h), leer(u, 'recurrentes')]);
  const estadoDe = (f) => (f.cobrada ? 'cobrada' : vencida(f, plazo, h) ? 'vencida' : 'pendiente');
  const porCobrar = r2(pc);
  // La búsqueda va por el índice de texto (todos los conceptos, revisión S06); el resto, por la ficha.
  const filtro = (f) => (!ACTIVIDADES[a] || f.a === a) && (estado !== 'vencidas' || vencidaFicha(f, plazo, h));
  const conFiltro = Boolean(ACTIVIDADES[a] || estado === 'vencidas');
  const pag = await pagina(u, 'facturas', { cursor: desde, marca: ['pendientes', 'vencidas'].includes(estado) ? 'p' : undefined, filtro: conFiltro ? filtro : undefined, buscar: buscado });
  const lista = await documentos(u, 'facturas', pag.ids);

  // Agrupadas por mes, con lo facturado de cada uno (el mes entero con el mismo filtro, aunque siga en otra página).
  const grupos = [];
  for (const f of lista) {
    const m = f.fecha.slice(0, 7);
    if (grupos.at(-1)?.m !== m) grupos.push({ m, facturas: [] });
    grupos.at(-1).facturas.push(f);
  }
  // E06: sin búsqueda ni «vencidas», el total del mes es un total precalculado (todas o sin cobrar, por actividad).
  const precalculado = !buscado && estado !== 'vencidas';
  const campoMes = (m) => `${estado === 'pendientes' ? 'mp' : 'm'}:${m}${ACTIVIDADES[a] ? `:${a}` : ''}`;
  const delMes = precalculado ? await totales(u, 'facturas', grupos.map((g) => campoMes(g.m))) : {};
  const totalMes = precalculado ? Object.fromEntries(grupos.map((g) => [g.m, delMes[campoMes(g.m)]])) : Object.fromEntries(await Promise.all(grupos.map(async (g) => {
    const fichas = await fichasRango(u, 'facturas', `${g.m}-01`, `${g.m}-31`, { textos: Boolean(buscado) });
    return [g.m, fichas.filter((f) => filtro(f) && (!buscado || f.x.includes(buscado)) && (!['pendientes', 'vencidas'].includes(estado) || !f.co)).reduce((s, f) => s + f.b, 0)];
  })));
  const url = (cambios) => {
    const p = new URLSearchParams(Object.entries({ a, estado, q, ...cambios }).filter(([, v]) => v));
    return `/facturas${p.size ? `?${p}` : ''}`;
  };

  return (
    <main className="pagina mk-look">
      <header className="cabecera">
        <h1 className="titulo">Facturas</h1>
        {puede(u, 'facturar') && <Ir href="/facturas/nueva" tipo="subir" className="boton pequeno">Nueva factura</Ir>}
      </header>

      <nav className="segmentado vt">
        <Ir href="/facturas" tipo="fundido" className="activo">Facturas</Ir>
        <Ir href="/presupuestos" tipo="fundido">Presupuestos</Ir>
      </nav>

      {total > 0 && (
        <p className="resumen-linea solo-pc">
          <span>Por cobrar <strong>{eur(porCobrar)}</strong></span>
          {vencidas.length > 0 && <span className="rojo">{vencidas.length === 1 ? '1 vencida' : `${vencidas.length} vencidas`}</span>}
          {recurrentes?.length > 0 && <Link href="/facturas/recurrentes" className="rec-enlace">{recurrentes.length === 1 ? '1 recurrente' : `${recurrentes.length} recurrentes`} ›</Link>}
          {puede(u, 'facturar') && <Link href="/facturas/catalogo" className="rec-enlace">Catálogo ›</Link>}
          {u.fiscal?.inventario && <Link href="/inventario" className="rec-enlace">Inventario ›</Link>}
          {u.fiscal?.inventario && puede(u, 'facturar') && <Link href="/albaranes" className="rec-enlace">Pedidos y albaranes ›</Link>}
          {puede(u, 'facturar') && <Link href="/facturas/caja" className="rec-enlace">Caja ›</Link>}
          {puede(u, 'resumen') && <a href={`/api/efactura?anio=${h.slice(0, 4)}`} className="rec-enlace" download>Estado de pagos ›</a>}
        </p>
      )}

      {total > 0 && (
        <>
          {/* Móvil: resumen fijo arriba y un botón «Filtrar» (en el ordenador siguen la línea de arriba y las fichas de abajo) */}
          <div className="resumen-fijo solo-movil">
            <p className="resumen-fijo-t">
              <span>Por cobrar <strong>{eur(porCobrar)}</strong></span>
              {vencidas.length > 0 && <Link href={url({ estado: estado === 'vencidas' ? null : 'vencidas' })} className="rojo">{vencidas.length === 1 ? '1 vencida' : `${vencidas.length} vencidas`}</Link>}
            </p>
            <HojaFiltro titulo="Filtrar facturas" activos={(ACTIVIDADES[a] ? 1 : 0) + (['pendientes', 'vencidas'].includes(estado) ? 1 : 0)}>
              {Object.keys(ACTIVIDADES).length > 1 && (
                <section className="filtro-grupo">
                  <h3>Actividad</h3>
                  <ul className="filtro-ops">
                    <li><Link href={url({ a: null })} className="filtro-op" aria-current={!ACTIVIDADES[a] ? 'true' : undefined}>Todas</Link></li>
                    {Object.entries(ACTIVIDADES).map(([id, n]) => <li key={id}><Link href={url({ a: id })} className="filtro-op" aria-current={a === id ? 'true' : undefined}>{n}</Link></li>)}
                  </ul>
                </section>
              )}
              <section className="filtro-grupo">
                <h3>Estado</h3>
                <ul className="filtro-ops">
                  <li><Link href={url({ estado: null })} className="filtro-op" aria-current={!['pendientes', 'vencidas'].includes(estado) ? 'true' : undefined}>Todas</Link></li>
                  <li><Link href={url({ estado: 'pendientes' })} className="filtro-op" aria-current={estado === 'pendientes' ? 'true' : undefined}>Sin cobrar<small>{eur(porCobrar)}</small></Link></li>
                  {vencidas.length > 0 && <li><Link href={url({ estado: 'vencidas' })} className="filtro-op" aria-current={estado === 'vencidas' ? 'true' : undefined}>Vencidas<small>{vencidas.length}</small></Link></li>}
                </ul>
              </section>
              {(recurrentes?.length > 0 || puede(u, 'resumen')) && (
                <section className="filtro-grupo">
                  <h3>Más</h3>
                  <ul className="filtro-ops">
                    {recurrentes?.length > 0 && <li><Link href="/facturas/recurrentes" className="filtro-op">Facturas recurrentes<small>{recurrentes.length}</small></Link></li>}
                    {puede(u, 'resumen') && <li><a href={`/api/efactura?anio=${h.slice(0, 4)}`} className="filtro-op" download>Estado de pagos (descargar)</a></li>}
                  </ul>
                </section>
              )}
            </HojaFiltro>
          </div>
          {(ACTIVIDADES[a] || ['pendientes', 'vencidas'].includes(estado)) && (
            <div className="filtros-activos solo-movil" aria-label="Filtros activos">
              {ACTIVIDADES[a] && <Link href={url({ a: null })} aria-label={`Quitar el filtro ${ACTIVIDADES[a]}`}>{ACTIVIDADES[a]}</Link>}
              {estado === 'pendientes' && <Link href={url({ estado: null })} aria-label="Quitar el filtro Sin cobrar">Sin cobrar</Link>}
              {estado === 'vencidas' && <Link href={url({ estado: null })} aria-label="Quitar el filtro Vencidas">Vencidas</Link>}
            </div>
          )}
        </>
      )}

      {total > 5 && <Buscar action="/facturas" q={q} ocultos={{ a, estado }} placeholder="Buscar cliente, número o concepto" />}

      <Deslizable className="chips solo-pc">
        <Link href={url({ a: null })} className={!ACTIVIDADES[a] ? 'activo' : ''}>Todas</Link>
        {Object.entries(ACTIVIDADES).map(([id, n]) => <Link key={id} href={url({ a: id })} className={a === id ? 'activo' : ''}>{n}</Link>)}
        <Link href={url({ estado: estado === 'pendientes' ? null : 'pendientes' })} className={estado === 'pendientes' ? 'activo' : ''}>Sin cobrar</Link>
        {vencidas.length > 0 && <Link href={url({ estado: estado === 'vencidas' ? null : 'vencidas' })} className={estado === 'vencidas' ? 'activo' : ''}>Vencidas</Link>}
      </Deslizable>

      {grupos.map((g) => {
        const [y, m] = g.m.split('-');
        return (
          <section key={g.m} className="grupo-mes">
            <h2><span>{MESES[m - 1]} {y !== h.slice(0, 4) ? y : ''}</span><small>{eur(r2(totalMes[g.m] || 0))} sin IVA</small></h2>
            <ul className="grupo-lista">
              {g.facturas.map((f) => {
                const e = estadoDe(f);
                return (
                  <li key={f.id}>
                    <FilaFactura href={`/facturas/${f.id}`}>
                      <span className="txt">
                        <strong data-vt="cliente">{f.cliente.nombre}</strong>
                        <small>{f.caja ? 'Cierre de caja · ' : ''}{numeroFactura(f)} · {diaMes(f.fecha)}{!a && Object.keys(ACTIVIDADES).length > 1 ? ` · ${ACTIVIDADES[f.actividad]}` : ''}</small>
                      </span>
                      <span className="imp-col">
                        <span className="imp" data-vt="total">{eur(importes(f).total)}</span>
                        <span className={`estado-txt e-${e}`}>{e === 'cobrada' ? 'Cobrada' : e === 'vencida' ? 'Vencida' : 'Pendiente'}</span>
                      </span>
                    </FilaFactura>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {pag.siguiente && <p className="grupo-pie"><Link href={url({ desde: pag.siguiente })} className="boton sec">Ver más</Link></p>}

      {!lista.length && (
        <div className="vacio">
          {total ? <><p>{buscado ? `Nada con «${q}»` : 'Nada con este filtro'}</p><p>{buscado ? 'Prueba con otra palabra o quita la búsqueda.' : 'Prueba con otra actividad o quita el filtro.'}</p></> : <>
            <p>Aún no has hecho ninguna factura</p>
            <p>Se numeran solas y puedes descargarlas en PDF con tu logo.</p>
            {puede(u, 'facturar') && <Ir href="/facturas/nueva" tipo="subir" className="boton">Crear la primera</Ir>}
            {puede(u, 'facturar') && <p><Link href="/facturas/caja">¿Vendes en tienda con TPV o caja registradora? Apunta el cierre del día</Link></p>}
          </>}
        </div>
      )}
    </main>
  );
}
