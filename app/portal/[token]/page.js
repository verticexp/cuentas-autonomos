import { notFound } from 'next/navigation';
import { importes, numeroFactura, vencida } from '@/lib/calculos';
import { eur, fechaTexto, hoy } from '@/lib/formato';
import { ESTADOS, estadoDe, numeroPresupuesto } from '@/lib/presupuestos';
import { portalDe } from '@/lib/portal';
import '@/app/portal.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tus documentos', robots: { index: false } };

// Portal del cliente: sin cuenta, con su enlace ve todas sus facturas y presupuestos, los descarga y paga.
export default async function Portal({ params }) {
  const { token } = await params;
  const d = await portalDe(token);
  if (!d) notFound();
  const { cliente, empresa, facturas, presupuestos } = d;
  const e = empresa.emisor || {};
  const h = hoy();
  const pdf = Boolean(e.nif && e.iban);
  const porPagar = facturas.filter((f) => !f.cobrada && importes(f).total > 0);
  const pendiente = porPagar.reduce((s, f) => s + importes(f).total, 0);
  const t = encodeURIComponent(token);
  return (
    <main className="pagina portal" style={{ '--acento': empresa.marca?.color }}>
      {empresa.marca?.logo && <img src={empresa.marca.logo} alt="" className="portal-logo" />}
      <p className="fh-num">{e.nombre || empresa.nombre}{e.nif ? ` · ${e.nif}` : ''}</p>
      <section className="factura-hero">
        <p className="fh-num">Tus documentos</p>
        <h1 className="fh-cliente">{cliente.nombre}</h1>
        <p className="fh-total">{eur(pendiente)}</p>
        <div className="fh-pie"><span>{porPagar.length ? `Pendiente de pago · ${porPagar.length} ${porPagar.length === 1 ? 'factura' : 'facturas'}` : 'No tienes nada pendiente'}</span></div>
      </section>

      <h2 className="portal-t">Facturas</h2>
      {facturas.length ? <ul className="grupo-lista portal-lista">
        {facturas.map((f) => {
          const est = f.cobrada ? 'cobrada' : vencida(f, e.plazo, h) ? 'vencida' : 'pendiente';
          const pagar = !f.cobrada && importes(f).total > 0;
          return (
            <li key={f.id} className="portal-doc">
              <span className="txt">
                <strong>Factura {numeroFactura(f)}</strong>
                <small>{fechaTexto(f.fecha)}{f.concepto ? ` · ${f.concepto}` : ''}</small>
              </span>
              <span className="imp-col">
                <span className="imp">{eur(importes(f).total)}</span>
                <span className={`estado-txt e-${est}`}>{est === 'cobrada' ? 'Pagada' : est === 'vencida' ? 'Vencida' : 'Pendiente'}</span>
              </span>
              <span className="portal-acc">
                {pdf && <a className="boton pequeno sec" href={`/api/portal/pdf?t=${t}&id=${encodeURIComponent(f.id)}`}>PDF</a>}
                {pagar && <form action="/api/portal/pagar" method="post"><input type="hidden" name="t" value={token} /><input type="hidden" name="id" value={f.id} /><button className="boton pequeno">Pagar</button></form>}
              </span>
            </li>
          );
        })}
      </ul> : <p className="nota">Todavía no hay facturas.</p>}

      {presupuestos.length > 0 && <>
        <h2 className="portal-t">Presupuestos</h2>
        <ul className="grupo-lista portal-lista">
          {presupuestos.map((p) => {
            const [txt, clase] = ESTADOS[estadoDe(p, h)];
            return (
              <li key={p.id} className="portal-doc">
                <span className="txt">
                  <strong>Presupuesto {numeroPresupuesto(p)}</strong>
                  <small>{fechaTexto(p.fecha)}{p.concepto ? ` · ${p.concepto}` : ''}</small>
                </span>
                <span className="imp-col">
                  <span className="imp">{eur(importes(p).total)}</span>
                  <span className={`estado-txt ${clase}`}>{txt}</span>
                </span>
                <span className="portal-acc">
                  {pdf && <a className="boton pequeno sec" href={`/api/portal/pdf?t=${t}&tipo=presupuesto&id=${encodeURIComponent(p.id)}`}>PDF</a>}
                  <a className="boton pequeno sec" href={`/p/${p.token}`}>Ver</a>
                </span>
              </li>
            );
          })}
        </ul>
      </>}
      {e.iban && porPagar.length > 0 && <p className="nota pago-iban">También puedes pagar por transferencia a <strong>{e.iban}</strong>, indicando el número de factura.</p>}
    </main>
  );
}
