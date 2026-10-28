import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leer, leerUno } from '@/lib/redis';
import { puede } from '@/lib/permisos';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import { usaIgic, actividadesDe, fiscalDe, trimestresPresentados } from '@/lib/empresa';
import { idValido, ordenar, paraPantalla } from '@/lib/bandeja';
import { proyectosDe } from '@/lib/stockServidor';
import FormGasto from '@/components/FormGasto';
import Volver from '@/components/Volver';
import { AccionesDocumento, EsperarLectura } from '@/components/AccionesBandeja';
import { textos } from '@/lib/idiomaServidor';
import '@/app/bandeja.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';

// Revisar una factura de la bandeja: el archivo a un lado y, al otro, el formulario del gasto con lo leído. Al aprobarla
// se pasa a la siguiente que espera revisión.
export default async function DocumentoBandeja({ params }) {
  const u = await requerir('gastos');
  const tr = await textos();
  const id = decodeURIComponent((await params).id);
  if (!idValido(id)) notFound();
  const [d, todos, productos] = await Promise.all([leerUno(u, 'bandeja', id), leer(u, 'bandeja'), leer(u, 'productos')]);
  if (!d) notFound();
  const doc = paraPantalla(d);
  const siguiente = ordenar(todos || []).find((x) => x.id !== id && ['revisar', 'error', 'cuarentena'].includes(x.estado))?.id || null;
  const archivo = `/api/bandeja/archivo?id=${encodeURIComponent(id)}`;
  const imagen = /^image\//.test(doc.tipo);
  const stockProductos = fiscalDe(u).inventario ? (productos || []).filter((p) => !p.servicio).sort((a, b) => a.nombre.localeCompare(b.nombre)) : [];
  const gastar = puede(u, 'gastar');
  return (
    <main className="pagina mk-look gastos-formulario bandeja-revisar">
      <Volver href="/gastos?ver=revisar">{tr('Por revisar')}</Volver>
      <section className="bandeja-archivo tarjeta">
        <p className="mini-t">{doc.correo ? tr('De {quien}', { quien: doc.correo.deNombre ? `${doc.correo.deNombre} (${doc.correo.de})` : doc.correo.de }) : doc.nombre}</p>
        {doc.correo?.asunto && <p className="nota">«{doc.correo.asunto}»</p>}
        {imagen ? <a href={archivo} target="_blank" rel="noopener"><img src={archivo} alt={tr('Factura {nombre}', { nombre: doc.nombre })} /></a>
          : <a className="boton sec" href={archivo} target="_blank" rel="noopener">{doc.tipo === 'application/xml' ? tr('Descargar el XML') : tr('Abrir la factura (PDF)')}</a>}
        {doc.tipo === 'application/xml' && <p className="nota">{tr('Factura electrónica: sus datos son exactos, leídos del propio archivo.')}</p>}
        {doc.duplicados?.length > 0 && <div className="nota" role="alert"><strong>{tr('Puede que ya esté apuntada')}</strong><ul>{doc.duplicados.map((x) => <li key={x.id}><a href={`/gastos/${encodeURIComponent(x.id)}`} target="_blank" rel="noopener noreferrer">{tr(x.motivo)}</a></li>)}</ul></div>}
        {gastar && <AccionesDocumento id={id} estado={doc.estado} remitente={doc.correo?.de || ''} />}
      </section>
      {doc.estado === 'leyendo' && <EsperarLectura id={id} />}
      {doc.estado === 'aprobado' && <p className="nota">{tr('Aprobada sola el {fecha}: es de un proveedor de confianza y cuadraba.', { fecha: fechaCorta(String(d.recibido).slice(0, 10)) })} <a href={`/gastos/${encodeURIComponent(d.gasto)}`}>{tr('Ver el gasto')}</a>.</p>}
      {doc.estado === 'cuarentena' && <p className="nota">{tr('Viene de un remitente que no conoces: no se ha leído para no gastar lecturas. Léela si es una factura tuya o apúntala a mano.')}</p>}
      {doc.estado === 'error' && <p className="nota" role="alert">{tr(doc.error)} {doc.total > 0 ? tr('Total leído: {importe}.', { importe: eur(doc.total) }) : ''}</p>}
      {!['leyendo', 'aprobado'].includes(doc.estado) && (
        <fieldset className="solo-ver" disabled={!gastar}>
          <FormGasto presentados={trimestresPresentados(u)} igic={usaIgic(fiscalDe(u))} especial={Object.values(u.prorrata?.especial || {}).some(Boolean)} recargo={fiscalDe(u).iva === 'recargo'} hoy={hoy()} actividades={actividadesDe(u)} alquiler={fiscalDe(u).alquiler} retenciones={fiscalDe(u).trabajadores} regimen={fiscalDe(u).tipo}
            productos={stockProductos} proyectos={gastar ? await proyectosDe(u) : []} documento={{ id, propuesta: d.propuesta || {}, banco: d.banco, habitual: d.habitual }} siguiente={siguiente} />
        </fieldset>
      )}
    </main>
  );
}

export async function generateMetadata() {
  return { title: (await textos())('Revisar factura') };
}
