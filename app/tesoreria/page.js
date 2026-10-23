import Vacio from '@/components/Vacio';
import { sinFuncion } from '@/lib/planes';
import SinPlan from '@/components/SinPlan';
import { requerir } from '@/lib/auth';
import { DETALLE, puede } from '@/lib/permisos';
import { clave, leer, redis } from '@/lib/redis';
import { actividadesDe, fiscalDe, usaIgic } from '@/lib/empresa';
import { esSociedad } from '@/lib/modulos';
import { prevision } from '@/lib/tesoreria';
import { eur, fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import SaldoBanco from '@/components/SaldoBanco';
import GraficaCaja from '@/components/GraficaCaja';
import { conectarVisible } from '@/lib/enableBanking';
import '@/app/tesoreria.css';
import '@/app/banco.css';

import '@/app/mk.css';
import { delosAnios } from '@/lib/indices';
import { veSueldos } from '@/lib/nominas';
import YaPresentado from '@/components/YaPresentado';

export const dynamic = 'force-dynamic';
const HORIZONTES = [3, 6, 12];
const TIPO = { cobro: 'Cobro', pago: 'Pago', hacienda: 'Hacienda' };

export default async function Tesoreria({ searchParams }) {
  const u = await requerir('resumen');
  if (u.plan?.version >= 2 && sinFuncion(u.plan, 'tesoreria')) return <SinPlan usuario={u} funcion="tesoreria" />;
  if (!redis) return <SinBD />;
  // Informe de capacidad E01: lo pendiente, este año y el anterior (impuestos y gastos habituales) y los bienes; como el Resumen.
  const y = Number(hoy().slice(0, 4));
  const [{ facturas, gastos }, recurrentes, nominas, saldo, movs, empleados, capital] = await Promise.all([usaIgic(fiscalDe(u)) ? Promise.all([leer(u, 'facturas'), leer(u, 'gastos')]).then(([facturas, gastos]) => ({ facturas: facturas || [], gastos: gastos || [] })) : delosAnios(u, Array.from({ length: 5 }, (_, i) => y - i), { pendientes: true }), leer(u, 'recurrentes'), leer(u, 'nominas'), redis.get(clave(u, 'saldo')), leer(u, 'banco'), leer(u, 'empleados'), leer(u, 'capital')]);
  const sinRevisar = (movs || []).filter((m) => m.estado === 'pendiente').length;
  const n = HORIZONTES.includes(Number((await searchParams).meses)) ? Number((await searchParams).meses) : 3;
  const p = prevision({ facturas, gastos, recurrentes: recurrentes || [], nominas: nominas || [], empleados: empleados || [], agruparSueldos: !veSueldos(u), fiscal: fiscalDe(u), pagos130: u.pagos130 || {}, pres303: u.pres303 || {}, pres111: u.pres111 || {}, pres115: u.pres115 || {}, pres123: u.pres123 || {}, pres369: u.pres369 || {}, capital: capital || [], pagos131: u.pagos131 || {}, modulos: u.modulos || {}, prorrata: u.prorrata || {}, rend130: u.rend130 || {}, cuotaIS: u.cuotaIS || {}, pagos202: u.pagos202 || {}, pagadosHacienda: u.pagadosHacienda || {}, plazo: u.emisor?.plazo, saldo,
    actividades: actividadesDe(u).map((a) => a.id), hoy: hoy(), meses: n });
  const alto = Math.max(1, ...p.meses.map((m) => Math.abs(m.saldo)), Math.abs(p.inicial));

  return (
    <main className="pagina mk-look tesoreria">
      <Volver href="/">Resumen</Volver>
      <h1 className="titulo">Tesorería</h1>
      {esSociedad(fiscalDe(u)) && (puede(u, 'facturar') || puede(u, 'gastar')) && <Ir href="/tesoreria/remesas" className="grupo-pie">Remesas SEPA ›</Ir>}
      <nav className="segmentado">
        {HORIZONTES.map((h) => <Ir key={h} href={`/tesoreria?meses=${h}`} tipo="fundido" className={h === n ? 'activo' : ''}>{h} meses</Ir>)}
      </nav>

      <SaldoBanco saldo={saldo ? saldo.importe : null} fecha={saldo?.fecha} banco={Boolean(saldo?.banco)} editable={puede(u, 'facturar') || puede(u, 'gastar')} />
      {p.descontado.length > 0 && <p className="nota">Ya restados del saldo: {p.descontado.map((d) => `${d.modelo} del ${d.t}T (${eur(d.importe)})`).join(', ')}, marcados como pagados después del {fechaTexto(saldo.fecha)}. Dejan de restarse cuando subas un extracto o actualices el saldo.</p>}
      {puede(u, DETALLE) && (
        <Ir href="/banco" className="teso-banco">
          <span className="bco-txt"><strong>Banco</strong><small>{saldo?.banco ? 'Saldo real y movimientos emparejados con facturas y gastos' : (conectarVisible(u) ? 'Conecta tu banco o sube el extracto' : 'Sube el extracto de tu banco y concilia cobros y pagos')}</small></span>
          {sinRevisar > 0 && <span className="num" aria-label={`${sinRevisar} movimientos por revisar`}>{sinRevisar}</span>}
        </Ir>
      )}

      <div className="teso-cifras">
        <div className="teso-cifra"><span>Vas a cobrar</span><strong className="teso-in">{eur(p.entra)}</strong></div>
        <div className="teso-cifra"><span>Vas a pagar</span><strong className="teso-out">{eur(p.sale)}</strong></div>
        <div className="teso-cifra"><span>Hacienda</span><strong className="teso-hac">{eur(p.hacienda)}</strong></div>
        <div className="teso-cifra final"><span>{p.conSaldo ? 'Saldo' : 'Diferencia'} el {fechaTexto(p.hasta)}</span><strong className={p.final < 0 ? 'teso-out' : ''}>{eur(p.final)}</strong></div>
      </div>
      {p.minimo.saldo < 0 && <p className="teso-alerta">El {fechaTexto(p.minimo.fecha)} te quedarías en {eur(p.minimo.saldo)}{p.conSaldo ? '' : ' (sin contar lo que tienes hoy en el banco)'}. Adelanta cobros o retrasa pagos.</p>}

      <section className="grupo">
        <h2 className="grupo-t">Mes a mes</h2>
        {p.meses.length > 0 && <div className="grupo-c relleno teso-graf"><GraficaCaja meses={p.meses.map(({ mes, nombre, entra, sale, hacienda, saldo }) => ({ mes, nombre, entra, sale, hacienda, saldo }))} conSaldo={p.conSaldo} /></div>}
        <div className="grupo-c teso-meses">
          {p.meses.map((m) => (
            <div key={m.mes} className="celda teso-mes">
              <span className="txt">{m.nombre[0].toUpperCase() + m.nombre.slice(1)}<small>+{eur(Math.abs(m.entra))} · −{eur(Math.abs(m.sale))}{m.hacienda ? ` · Hacienda −${eur(Math.abs(m.hacienda))}` : ''}</small></span>
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
              if (x.pregunta) return <li key={i}><div className="fila">{fila}</div><YaPresentado pregunta={x.pregunta} importe={-x.importe} puede={puede(u, 'contabilidad')} /></li>;
              return <li key={i}>{x.url ? <Ir href={x.url} className="fila">{fila}</Ir> : <div className="fila">{fila}</div>}</li>;
            })}
          </ul>
        </section>
      ))}

      {!p.movimientos.length && <Vacio icono="cobrar" titulo="Aún no hay nada previsto" accion={{ href: '/facturas/nueva', texto: 'Nueva factura' }} secundaria={{ href: '/gastos#apuntar-gasto', texto: 'Añadir gasto' }}>Aquí verás las facturas por cobrar, los gastos pendientes y habituales y lo que toca pagar a Hacienda.</Vacio>}

      <p className="grupo-pie arriba">Cobros: facturas sin cobrar a su vencimiento (las vencidas, hoy) y las recurrentes. Pagos: gastos pendientes a su vencimiento (los vencidos, hoy) y los que se repiten cada uno de los 3 últimos meses. Hacienda: {usaIgic(fiscalDe(u)) ? 'IGIC (420)' : '303'}, 130, 115 y 111 de los trimestres sin marcar como presentados. Es una previsión: revísala de vez en cuando.</p>
    </main>
  );
}

export const metadata = { title: 'Tesorería' };
