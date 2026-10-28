import Vacio from '@/components/Vacio';
import { Fragment } from 'react';
import Ir from '@/components/Ir';
import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { importes, numeroFactura, pendienteDe, r2 } from '@/lib/calculos';
import { actividadesDe, nombresActividad } from '@/lib/empresa';
import { gastosQueVe } from '@/lib/nominas';
import { eur, fechaCorta } from '@/lib/formato';
import Volver from '@/components/Volver';
import { textos } from '@/lib/idiomaServidor';

import '@/app/mk.css';
import { leerRango } from '@/lib/indices';

export const dynamic = 'force-dynamic';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default async function Mes({ params }) {
  const tr = await textos();
  const u = await requerir('resumen');
  const ACTIVIDADES = nombresActividad(actividadesDe(u));
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  // Solo ese mes (informe de capacidad E01).
  const [facturas, gastos] = await Promise.all([leerRango(u, 'facturas', `${mes}-01`, `${mes}-31`), leerRango(u, 'gastos', `${mes}-01`, `${mes}-31`)]);
  const F = (facturas || []).filter((f) => f.fecha.startsWith(mes)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const G = gastosQueVe(u, gastos || []).filter((g) => g.fecha.startsWith(mes)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const suma = (l, k) => r2(l.map(importes).reduce((s, x) => s + x[k], 0));
  const [y, m] = mes.split('-').map(Number);
  const otro = (d) => new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
  const facturado = suma(F, 'base');
  const gastado = suma(G, 'base');
  const pendiente = r2(F.reduce((s, f) => s + pendienteDe(f), 0));
  // Misma cuenta que la nómina que va a Controla'T (lib/controlat.js).
  const cuotas = r2(G.filter((g) => String(g.id).startsWith('cuota-')).reduce((s, g) => s + g.base, 0));
  const puntuales = r2(gastado - cuotas);
  const beneficio = r2(facturado - gastado);
  const irpf = r2(Math.max(0, 0.2 * beneficio));
  const nomina = r2(facturado - puntuales - irpf);

  return (
    <main className="pagina mk-look">
      <Volver href={`/?anio=${y}`}>{tr('Resumen')}</Volver>
      <header className="cabecera">
        <h1 className="titulo">{tr(MESES[m - 1])} {y}</h1>
        <nav className="anios" aria-label={tr('Mes')}>
          <Ir tipo="cifras" href={`/mes/${otro(-1)}`} aria-label={tr('Mes anterior')}>‹</Ir>
          <Ir tipo="cifras" href={`/mes/${otro(1)}`} aria-label={tr('Mes siguiente')}>›</Ir>
        </nav>
      </header>

      <div className="tarjeta bloque">
        <div className="dos-valores">
          <div><small>{tr('Facturado')}</small><p className="grande">{eur(facturado)}</p></div>
          <div><small>{tr('Gastos')}</small><p className="grande">{eur(gastado)}</p></div>
        </div>
        <dl className="mes-detalle">
          {Object.entries(ACTIVIDADES).map(([a, n]) => <Fragment key={a}><dt>{n}</dt><dd>{eur(suma(F.filter((f) => f.actividad === a), 'base'))}</dd></Fragment>)}
          <dt>{tr('IVA cobrado')}</dt><dd>{eur(suma(F, 'iva'))}</dd>
          <dt>{tr('IVA de gastos')}</dt><dd>−{eur(suma(G, 'iva'))}</dd>
          <dt>{tr('Retenciones IRPF')}</dt><dd>{eur(suma(F, 'irpf'))}</dd>
          {pendiente > 0 && <><dt>{tr('Pendiente de cobro')}</dt><dd>{eur(pendiente)}</dd></>}
          <dt><strong>{tr('Rendimiento')}</strong></dt><dd><strong>{eur(facturado - gastado)}</strong></dd>
        </dl>
      </div>

      {u.controlat && (
        <div className="tarjeta bloque">
          <h3>{tr("Nómina enviada a Controla'T")}</h3>
          <dl className="mes-detalle" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
            <dt>{tr('Facturado (sin IVA)')}</dt><dd>{eur(facturado)}</dd>
            <dt>{tr('Gastos puntuales')}</dt><dd>−{eur(puntuales)}</dd>
            <dt>{tr('IRPF: 20 % de {importe} de beneficio', { importe: eur(beneficio) })}{cuotas ? ` ${tr('(cuota de {importe} incluida como gasto)', { importe: eur(cuotas) })}` : ''}</dt><dd>−{eur(irpf)}</dd>
            <dt><strong>{tr('Nómina')}</strong></dt><dd><strong>{nomina > 0 ? eur(nomina) : tr('no se envía')}</strong></dd>
          </dl>
        </div>
      )}

      <p className="rotulo">{F.length ? (F.length === 1 ? tr('{n} factura', { n: F.length }) : tr('{n} facturas', { n: F.length })) : tr('Facturas del mes')}</p>
      {!F.length && <Vacio compacto icono="factura" titulo={tr('Sin facturas este mes')} />}
      {F.length > 0 && (
        <ul className="grupo-lista bloque">
          {F.map((f) => (
            <li key={f.id}>
              <Ir href={`/facturas/${f.id}`} className="fila">
                <span className="num">{numeroFactura(f)}</span>
                <span className="txt">
                  <strong>{f.caja ? tr(f.cliente.nombre) : f.cliente.nombre}</strong>
                  <small><span className="num-movil">{numeroFactura(f)} · </span>{fechaCorta(f.fecha)} · {ACTIVIDADES[f.actividad]}{f.cobrada ? '' : ` · ${tr('Pendiente')}`}</small>
                </span>
                <span className={`imp ${f.cobrada ? '' : 'pend'}`}>{eur(importes(f).total)}</span>
              </Ir>
            </li>
          ))}
        </ul>
      )}

      <p className="rotulo">{G.length ? (G.length === 1 ? tr('{n} gasto', { n: G.length }) : tr('{n} gastos', { n: G.length })) : tr('Gastos del mes')}</p>
      {!G.length && <Vacio compacto icono="gasto" titulo={tr('Sin gastos este mes')} />}
      {G.length > 0 && (
        <ul className="grupo-lista bloque">
          {G.map((g) => (
            <li key={g.id} className="fila">
              <span className="txt">
                <strong>{g.concepto}</strong>
                <small>{fechaCorta(g.fecha)} · {ACTIVIDADES[g.actividad]} · {tr('IVA {importe}', { importe: eur(importes(g).iva) })}</small>
              </span>
              <span className="imp">{eur(g.base)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export async function generateMetadata({ params }) {
  const tr = await textos();
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { title: tr('Resumen mensual') };
  return { title: `${tr(MESES[Number(mes.slice(5)) - 1])} ${mes.slice(0, 4)}` };
}
