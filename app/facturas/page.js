import Link from 'next/link';
import { enviarLuego } from '@/lib/verifactuEnvio';
import Ir from '@/components/Ir';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { importes, numeroFactura, r2, vencida } from '@/lib/calculos';
import { actividadesDe, nombresActividad } from '@/lib/empresa';
import FilaFactura from '@/components/FilaFactura';
import { eur, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import { puede } from '@/lib/permisos';
import Deslizable from '@/components/Deslizable';
import Buscar from '@/components/Buscar';
import '@/app/recurrentes.css';

export const dynamic = 'force-dynamic';
const diaMes = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default async function Facturas({ searchParams }) {
  const u = await requerir('facturas');
  enviarLuego(u); // Verifactu: si quedó algo por enviar (control de flujo de la AEAT), ahora
  const [todas, recurrentes] = await Promise.all([leer(u, 'facturas'), leer(u, 'recurrentes')]);
  if (!todas) return <SinBD />;
  const ACTIVIDADES = nombresActividad(actividadesDe(u));
  const { a, estado, q } = await searchParams;
  const buscado = String(q || '').trim().toLowerCase();
  const h = hoy();
  const plazo = u.emisor?.plazo;
  const estadoDe = (f) => (f.cobrada ? 'cobrada' : vencida(f, plazo, h) ? 'vencida' : 'pendiente');
  const lista = todas
    .filter((f) => !ACTIVIDADES[a] || f.actividad === a)
    .filter((f) => estado !== 'pendientes' || !f.cobrada)
    .filter((f) => estado !== 'vencidas' || estadoDe(f) === 'vencida')
    .filter((f) => !buscado || [f.cliente?.nombre, numeroFactura(f), f.concepto, ...(f.lineas || []).map((l) => l.concepto)].some((t) => String(t || '').toLowerCase().includes(buscado)))
    .sort((x, y) => y.fecha.localeCompare(x.fecha) || y.numero - x.numero);
  const porCobrar = r2(todas.filter((f) => !f.cobrada).reduce((s, f) => s + importes(f).total, 0));
  const vencidas = todas.filter((f) => estadoDe(f) === 'vencida');

  // Agrupadas por mes, con lo facturado de cada uno.
  const grupos = [];
  for (const f of lista) {
    const m = f.fecha.slice(0, 7);
    if (grupos.at(-1)?.m !== m) grupos.push({ m, facturas: [] });
    grupos.at(-1).facturas.push(f);
  }
  const url = (cambios) => {
    const p = new URLSearchParams(Object.entries({ a, estado, q, ...cambios }).filter(([, v]) => v));
    return `/facturas${p.size ? `?${p}` : ''}`;
  };

  return (
    <main className="pagina">
      <header className="cabecera">
        <h1 className="titulo">Facturas</h1>
        {puede(u, 'facturar') && <Ir href="/facturas/nueva" tipo="subir" className="boton pequeno">Nueva factura</Ir>}
      </header>

      <nav className="segmentado vt">
        <Ir href="/facturas" tipo="fundido" className="activo">Facturas</Ir>
        <Ir href="/presupuestos" tipo="fundido">Presupuestos</Ir>
      </nav>

      {todas.length > 0 && (
        <p className="resumen-linea">
          <span>Por cobrar <strong>{eur(porCobrar)}</strong></span>
          {vencidas.length > 0 && <span className="rojo">{vencidas.length === 1 ? '1 vencida' : `${vencidas.length} vencidas`}</span>}
          {recurrentes?.length > 0 && <Link href="/facturas/recurrentes" className="rec-enlace">{recurrentes.length === 1 ? '1 recurrente' : `${recurrentes.length} recurrentes`} ›</Link>}
          {puede(u, 'facturar') && <Link href="/facturas/catalogo" className="rec-enlace">Catálogo ›</Link>}
        </p>
      )}

      {todas.length > 5 && <Buscar action="/facturas" q={q} ocultos={{ a, estado }} placeholder="Buscar cliente, número o concepto" />}

      <Deslizable className="chips">
        <Link href={url({ a: null })} className={!ACTIVIDADES[a] ? 'activo' : ''}>Todas</Link>
        {Object.entries(ACTIVIDADES).map(([id, n]) => <Link key={id} href={url({ a: id })} className={a === id ? 'activo' : ''}>{n}</Link>)}
        <Link href={url({ estado: estado === 'pendientes' ? null : 'pendientes' })} className={estado === 'pendientes' ? 'activo' : ''}>Sin cobrar</Link>
        {vencidas.length > 0 && <Link href={url({ estado: estado === 'vencidas' ? null : 'vencidas' })} className={estado === 'vencidas' ? 'activo' : ''}>Vencidas</Link>}
      </Deslizable>

      {grupos.map((g) => {
        const [y, m] = g.m.split('-');
        const total = g.facturas.reduce((s, f) => s + importes(f).base, 0);
        return (
          <section key={g.m} className="grupo-mes">
            <h2><span>{MESES[m - 1]} {y !== h.slice(0, 4) ? y : ''}</span><small>{eur(total)} sin IVA</small></h2>
            <ul className="grupo-lista">
              {g.facturas.map((f) => {
                const e = estadoDe(f);
                return (
                  <li key={f.id}>
                    <FilaFactura href={`/facturas/${f.id}`}>
                      <span className="txt">
                        <strong data-vt="cliente">{f.cliente.nombre}</strong>
                        <small>{numeroFactura(f)} · {diaMes(f.fecha)}{!a && Object.keys(ACTIVIDADES).length > 1 ? ` · ${ACTIVIDADES[f.actividad]}` : ''}</small>
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

      {!lista.length && (
        <div className="vacio">
          {todas.length ? <><p>{buscado ? `Nada con «${q}»` : 'Nada con este filtro'}</p><p>{buscado ? 'Prueba con otra palabra o quita la búsqueda.' : 'Prueba con otra actividad o quita el filtro.'}</p></> : <>
            <p>Aún no has hecho ninguna factura</p>
            <p>Se numeran solas y puedes descargarlas en PDF con tu logo.</p>
            {puede(u, 'facturar') && <Ir href="/facturas/nueva" tipo="subir" className="boton">Crear la primera</Ir>}
          </>}
        </div>
      )}
    </main>
  );
}
