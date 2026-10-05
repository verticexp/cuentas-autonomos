import { requerir } from '@/lib/auth';
import { clave, leer, redis } from '@/lib/redis';
import { actividadesDe, fiscalDe } from '@/lib/empresa';
import { prevision } from '@/lib/tesoreria';
import { eur, fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import SaldoBanco from '@/components/SaldoBanco';
import '@/app/tesoreria.css';

export const dynamic = 'force-dynamic';
const HORIZONTES = [3, 6, 12];
const TIPO = { cobro: 'Cobro', pago: 'Pago', hacienda: 'Hacienda' };

export default async function Tesoreria({ searchParams }) {
  const u = await requerir('resumen');
  const [facturas, gastos, recurrentes, nominas, saldo] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'recurrentes'), leer(u, 'nominas'), redis?.get(clave(u, 'saldo'))]);
  if (!facturas) return <SinBD />;
  const n = HORIZONTES.includes(Number((await searchParams).meses)) ? Number((await searchParams).meses) : 3;
  const p = prevision({ facturas, gastos, recurrentes: recurrentes || [], nominas: nominas || [], fiscal: fiscalDe(u), pagos130: u.pagos130 || {}, plazo: u.emisor?.plazo, saldo,
    actividades: actividadesDe(u).map((a) => a.id), hoy: hoy(), meses: n });
  const alto = Math.max(1, ...p.meses.map((m) => Math.abs(m.saldo)), Math.abs(p.inicial));

  return (
    <main className="pagina tesoreria">
      <Volver href="/">Resumen</Volver>
      <h1 className="titulo">Tesorería</h1>
      <nav className="segmentado">
        {HORIZONTES.map((h) => <Ir key={h} href={`/tesoreria?meses=${h}`} tipo="fundido" className={h === n ? 'activo' : ''}>{h} meses</Ir>)}
      </nav>

      <SaldoBanco saldo={saldo ? saldo.importe : null} fecha={saldo?.fecha} />

      <div className="teso-cifras">
        <div className="teso-cifra"><span>Vas a cobrar</span><strong className="teso-in">{eur(p.entra)}</strong></div>
        <div className="teso-cifra"><span>Vas a pagar</span><strong className="teso-out">{eur(p.sale)}</strong></div>
        <div className="teso-cifra"><span>Hacienda</span><strong className="teso-hac">{eur(p.hacienda)}</strong></div>
        <div className="teso-cifra final"><span>{p.conSaldo ? 'Saldo' : 'Diferencia'} el {fechaTexto(p.hasta)}</span><strong className={p.final < 0 ? 'teso-out' : ''}>{eur(p.final)}</strong></div>
      </div>
      {p.minimo.saldo < 0 && <p className="teso-alerta">El {fechaTexto(p.minimo.fecha)} te quedarías en {eur(p.minimo.saldo)}{p.conSaldo ? '' : ' (sin contar lo que tienes hoy en el banco)'}. Adelanta cobros o retrasa pagos.</p>}

      <section className="grupo">
        <h2 className="grupo-t">Mes a mes</h2>
        <div className="grupo-c teso-meses">
          {p.meses.map((m) => (
            <div key={m.mes} className="celda teso-mes">
              <span className="txt">{m.nombre[0].toUpperCase() + m.nombre.slice(1)}<small>+{eur(m.entra)} · −{eur(m.sale)}{m.hacienda ? ` · Hacienda −${eur(m.hacienda)}` : ''}</small></span>
              <span className="teso-barra" aria-hidden><span className={m.saldo < 0 ? 'neg' : ''} style={{ width: `${Math.round((Math.abs(m.saldo) / alto) * 100)}%` }} /></span>
              <span className={`v${m.saldo < 0 ? ' rojo' : ''}`}>{eur(m.saldo)}</span>
            </div>
          ))}
        </div>
        <p className="grupo-pie">Saldo previsto al final de cada mes{p.conSaldo ? '' : ', partiendo de 0 €'}.</p>
      </section>

      {p.meses.filter((m) => m.movimientos.length).map((m) => (
        <section key={m.mes} className="grupo">
          <h2 className="grupo-t">{m.nombre[0].toUpperCase() + m.nombre.slice(1)}</h2>
          <ul className="grupo-lista teso-lista">
            {m.movimientos.map((x, i) => {
              const fila = (
                <>
                  <span className={`teso-tipo ${x.tipo}`}>{fechaCorta(x.fecha).slice(0, 5)}</span>
                  <span className="txt"><strong>{x.concepto}</strong><small>{TIPO[x.tipo]}{x.detalle ? ` · ${x.detalle}` : ''}{x.vencida ? ' · vencida' : ''}</small></span>
                  <span className="teso-imp"><span className={x.importe > 0 ? 'teso-in' : x.tipo === 'hacienda' ? 'teso-hac' : 'teso-out'}>{x.importe > 0 ? '+' : '−'}{eur(Math.abs(x.importe))}</span><small>{eur(x.saldo)}</small></span>
                </>
              );
              return <li key={i}>{x.url ? <Ir href={x.url} className="fila">{fila}</Ir> : <div className="fila">{fila}</div>}</li>;
            })}
          </ul>
        </section>
      ))}

      {!p.movimientos.length && <div className="vacio"><p>Nada previsto</p><p>Aquí verás las facturas por cobrar, los gastos pendientes y habituales y lo que toca pagar a Hacienda.</p></div>}

      <p className="grupo-pie arriba">Cobros: facturas sin cobrar a su vencimiento (las vencidas, hoy) y las recurrentes. Pagos: gastos pendientes y los que se repiten cada uno de los 3 últimos meses. Hacienda: 303, 130, 115 y 111 de los trimestres sin marcar como presentados. Es una previsión: revísala de vez en cuando.</p>
    </main>
  );
}
