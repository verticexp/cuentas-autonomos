import { conHuecos } from '@/lib/huecos';
import { textos } from '@/lib/idiomaServidor';
import Ir from '@/components/Ir';
import { cuentasArqueo, SALIDAS_CAJA } from '@/lib/caja';
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
import { usaIgic, actividadesDe, faltanDatosFactura, fiscalDe, limiteSimplificada, nombresActividad, usa130, usa303, ajustesIva, trimestresPresentados } from '@/lib/empresa';
import { enlacePortal } from '@/lib/portal';
import { CambiarEnlace, Compartir } from '@/components/AccionesPresupuesto';
import { proyectosDe } from '@/lib/stockServidor';
import { riesgosPendientes } from '@/lib/tercerosServidor';
import { tieneLimite } from '@/lib/riesgo';
import { identidadDoc } from '@/lib/documento';
import VistaA4 from '@/components/VistaA4';
import FacturaA4 from '@/components/FacturaA4';
import '@/app/portal.css';

import '@/app/mk.css';
import '@/app/factura-detalle.css';

export const dynamic = 'force-dynamic';

export default async function Factura({ params }) {
  const tr = await textos();
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
    const arq = cuentasArqueo(f);
    return (
      <main className="pagina mk-look">
        <Volver href="/facturas">{tr('Facturas')}</Volver>
        <section className="factura-hero">
          <p className="fh-num">{(actividades.length > 1 ? tr('Cierre de caja {numero} · {actividad}', { numero: numeroFactura(f), actividad: nombresActividad(actividades)[f.actividad] || '' }) : tr('Cierre de caja {numero}', { numero: numeroFactura(f) }))}</p>
          <h1 className="fh-cliente">{tr('Ventas del {fecha}', { fecha: tr(fechaTexto(f.fecha)) })}</h1>
          <p className="fh-total">{eur(i.total)}</p>
          <dl className="fh-desglose">
            <div><dt>{tr('Base')}</dt><dd>{eur(i.base)}</dd></div>
            {desglose(f).map((d) => <div key={d.pct}><dt>{tr('IVA {porcentaje} %', { porcentaje: d.pct })}</dt><dd>{eur(d.iva)}</dd></div>)}
          </dl>
          <dl className="fh-desglose">
            <div><dt>{tr('Efectivo')}</dt><dd>{eur(f.caja.efectivo)}</dd></div>
            <div><dt>{tr('Tarjeta')}</dt><dd>{eur(f.caja.tarjeta)}</dd></div>
            {f.caja.otros > 0 && <div><dt>{tr('Otros')}</dt><dd>{eur(f.caja.otros)}</dd></div>}
          </dl>
          {arq && <dl className="fh-desglose">
            <div><dt>{tr('Debería haber')}</dt><dd>{eur(arq.esperado)}</dd></div>
            <div><dt>{tr('Contado')}</dt><dd>{eur(arq.contado)}</dd></div>
            <div><dt>{(!arq.descuadre ? tr('Arqueo') : (arq.descuadre > 0 ? tr('Sobrante') : tr('Faltante')))}</dt><dd className={arq.descuadre ? 'rojo' : ''}>{(!arq.descuadre ? tr('Cuadra') : eur(Math.abs(arq.descuadre)))}</dd></div>
          </dl>}
        </section>
        {f.caja.arqueo?.salidas?.length > 0 && <p className="nota">{tr('Salió del cajón: {salidas}. Fondo al abrir: {fondo}.', { salidas: f.caja.arqueo.salidas.map((x) => tr(x.concepto ? '{tipo} ({concepto}) {importe}' : '{tipo} {importe}', { tipo: tr(SALIDAS_CAJA[x.tipo]), concepto: x.concepto, importe: eur(x.importe) })).join(' · '), fondo: eur(f.caja.arqueo.fondo) })}</p>}
        {editar && <div className="acciones-factura">
          <Ir href={`/facturas/caja?id=${encodeURIComponent(f.id)}`} className="boton sec">{tr('Corregir')}</Ir>
          <Borrar url={`/api/facturas?id=${encodeURIComponent(f.id)}`} pregunta={tr('¿Borrar el cierre de caja {numero}?', { numero: numeroFactura(f) })} volver="/facturas" />
        </div>}
        {f.resumen && <p className="nota">{(f.resumen.hasta ? tr('Tiques {desde} a {hasta} (asiento resumen en el libro registro).', { desde: f.resumen.desde, hasta: f.resumen.hasta }) : tr('Tiques {desde} (asiento resumen en el libro registro).', { desde: f.resumen.desde }))}</p>}
        {f.importado && <p className="nota">{tr('Importado de {origen}.', { origen: f.importado })}</p>}
        {f.nota && <p className="nota">{f.nota}</p>}
        {f.proyecto && <p className="nota">{conHuecos(tr('Local o centro: {proyecto}'), { proyecto: <Link href={`/proyectos?p=${encodeURIComponent(f.proyecto)}`}>{f.proyecto}</Link> })}</p>}
        {f.unidades?.length > 0 && <section className="bloque">
          <h2 className="grupo-t">{tr('Unidades vendidas')}</h2>
          <ul className="grupo-lista">{f.unidades.map((x) => <li key={x.producto}><Link href={`/inventario/${x.producto}`} className="fila"><span className="txt"><strong>{(nombres[x.producto] || tr('Producto borrado'))}</strong><small>{tr('{importe} sin IVA', { importe: eur(x.importe) })}</small></span><span className="imp">{tr('{cantidad} ud.', { cantidad: String(x.cantidad).replace('.', ',') })}</span></Link></li>)}</ul>
        </section>}
        <p className="grupo-pie">{tr('Factura simplificada de resumen: cuenta en el IVA, la contabilidad y los libros registro. No se envía a Verifactu (los tiques ya los registra el TPV).')}</p>
      </main>
    );
  }
  // En el ordenador ancho, la factura tal como sale en el PDF, a la derecha (lo que antes era un hueco de 400 px).
  const { emisor: emisorDoc, marca } = await identidadDoc(u, f);
  const vista = !faltanDatosFactura(emisorDoc).length;
  return (
    <main className="pagina mk-look">
      <Volver href="/facturas">{tr('Facturas')}</Volver>
      <div className="fd-rejilla">
      <div className="fd-col">
      <section className="factura-hero">
        <p className="fh-num">{(actividades.length > 1 ? tr('Factura {numero} · {actividad}', { numero: numeroFactura(f), actividad: nombresActividad(actividades)[f.actividad] || '' }) : tr('Factura {numero}', { numero: numeroFactura(f) }))}</p>
        <h1 className="fh-cliente">{f.cliente.nombre}</h1>
        <p className="fh-total">{eur(i.total)}</p>
        <dl className="fh-desglose">
          <div><dt>{tr('Base')}</dt><dd>{eur(i.base)}</dd></div>
          {desglose(f).map((d) => <div key={d.pct}><dt>{tr('IVA {porcentaje} %', { porcentaje: d.pct })}</dt><dd>{eur(d.iva)}</dd></div>)}
          {desglose(f).filter((d) => d.re).map((d) => <div key={`re${d.pct}`}><dt>{tr('Recargo {porcentaje} %', { porcentaje: String(d.re).replace('.', ',') })}</dt><dd>{eur(d.recargo)}</dd></div>)}
          {f.irpfPct > 0 && <div><dt>{tr('IRPF {porcentaje} %', { porcentaje: f.irpfPct })}</dt><dd>−{eur(i.irpf)}</dd></div>}
        </dl>
        <div className="fh-pie">
          <span className={`fh-estado e-${estado.toLowerCase()}`}>{(!f.cobrada ? tr('{estado} · vence el {fecha}', { estado: tr(estado), fecha: tr(fechaTexto(vencimiento(f, u.emisor?.plazo))) }) : tr(estado))}</span>
          {/* Lo que el cliente dijo desde su portal (estados de la factura electrónica, Ley 18/2022). */}
          {f.estadoCliente && <span className={`fh-estado ${f.estadoCliente.estado === 'rechazada' ? 'e-vencida' : 'e-cobrada'}`}>{(f.estadoCliente.estado === 'rechazada' ? tr('El cliente la rechazó el {fecha}: {motivo}', { fecha: tr(fechaTexto(f.estadoCliente.fecha.slice(0, 10))), motivo: f.estadoCliente.motivo }) : tr('El cliente la dio por conforme el {fecha}', { fecha: tr(fechaTexto(f.estadoCliente.fecha.slice(0, 10))) }))}</span>}
          <span>{tr('Emitida el {fecha}', { fecha: tr(fechaTexto(f.fecha)) })}</span>
        </div>
        {editar && <div className="fh-cobrada"><Cobro id={f.id} cobrada={Boolean(f.cobrada)} total={i.total} pagado={pagadoDe(f)} pendiente={Math.max(0, pendienteDe(f))} cobro={f.cobro ? { fecha: f.cobro.fecha, metodo: f.cobro.metodo } : null} deshacer={deshacerDe(f)} hoy={hoy()} desde={f.fecha} secundario={sinEnviar} formaInicial={f.formaCobro === 'efectivo' ? 'efectivo' : ''} /></div>}
      </section>
      {/* Lo de cada día arriba (PDF, enviar, duplicar); lo de vez en cuando, en «Más opciones», con Borrar al final. Sin
          enviar todavía, lo principal es mandársela al cliente (auditoría U-10); después, el PDF. */}
      {sinEnviar && <EnviarFactura principal id={f.id} email={f.cliente.email} envios={f.envios} editar={editar}
        asunto={asuntoFactura(f, emisorDe(f, u), u.envio)} mensaje={mensajeFactura(f, emisorDe(f, u), u.envio)} asuntoFijo={diasPrueba(u.plan) > 0} />}
      <div className="acciones-factura">
        <Ir href={`/facturas/${f.id}/pdf`} className={sinEnviar ? 'boton sec' : 'boton'}>{tr('Ver / descargar PDF')}</Ir>
        {editar && <>
        <Ir href={`/facturas/nueva?duplica=${f.id}`} tipo="subir" className="boton sec">{tr('Duplicar')}</Ir>
        {f.serie !== 'R' && !f.caja && <Ir href={`/facturas/nueva?rectifica=${f.id}`} tipo="subir" className="boton sec">{tr('Rectificar')}</Ir>}
        </>}
      </div>
      {!sinEnviar && (editar || f.envios?.length > 0) && <EnviarFactura id={f.id} email={f.cliente.email} envios={f.envios} editar={editar}
        asunto={asuntoFactura(f, emisorDe(f, u), u.envio)} mensaje={mensajeFactura(f, emisorDe(f, u), u.envio)} asuntoFijo={diasPrueba(u.plan) > 0} />}
      {(String(f.cliente?.nif || '').trim() || portal || editar) && <details className="mas-opciones">
        <summary>{tr('Más opciones')}</summary>
        <div className="mas-opciones-c">
          {String(f.cliente?.nif || '').trim() && <p className="nota efactura">{conHuecos(tr(f.cobrada ? (f.cobro?.fecha ? 'Factura electrónica: {facturae} · {ubl} · cobrada el {fecha}' : 'Factura electrónica: {facturae} · {ubl} · cobrada') : 'Factura electrónica: {facturae} · {ubl}'), { facturae: <a href={`/api/facturas/efactura?id=${encodeURIComponent(f.id)}&formato=facturae`} download>Facturae 3.2.2</a>, ubl: <a href={`/api/facturas/efactura?id=${encodeURIComponent(f.id)}&formato=ubl`} download>UBL (Peppol)</a>, fecha: f.cobro?.fecha ? fechaTexto(f.cobro.fecha.slice(0, 10)) : '' })}</p>}
          {portal && <section className="portal-enlace">
            <p className="nota">{tr('Portal de {cliente}: ve todas sus facturas y presupuestos, los descarga en PDF y paga.', { cliente: f.cliente.nombre })}</p>
            <div className="portal-botones"><Compartir ruta={portal} texto={tr('Tus documentos de {nombre}', { nombre: u.emisor?.nombre || '' }).trim()} etiqueta={tr('Enviar su portal')} className="boton sec" /><Link href={portal} className="boton sec">{tr('Ver su portal')}</Link><CambiarEnlace datos={{ tipo: 'portal', cliente: f.cliente.nombre, nif: f.cliente.nif || '' }} pregunta={tr('¿Cambiar el enlace del portal de {cliente}? El que tiene dejará de funcionar y tendrás que enviarle el nuevo.', { cliente: f.cliente.nombre })} etiqueta={tr('Cambiar el enlace del portal')} /></div>
          </section>}
          {editar && f.serie !== 'R' && <RepetirFactura factura={f.id} dia={Math.min(28, Number(f.fecha.slice(8, 10)))} existente={recurrentes.find((r) => r.origen === f.id)} />}
          {editar && <div className="mas-opciones-borrar"><Borrar url={`/api/facturas?id=${f.id}`} pregunta={tr('¿Borrar la factura {numero}? Hacienda exige numeración correlativa: si ya la has enviado, mejor haz una rectificativa.', { numero: numeroFactura(f) })} volver="/facturas" /></div>}
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
        return <p className="aviso-plazo"><strong>{tr('De esta factura, aparta {importe} para Hacienda', { importe: eur(iva + irpf) })}</strong><span>{[usa303(fiscal) && tr('IVA {importe}', { importe: eur(iva) }), usa130(fiscal) && (margen !== undefined ? tr('IRPF que te faltará en el 130 ≈ {importe} (con tu beneficio real: {porcentaje} % de lo facturado)', { importe: eur(irpf), porcentaje: Math.round(a.margen * 100) }) : tr('IRPF que te faltará en el 130 ≈ {importe}', { importe: eur(irpf) }))].filter(Boolean).join(' + ')}</span></p>;
      })()}
      {f.cobro?.metodo === 'stripe' && <p className="nota">{tr('Cobrada con tarjeta o Bizum el {fecha} ({importe}).', { fecha: tr(fechaTexto(f.cobro.fecha.slice(0, 10))), importe: eur(f.cobro.importe) })}</p>}
      {f.rectifica && <p className="nota">{tr('Rectifica la factura {numero}.', { numero: f.rectifica.numero })}</p>}
      {f.verifactu && <p className={f.verifactu.estado === 'Incorrecto' ? 'error' : 'nota'}>{(() => {
        const v = f.verifactu;
        const mensajes = v.modo === 'pruebas' ? {
          Correcto: v.csv ? 'Verifactu (pruebas): registrada en la AEAT (CSV {csv}).' : 'Verifactu (pruebas): registrada en la AEAT.',
          AceptadoConErrores: 'Verifactu (pruebas): registrada en la AEAT con avisos: {error}',
          Incorrecto: 'Verifactu (pruebas): la AEAT la ha rechazado: {error}',
          pendiente: v.error ? 'Verifactu (pruebas): pendiente de enviar a la AEAT (último intento: {error}). Se envía sola.' : 'Verifactu (pruebas): pendiente de enviar a la AEAT. Se envía sola.',
        } : {
          Correcto: v.csv ? 'Verifactu: registrada en la AEAT (CSV {csv}).' : 'Verifactu: registrada en la AEAT.',
          AceptadoConErrores: 'Verifactu: registrada en la AEAT con avisos: {error}',
          Incorrecto: 'Verifactu: la AEAT la ha rechazado: {error}',
          pendiente: v.error ? 'Verifactu: pendiente de enviar a la AEAT (último intento: {error}). Se envía sola.' : 'Verifactu: pendiente de enviar a la AEAT. Se envía sola.',
        };
        return tr(mensajes[v.estado] || mensajes.pendiente, { csv: v.csv, error: tr(v.error) });
      })()}</p>}
      {f.verifactu && editar && <VerifactuFactura factura={f} admin={u.rol === 'admin'} />}
      {/* Los datos completos (líneas, cliente, notas) se ven y se editan plegados: la pantalla es para consultarla. */}
      <details className="editar-factura">
        <summary>{(editar && !f.verifactu ? tr('Ver y editar los datos') : tr('Ver los datos de la factura'))}</summary>
      <fieldset className="solo-ver" disabled={!editar}><FormFactura presentados={trimestresPresentados(u)} igic={usaIgic(fiscalDe(u))} key={JSON.stringify(f)} recargo={usa303(fiscal)} oss={usa303(fiscal) && Boolean(fiscal.oss)} margenes={['rebu', 'reav'].filter((k) => fiscal[k])} reagp={fiscal.iva === 'reagp'} limiteSimplificada={limiteSimplificada(fiscal)} factura={f} clientes={clientes} actividades={actividades} productos={(productos || []).sort((a, b) => a.nombre.localeCompare(b.nombre))} riesgos={riesgos} proyectos={editar ? await proyectosDe(u) : []} /></fieldset>
      </details>
      </div>
      {vista && (
        <aside className="fd-vista" aria-label={tr('Vista previa del PDF')}>
          <Ir href={`/facturas/${f.id}/pdf`} className="fd-vista-a4" aria-label={tr('Abrir el PDF de la factura {numero}', { numero: numeroFactura(f) })}>
            <VistaA4><FacturaA4 f={f} e={emisorDoc} marca={marca} /></VistaA4>
          </Ir>
        </aside>
      )}
      </div>
    </main>
  );
}

export async function generateMetadata({ params }) {
  const tr = await textos();
  const u = await requerir('facturas');
  const d = await leerUno(u, 'facturas', normalizarIdFactura((await params).id));
  return { title: (d ? tr('Factura {numero}', { numero: numeroFactura(d) }) : tr('Factura')) };
}
