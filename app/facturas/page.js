import Link from 'next/link';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { ACTIVIDADES, importes, numeroFactura, vencida } from '@/lib/calculos';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';

export const dynamic = 'force-dynamic';

export default async function Facturas({ searchParams }) {
  const u = await requerir();
  const todas = await leer(u, 'facturas');
  if (!todas) return <SinBD />;
  const { a } = await searchParams;
  const h = hoy();
  const lista = todas.filter((f) => !ACTIVIDADES[a] || f.actividad === a).sort((x, y) => y.fecha.localeCompare(x.fecha) || y.numero - x.numero);

  return (
    <main className="pagina">
      <header className="cabecera">
        <h1 className="titulo">Facturas</h1>
        <Link href="/facturas/nueva" className="boton pequeno">+ Nueva</Link>
      </header>
      <nav className="chips">
        <Link href="/facturas" className={!ACTIVIDADES[a] ? 'activo' : ''}>Todas</Link>
        {Object.entries(ACTIVIDADES).map(([id, n]) => <Link key={id} href={`/facturas?a=${id}`} className={a === id ? 'activo' : ''}>{n}</Link>)}
      </nav>
      {lista.length ? (
        <ul className="grupo-lista">
          {lista.map((f) => (
            <li key={f.id}>
              <Link href={`/facturas/${f.id}`} className="fila">
                <span className="num">{numeroFactura(f)}</span>
                <span className="txt">
                  <strong>{f.cliente.nombre}</strong>
                  <small>{fechaCorta(f.fecha)} · {ACTIVIDADES[f.actividad]}{f.cobrada ? '' : vencida(f, u.emisor?.plazo, h) ? ' · Vencida' : ' · Pendiente'}</small>
                </span>
                <span className={`imp ${f.cobrada ? '' : 'pend'}`}>{eur(importes(f).total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <div className="vacio"><p>No hay facturas</p></div>}
    </main>
  );
}
