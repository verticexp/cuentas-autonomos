import Vacio from '@/components/Vacio';
import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { detalleProveedor, listarProveedores } from '@/lib/tercerosServidor';
import { nombreForma, valoresDe } from '@/lib/terceros';
import FichaProveedor from '@/components/FichaProveedor';
import '@/app/fichas.css';
import { totalDe } from '@/lib/proveedores';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import { textoVence } from '@/lib/pagos';
import { puede } from '@/lib/permisos';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import PagarProveedor from '@/components/PagarProveedor';
import { ConfianzaProveedor } from '@/components/AccionesBandeja';
import { deConfianza } from '@/lib/bandejaServidor';
import { textos } from '@/lib/idiomaServidor';
import '@/app/proveedores.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Proveedor({ params }) {
  const u = await requerir('gastos');
  const tr = await textos();
  const clave = decodeURIComponent((await params).clave);
  const p = await detalleProveedor(u, clave);
  if (!p) notFound();
  const fichas = (await listarProveedores(u)).map((p) => p.ficha);
  const confianza = Boolean(await deConfianza(u, { proveedor: p.nombre, proveedorNif: p.nif }));
  return (
    <main className="pagina mk-look fichas-pagina">
      <Volver href="/gastos/proveedores">{tr('Proveedores')}</Volver>
      <h1 className="titulo">{p.nombre}</h1>
      <p className="prov-cifras">
        {p.nif && <span>NIF <strong>{p.nif}</strong></span>}
        <span>{tr('Total de gastos')} <strong>{eur(p.total)}</strong></span>
        <span>{p.n === 1 ? tr('1 gasto') : tr('{n} gastos', { n: p.n })}</span>
        {p.debe > 0 && <span className="prov-debe">{tr('Le debes')} <strong>{eur(p.debe)}</strong></span>}
      </p>
      {p.debe > 0 && puede(u, 'gastar') && <PagarProveedor clave={p.clave} importe={eur(p.debe)} />}
      {/* Como la ficha de cliente: los datos plegados (sin ficha todavía, abiertos para crearla) y los gastos a la vista. */}
      <details className="plegable bloque ficha-datos" open={!p.ficha}><summary><span><h2 className="ficha-titulo">{p.ficha ? tr('Datos del proveedor') : tr('Crear ficha')}</h2>{p.ficha && <small>{[p.ficha.ciudad, p.ficha.email, tr(nombreForma(p.ficha.formaPago))].filter(Boolean).join(' · ')}</small>}</span></summary>
        <FichaProveedor ficha={p.ficha} clave={p.clave} nombre={p.nombre} nif={p.nif} editar={puede(u, 'gastar')} comerciales={valoresDe(fichas, 'comercial')} zonas={valoresDe(fichas, 'zona')} />
      </details>
      {puede(u, 'gastar') && <ConfianzaProveedor clave={p.clave} proveedor={p.nombre} proveedorNif={p.nif} inicial={confianza} />}
      <h2 className="ficha-titulo">{tr('Gastos')}</h2>
      {!p.gastos.length && <Vacio compacto icono="gasto" titulo={tr('Este proveedor aún no tiene gastos')} accion={puede(u, 'gastar') && { href: '/gastos#apuntar-gasto', texto: tr('Añadir gasto') }} />}
      <ul className="grupo-lista">
        {p.gastos.map((g) => (
          <li key={g.id}>
            <Ir href={`/gastos/${encodeURIComponent(g.id)}`} className="fila">
              <span className="txt"><strong>{g.concepto}</strong><small>{fechaCorta(g.fecha)}{g.pendiente ? <span className="prov-debe"> · {tr(textoVence(g, hoy(), fechaCorta))}</span> : ''}</small></span>
              <span className="imp">{eur(totalDe(g))}</span>
            </Ir>
          </li>
        ))}
      </ul>
    </main>
  );
}

export async function generateMetadata({ params }) {
  const u = await requerir('gastos');
  const d = await detalleProveedor(u, decodeURIComponent((await params).clave));
  return { title: d?.nombre || (await textos())('Proveedor') };
}
