import Ir from '@/components/Ir';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { normalizarIdFactura } from '@/lib/idFactura';
import { requerir } from '@/lib/auth';
import { leer, leerUno } from '@/lib/redis';
import { leerRango } from '@/lib/indices';
import { apartar, margenIrpf, resumenAnual, trimestre, desglose, emisorDe, importes, numeroFactura, pagadoDe, pendienteDe, vencida, vencimiento } from '@/lib/calculos';
import { eur, fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import FormFactura from '@/components/FormFactura';
import Volver from '@/components/Volver';
import { Borrar } from '@/components/Acciones';
import Cobro from '@/components/Cobro';
import { deshacerDe } from '@/lib/cobroManual';
import EnviarFactura from '@/components/EnviarFactura';
import { diasPrueba } from '@/lib/prueba';
import VerifactuFactura from '@/components/VerifactuFactura';
import { RepetirFactura } from '@/components/Recurrente';
import { asuntoFactura, mensajeFactura } from '@/lib/envio';
import { puede } from '@/lib/permisos';
import { usaIgic, actividadesDe, fiscalDe, limiteSimplificada, nombresActividad, usa130, usa303, ajustesIva, trimestresPresentados } from '@/lib/empresa';
import { enlacePortal } from '@/lib/portal';
import { CambiarEnlace, Compartir } from '@/components/AccionesPresupuesto';
import { proyectosDe } from '@/lib/stockServidor';
import { riesgosPendientes } from '@/lib/tercerosServidor';
import { tieneLimite } from '@/lib/riesgo';
import '@/app/portal.css';

import '@/app/mk.css';
import '@/app/factura-detalle.css';

export const dynamic = 'force-dynamic';

export default async function Factura({ params }) {
  const u = await requerir('facturas');
  const { id } = await params;
  const normalizado = normalizarIdFactura(id);
  if (normalizado !== id) redirect(`/facturas/${encodeURIComponent(normalizado)}`);
  const [f, clientes, recurrentes, productos] = await Promise.all([leerUno(u, 'facturas', id), leer(u, 'clientes'), leer(u, 'recurrentes'), leer(u, 'productos')]);
  if (!f) notFound();
  const editar = puede(u, 'facturar');
  // Factura aún sin enviar (y que no es un cierre de caja): «Enviar al cliente» pasa a ser el botón principal.
  const sinEnviar = editar && !f.envios?.length && !f.caja;
  const portal = editar ? await enlacePortal(u, f.cliente.nombre, f.cliente.nif || '') : null;
  const fiscal = fiscalDe(u);
  const actividades = actividadesDe(u);
  // Riesgo de los clientes con límite (para avisar al editar si la factura subiría por encima).
  const conLimite = editar ? clientes.filter(tieneLimite) : [];
  const debe = conLimite.length ? await riesgosPendientes(u) : new Map();
  const riesgos = Object.fromEntries(conLimite.map((c) => [c.id, debe.get(c.id) || 0]));
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
          {desglose(f).filter((d) => d.re).map((d) => <div key={`re${d.pct}`}><dt>Recargo {String(d.re).replace('.', ',')} %</dt><dd>{eur(d.recargo)}</dd></div>)}
          {f.irpfPct > 0 && <div><dt>IRPF {f.irpfPct} %</dt><dd>−{eur(i.irpf)}</dd></div>}
        </dl>
        <div className="fh-pie">
          <span className={`fh-estado e-${estado.toLowerCase()}`}>{estado}{!f.cobrada && ` · vence el ${fechaTexto(vencimiento(f, u.emisor?.plazo))}`}</span>
          {/* Lo que el cliente dijo desde su portal (estados de la factura electrónica, Ley 18/2022). */}
          {f.estadoCliente && <span className={`fh-estado ${f.estadoCliente.estado === 'rechazada' ? 'e-vencida' : 'e-cobrada'}`}>{f.estadoCliente.estado === 'rechazada' ? `El cliente la rechazó el ${fechaTexto(f.estadoCliente.fecha.slice(0, 10))}: ${f.estadoCliente.motivo}` : `El cliente la dio por conforme el ${fechaTexto(f.estadoCliente.fecha.slice(0, 10))}`}</span>}
          <span>Emitida el {fechaTexto(f.fecha)}</span>
        </div>
        {editar && <div className="fh-cobrada"><Cobro id={f.id} cobrada={Boolean(f.cobrada)} total={i.total} pagado={pagadoDe(f)} pendiente={Math.max(0, pendienteDe(f))} cobro={f.cobro ? { fecha: f.cobro.fecha, metodo: f.cobro.metodo } : null} deshacer={deshacerDe(f)} hoy={hoy()} desde={f.fecha} secundario={sinEnviar} formaInicial={f.formaCobro === 'efectivo' ? 'efectivo' : ''} /></div>}
      </section>
      {/* Lo de cada día arriba (PDF, enviar, duplicar); lo de vez en cuando, en «Más opciones», con Borrar al final. Sin
          enviar todavía, lo principal es mandársela al cliente (auditoría U-10); después, el PDF. */}
      {sinEnviar && <EnviarFactura principal id={f.id} email={f.cliente.email} envios={f.envios} editar={editar}
        asunto={asuntoFactura(f, emisorDe(f, u), u.envio)} mensaje={mensajeFactura(f, emisorDe(f, u), u.envio)} asuntoFijo={diasPrueba(u.plan) > 0} />}
      <div className="acciones-factura">
        <Ir href={`/facturas/${f.id}/pdf`} className={sinEnviar ? 'boton sec' : 'boton'}>Ver / descargar PDF</Ir>
        {editar && <>
        <Ir href={`/facturas/nueva?duplica=${f.id}`} tipo="subir" className="boton sec">Duplicar</Ir>
        {f.serie !== 'R' && !f.caja && <Ir href={`/facturas/nueva?rectifica=${f.id}`} tipo="subir" className="boton sec">Rectificar</Ir>}
        </>}
      </div>
      {!sinEnviar && (editar || f.envios?.length > 0) && <EnviarFactura id={f.id} email={f.cliente.email} envios={f.envios} editar={editar}
        asunto={asuntoFactura(f, emisorDe(f, u), u.envio)} mensaje={mensajeFactura(f, emisorDe(f, u), u.envio)} asuntoFijo={diasPrueba(u.plan) > 0} />}
      {(String(f.cliente?.nif || '').trim() || portal || editar) && <details className="mas-opciones">
        <summary>Más opciones</summary>
        <div className="mas-opciones-c">
          {String(f.cliente?.nif || '').trim() && <p className="nota efactura">Factura electrónica: <a href={`/api/facturas/efactura?id=${encodeURIComponent(f.id)}&formato=facturae`} download>Facturae 3.2.2</a> · <a href={`/api/facturas/efactura?id=${encodeURIComponent(f.id)}&formato=ubl`} download>UBL (Peppol)</a>{f.cobrada ? ` · cobrada${f.cobro?.fecha ? ` el ${fechaTexto(f.cobro.fecha.slice(0, 10))}` : ''}` : ''}</p>}
          {portal && <section className="portal-enlace">
            <p className="nota">Portal de {f.cliente.nombre}: ve todas sus facturas y presupuestos, los descarga en PDF y paga.</p>
            <div className="portal-botones"><Compartir ruta={portal} texto={`Tus documentos de ${u.emisor?.nombre || ''}`.trim()} etiqueta="Enviar su portal" className="boton sec" /><Link href={portal} className="boton sec">Ver su portal</Link><CambiarEnlace datos={{ tipo: 'portal', cliente: f.cliente.nombre, nif: f.cliente.nif || '' }} pregunta={`¿Cambiar el enlace del portal de ${f.cliente.nombre}? El que tiene dejará de funcionar y tendrás que enviarle el nuevo.`} /></div>
          </section>}
          {editar && f.serie !== 'R' && <RepetirFactura factura={f.id} dia={Math.min(28, Number(f.fecha.slice(8, 10)))} existente={recurrentes.find((r) => r.origen === f.id)} />}
          {editar && <div className="mas-opciones-borrar"><Borrar url={`/api/facturas?id=${f.id}`} pregunta={`¿Borrar la factura ${numeroFactura(f)}? Hacienda exige numeración correlativa: si ya la has enviado, mejor haz una rectificativa.`} volver="/facturas" /></div>}
        </div>
      </details>}
      {f.base > 0 && (usa303(fiscal) || usa130(fiscal)) && await (async () => {
        // El IRPF, con el beneficio real del año hasta el trimestre de la factura (sus gastos restan), no con el 95 %.
        let margen;
        if (usa130(fiscal)) {
          const anio = Number(f.fecha.slice(0, 4)), hasta = `${anio}-12-31`;
          const [fs, gs] = await Promise.all([leerRango(u, 'facturas', `${anio}-01-01`, hasta), leerRango(u, 'gastos', `${anio}-01-01`, hasta)]);
          margen = margenIrpf(resumenAnual(fs, gs, anio, {}, actividadesDe(u).map((x) => x.id), { ivaCoste: !usa303(fiscal), iva: ajustesIva(u) }), trimestre(f.fecha)) ?? undefined;
        }
        const a = apartar(f, { margen });
        const iva = usa303(fiscal) ? a.iva : 0;
        const irpf = usa130(fiscal) ? a.irpf : 0;
        return <p className="aviso-plazo"><strong>De esta factura, aparta {eur(iva + irpf)} para Hacienda</strong><span>{[usa303(fiscal) && `IVA ${eur(iva)}`, usa130(fiscal) && `IRPF que te faltará en el 130 ≈ ${eur(irpf)}${margen !== undefined ? ` (con tu beneficio real: ${Math.round(a.margen * 100)} % de lo facturado)` : ''}`].filter(Boolean).join(' + ')}</span></p>;
      })()}
      {f.cobro?.metodo === 'stripe' && <p className="nota">Pagada con tarjeta o Bizum el {fechaTexto(f.cobro.fecha.slice(0, 10))} ({eur(f.cobro.importe)}).</p>}
      {f.rectifica && <p className="nota">Rectifica la factura {f.rectifica.numero}.</p>}
      {f.verifactu && <p className={f.verifactu.estado === 'Incorrecto' ? 'error' : 'nota'}>{`Verifactu${f.verifactu.modo === 'pruebas' ? ' (pruebas)' : ''}: ${
        { Correcto: `registrada en la AEAT${f.verifactu.csv ? ` (CSV ${f.verifactu.csv})` : ''}.`, AceptadoConErrores: `registrada en la AEAT con avisos: ${f.verifactu.error}`, Incorrecto: `la AEAT la ha rechazado: ${f.verifactu.error}` }[f.verifactu.estado]
        || `pendiente de enviar a la AEAT${f.verifactu.error ? ` (último intento: ${f.verifactu.error})` : ''}. Se envía sola.`}`}</p>}
      {f.verifactu && editar && <VerifactuFactura factura={f} admin={u.rol === 'admin'} />}
      {/* Los datos completos (líneas, cliente, notas) se ven y se editan plegados: la pantalla es para consultarla. */}
      <details className="editar-factura">
        <summary>{editar && !f.verifactu ? 'Ver y editar los datos' : 'Ver los datos de la factura'}</summary>
      <fieldset className="solo-ver" disabled={!editar}><FormFactura presentados={trimestresPresentados(u)} igic={usaIgic(fiscalDe(u))} key={JSON.stringify(f)} recargo={usa303(fiscal)} oss={usa303(fiscal) && Boolean(fiscal.oss)} margenes={['rebu', 'reav'].filter((k) => fiscal[k])} reagp={fiscal.iva === 'reagp'} limiteSimplificada={limiteSimplificada(fiscal)} factura={f} clientes={clientes} actividades={actividades} productos={(productos || []).sort((a, b) => a.nombre.localeCompare(b.nombre))} riesgos={riesgos} proyectos={editar ? await proyectosDe(u) : []} /></fieldset>
      </details>
    </main>
  );
}

export async function generateMetadata({ params }) {
  const u = await requerir('facturas');
  const d = await leerUno(u, 'facturas', normalizarIdFactura((await params).id));
  return { title: d ? `Factura ${numeroFactura(d)}` : 'Factura' };
}
