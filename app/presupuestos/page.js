import Link from 'next/link';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { importes } from '@/lib/calculos';
import { eur, fechaTexto, hoy } from '@/lib/formato';
import { ESTADOS, estadoDe, numeroPresupuesto } from '@/lib/presupuestos';
import { puede } from '@/lib/permisos';
import SinBD from '@/components/SinBD';

export const dynamic = 'force-dynamic';

export default async function Presupuestos() {
  const u = await requerir('facturas');
  const todos = await leer(u, 'presupuestos');
  if (!todos) return <SinBD />;
  const h = hoy();
  const lista = todos.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero);
  const abiertos = lista.filter((p) => ['pendiente', 'aceptado'].includes(estadoDe(p, h)));
  return (
    <main className="pagina">
      <header className="cabecera">
        <h1 className="titulo">Presupuestos</h1>
        {puede(u, 'facturar') && <Link href="/presupuestos/nuevo" className="boton pequeno">Nuevo</Link>}
      </header>
      {abiertos.length > 0 && <p className="resumen-linea"><span>Abiertos <strong>{eur(abiertos.reduce((s, p) => s + importes(p).base, 0))}</strong> sin IVA</span></p>}
      {lista.length > 0 && <ul className="grupo-lista">
        {lista.map((p) => {
          const [txt, clase] = ESTADOS[estadoDe(p, h)];
          return (
            <li key={p.id}>
              <Link href={`/presupuestos/${p.id}`} className="fila">
                <span className="txt">
                  <strong>{p.cliente.nombre}</strong>
                  <small>{numeroPresupuesto(p)}{p.evento?.fecha ? ` · evento el ${fechaTexto(p.evento.fecha)}` : ''}</small>
                </span>
                <span className="imp-col">
                  <span className="imp">{eur(importes(p).total)}</span>
                  <span className={`estado-txt ${clase}`}>{txt}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>}
      {!lista.length && (
        <div className="vacio">
          <p>Aún no has hecho ningún presupuesto</p>
          <p>Envíaselo al cliente con un enlace: lo acepta desde el móvil y lo conviertes en factura con un toque.</p>
          {puede(u, 'facturar') && <Link href="/presupuestos/nuevo" className="boton">Crear el primero</Link>}
        </div>
      )}
    </main>
  );
}
