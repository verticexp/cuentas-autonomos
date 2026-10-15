import { Fragment } from 'react';
import { baseLinea } from '@/lib/calculos';
import '@/app/factura.css';
import { eur, eurSin, pct, pctCorto } from '@/lib/formato';
import { aclarar, colorValido } from '@/lib/marca';
import { COLOR_FACTURA } from '@/lib/pdf';
import { datosAlbaran } from '@/lib/pdfAlbaran';

// El albarán o pedido en pantalla, a tamaño A4. Misma plantilla que el PDF de lib/pdfAlbaran.js.
export default function AlbaranA4({ d, e, marca, valorado = true, pedido = null }) {
  const base = colorValido(marca?.color) || COLOR_FACTURA;
  const a = datosAlbaran(d, pedido);
  const c = d.cliente;
  return (
    <article className="fa" style={{ '--fa-c': base, '--fa-suave': aclarar(base, 0.9), '--fa-claro': aclarar(base, 0.75) }}>
      <div className="fa-cuerpo">
        <header className="fa-cab">
          <div className="fa-identidad">
            {marca?.logo && <span className="fa-logo"><img src={marca.logo} alt="" /></span>}
            <h1 className="fa-emisor">{e.nombre}</h1>
          </div>
          <h2>{a.titulo}</h2>
        </header>
        <div className="fa-datos">
          <div><p className="fa-et">Número</p><p className="fa-num">Nº {a.numero}</p></div>
          {a.fechas.map(([k, v]) => <div key={k}><p className="fa-et">{k}</p><p>{v}</p></div>)}
        </div>
        <div className="fa-partes">
          <div><p className="fa-et">De</p><p><strong>{e.nombre}</strong>{e.nif && <><br />NIF {e.nif}</>}{e.direccion && <><br />{e.direccion}</>}{e.ciudad && <><br />{e.ciudad}</>}</p></div>
          <div><p className="fa-et">{d.tipo === 'albaran' ? 'Entregar a' : 'Cliente'}</p><p><strong>{c.nombre}</strong>{c.nif && <><br />NIF {c.nif}</>}{c.direccion && <><br />{c.direccion}</>}{c.ciudad && <><br />{c.ciudad}</>}</p></div>
        </div>
        <table className="fa-tabla fa-lineas">
          {valorado ? (
            <colgroup><col /><col style={{ width: '50pt' }} /><col style={{ width: '70pt' }} />{a.dto && <col style={{ width: '38pt' }} />}<col style={{ width: '70pt' }} /></colgroup>
          ) : <colgroup><col /><col style={{ width: '80pt' }} /></colgroup>}
          <thead><tr><th>Concepto</th>{valorado ? <><th className="n">Cant.</th><th className="n">Precio</th>{a.dto && <th className="n">Dto.</th>}<th>Importe</th></> : <th>Cantidad</th>}</tr></thead>
          <tbody>
            {d.lineas.map((l, i) => (
              <tr key={i}>
                <td>{l.concepto}</td>
                <td className="n">{eurSin(l.cantidad)}</td>
                {valorado && <><td className="n">{eur(l.precio)}</td>{a.dto && <td className="n">{l.dto ? pctCorto(l.dto) : ''}</td>}<td>{eur(baseLinea(l))}</td></>}
              </tr>
            ))}
          </tbody>
        </table>
        {valorado && (
          <dl className="fa-totales">
            <dt>Base imponible</dt><dd>{eur(a.total.base)}</dd>
            {a.desglose.map((x, i, l) => <Fragment key={i}><dt>IVA {pct(x.pct)}{l.length > 1 ? ` de ${eur(x.base)}` : ''}</dt><dd>{eur(x.iva)}</dd></Fragment>)}
            <div className="fa-total-fila"><dt className="fa-total">Total</dt><dd className="fa-total" style={{ fontSize: '18pt' }}>{eur(a.total.total)}</dd></div>
          </dl>
        )}
        {d.nota && <div className="fa-notas"><p className="fa-et">Notas</p><p>{d.nota}</p></div>}
        {a.recibi && (
          <div className="fa-recibi">
            <div><p className="fa-et">Recibí conforme: nombre y firma</p></div>
            <div><p className="fa-et">Fecha</p></div>
          </div>
        )}
        <footer className="fa-pie"><span>{e.nombre}{e.nif ? ` · NIF ${e.nif}` : ''}</span></footer>
      </div>
    </article>
  );
}
