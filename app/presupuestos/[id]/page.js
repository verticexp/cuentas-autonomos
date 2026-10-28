import { conHuecos } from '@/lib/huecos';
import { textos } from '@/lib/idiomaServidor';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leer, leerUno } from '@/lib/redis';
import { importes } from '@/lib/calculos';
import { eur, fechaTexto, hoy, textoEvento } from '@/lib/formato';
import { actividadesDe } from '@/lib/empresa';
import { puede } from '@/lib/permisos';
import { ESTADOS, baseResto, baseSenal, caduca, estadoDe, numeroPresupuesto } from '@/lib/presupuestos';
import { Borrar } from '@/components/Acciones';
import { CambiarEnlace, Compartir, Facturar, MarcarAceptado } from '@/components/AccionesPresupuesto';
import { enlacePortal } from '@/lib/portal';
import '@/app/portal.css';
import FormPresupuesto from '@/components/FormPresupuesto';
import Volver from '@/components/Volver';
import Conceptos from '@/components/Conceptos';
import EnviarFactura from '@/components/EnviarFactura';
import { asuntoPresupuesto, mensajePresupuesto } from '@/lib/envio';
import { diasPrueba } from '@/lib/prueba';

import '@/app/mk.css';
import '@/app/factura-detalle.css';

export const dynamic = 'force-dynamic';

export default async function Presupuesto({ params }) {
  const tr = await textos();
  const u = await requerir('facturas');
  const { id } = await params;
  const [p, clientes] = await Promise.all([leerUno(u, 'presupuestos', id), leer(u, 'clientes')]);
  if (!p) notFound();
  const editar = puede(u, 'facturar');
  const portal = editar ? await enlacePortal(u, p.cliente.nombre, p.cliente.nif || '') : null;
  const estado = estadoDe(p, hoy());
  const i = importes(p);
  const senal = p.facturas.find((f) => f.tipo === 'senal');
  return (
    <main className="pagina mk-look">
      <Volver href="/presupuestos">{tr('Presupuestos')}</Volver>
      <section className="factura-hero">
        <p className="fh-num">{tr('Presupuesto {numero}', { numero: numeroPresupuesto(p) })}</p>
        <h1 className="fh-cliente">{p.cliente.nombre}</h1>
        <p className="fh-total">{eur(i.total)}</p>
        <dl className="fh-desglose">
          <div><dt>{tr('Base')}</dt><dd>{eur(i.base)}</dd></div>
          <div><dt>{tr('IVA {porcentaje} %', { porcentaje: p.ivaPct })}</dt><dd>{eur(i.iva)}</dd></div>
          {p.senalPct > 0 && <div><dt>{tr('Señal {porcentaje} %', { porcentaje: p.senalPct })}</dt><dd>{tr('{importe} + IVA', { importe: eur(baseSenal(p)) })}</dd></div>}
        </dl>
        <div className="fh-pie">
          <span className={`fh-estado ${ESTADOS[estado][1]}`}>{(estado === 'pendiente' ? tr('{estado} · válido hasta el {fecha}', { estado: tr(ESTADOS[estado][0]), fecha: tr(fechaTexto(caduca(p))) }) : tr(ESTADOS[estado][0]))}</span>
          {textoEvento(p) && <span>{tr(textoEvento(p))}</span>}
        </div>
      </section>
      {p.estado !== 'pendiente' && <Conceptos lineas={p.lineas} />}
      {p.respuesta && <p className="nota">{(p.estado === 'rechazado' ? tr('Rechazado por {cliente} el {fecha}.', { cliente: p.respuesta.nombre, fecha: tr(fechaTexto(p.respuesta.fecha.slice(0, 10))) }) : tr('Aceptado por {cliente} el {fecha}.', { cliente: p.respuesta.nombre, fecha: tr(fechaTexto(p.respuesta.fecha.slice(0, 10))) }))}</p>}
      {p.facturas.length > 0 && <p className="nota">{conHuecos(tr('Facturas: {facturas}'), { facturas: p.facturas.map((f, n) => <span key={f.id}>{n ? ', ' : ''}{conHuecos(tr(f.tipo === 'senal' ? '{numero} (señal)' : senal ? '{numero} (resto)' : '{numero} (total)'), { numero: <Link href={`/facturas/${f.id}`}>{f.numero}</Link> })}</span>) })}</p>}
      {/* Como en la factura: lo de cada día arriba; el portal, cambiar el enlace y borrar, en «Más opciones» (Borrar al final). */}
      {editar && <div className="acciones-factura">
        {estado === 'pendiente' && <Compartir ruta={`/p/${p.token}`} texto={tr('Presupuesto {numero}', { numero: numeroPresupuesto(p) })} etiqueta={tr('Compartir enlace')} />}
        {estado === 'pendiente' && <MarcarAceptado id={p.id} />}
        {['pendiente', 'aceptado'].includes(estado) && p.senalPct > 0 && !senal && <Facturar id={p.id} tipo="senal">{tr('Facturar señal ({importe})', { importe: eur(baseSenal(p)) })}</Facturar>}
        {['pendiente', 'aceptado'].includes(estado) && <Facturar id={p.id} tipo="resto">{(senal ? tr('Facturar el resto ({importe})', { importe: eur(baseResto(p)) }) : tr('Facturar todo'))}</Facturar>}
        <Link href={`/p/${p.token}`} className="boton sec">{tr('Ver como el cliente')}</Link>
      </div>}
      {((editar && estado === 'pendiente') || p.envios?.length > 0) && <EnviarFactura id={p.id} email={p.cliente.email} envios={p.envios} editar={editar && estado === 'pendiente'}
        ruta="/api/presupuestos/enviar" doc="presupuesto" seguimiento={false} principal={!p.envios?.length}
        asunto={asuntoPresupuesto(p, u)} mensaje={mensajePresupuesto(p, u)} asuntoFijo={diasPrueba(u.plan) > 0} />}
      {(editar || portal) && <details className="mas-opciones">
        <summary>{tr('Más opciones')}</summary>
        <div className="mas-opciones-c">
          {portal && <section className="portal-enlace">
            <p className="nota">{tr('Portal de {cliente}: ve todas sus facturas y presupuestos, los descarga en PDF y paga.', { cliente: p.cliente.nombre })}</p>
            <div className="portal-botones"><Compartir ruta={portal} texto={tr('Tus documentos de {nombre}', { nombre: u.emisor?.nombre || '' }).trim()} etiqueta={tr('Enviar su portal')} className="boton sec" /><Link href={portal} className="boton sec">{tr('Ver su portal')}</Link><CambiarEnlace datos={{ tipo: 'portal', cliente: p.cliente.nombre, nif: p.cliente.nif || '' }} pregunta={tr('¿Cambiar el enlace del portal de {cliente}? El que tiene dejará de funcionar y tendrás que enviarle el nuevo.', { cliente: p.cliente.nombre })} etiqueta={tr('Cambiar el enlace del portal')} /></div>
          </section>}
          {editar && <div className="portal-botones"><CambiarEnlace datos={{ tipo: 'presupuesto', id: p.id }} pregunta={tr('¿Cambiar el enlace de este presupuesto? El que tiene el cliente dejará de funcionar.')} etiqueta={tr('Cambiar el enlace del presupuesto')} /></div>}
          {editar && !p.facturas.length && <div className="mas-opciones-borrar"><Borrar url={`/api/presupuestos?id=${p.id}`} pregunta={tr('¿Borrar el presupuesto {numero}? El enlace del cliente dejará de funcionar.', { numero: numeroPresupuesto(p) })} volver="/presupuestos" /></div>}
        </div>
      </details>}
      {editar && p.estado === 'pendiente' && <FormPresupuesto key={JSON.stringify(p)} presupuesto={p} clientes={clientes} actividades={actividadesDe(u)} />}
    </main>
  );
}

export async function generateMetadata({ params }) {
  const tr = await textos();
  const u = await requerir('facturas');
  const d = await leerUno(u, 'presupuestos', (await params).id);
  return { title: (d ? tr('Presupuesto {numero}', { numero: numeroPresupuesto(d) }) : tr('Presupuesto')) };
}
