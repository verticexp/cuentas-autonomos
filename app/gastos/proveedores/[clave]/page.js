import Vacio from '@/components/Vacio';
import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { detalleProveedor, listarProveedores } from '@/lib/tercerosServidor';
import { valoresDe } from '@/lib/terceros';
import FichaProveedor from '@/components/FichaProveedor';
import '@/app/fichas.css';
import { totalDe } from '@/lib/proveedores';
import { eur, fechaCorta } from '@/lib/formato';
import { puede } from '@/lib/permisos';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import PagarProveedor from '@/components/PagarProveedor';
import '@/app/proveedores.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Proveedor({ params }) {
  const u = await requerir('gastos');
  const clave = decodeURIComponent((await params).clave);
  const p = await detalleProveedor(u, clave);
  if (!p) notFound();
  const fichas = (await listarProveedores(u)).map((p) => p.ficha);
  return (
    <main className="pagina mk-look fichas-pagina">
      <Volver href="/gastos/proveedores">Proveedores</Volver>
      <h1 className="titulo">{p.nombre}</h1>
      <p className="prov-cifras">
        {p.nif && <span>NIF <strong>{p.nif}</strong></span>}
        <span>Total de gastos <strong>{eur(p.total)}</strong></span>
        <span>{p.n === 1 ? '1 gasto' : `${p.n} gastos`}</span>
        {p.debe > 0 && <span className="prov-debe">Le debes <strong>{eur(p.debe)}</strong></span>}
      </p>
      {p.debe > 0 && puede(u, 'gastar') && <PagarProveedor clave={p.clave} importe={eur(p.debe)} />}
      <section className="bloque"><h2 className="ficha-titulo">{p.ficha ? 'Datos del proveedor' : 'Crear ficha'}</h2>
        <FichaProveedor ficha={p.ficha} clave={p.clave} nombre={p.nombre} nif={p.nif} editar={puede(u, 'gastar')} comerciales={valoresDe(fichas, 'comercial')} zonas={valoresDe(fichas, 'zona')} />
      </section>
      <h2 className="ficha-titulo">Gastos</h2>
      {!p.gastos.length && <Vacio compacto icono="gasto" titulo="Este proveedor aún no tiene gastos" accion={puede(u, 'gastar') && { href: '/gastos#apuntar-gasto', texto: 'Añadir gasto' }} />}
      <ul className="grupo-lista">
        {p.gastos.map((g) => (
          <li key={g.id}>
            <Ir href={`/gastos/${encodeURIComponent(g.id)}`} className="fila">
              <span className="txt"><strong>{g.concepto}</strong><small>{fechaCorta(g.fecha)}{g.pendiente ? <span className="prov-debe"> · Sin pagar</span> : ''}</small></span>
              <span className="imp">{eur(totalDe(g))}</span>
            </Ir>
          </li>
        ))}
      </ul>
    </main>
  );
}
