import { eur, fechaCorta } from '@/lib/formato';

export default function CuadreBanco({ datos: d }) {
  if (!d) return null;
  return <section className="bloque cont-cuadre" aria-labelledby="cuadre-banco">
    <h2 className="grupo-t" id="cuadre-banco">Cuadre con el banco</h2>
    {d.sinSaldo ? <p className="grupo-pie">Todavía no hay un saldo bancario con fecha para poder comparar.</p> : <>
      <p className="grupo-pie">Último saldo bancario conocido: {fechaCorta(d.fecha)}. Todos los importes se comparan a esa fecha.</p>
      <dl className="cont-cuadre-cifras">
        <div><dt>572 · Bancos en contabilidad</dt><dd>{eur(d.contable)}</dd></div>
        <div><dt>Saldo real del banco</dt><dd>{eur(d.real)}</dd></div>
        <div><dt>Diferencia (real − contable)</dt><dd>{eur(d.diferencia)}</dd></div>
        <div><dt>570 · Caja, por separado</dt><dd>{eur(d.caja)}</dd></div>
      </dl>
      <details>
        <summary>Causas probables de la diferencia</summary>
        <dl className="cont-cuadre-cifras">
          <div><dt>Movimientos pendientes de conciliar ({d.pendientes.cantidad})</dt><dd>{eur(d.pendientes.importe)}</dd></div>
          <div><dt>Cobros contabilizados sin movimiento bancario</dt><dd>{eur(d.cobrosSinBanco)}</dd></div>
          <div><dt>Pagos contabilizados sin movimiento bancario</dt><dd>{eur(d.pagosSinBanco)}</dd></div>
          <div><dt>Diferencia probable (pendientes − cobros + pagos)</dt><dd>{eur(d.probable)}</dd></div>
          <div><dt>Resto por revisar</dt><dd>{eur(d.sinExplicar)}</dd></div>
        </dl>
        <p className="grupo-pie">Son indicios: puede haber movimientos pendientes que correspondan a cobros o pagos ya apuntados, saldos de apertura incompletos o fechas distintas. Revisa la conciliación antes de registrar nada.</p>
      </details>
    </>}
  </section>;
}
