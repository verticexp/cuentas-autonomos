import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leer, leerUno } from '@/lib/redis';
import { puede } from '@/lib/permisos';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import { usaIgic, actividadesDe, fiscalDe } from '@/lib/empresa';
import { idValido, ordenar, paraPantalla } from '@/lib/bandeja';
import { proyectosDe } from '@/lib/stockServidor';
import FormGasto from '@/components/FormGasto';
import Volver from '@/components/Volver';
import { AccionesDocumento, EsperarLectura } from '@/components/AccionesBandeja';
import '@/app/bandeja.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';

// Revisar una factura de la bandeja: el archivo a un lado y, al otro, el formulario del gasto con lo leído. Al aprobarla
// se pasa a la siguiente que espera revisión.
export default async function DocumentoBandeja({ params }) {
  const u = await requerir('gastos');
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
      <Volver href="/gastos/bandeja">Bandeja</Volver>
      <section className="bandeja-archivo tarjeta">
        <p className="mini-t">{doc.correo ? `De ${doc.correo.deNombre ? `${doc.correo.deNombre} (${doc.correo.de})` : doc.correo.de}` : doc.nombre}</p>
        {doc.correo?.asunto && <p className="nota">«{doc.correo.asunto}»</p>}
        {imagen ? <a href={archivo} target="_blank" rel="noopener"><img src={archivo} alt={`Factura ${doc.nombre}`} /></a>
          : <a className="boton sec" href={archivo} target="_blank" rel="noopener">{doc.tipo === 'application/xml' ? 'Descargar el XML' : 'Abrir la factura (PDF)'}</a>}
        {doc.tipo === 'application/xml' && <p className="nota">Factura electrónica: sus datos son exactos, leídos del propio archivo.</p>}
        {doc.duplicados?.length > 0 && <div className="nota" role="alert"><strong>Puede que ya esté apuntada</strong><ul>{doc.duplicados.map((x) => <li key={x.id}><a href={`/gastos/${encodeURIComponent(x.id)}`} target="_blank" rel="noopener noreferrer">{x.motivo}</a></li>)}</ul></div>}
        {gastar && <AccionesDocumento id={id} estado={doc.estado} remitente={doc.correo?.de || ''} />}
      </section>
      {doc.estado === 'leyendo' && <EsperarLectura id={id} />}
      {doc.estado === 'aprobado' && <p className="nota">Aprobada sola el {fechaCorta(String(d.recibido).slice(0, 10))}: es de un proveedor de confianza y cuadraba. <a href={`/gastos/${encodeURIComponent(d.gasto)}`}>Ver el gasto</a>.</p>}
      {doc.estado === 'cuarentena' && <p className="nota">Viene de un remitente que no conoces: no se ha leído para no gastar lecturas. Léela si es una factura tuya o apúntala a mano.</p>}
      {doc.estado === 'error' && <p className="nota" role="alert">{doc.error} {doc.total > 0 ? `Total leído: ${eur(doc.total)}.` : ''}</p>}
      {!['leyendo', 'aprobado'].includes(doc.estado) && (
        <fieldset className="solo-ver" disabled={!gastar}>
          <FormGasto igic={usaIgic(fiscalDe(u))} hoy={hoy()} actividades={actividadesDe(u)} alquiler={fiscalDe(u).alquiler} retenciones={fiscalDe(u).trabajadores} regimen={fiscalDe(u).tipo}
            productos={stockProductos} proyectos={gastar ? await proyectosDe(u) : []} documento={{ id, propuesta: d.propuesta || {}, banco: d.banco, habitual: d.habitual }} siguiente={siguiente} />
        </fieldset>
      )}
    </main>
  );
}

export const metadata = { title: 'Revisar factura' };
