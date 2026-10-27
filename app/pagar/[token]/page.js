import { headers } from 'next/headers';
import { ipDe } from '@/lib/limite';
import { notFound } from 'next/navigation';
import { importes, numeroFactura, vencimiento } from '@/lib/calculos';
import { eur, fechaTexto } from '@/lib/formato';
import { facturaDePago, marcarPagada } from '@/lib/cobros';
import { cobroFacturasListo, leerPagoPublico, sesionPagoValida, stripeListo } from '@/lib/stripe';
import { mensajeSeguro } from '@/lib/mensajes';
import { textos } from '@/lib/idiomaServidor';
import '@/app/cobros.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Pagar factura'), robots: { index: false } }; }

// «a {x} b» con el hueco rellenado por un elemento (el IBAN en negrita): el texto se traduce entero y se parte por el hueco.
const conHueco = (texto, nombre, nodo) => { const [antes, despues] = texto.split(`{${nombre}}`); return <>{antes}{nodo}{despues}</>; };

// Página pública de pago: el cliente ve los datos de la transferencia y el Bizum de la empresa y, si la empresa cobra
// con tarjeta en su cuenta de Stripe (lib/stripe.js cobroFacturasListo), el botón para pagar con tarjeta o Bizum.
export default async function Pagar({ params, searchParams }) {
  const { token } = await params;
  const tr = await textos();
  const { sesion, error } = await searchParams;
  let d = await facturaDePago(token);
  if (!d) notFound();
  // Vuelta desde Stripe: se comprueba el pago con Stripe (no basta con la dirección).
  if (sesionPagoValida(sesion) && !d.f.cobrada && stripeListo()) {
    const cuenta = d.empresa.stripeConnect?.cuenta;
    const s = await leerPagoPublico(sesion, cuenta, { token, ip: ipDe({ headers: await headers() }) });
    if (s.metadata?.token === token && (await marcarPagada(s, { cuenta })).aplicado) d = await facturaDePago(token);
  }
  const { f, empresa } = d;
  const e = empresa.emisor || {};
  const t = importes(f);
  return (
    <main className="pagina pago-publico" style={{ '--acento': empresa.marca?.color }}>
      {empresa.marca?.logo && <img src={empresa.marca.logo} alt="" className="pago-logo" />}
      <p className="fh-num">{e.nombre || empresa.nombre}{e.nif ? ` · ${e.nif}` : ''}</p>
      <section className="factura-hero">
        <p className="fh-num">{tr('Factura {numero} · {fecha}', { numero: numeroFactura(f), fecha: fechaTexto(f.fecha) })}</p>
        <h1 className="fh-cliente">{f.cliente.nombre}</h1>
        <p className="fh-total">{eur(t.total)}</p>
        <div className="fh-pie"><span>{f.cobrada ? tr('Pagada') : tr('Vence el {fecha}', { fecha: fechaTexto(vencimiento(f, e.plazo)) })}</span></div>
      </section>
      {f.cobrada ? <p className="pago-ok">{tr('✓ Esta factura ya está pagada. ¡Gracias!')}</p> : (
        <>
          {error && <p className="error" role="alert">{tr(mensajeSeguro(error))}</p>}
          {cobroFacturasListo(empresa) && t.total > 0 && (
            <form action="/api/pagar" method="post">
              <input type="hidden" name="token" value={token} />
              <button className="boton ancho">{tr('Pagar {importe} con tarjeta o Bizum', { importe: eur(t.total) })}</button>
            </form>
          )}
          {e.iban && <p className="nota pago-iban">{conHueco(cobroFacturasListo(empresa) ? tr('O por transferencia a {iban}, indicando la factura {numero}.', { numero: numeroFactura(f) }) : tr('Puedes pagarla por transferencia a {iban}, indicando la factura {numero}.', { numero: numeroFactura(f) }), 'iban', <strong>{e.iban}</strong>)}</p>}
          {e.bizum && <p className="nota pago-iban">{conHueco(tr('Por Bizum al {bizum}.'), 'bizum', <strong>{e.bizum}</strong>)}</p>}
        </>
      )}
    </main>
  );
}
