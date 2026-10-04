import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { proveedores, totalDe } from '@/lib/proveedores';
import { eur, fechaCorta } from '@/lib/formato';
import { puede } from '@/lib/permisos';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import PagarProveedor from '@/components/PagarProveedor';
import '@/app/proveedores.css';

export const dynamic = 'force-dynamic';

export default async function Proveedor({ params }) {
  const u = await requerir('gastos');
  const clave = decodeURIComponent((await params).clave);
  const p = proveedores((await leer(u, 'gastos')) || []).find((x) => x.clave === clave);
  if (!p) notFound();
  return (
    <main className="pagina">
      <Volver href="/gastos/proveedores">Proveedores</Volver>
      <h1 className="titulo">{p.nombre}</h1>
      <p className="prov-cifras">
        {p.nif && <span>NIF <strong>{p.nif}</strong></span>}
        <span>Total de gastos <strong>{eur(p.total)}</strong></span>
        <span>{p.n === 1 ? '1 gasto' : `${p.n} gastos`}</span>
        {p.debe > 0 && <span className="prov-debe">Le debes <strong>{eur(p.debe)}</strong></span>}
      </p>
      {p.debe > 0 && puede(u, 'gastar') && <PagarProveedor clave={p.clave} importe={eur(p.debe)} />}
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
