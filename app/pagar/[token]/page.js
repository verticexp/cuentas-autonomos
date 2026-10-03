import { notFound } from 'next/navigation';
import { importes, numeroFactura, vencimiento } from '@/lib/calculos';
import { eur, fechaTexto } from '@/lib/formato';
import { facturaDePago, marcarPagada } from '@/lib/cobros';
import { leerPago, stripeListo } from '@/lib/stripe';
import '@/app/cobros.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pagar factura', robots: { index: false } };

// Página pública de pago: el cliente paga con tarjeta o Bizum (Stripe) o ve los datos de la transferencia.
export default async function Pagar({ params, searchParams }) {
  const { token } = await params;
  const { sesion, error } = await searchParams;
  let d = await facturaDePago(token);
  if (!d) notFound();
  // Vuelta desde Stripe: se comprueba el pago con Stripe (no basta con la dirección).
  if (sesion && !d.f.cobrada && stripeListo()) {
    const s = await leerPago(sesion);
    if (s.metadata?.token === token && (await marcarPagada(s))) d = await facturaDePago(token);
  }
  const { f, empresa } = d;
  const e = empresa.emisor || {};
  const t = importes(f);
  return (
    <main className="pagina pago-publico" style={{ '--acento': empresa.marca?.color }}>
      {empresa.marca?.logo && <img src={empresa.marca.logo} alt="" className="pago-logo" />}
      <p className="fh-num">{e.nombre || empresa.nombre}{e.nif ? ` · ${e.nif}` : ''}</p>
      <section className="factura-hero">
        <p className="fh-num">Factura {numeroFactura(f)} · {fechaTexto(f.fecha)}</p>
        <h1 className="fh-cliente">{f.cliente.nombre}</h1>
        <p className="fh-total">{eur(t.total)}</p>
        <div className="fh-pie"><span>{f.cobrada ? 'Pagada' : `Vence el ${fechaTexto(vencimiento(f, e.plazo))}`}</span></div>
      </section>
      {f.cobrada ? <p className="pago-ok">✓ Esta factura ya está pagada. ¡Gracias!</p> : (
        <>
          {error && <p className="error">{error}</p>}
          {stripeListo() && t.total > 0 && (
            <form action="/api/pagar" method="post">
              <input type="hidden" name="token" value={token} />
              <button className="boton ancho">Pagar {eur(t.total)} con tarjeta o Bizum</button>
            </form>
          )}
          {e.iban && <p className="nota pago-iban">O por transferencia a <strong>{e.iban}</strong>, indicando la factura {numeroFactura(f)}.</p>}
        </>
      )}
    </main>
  );
}
