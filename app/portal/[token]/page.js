import { notFound, redirect } from 'next/navigation';
import { cobroFacturasListo } from '@/lib/stripe';
import { importes, numeroFactura, saldoDe, vencida } from '@/lib/calculos';
import { eur, fechaTexto, hoy } from '@/lib/formato';
import { ESTADOS, estadoDe, numeroPresupuesto } from '@/lib/presupuestos';
import { portalDe } from '@/lib/portal';
import '@/app/portal.css';
import { enDivisa, formatoDoc, textosFactura, tituloDoc } from '@/lib/idiomas';
import { faltanDatosFactura } from '@/lib/empresa';
import Vacio from '@/components/Vacio';
import { textos } from '@/lib/idiomaServidor';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Tus documentos'), robots: { index: false } }; }

// «a {x} b» con el hueco rellenado por un elemento (el IBAN en negrita): el texto se traduce entero y se parte por el hueco.
const conHueco = (texto, nombre, nodo) => { const [antes, despues] = texto.split(`{${nombre}}`); return <>{antes}{nodo}{despues}</>; };

// Portal del cliente: sin cuenta, con su enlace ve todas sus facturas y presupuestos, los descarga y paga.
export default async function Portal({ params, searchParams }) {
  const { token } = await params;
  const tr = await textos();
  const { hecho, error } = (await searchParams) || {};
  const d = await portalDe(token);
  // Las páginas no pueden fijar un 429: el endpoint público devuelve el límite sin leer documentos.
  if (d instanceof Response) redirect(`/api/portal/limite?espera=${d.headers.get('Retry-After')}`);
  if (!d) notFound();
  const { cliente, empresa, facturas, presupuestos } = d;
  const e = empresa.emisor || {};
  const h = hoy();
  const pdf = faltanDatosFactura(e).length === 0;
  const porPagar = facturas.filter((f) => !f.cobrada && importes(f).total > 0);
  const pendiente = porPagar.reduce((s, f) => s + saldoDe(f), 0);
  const t = encodeURIComponent(token);
  return (
    <main className="pagina portal" style={{ '--acento': empresa.marca?.color }}>
      {empresa.marca?.logo && <img src={empresa.marca.logo} alt="" className="portal-logo" />}
      <p className="fh-num">{e.nombre || empresa.nombre}{e.nif ? ` · ${e.nif}` : ''}</p>
      <section className="factura-hero">
        <p className="fh-num">{tr('Tus documentos')}</p>
        <h1 className="fh-cliente">{cliente.nombre}</h1>
        <p className="fh-total">{eur(pendiente)}</p>
        <div className="fh-pie"><span>{porPagar.length ? (porPagar.length === 1 ? tr('Pendiente de pago · 1 factura') : tr('Pendiente de pago · {n} facturas', { n: porPagar.length })) : tr('No tienes nada pendiente')}</span></div>
      </section>

      {hecho && <p className="nota" role="status">{hecho === 'rechazada' ? tr('Hemos avisado a la empresa de que rechazas la factura.') : tr('Gracias: la empresa ya sabe que la factura está conforme.')}</p>}
      {error && <p className="error" role="alert">{tr(String(error).slice(0, 200))}</p>}
      <h2 className="portal-t">{tr('Facturas')}</h2>
      {facturas.length ? <ul className="grupo-lista portal-lista">
        {facturas.map((f) => {
          const est = f.cobrada ? 'cobrada' : vencida(f, e.plazo, h) ? 'vencida' : 'pendiente';
          const pagar = cobroFacturasListo(empresa) && !f.cobrada && importes(f).total > 0;
          return (
            <li key={f.id} className="portal-doc">
              <span className="txt">
                {/* «Factura simplificada» si va sin NIF del cliente, como en su PDF (lib/idiomas.js tituloDoc). */}
                <strong>{tituloDoc(f, textosFactura('es'))} {numeroFactura(f)}</strong>
                <small>{fechaTexto(f.fecha)}{f.concepto ? ` · ${f.concepto}` : ''}</small>
              </span>
              <span className="imp-col">
                {/* En la moneda en que se facturó (lib/idiomas.js). */}
                <span className="imp">{formatoDoc(f).dinero(importes(enDivisa(f)).total)}</span>
                <span className={`estado-txt e-${est}`}>{est === 'cobrada' ? tr('Pagada') : est === 'vencida' ? tr('Vencida') : tr('Pendiente')}</span>
              </span>
              <span className="portal-acc">
                {pdf && <a className="boton pequeno sec" href={`/api/portal/pdf?t=${t}&id=${encodeURIComponent(f.id)}`}>PDF</a>}
                {pagar && <form action="/api/portal/pagar" method="post"><input type="hidden" name="t" value={token} /><input type="hidden" name="id" value={f.id} /><button className="boton pequeno">{tr('Pagar')}</button></form>}
              </span>
              {/* Estados de la factura electrónica entre empresas (Ley 18/2022): conforme o rechazada, con su motivo. */}
              {!f.cobrada && (f.estadoCliente ? <small className="portal-estado">{f.estadoCliente.estado === 'aceptada' ? tr('Marcaste esta factura como conforme el {fecha}.', { fecha: fechaTexto(f.estadoCliente.fecha.slice(0, 10)) }) : tr('La rechazaste el {fecha}: {motivo}', { fecha: fechaTexto(f.estadoCliente.fecha.slice(0, 10)), motivo: f.estadoCliente.motivo })}</small> : (
                <details className="portal-estado">
                  <summary>{tr('¿Está bien esta factura?')}</summary>
                  <form action="/api/portal/estado" method="post" className="fila-act"><input type="hidden" name="t" value={token} /><input type="hidden" name="id" value={f.id} /><input type="hidden" name="estado" value="aceptada" /><button className="boton pequeno sec">{tr('Sí, está conforme')}</button></form>
                  <form action="/api/portal/estado" method="post"><input type="hidden" name="t" value={token} /><input type="hidden" name="id" value={f.id} /><input type="hidden" name="estado" value="rechazada" />
                    <label>{tr('Si no, dinos qué falla')}<textarea className="campo" name="motivo" rows={2} maxLength={300} required placeholder={tr('Ej.: el importe no coincide con el presupuesto')} /></label>
                    <button className="boton pequeno sec">{tr('Rechazar la factura')}</button>
                  </form>
                </details>
              ))}
            </li>
          );
        })}
      </ul> : <Vacio compacto icono="factura" titulo={tr('Todavía no hay facturas')}>{tr('Cuando te emitan una, la verás aquí para descargarla y, si se puede, pagarla.')}</Vacio>}

      {presupuestos.length > 0 && <>
        <h2 className="portal-t">{tr('Presupuestos')}</h2>
        <ul className="grupo-lista portal-lista">
          {presupuestos.map((p) => {
            const [txt, clase] = ESTADOS[estadoDe(p, h)];
            return (
              <li key={p.id} className="portal-doc">
                <span className="txt">
                  <strong>{tr('Presupuesto')} {numeroPresupuesto(p)}</strong>
                  <small>{fechaTexto(p.fecha)}{p.concepto ? ` · ${p.concepto}` : ''}</small>
                </span>
                <span className="imp-col">
                  <span className="imp">{eur(importes(p).total)}</span>
                  <span className={`estado-txt ${clase}`}>{tr(txt)}</span>
                </span>
                <span className="portal-acc">
                  {pdf && <a className="boton pequeno sec" href={`/api/portal/pdf?t=${t}&tipo=presupuesto&id=${encodeURIComponent(p.id)}`}>PDF</a>}
                  <a className="boton pequeno sec" href={`/p/${p.token}`}>{tr('Ver')}</a>
                </span>
              </li>
            );
          })}
        </ul>
      </>}
      {e.iban && porPagar.length > 0 && <p className="nota pago-iban">{conHueco(tr('También puedes pagar por transferencia a {iban}, indicando el número de factura.'), 'iban', <strong>{e.iban}</strong>)}</p>}
    </main>
  );
}
