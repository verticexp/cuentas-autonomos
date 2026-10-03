import { Fragment } from 'react';
import Ir from '@/components/Ir';
import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { importes, numeroFactura, r2 } from '@/lib/calculos';
import { actividadesDe, nombresActividad } from '@/lib/empresa';
import { eur, fechaCorta } from '@/lib/formato';
import Volver from '@/components/Volver';

export const dynamic = 'force-dynamic';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default async function Mes({ params }) {
  const u = await requerir('resumen');
  const ACTIVIDADES = nombresActividad(actividadesDe(u));
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const [facturas, gastos] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos')]);
  const F = (facturas || []).filter((f) => f.fecha.startsWith(mes)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const G = (gastos || []).filter((g) => g.fecha.startsWith(mes)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const suma = (l, k) => r2(l.map(importes).reduce((s, x) => s + x[k], 0));
  const [y, m] = mes.split('-').map(Number);
  const otro = (d) => new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
  const facturado = suma(F, 'base');
  const gastado = suma(G, 'base');
  const pendiente = r2(F.filter((f) => !f.cobrada).reduce((s, f) => s + importes(f).total, 0));
  // Misma cuenta que la nómina que va a Controla'T (lib/controlat.js).
  const cuotas = r2(G.filter((g) => String(g.id).startsWith('cuota-')).reduce((s, g) => s + g.base, 0));
  const puntuales = r2(gastado - cuotas);
  const beneficio = r2(facturado - gastado);
  const irpf = r2(Math.max(0, 0.2 * beneficio));
  const nomina = r2(facturado - puntuales - irpf);

  return (
    <main className="pagina">
      <Volver href={`/?anio=${y}`}>Resumen</Volver>
      <header className="cabecera">
        <h1 className="titulo">{MESES[m - 1]} {y}</h1>
        <nav className="anios">
          <Ir tipo="cifras" href={`/mes/${otro(-1)}`} aria-label="Mes anterior">‹</Ir>
          <Ir tipo="cifras" href={`/mes/${otro(1)}`} aria-label="Mes siguiente">›</Ir>
        </nav>
      </header>

      <div className="tarjeta bloque">
        <div className="dos-valores">
          <div><small>Facturado</small><p className="grande">{eur(facturado)}</p></div>
          <div><small>Gastos</small><p className="grande">{eur(gastado)}</p></div>
        </div>
        <dl className="mes-detalle">
          {Object.entries(ACTIVIDADES).map(([a, n]) => <Fragment key={a}><dt>{n}</dt><dd>{eur(suma(F.filter((f) => f.actividad === a), 'base'))}</dd></Fragment>)}
          <dt>IVA cobrado</dt><dd>{eur(suma(F, 'iva'))}</dd>
          <dt>IVA de gastos</dt><dd>−{eur(suma(G, 'iva'))}</dd>
          <dt>Retenciones IRPF</dt><dd>{eur(suma(F, 'irpf'))}</dd>
          {pendiente > 0 && <><dt>Pendiente de cobro</dt><dd>{eur(pendiente)}</dd></>}
          <dt><strong>Rendimiento</strong></dt><dd><strong>{eur(facturado - gastado)}</strong></dd>
        </dl>
      </div>

      {u.controlat && (
        <div className="tarjeta bloque">
          <h3>Nómina enviada a Controla'T</h3>
          <dl className="mes-detalle" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
            <dt>Facturado (sin IVA)</dt><dd>{eur(facturado)}</dd>
            <dt>Gastos puntuales</dt><dd>−{eur(puntuales)}</dd>
            <dt>IRPF: 20 % de {eur(beneficio)} de beneficio{cuotas ? ` (cuota de ${eur(cuotas)} incluida como gasto)` : ''}</dt><dd>−{eur(irpf)}</dd>
            <dt><strong>Nómina</strong></dt><dd><strong>{nomina > 0 ? eur(nomina) : 'no se envía'}</strong></dd>
          </dl>
        </div>
      )}

      <p className="rotulo">{F.length ? `${F.length} ${F.length === 1 ? 'factura' : 'facturas'}` : 'Sin facturas este mes'}</p>
      {F.length > 0 && (
        <ul className="grupo-lista bloque">
          {F.map((f) => (
            <li key={f.id}>
              <Ir href={`/facturas/${f.id}`} className="fila">
                <span className="num">{numeroFactura(f)}</span>
                <span className="txt">
                  <strong>{f.cliente.nombre}</strong>
                  <small>{fechaCorta(f.fecha)} · {ACTIVIDADES[f.actividad]}{f.cobrada ? '' : ' · Pendiente'}</small>
                </span>
                <span className={`imp ${f.cobrada ? '' : 'pend'}`}>{eur(importes(f).total)}</span>
              </Ir>
            </li>
          ))}
        </ul>
      )}

      <p className="rotulo">{G.length ? `${G.length} ${G.length === 1 ? 'gasto' : 'gastos'}` : 'Sin gastos este mes'}</p>
      {G.length > 0 && (
        <ul className="grupo-lista bloque">
          {G.map((g) => (
            <li key={g.id} className="fila">
              <span className="txt">
                <strong>{g.concepto}</strong>
                <small>{fechaCorta(g.fecha)} · {ACTIVIDADES[g.actividad]} · IVA {eur(importes(g).iva)}</small>
              </span>
              <span className="imp">{eur(g.base)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
