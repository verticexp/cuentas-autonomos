import QRCode from 'qrcode';
import { importes, numeroFactura, vencimiento } from '@/lib/calculos';
import { eur, fechaCorta, pct, textoEvento } from '@/lib/formato';
import { aclarar, colorValido } from '@/lib/marca';
import { COLOR_FACTURA } from '@/lib/pdf';
import { urlQr } from '@/lib/verifactu';

// La factura en pantalla, a tamaño A4 (794 × 1123 px). Misma plantilla que el PDF de lib/pdf.js.
export default async function FacturaA4({ f, e, marca }) {
  const base = colorValido(marca?.color) || COLOR_FACTURA;
  const t = importes(f);
  const c = f.cliente;
  const qr = f.verifactu ? await QRCode.toString(urlQr(f.verifactu.modo, e.nif, f), { type: 'svg', errorCorrectionLevel: 'M', margin: 0 }) : null;
  return (
    <article className="fa" style={{ '--fa-c': base, '--fa-suave': aclarar(base, 0.9), '--fa-claro': aclarar(base, 0.75) }}>
      <aside className="fa-col">
        {marca?.logo && <span className="fa-logo"><img src={marca.logo} alt="" /></span>}
        <h1 className="fa-emisor">{e.nombre}</h1>
        <p className="fa-claro">NIF {e.nif}{e.direccion && <><br />{e.direccion}</>}{e.ciudad && <><br />{e.ciudad}</>}</p>
        <div className="fa-pago">
          <p className="fa-et">Forma de pago</p>
          <p>Transferencia bancaria<br /><strong>{e.iban}</strong></p>
          <p className="fa-et">Vencimiento</p>
          <p>{fechaCorta(vencimiento(f, e.plazo))} ({e.plazo} días)</p>
        </div>
      </aside>
      <div className="fa-cuerpo">
        <header className="fa-cab">
          <div>
            <h2>{f.serie === 'R' ? 'Factura rectificativa' : 'Factura'}</h2>
            <p className="fa-num">Nº {numeroFactura(f)}</p>
          </div>
          {qr && <div className="fa-qr"><span dangerouslySetInnerHTML={{ __html: qr }} /><small>VERI*FACTU</small></div>}
        </header>
        <div className="fa-partes">
          <div>
            <p className="fa-et">Facturar a</p>
            <p><strong>{c.nombre}</strong>{c.nif && <><br />NIF {c.nif}</>}{c.direccion && <><br />{c.direccion}</>}{c.ciudad && <><br />{c.ciudad}</>}</p>
          </div>
          <div>
            <p className="fa-et">Fecha</p>
            <p>{fechaCorta(f.fecha)}</p>
          </div>
        </div>
        <table className="fa-tabla">
          <thead><tr><th>Concepto</th><th>Importe</th></tr></thead>
          <tbody><tr><td>{f.concepto}{textoEvento(f) && <small>{textoEvento(f)}</small>}</td><td>{eur(t.base)}</td></tr></tbody>
        </table>
        <dl className="fa-totales">
          <dt>Base imponible</dt><dd>{eur(t.base)}</dd>
          <dt>IVA {pct(f.ivaPct)}</dt><dd>{eur(t.iva)}</dd>
          {f.irpfPct > 0 && <><dt>Retención IRPF {pct(f.irpfPct)}</dt><dd>−{eur(t.irpf)}</dd></>}
          <dt className="fa-total">Total</dt><dd className="fa-total">{eur(t.total)}</dd>
        </dl>
        {(f.rectifica || f.nota) && (
          <div className="fa-notas">
            <p className="fa-et">Notas</p>
            {f.rectifica && <p>Rectifica la factura nº {f.rectifica.numero} de fecha {fechaCorta(f.rectifica.fecha)}.</p>}
            {f.nota && <p>{f.nota}</p>}
          </div>
        )}
        <footer className="fa-pie"><span>{e.nombre} · NIF {e.nif}</span>{qr && <span>Factura verificable en la sede electrónica de la AEAT</span>}</footer>
      </div>
    </article>
  );
}
