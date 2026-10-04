import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { proveedores } from '@/lib/proveedores';
import { eur, fechaCorta } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import '@/app/proveedores.css';

export const dynamic = 'force-dynamic';

export default async function Proveedores() {
  const u = await requerir('gastos');
  const lista = proveedores((await leer(u, 'gastos')) || []);
  const debes = lista.reduce((s, p) => s + p.debe, 0);
  return (
    <main className="pagina">
      <Volver href="/gastos">Gastos</Volver>
      <h1 className="titulo">Proveedores</h1>
      {lista.length > 0 && <p className="resumen-linea"><span>{lista.length === 1 ? '1 proveedor' : `${lista.length} proveedores`}</span>{debes > 0 && <span className="prov-debe">Les debes <strong>{eur(debes)}</strong></span>}</p>}
      {lista.length ? (
        <ul className="grupo-lista">
          {lista.map((p) => (
            <li key={p.clave}>
              <Ir href={`/gastos/proveedores/${encodeURIComponent(p.clave)}`} className="fila">
                <span className="txt">
                  <strong>{p.nombre}</strong>
                  <small>{p.nif ? `${p.nif} · ` : ''}{p.n === 1 ? '1 gasto' : `${p.n} gastos`} · {p.debe > 0 ? <span className="prov-debe">debes {eur(p.debe)}</span> : `último ${fechaCorta(p.ultimo)}`}</small>
                </span>
                <span className="imp">{eur(p.total)}</span>
              </Ir>
            </li>
          ))}
        </ul>
      ) : <div className="vacio"><p>Aún no hay proveedores</p><p>Escribe el proveedor al apuntar un gasto (o haz una foto del ticket) y aparecerá aquí con todo lo que le has pagado.</p></div>}
    </main>
  );
}
