import Ir from '@/components/Ir';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { importes } from '@/lib/calculos';
import { eur, fechaTexto, hoy } from '@/lib/formato';
import { ESTADOS, estadoDe, numeroPresupuesto } from '@/lib/presupuestos';
import { puede } from '@/lib/permisos';
import SinBD from '@/components/SinBD';
import FilaFactura from '@/components/FilaFactura';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Presupuestos() {
  const u = await requerir('facturas');
  const todos = await leer(u, 'presupuestos');
  if (!todos) return <SinBD />;
  const h = hoy();
  const lista = todos.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero);
  const abiertos = lista.filter((p) => ['pendiente', 'aceptado'].includes(estadoDe(p, h)));
  return (
    <main className="pagina mk-look">
      <header className="cabecera">
        <h1 className="titulo">Presupuestos</h1>
        {puede(u, 'facturar') && <Ir href="/presupuestos/nuevo" tipo="subir" className="boton pequeno">Nuevo</Ir>}
      </header>
      <nav className="segmentado vt">
        <Ir href="/facturas" tipo="fundido">Facturas</Ir>
        <Ir href="/presupuestos" tipo="fundido" className="activo">Presupuestos</Ir>
      </nav>
      {abiertos.length > 0 && <p className="resumen-linea"><span>Abiertos <strong>{eur(abiertos.reduce((s, p) => s + importes(p).base, 0))}</strong> sin IVA</span></p>}
      {lista.length > 0 && <ul className="grupo-lista">
        {lista.map((p) => {
          const [txt, clase] = ESTADOS[estadoDe(p, h)];
          return (
            <li key={p.id}>
              <FilaFactura href={`/presupuestos/${p.id}`}>
                <span className="txt">
                  <strong data-vt="cliente">{p.cliente.nombre}</strong>
                  <small>{numeroPresupuesto(p)}{p.evento?.fecha ? ` · evento el ${fechaTexto(p.evento.fecha)}` : ''}</small>
                </span>
                <span className="imp-col">
                  <span className="imp" data-vt="total">{eur(importes(p).total)}</span>
                  <span className={`estado-txt ${clase}`}>{txt}</span>
                </span>
              </FilaFactura>
            </li>
          );
        })}
      </ul>}
      {!lista.length && (
        <div className="vacio">
          <p>Aún no has hecho ningún presupuesto</p>
          <p>Envíaselo al cliente con un enlace: lo acepta desde el móvil y lo conviertes en factura con un toque.</p>
          {puede(u, 'facturar') && <Ir href="/presupuestos/nuevo" tipo="subir" className="boton">Crear el primero</Ir>}
        </div>
      )}
    </main>
  );
}
