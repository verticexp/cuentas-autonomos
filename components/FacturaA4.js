import { Fragment } from 'react';
import QRCode from 'qrcode';
import { baseLinea, columnasLineas, desglose, importes, numeroFactura, vencimiento } from '@/lib/calculos';
import '@/app/factura.css';
import { eur, eurSin, fechaCorta, pct, pctCorto, textoEvento } from '@/lib/formato';
import { aclarar, colorValido } from '@/lib/marca';
import { COLOR_FACTURA, anchoResumen, tamanoNumero, tamanoTotal } from '@/lib/pdf';
import { urlQr } from '@/lib/verifactu';
import { caduca } from '@/lib/presupuestos';

// La factura en pantalla, a tamaño A4 (794 × 1123 px). Misma plantilla que el PDF de lib/pdf.js.
export default async function FacturaA4({ f, e, marca, presupuesto = f.serie === 'P' }) {
  const base = colorValido(marca?.color) || COLOR_FACTURA;
  const t = importes(f);
  const c = f.cliente;
  const fechaFin = fechaCorta(presupuesto ? caduca(f) : vencimiento(f, e.plazo));
  const qr = f.verifactu ? await QRCode.toString(urlQr(f.verifactu.modo, e.nif, f), { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }) : null;
  const numeroStyle = (s, w) => ({ fontSize: `${tamanoNumero(s, w)}pt` });
  return (
    <article className="fa" style={{ '--fa-c': base, '--fa-suave': aclarar(base, 0.9), '--fa-claro': aclarar(base, 0.75), '--fa-total-size': `${tamanoTotal(eur(t.total))}pt`, '--fa-resumen': `${anchoResumen(f)}pt` }}>
      <div className="fa-cuerpo">
        <header className="fa-cab">
          <div className="fa-identidad">
            {marca?.logo && <span className="fa-logo"><img src={marca.logo} alt="" /></span>}
            <h1 className="fa-emisor">{e.nombre}</h1>
          </div>
          <h2>{presupuesto ? 'Presupuesto' : f.serie === 'R' ? 'Factura rectificativa' : 'Factura'}</h2>
        </header>
        <div className="fa-datos">
          <div><p className="fa-et">Número</p><p className="fa-num">Nº {numeroFactura(f)}</p></div>
          <div><p className="fa-et">Fecha</p><p>{fechaCorta(f.fecha)}</p></div>
          <div><p className="fa-et">{presupuesto ? 'Válido hasta' : 'Vencimiento'}</p><p>{fechaFin}</p></div>
        </div>
        <div className="fa-partes">
          <div><p className="fa-et">De</p><p><strong>{e.nombre}</strong><br />NIF {e.nif}{e.direccion && <><br />{e.direccion}</>}{e.ciudad && <><br />{e.ciudad}</>}</p></div>
          <div><p className="fa-et">Para</p><p><strong>{c.nombre}</strong>{c.nif && <><br />NIF {c.nif}</>}{c.direccion && <><br />{c.direccion}</>}{c.ciudad && <><br />{c.ciudad}</>}</p></div>
        </div>
        {f.lineas?.length ? (() => {
          const k = columnasLineas(f);
          return (
            <table className="fa-tabla fa-lineas">
              <colgroup><col /><col style={{ width: '38pt' }} /><col style={{ width: '70pt' }} />{k.dto && <col style={{ width: '38pt' }} />}{k.iva && <col style={{ width: '38pt' }} />}<col style={{ width: '70pt' }} /></colgroup>
              <thead><tr><th>Concepto</th><th className="n">Cant.</th><th className="n">Precio</th>{k.dto && <th className="n">Dto.</th>}{k.iva && <th className="n">IVA</th>}<th>Importe</th></tr></thead>
              <tbody>
                {f.lineas.map((l, i) => (
                  <tr key={i} className={i >= f.lineas.length - 2 ? 'fa-ultima' : undefined}>
                    <td>{l.concepto}{i === 0 && textoEvento(f) && <small>{textoEvento(f)}</small>}</td>
                    <td className="n" style={numeroStyle(eurSin(l.cantidad), 38)}>{eurSin(l.cantidad)}</td><td className="n" style={numeroStyle(eur(l.precio), 70)}>{eur(l.precio)}</td>
                    {k.dto && <td className="n" style={numeroStyle(l.dto ? pctCorto(l.dto) : '', 38)}>{l.dto ? pctCorto(l.dto) : ''}</td>}{k.iva && <td className="n" style={numeroStyle(pctCorto(l.ivaPct), 38)}>{pctCorto(l.ivaPct)}</td>}
                    <td style={numeroStyle(eur(baseLinea(l)), 70)}>{eur(baseLinea(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })() : (
        <table className="fa-tabla">
          <colgroup><col /><col style={{ width: '110pt' }} /></colgroup>
          <thead><tr><th>Concepto</th><th>Importe</th></tr></thead>
          <tbody><tr className="fa-ultima"><td>{f.concepto}{textoEvento(f) && <small>{textoEvento(f)}</small>}</td><td style={numeroStyle(eur(t.base), 110)}>{eur(t.base)}</td></tr></tbody>
        </table>
        )}
        <dl className="fa-totales">
          <dt>Base imponible</dt><dd>{eur(t.base)}</dd>
          {desglose(f).map((d, i, l) => <Fragment key={i}><dt>IVA {pct(d.pct)}{l.length > 1 ? ` de ${eur(d.base)}` : ''}</dt><dd>{eur(d.iva)}</dd></Fragment>)}
          {f.irpfPct > 0 && <><dt>Retención IRPF {pct(f.irpfPct)}</dt><dd>{eur(t.irpf ? -t.irpf : 0)}</dd></>}
          <div className="fa-total-fila"><dt className="fa-total">Total</dt><dd className="fa-total">{eur(t.total)}</dd></div>
        </dl>
        {(f.rectifica || f.nota) && (
          <div className="fa-notas">
            <p className="fa-et">Notas</p>
            {f.rectifica && <p>Rectifica la factura nº {f.rectifica.numero} de fecha {fechaCorta(f.rectifica.fecha)}.</p>}
            {f.nota && <p>{f.nota}</p>}
          </div>
        )}
        <div className="fa-pago">
          <div><p className="fa-et">Forma de pago</p><p>Transferencia bancaria<br /><strong>{e.iban}</strong></p><p className="fa-vencimiento">{presupuesto ? `Válido hasta: ${fechaFin}` : `Vencimiento: ${fechaFin} (${e.plazo} días)`}</p></div>
          {qr && <div className="fa-qr"><span dangerouslySetInnerHTML={{ __html: qr }} /><small>VERI*FACTU</small></div>}
        </div>
        <footer className="fa-pie"><span>{e.nombre} · NIF {e.nif}</span>{qr && <span>Factura verificable en la sede electrónica de la AEAT</span>}</footer>
      </div>
    </article>
  );
}
