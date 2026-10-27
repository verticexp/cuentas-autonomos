import { eur, fechaCorta } from '@/lib/formato';
import { textos } from '@/lib/idiomaServidor';

export default async function CuadreBanco({ datos: d }) {
  if (!d) return null;
  const tr = await textos();
  return <section className="bloque cont-cuadre" aria-labelledby="cuadre-banco">
    <h2 className="grupo-t" id="cuadre-banco">{tr('Cuadre con el banco')}</h2>
    {d.sinSaldo ? <p className="grupo-pie">{tr('Todavía no hay un saldo bancario con fecha para poder comparar.')}</p> : <>
      <p className="grupo-pie">{tr('Último saldo bancario conocido: {fecha}. Todos los importes se comparan a esa fecha.', { fecha: fechaCorta(d.fecha) })}</p>
      <dl className="cont-cuadre-cifras">
        <div><dt>{tr('572 · Bancos en contabilidad')}</dt><dd>{eur(d.contable)}</dd></div>
        <div><dt>{tr('Saldo real del banco')}</dt><dd>{eur(d.real)}</dd></div>
        <div><dt>{tr('Diferencia (real − contable)')}</dt><dd>{eur(d.diferencia)}</dd></div>
        <div><dt>{tr('570 · Caja, por separado')}</dt><dd>{eur(d.caja)}</dd></div>
      </dl>
      <details>
        <summary>{tr('Causas probables de la diferencia')}</summary>
        <dl className="cont-cuadre-cifras">
          <div><dt>{tr('Movimientos pendientes de conciliar ({n})', { n: d.pendientes.cantidad })}</dt><dd>{eur(d.pendientes.importe)}</dd></div>
          <div><dt>{tr('Cobros contabilizados sin movimiento bancario')}</dt><dd>{eur(d.cobrosSinBanco)}</dd></div>
          <div><dt>{tr('Pagos contabilizados sin movimiento bancario')}</dt><dd>{eur(d.pagosSinBanco)}</dd></div>
          <div><dt>{tr('Diferencia probable (pendientes − cobros + pagos)')}</dt><dd>{eur(d.probable)}</dd></div>
          <div><dt>{tr('Resto por revisar')}</dt><dd>{eur(d.sinExplicar)}</dd></div>
        </dl>
        <p className="grupo-pie">{tr('Son indicios: puede haber movimientos pendientes que correspondan a cobros o pagos ya apuntados, saldos de apertura incompletos o fechas distintas. Revisa la conciliación antes de registrar nada.')}</p>
      </details>
    </>}
  </section>;
}
