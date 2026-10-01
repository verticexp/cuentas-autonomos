import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { ACTIVIDADES, importes, r2 } from '@/lib/calculos';
import { DEDUCCIONES, cubierta } from '@/lib/deducciones';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import FormGasto from '@/components/FormGasto';
import Cuotas from '@/components/Cuotas';
import Link from 'next/link';
import { puede } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

export default async function Gastos() {
  const u = await requerir('gastos');
  const gastos = await leer(u, 'gastos');
  if (!gastos) return <SinBD />;
  const h = hoy();
  const lista = gastos.sort((a, b) => b.fecha.localeCompare(a.fecha));
  const delAnio = lista.filter((g) => g.fecha.startsWith(h.slice(0, 4)));
  const pendientes = DEDUCCIONES.filter((d) => !cubierta(d, delAnio)).length;
  return (
    <main className="pagina">
      <header className="cabecera">
        <h1 className="titulo">Gastos</h1>
      </header>
      {delAnio.length > 0 && (
        <p className="resumen-linea">
          <span>Este año, sin IVA <strong>{eur(r2(delAnio.reduce((s, g) => s + g.base, 0)))}</strong></span>
          <span>IVA que recuperas <strong>{eur(r2(delAnio.reduce((s, g) => s + importes(g).iva, 0)))}</strong></span>
        </p>
      )}
      {puede(u, 'gastar') && <>
        <FormGasto hoy={h} />
        <Cuotas desde={`${h.slice(0, 4)}-01`} />
      </>}

      <details className="tarjeta bloque" open={pendientes > 0}>
        <summary><strong>Deducciones que no deberías olvidar</strong> <span className="nota">· {pendientes ? `${pendientes} sin ningún gasto este año` : 'todas cubiertas'}</span></summary>
        <div style={{ marginTop: 12 }}>
          {DEDUCCIONES.map((d) => {
            const ok = cubierta(d, delAnio);
            return (
              <div key={d.t} className="deduccion">
                <span className={ok ? 'ok' : 'no'}>{ok ? '✓' : '○'}</span>
                <div><strong>{d.t}</strong><p>{d.d}</p></div>
              </div>
            );
          })}
          <p className="nota">Solo cuenta lo que tenga factura a tu nombre y esté ligado a tu actividad. Ante la duda, confírmalo con tu gestor.</p>
        </div>
      </details>

      {lista.length ? (
        <ul className="grupo-lista">
          {lista.map((g) => (
            <li key={g.id}>
              <Link href={`/gastos/${encodeURIComponent(g.id)}`} className="fila">
                <span className="txt">
                  <strong>{g.concepto}</strong>
                  <small>{fechaCorta(g.fecha)}{Object.keys(ACTIVIDADES).length > 1 ? ` · ${ACTIVIDADES[g.actividad]}` : ''}{importes(g).iva ? ` · IVA ${eur(importes(g).iva)}` : ''}</small>
                </span>
                <span className="imp">{eur(g.base)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <div className="vacio"><p>Aún no hay gastos</p><p>Apunta arriba lo que pagas por tu actividad: el IVA se resta del 303 y el gasto baja tu IRPF.</p></div>}
    </main>
  );
}
