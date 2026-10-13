import Ir from '@/components/Ir';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leer, leerUno } from '@/lib/redis';
import { apartar, desglose, emisorDe, importes, numeroFactura, vencida, vencimiento } from '@/lib/calculos';
import { eur, fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import FormFactura from '@/components/FormFactura';
import Volver from '@/components/Volver';
import { Borrar, Cobrada } from '@/components/Acciones';
import EnviarFactura from '@/components/EnviarFactura';
import VerifactuFactura from '@/components/VerifactuFactura';
import { RepetirFactura } from '@/components/Recurrente';
import { asuntoFactura, mensajeFactura } from '@/lib/envio';
import { puede } from '@/lib/permisos';
import { actividadesDe, fiscalDe, nombresActividad, usa130, usa303 } from '@/lib/empresa';
import { enlacePortal } from '@/lib/portal';
import { Compartir } from '@/components/AccionesPresupuesto';
import { proyectosDe } from '@/lib/stockServidor';
import '@/app/portal.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Factura({ params }) {
  const u = await requerir('facturas');
  const { id } = await params;
  const [f, clientes, recurrentes, productos] = await Promise.all([leerUno(u, 'facturas', id), leer(u, 'clientes'), leer(u, 'recurrentes'), leer(u, 'productos')]);
  if (!f) notFound();
  const editar = puede(u, 'facturar');
  const portal = editar ? await enlacePortal(u, f.cliente.nombre) : null;
  const fiscal = fiscalDe(u);
  const actividades = actividadesDe(u);
  const i = importes(f);
  const estado = f.cobrada ? 'Cobrada' : vencida(f, u.emisor?.plazo, hoy()) ? 'Vencida' : 'Pendiente';
  if (f.caja) {
    const nombres = Object.fromEntries((productos || []).map((p) => [p.id, p.nombre]));
    return (
      <main className="pagina mk-look">
        <Volver href="/facturas">Facturas</Volver>
        <section className="factura-hero">
          <p className="fh-num">Cierre de caja {numeroFactura(f)}{actividades.length > 1 ? ` · ${nombresActividad(actividades)[f.actividad] || ''}` : ''}</p>
          <h1 className="fh-cliente">Ventas del {fechaTexto(f.fecha)}</h1>
          <p className="fh-total">{eur(i.total)}</p>
          <dl className="fh-desglose">
            <div><dt>Base</dt><dd>{eur(i.base)}</dd></div>
            {desglose(f).map((d) => <div key={d.pct}><dt>IVA {d.pct} %</dt><dd>{eur(d.iva)}</dd></div>)}
          </dl>
          <dl className="fh-desglose">
            <div><dt>Efectivo</dt><dd>{eur(f.caja.efectivo)}</dd></div>
            <div><dt>Tarjeta</dt><dd>{eur(f.caja.tarjeta)}</dd></div>
            {f.caja.otros > 0 && <div><dt>Otros</dt><dd>{eur(f.caja.otros)}</dd></div>}
          </dl>
        </section>
        {editar && <div className="acciones-factura">
          <Ir href={`/facturas/caja?id=${encodeURIComponent(f.id)}`} className="boton sec">Corregir</Ir>
          <Borrar url={`/api/facturas?id=${encodeURIComponent(f.id)}`} pregunta={`¿Borrar el cierre de caja ${numeroFactura(f)}?`} volver="/facturas" />
        </div>}
        {f.resumen && <p className="nota">Tiques {f.resumen.desde}{f.resumen.hasta ? ` a ${f.resumen.hasta}` : ''} (asiento resumen en el libro registro).</p>}
        {f.importado && <p className="nota">Importado de {f.importado}.</p>}
        {f.nota && <p className="nota">{f.nota}</p>}
        {f.proyecto && <p className="nota">Local o centro: <Link href={`/proyectos?p=${encodeURIComponent(f.proyecto)}`}>{f.proyecto}</Link></p>}
        {f.unidades?.length > 0 && <section className="bloque">
          <h2 className="grupo-t">Unidades vendidas</h2>
          <ul className="grupo-lista">{f.unidades.map((x) => <li key={x.producto}><Link href={`/inventario/${x.producto}`} className="fila"><span className="txt"><strong>{nombres[x.producto] || 'Producto borrado'}</strong><small>{eur(x.importe)} sin IVA</small></span><span className="imp">{String(x.cantidad).replace('.', ',')} ud.</span></Link></li>)}</ul>
        </section>}
        <p className="grupo-pie">Factura simplificada de resumen: cuenta en el IVA, la contabilidad y los libros registro. No se envía a Verifactu (los tiques ya los registra el TPV).</p>
      </main>
    );
  }
  return (
    <main className="pagina mk-look">
      <Volver href="/facturas">Facturas</Volver>
      <section className="factura-hero">
        <p className="fh-num">Factura {numeroFactura(f)}{actividades.length > 1 ? ` · ${nombresActividad(actividades)[f.actividad] || ''}` : ''}</p>
        <h1 className="fh-cliente">{f.cliente.nombre}</h1>
        <p className="fh-total">{eur(i.total)}</p>
        <dl className="fh-desglose">
          <div><dt>Base</dt><dd>{eur(i.base)}</dd></div>
          {desglose(f).map((d) => <div key={d.pct}><dt>IVA {d.pct} %</dt><dd>{eur(d.iva)}</dd></div>)}
          {f.irpfPct > 0 && <div><dt>IRPF {f.irpfPct} %</dt><dd>−{eur(i.irpf)}</dd></div>}
        </dl>
        <div className="fh-pie">
          <span className={`fh-estado e-${estado.toLowerCase()}`}>{estado}{!f.cobrada && ` · vence el ${fechaTexto(vencimiento(f, u.emisor?.plazo))}`}</span>
          <span>{fechaTexto(f.fecha)}</span>
        </div>
        {editar && <div className="fh-cobrada"><Cobrada id={f.id} cobrada={f.cobrada} /></div>}
      </section>
      <div className="acciones-factura">
        <Ir href={`/facturas/${f.id}/pdf`} className="boton">Ver / descargar PDF</Ir>
        {editar && <>
        <Ir href={`/facturas/nueva?duplica=${f.id}`} tipo="subir" className="boton sec">Duplicar</Ir>
        {!f.serie && <Ir href={`/facturas/nueva?rectifica=${f.id}`} tipo="subir" className="boton sec">Rectificar</Ir>}
        <Borrar url={`/api/facturas?id=${f.id}`} pregunta={`¿Borrar la factura ${numeroFactura(f)}? Hacienda exige numeración correlativa: si ya la has enviado, mejor haz una rectificativa.`} volver="/facturas" />
        </>}
      </div>
      {String(f.cliente?.nif || '').trim() && <p className="nota efactura">Factura electrónica: <a href={`/api/facturas/efactura?id=${encodeURIComponent(f.id)}&formato=facturae`} download>Facturae 3.2.2</a> · <a href={`/api/facturas/efactura?id=${encodeURIComponent(f.id)}&formato=ubl`} download>UBL (Peppol)</a>{f.cobrada ? ` · cobrada${f.cobro?.fecha ? ` el ${fechaTexto(f.cobro.fecha.slice(0, 10))}` : ''}` : ''}</p>}
      {(editar || f.envios?.length > 0) && <EnviarFactura id={f.id} email={f.cliente.email} envios={f.envios} editar={editar}
        asunto={asuntoFactura(f, emisorDe(f, u))} mensaje={mensajeFactura(f, emisorDe(f, u))} />}
      {portal && <section className="portal-enlace">
        <p className="nota">Portal de {f.cliente.nombre}: ve todas sus facturas y presupuestos, los descarga en PDF y paga.</p>
        <div className="portal-botones"><Compartir ruta={portal} texto={`Tus documentos de ${u.emisor?.nombre || ''}`.trim()} etiqueta="Enviar su portal" className="boton sec" /><Link href={portal} className="boton sec">Ver su portal</Link></div>
      </section>}
      {editar && f.serie !== 'R' && <RepetirFactura factura={f.id} dia={Math.min(28, Number(f.fecha.slice(8, 10)))} existente={recurrentes.find((r) => r.origen === f.id)} />}
      {f.base > 0 && (usa303(fiscal) || usa130(fiscal)) && (() => {
        const a = apartar(f);
        const iva = usa303(fiscal) ? a.iva : 0;
        const irpf = usa130(fiscal) ? a.irpf : 0;
        return <p className="aviso-plazo"><strong>De esta factura, aparta {eur(iva + irpf)} para Hacienda</strong><span>{[usa303(fiscal) && `IVA ${eur(iva)}`, usa130(fiscal) && `IRPF que te faltará en el 130 ≈ ${eur(irpf)}`].filter(Boolean).join(' + ')}</span></p>;
      })()}
      {f.cobro?.metodo === 'stripe' && <p className="nota">Pagada con tarjeta o Bizum el {fechaTexto(f.cobro.fecha.slice(0, 10))} ({eur(f.cobro.importe)}).</p>}
      {f.rectifica && <p className="nota">Rectifica la factura {f.rectifica.numero}.</p>}
      {f.verifactu && <p className={f.verifactu.estado === 'Incorrecto' ? 'error' : 'nota'}>{`Verifactu${f.verifactu.modo === 'pruebas' ? ' (pruebas)' : ''}: ${
        { Correcto: `registrada en la AEAT${f.verifactu.csv ? ` (CSV ${f.verifactu.csv})` : ''}.`, AceptadoConErrores: `registrada en la AEAT con avisos: ${f.verifactu.error}`, Incorrecto: `la AEAT la ha rechazado: ${f.verifactu.error}` }[f.verifactu.estado]
        || `pendiente de enviar a la AEAT${f.verifactu.error ? ` (último intento: ${f.verifactu.error})` : ''}. Se envía sola.`}`}</p>}
      {f.verifactu && editar && <VerifactuFactura factura={f} admin={u.rol === 'admin'} />}
      <fieldset className="solo-ver" disabled={!editar}><FormFactura key={JSON.stringify(f)} factura={f} clientes={clientes} actividades={actividades} productos={(productos || []).sort((a, b) => a.nombre.localeCompare(b.nombre))} proyectos={editar ? await proyectosDe(u) : []} /></fieldset>
    </main>
  );
}
