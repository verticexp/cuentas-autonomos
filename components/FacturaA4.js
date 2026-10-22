import { Fragment } from 'react';
import QRCode from 'qrcode';
import { baseLinea, columnasLineas, desglose, importes, numeroFactura, vencimiento } from '@/lib/calculos';
import '@/app/factura.css';
import { enDivisa, formatoDoc, menciones } from '@/lib/idiomas';
import { aclarar, colorValido } from '@/lib/marca';
import { COLOR_FACTURA, anchoResumen, tamanoNumero, tamanoTotal } from '@/lib/pdf';
import { urlQr } from '@/lib/verifactu';
import { caduca } from '@/lib/presupuestos';

// La factura en pantalla, a tamaño A4 (794 × 1123 px). Misma plantilla que el PDF de lib/pdf.js, en el idioma y la
// moneda de la factura (lib/idiomas.js).
export default async function FacturaA4({ f: fOriginal, e, marca, presupuesto = fOriginal.serie === 'P' }) {
  const L = formatoDoc(fOriginal), f = enDivisa(fOriginal), tEur = importes(fOriginal);
  const base = colorValido(marca?.color) || COLOR_FACTURA;
  const t = importes(f);
  const c = f.cliente;
  const contacto = [e.email, e.telefono, e.web].filter(Boolean).join(' · ');
  const fechaFin = L.fecha(presupuesto ? caduca(f) : vencimiento(f, e.plazo));
  const qr = f.verifactu ? await QRCode.toString(urlQr(f.verifactu.modo, e.nif, fOriginal), { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }) : null;
  const numeroStyle = (s, w) => ({ fontSize: `${tamanoNumero(s, w)}pt` });
  return (
    <article className="fa" style={{ '--fa-c': base, '--fa-suave': aclarar(base, 0.9), '--fa-claro': aclarar(base, 0.75), '--fa-total-size': `${tamanoTotal(L.dinero(t.total))}pt`, '--fa-resumen': `${anchoResumen(f, L.dinero)}pt` }}>
      <div className="fa-cuerpo">
        <header className="fa-cab">
          <div className="fa-identidad">
            {marca?.logo && <span className="fa-logo"><img src={marca.logo} alt="" /></span>}
            <h1 className="fa-emisor">{e.nombre}</h1>
          </div>
          <h2>{presupuesto ? L.t.presupuesto : f.serie === 'R' ? L.t.rectificativa : L.t.factura}</h2>
        </header>
        <div className="fa-datos">
          <div><p className="fa-et">{L.t.numero}</p><p className="fa-num">{L.t.nro} {numeroFactura(f)}</p></div>
          <div><p className="fa-et">{L.t.fecha}</p><p>{L.fecha(f.fecha)}</p></div>
          <div><p className="fa-et">{presupuesto ? L.t.validoHasta : L.t.vencimiento}</p><p>{fechaFin}</p></div>
        </div>
        <div className="fa-partes">
          <div><p className="fa-et">{L.t.de}</p><p><strong>{e.nombre}</strong><br />{L.t.nif} {e.nif}{e.direccion && <><br />{e.direccion}</>}{e.ciudad && <><br />{e.ciudad}</>}{contacto && <><br />{contacto}</>}</p></div>
          <div><p className="fa-et">{L.t.para}</p><p><strong>{c.nombre}</strong>{c.nif && <><br />{L.t.nif} {c.nif}</>}{c.direccion && <><br />{c.direccion}</>}{c.ciudad && <><br />{c.ciudad}</>}</p></div>
        </div>
        {f.lineas?.length ? (() => {
          const k = columnasLineas(f);
          return (
            <table className="fa-tabla fa-lineas">
              <colgroup><col /><col style={{ width: '38pt' }} /><col style={{ width: '70pt' }} />{k.dto && <col style={{ width: '38pt' }} />}{k.iva && <col style={{ width: '38pt' }} />}<col style={{ width: '70pt' }} /></colgroup>
              <thead><tr><th>{L.t.concepto}</th><th className="n">{L.t.cant}</th><th className="n">{L.t.precio}</th>{k.dto && <th className="n">{L.t.dto}</th>}{k.iva && <th className="n">{L.t.iva}</th>}<th>{L.t.importe}</th></tr></thead>
              <tbody>
                {f.lineas.map((l, i) => (
                  <tr key={i} className={i >= f.lineas.length - 2 ? 'fa-ultima' : undefined}>
                    <td>{l.concepto}{i === 0 && L.evento(f) && <small>{L.evento(f)}</small>}</td>
                    <td className="n" style={numeroStyle(L.cantidad(l.cantidad), 38)}>{L.cantidad(l.cantidad)}</td><td className="n" style={numeroStyle(L.dinero(l.precio), 70)}>{L.dinero(l.precio)}</td>
                    {k.dto && <td className="n" style={numeroStyle(l.dto ? L.pctCorto(l.dto) : '', 38)}>{l.dto ? L.pctCorto(l.dto) : ''}</td>}{k.iva && <td className="n" style={numeroStyle(L.pctCorto(l.ivaPct), 38)}>{L.pctCorto(l.ivaPct)}</td>}
                    <td style={numeroStyle(L.dinero(baseLinea(l)), 70)}>{L.dinero(baseLinea(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })() : (
        <table className="fa-tabla">
          <colgroup><col /><col style={{ width: '110pt' }} /></colgroup>
          <thead><tr><th>{L.t.concepto}</th><th>{L.t.importe}</th></tr></thead>
          <tbody><tr className="fa-ultima"><td>{f.concepto}{L.evento(f) && <small>{L.evento(f)}</small>}</td><td style={numeroStyle(L.dinero(t.base), 110)}>{L.dinero(t.base)}</td></tr></tbody>
        </table>
        )}
        <dl className="fa-totales">
          <dt>{L.t.base}</dt><dd>{L.dinero(t.base)}</dd>
          {desglose(f).map((d, i, l) => <Fragment key={i}><dt>{L.t.iva} {L.pct(d.pct)}{l.length > 1 ? ` ${L.t.sobre} ${L.dinero(d.base)}` : ''}</dt><dd>{L.dinero(d.iva)}</dd>{d.re ? <><dt>{L.t.recargo} {L.pct(d.re)}</dt><dd>{L.dinero(d.recargo)}</dd></> : null}</Fragment>)}
          {f.irpfPct > 0 && <><dt>{L.t.retencion} {L.pct(f.irpfPct)}</dt><dd>{L.dinero(t.irpf ? -t.irpf : 0)}</dd></>}
          <div className="fa-total-fila"><dt className="fa-total">{L.t.total}</dt><dd className="fa-total">{L.dinero(t.total)}</dd></div>
        </dl>
        {(f.rectifica || f.nota || f.divisa || f.recc || f.oss) && (
          <div className="fa-notas">
            <p className="fa-et">{L.t.notas}</p>
            {f.rectifica && <p>{L.t.rectifica(f.rectifica.numero, L.fecha(f.rectifica.fecha))}</p>}
            {menciones(f, L).map((m) => <p key={m}>{m}</p>)}
            {f.divisa && L.moneda !== 'EUR' && <p>{L.t.contravalor}: {L.t.base} {L.euros(tEur.base)} · {L.t.iva} {L.euros(tEur.iva)}{tEur.irpf ? ` · ${L.t.retencion} ${L.euros(-tEur.irpf)}` : ''} · {L.t.total} {L.euros(tEur.total)}. {L.cambio(f.divisa)}.</p>}
            {f.nota && <p>{f.nota}</p>}
          </div>
        )}
        <div className="fa-pago">
          <div><p className="fa-et">{L.t.pago}</p>{(e.iban || (!e.bizum && !e.otroPago)) && <p>{L.t.transferencia}<br /><strong>{e.iban}</strong></p>}{e.bizum && <p style={{ overflowWrap: 'anywhere' }}>Bizum: {e.bizum}</p>}{e.otroPago && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{e.otroPago}</p>}<p className="fa-vencimiento">{`${presupuesto ? L.t.validoHasta : L.t.vencimiento}: ${fechaFin}`}</p></div>
          {qr && <div className="fa-qr"><span dangerouslySetInnerHTML={{ __html: qr }} /><small>VERI*FACTU</small></div>}
        </div>
        <footer className="fa-pie" style={e.pie ? { flexWrap: 'wrap', rowGap: '4pt' } : undefined}>{e.pie && <p style={{ flexBasis: '100%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{e.pie}</p>}<span>{e.nombre} · {L.t.nif} {e.nif}{e.registro && <> · {e.registro}</>}</span>{qr && <span>Factura verificable en la sede electrónica de la AEAT</span>}</footer>
      </div>
    </article>
  );
}
