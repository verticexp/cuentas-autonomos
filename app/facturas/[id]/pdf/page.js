import { notFound } from 'next/navigation';
import { requerir, usuarioActual } from '@/lib/auth';
import { leerUno } from '@/lib/redis';
import { importes, numeroFactura } from '@/lib/calculos';
import { eur, fechaCorta, pct, textoEvento } from '@/lib/formato';
import Volver from '@/components/Volver';
import VistaA4 from '@/components/VistaA4';
import DescargarPdf from '@/components/DescargarPdf';
import { aclarar, colorValido } from '@/lib/marca';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const u = await usuarioActual();
  const f = u && (await leerUno(u, 'facturas', (await params).id));
  return { title: f ? `${numeroFactura(f)}-${f.cliente.nombre.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}` : 'Factura' };
}

export default async function PDF({ params }) {
  const u = await requerir('facturas');
  const f = await leerUno(u, 'facturas', (await params).id);
  if (!f) notFound();
  const t = importes(f);
  const c = f.cliente;
  const EMISOR = u.emisor || {};
  if (!EMISOR.nif || !EMISOR.iban) {
    return <main className="aviso"><h1>Faltan tus datos de facturación</h1><p>Rellena tu nombre, NIF, dirección e IBAN en <a href="/ajustes">Ajustes</a> para generar el PDF.</p></main>;
  }

  const nombre = `${numeroFactura(f)} ${c.nombre.toUpperCase().replace(/[^A-Z0-9ÀÈÉÍÒÓÚÇÑ ]+/g, '').trim()}.pdf`;
  return (
    <div className="pdf-fondo" style={{ paddingTop: 0 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px', background: 'var(--paper)', borderBottom: '1px solid var(--line)', marginBottom: 12 }}>
        <div style={{ marginBottom: -8 }}><Volver href={`/facturas/${f.id}`}>Factura {numeroFactura(f)}</Volver></div>
        <DescargarPdf id={f.id} nombre={nombre} />
      </div>
      <VistaA4>
      <article className="factura-a4" style={{ ...(colorValido(u.marca?.color) ? { '--f-oro': u.marca.color, '--f-verde': u.marca.color, '--f-fondo': aclarar(u.marca.color, 0.92), '--f-linea': aclarar(u.marca.color, 0.6) } : {}), position: 'relative', width: 794, minHeight: 1123, margin: 0, padding: '83px 76px', boxShadow: '0 4px 24px rgba(0,0,0,.12)' }}>
        {u.marca?.logo && <img src={u.marca.logo} alt="" style={{ position: 'absolute', top: 60, right: 76, maxWidth: 150, maxHeight: 64 }} />}
        <p className="f-num">{f.serie === 'R' ? `FACTURA RECTIFICATIVA ${numeroFactura(f)}` : numeroFactura(f)}</p>
        <h1 className="f-nombre" style={{ fontSize: '30pt' }}>{EMISOR.nombre}</h1>
        <p className="f-gris">NIF: {EMISOR.nif}<br />{EMISOR.direccion}<br />{EMISOR.ciudad}</p>

        <div className="f-seccion">
          <div>
            <h2>FACTURAR A</h2>
            <p>{c.nombre}{c.nif && <><br />{c.nif}</>}{c.direccion && <><br />{c.direccion}</>}{c.ciudad && <><br />{c.ciudad}</>}</p>
          </div>
          <p><strong className="f-oro">FECHA:</strong> {fechaCorta(f.fecha)}</p>
        </div>

        <table className="f-tabla">
          <thead><tr><th>Detalles</th><th>IMPORTE</th></tr></thead>
          <tbody><tr><td>{f.concepto}{textoEvento(f) && <><br />{textoEvento(f)}</>}</td><td>{eur(t.base)}</td></tr></tbody>
        </table>

        <table className="f-resumen">
          <tbody>
            <tr><td>SUBTOTAL</td><td>{eur(t.base)}</td></tr>
            <tr><td>I.V.A</td><td>{pct(f.ivaPct)}</td></tr>
            {f.irpfPct > 0 && <tr><td>I.R.P.F</td><td>{pct(f.irpfPct)}</td></tr>}
            <tr className="f-total"><td>TOTAL</td><td>{eur(t.total)}</td></tr>
          </tbody>
        </table>

        {f.rectifica && <p className="f-nota">Rectifica la factura nº {f.rectifica.numero} de fecha {fechaCorta(f.rectifica.fecha)}.</p>}
        {f.nota && <p className="f-nota">{f.nota}</p>}

        <h2>CONDICIONES Y FORMA DE PAGO</h2>
        <p>El pago se efectuará, en un plazo máximo de {EMISOR.plazo} días, por transferencia bancaria a la cuenta:<br />{EMISOR.iban}</p>
      </article>
      </VistaA4>
    </div>
  );
}
