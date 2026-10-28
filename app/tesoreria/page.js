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
import { idiomaActual, textos } from '@/lib/idiomaServidor';
import { localeDe } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
const HORIZONTES = [3, 6, 12];
const TIPO = { cobro: 'Cobro', pago: 'Pago', hacienda: 'Hacienda' };

// El concepto de los movimientos de Hacienda lo escribe lib/tesoreria.js en castellano («IVA (303) del 1T»); el de los demás
// es del usuario (un cliente, un proveedor), salvo el «Cliente» de una factura sin nombre.
function conceptoDe(x, tr) {
  if (x.tipo !== 'hacienda') return x.concepto === 'Cliente' ? tr(x.concepto) : x.concepto;
  const igic = /^IGIC \(420\) del (\d)T$/.exec(x.concepto);
  if (igic) return tr('IGIC (420) del {t}T', { t: igic[1] });
  const is202 = /^Impuesto sobre Sociedades \(202\) de (abril|diciembre)$/.exec(x.concepto);
  if (is202) return tr(is202[1] === 'abril' ? 'Impuesto sobre Sociedades (202) de abril' : 'Impuesto sobre Sociedades (202) de diciembre');
  return tr(x.concepto);
}

// El detalle de cada movimiento lo escribe lib/tesoreria.js en castellano: se traduce el que es texto fijo del programa
// (Hacienda, lo habitual, lo estimado) y se deja tal cual el que es del usuario (el concepto de una factura o de un gasto).
function detalleDe(x, tr) {
  const trimestre = /^(\d)T (\d{4})$/.exec(x.detalle);
  if (x.tipo === 'hacienda') return trimestre ? tr('{t}T {anio}', { t: trimestre[1], anio: trimestre[2] }) : tr(x.detalle);
  if (x.habitual || x.estimado) return tr(x.detalle);
  if (x.recurrente && x.detalle.startsWith('Recurrente · ')) return tr('Recurrente · {concepto}', { concepto: x.detalle.slice('Recurrente · '.length) });
  return x.tipo === 'pago' && x.detalle === 'Pendiente de pagar' ? tr(x.detalle) : x.detalle;
}

// «octubre 2026» (lib/tesoreria.js nombreMesT) en el idioma de la app; en castellano, tal cual.
const nombreMes = (m, idioma) => {
  const t = idioma === 'es' ? m.nombre : new Date(Date.UTC(Number(m.mes.slice(0, 4)), Number(m.mes.slice(5, 7)) - 1, 1, 12)).toLocaleDateString(localeDe(idioma), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return t[0].toUpperCase() + t.slice(1);
};

export default async function Tesoreria({ searchParams }) {
  const tr = await textos();
  const idioma = await idiomaActual();
  const u = await requerir('resumen');
  if (u.plan?.version >= 2 && sinFuncion(u.plan, 'tesoreria')) return <SinPlan usuario={u} funcion="tesoreria" />;
  if (!redis) return <SinBD />;
  // Informe de capacidad E01: lo pendiente, este año y el anterior (impuestos y gastos habituales) y los bienes; como el Resumen.
  const y = Number(hoy().slice(0, 4));
  const [{ facturas, gastos }, recurrentes, nominas, saldo, movs, empleados, capital] = await Promise.all([usaIgic(fiscalDe(u)) ? Promise.all([leer(u, 'facturas'), leer(u, 'gastos')]).then(([facturas, gastos]) => ({ facturas: facturas || [], gastos: gastos || [] })) : delosAnios(u, Array.from({ length: 5 }, (_, i) => y - i), { pendientes: true }), leer(u, 'recurrentes'), leer(u, 'nominas'), redis.get(clave(u, 'saldo')), leer(u, 'banco'), leer(u, 'empleados'), leer(u, 'capital')]);
  const sinRevisar = (movs || []).filter((m) => m.estado === 'pendiente').length;
  const n = HORIZONTES.includes(Number((await searchParams).meses)) ? Number((await searchParams).meses) : 3;
  const p = prevision({ facturas, gastos, recurrentes: recurrentes || [], nominas: nominas || [], empleados: empleados || [], agruparSueldos: !veSueldos(u), fiscal: fiscalDe(u), pagos130: u.pagos130 || {}, pres303: u.pres303 || {}, pres111: u.pres111 || {}, pres115: u.pres115 || {}, pres123: u.pres123 || {}, pres216: u.pres216 || {}, pres369: u.pres369 || {}, capital: capital || [], pagos131: u.pagos131 || {}, modulos: u.modulos || {}, prorrata: u.prorrata || {}, rend130: u.rend130 || {}, cuotaIS: u.cuotaIS || {}, pagos202: u.pagos202 || {}, pagadosHacienda: u.pagadosHacienda || {}, plazo: u.emisor?.plazo, saldo,
    actividades: actividadesDe(u).map((a) => a.id), hoy: hoy(), meses: n });
  const alto = Math.max(1, ...p.meses.map((m) => Math.abs(m.saldo)), Math.abs(p.inicial));

  return (
    <main className="pagina mk-look tesoreria">
      <Volver href="/">Resumen</Volver>
      <h1 className="titulo">{tr('Tesorería')}</h1>
      {!p.movimientos.length && <Vacio icono="cobrar" titulo={tr('Aún no hay nada previsto')} accion={{ href: '/facturas/nueva', texto: tr('Nueva factura') }} secundaria={{ href: '/gastos#apuntar-gasto', texto: tr('Añadir gasto') }}>{tr('Aquí verás qué dinero entra y sale en los próximos meses')}</Vacio>}
      {!p.movimientos.length && <SaldoBanco saldo={saldo ? saldo.importe : null} fecha={saldo?.fecha} banco={Boolean(saldo?.banco)} editable={puede(u, 'facturar') || puede(u, 'gastar')} />}
      {p.movimientos.length > 0 && <>
      {esSociedad(fiscalDe(u)) && (puede(u, 'facturar') || puede(u, 'gastar')) && <Ir href="/tesoreria/remesas" className="grupo-pie">{tr('Remesas SEPA')} ›</Ir>}
      <nav className="segmentado" aria-label={tr('Meses de la previsión')}>
        {HORIZONTES.map((h) => <Ir key={h} href={`/tesoreria?meses=${h}`} tipo="fundido" className={h === n ? 'activo' : ''}>{tr('{n} meses', { n: h })}</Ir>)}
      </nav>

      <SaldoBanco saldo={saldo ? saldo.importe : null} fecha={saldo?.fecha} banco={Boolean(saldo?.banco)} editable={puede(u, 'facturar') || puede(u, 'gastar')} />
      {p.descontado.length > 0 && <p className="nota">{tr('Ya restados del saldo: {lista}, marcados como pagados después del {fecha}. Dejan de restarse cuando subas un extracto o actualices el saldo.', { lista: p.descontado.map((d) => tr('{modelo} del {t}T ({importe})', { modelo: d.modelo, t: d.t, importe: eur(d.importe) })).join(', '), fecha: tr(fechaTexto(saldo.fecha)) })}</p>}
      {puede(u, DETALLE) && (
        <Ir href="/banco" className="teso-banco">
          <span className="bco-txt"><strong>{tr('Banco')}</strong><small>{tr(saldo?.banco ? 'Saldo real y movimientos emparejados con facturas y gastos' : (conectarVisible(u) ? 'Conecta tu banco o sube el extracto' : 'Sube el extracto de tu banco y concilia cobros y pagos'))}</small></span>
          {sinRevisar > 0 && <span className="num" aria-label={tr('{n} movimientos por revisar', { n: sinRevisar })}>{sinRevisar}</span>}
        </Ir>
      )}

      <div className="teso-cifras">
        <div className="teso-cifra"><span>{tr('Vas a cobrar')}</span><strong className="teso-in">{eur(p.entra)}</strong></div>
        <div className="teso-cifra"><span>{tr('Vas a pagar')}</span><strong className="teso-out">{eur(p.sale)}</strong></div>
        <div className="teso-cifra"><span>{tr('Hacienda')}</span><strong className="teso-hac">{eur(p.hacienda)}</strong></div>
        <div className="teso-cifra final"><span>{tr(p.conSaldo ? 'Saldo el {fecha}' : 'Diferencia el {fecha}', { fecha: tr(fechaTexto(p.hasta)) })}</span><strong className={p.final < 0 ? 'teso-out' : ''}>{eur(p.final)}</strong></div>
      </div>
      {p.minimo.saldo < 0 && <p className="teso-alerta">{tr(p.conSaldo ? 'El {fecha} te quedarías en {importe}. Adelanta cobros o retrasa pagos.' : 'El {fecha} te quedarías en {importe} (sin contar lo que tienes hoy en el banco). Adelanta cobros o retrasa pagos.', { fecha: tr(fechaTexto(p.minimo.fecha)), importe: eur(p.minimo.saldo) })}</p>}

      <section className="grupo">
        <h2 className="grupo-t">{tr('Mes a mes')}</h2>
        {p.meses.length > 0 && <div className="grupo-c relleno teso-graf"><GraficaCaja meses={p.meses.map(({ mes, nombre, entra, sale, hacienda, saldo }) => ({ mes, nombre, entra, sale, hacienda, saldo }))} conSaldo={p.conSaldo} /></div>}
        <div className="grupo-c teso-meses">
          {p.meses.map((m) => (
            <div key={m.mes} className="celda teso-mes">
              <span className="txt">{nombreMes(m, idioma)}<small>+{eur(Math.abs(m.entra))} · −{eur(Math.abs(m.sale))}{m.hacienda ? ` · ${tr('Hacienda −{importe}', { importe: eur(Math.abs(m.hacienda)) })}` : ''}</small></span>
              <span className="teso-barra" aria-hidden><span className={m.saldo < 0 ? 'neg' : ''} style={{ width: `${Math.round((Math.abs(m.saldo) / alto) * 100)}%` }} /></span>
              <span className={`v${m.saldo < 0 ? ' rojo' : ''}`}>{eur(m.saldo)}</span>
            </div>
          ))}
        </div>
        <p className="grupo-pie">{tr(p.conSaldo ? 'Saldo previsto al final de cada mes.' : 'Saldo previsto al final de cada mes, partiendo de 0 €.')}</p>
      </section>

      {p.meses.filter((m) => m.movimientos.length).map((m) => (
        <section key={m.mes} className="grupo">
          <h2 className="grupo-t">{nombreMes(m, idioma)}</h2>
          <ul className="grupo-lista teso-lista">
            {m.movimientos.map((x, i) => {
              const fila = (
                <>
                  <span className={`teso-tipo ${x.tipo}`}>{fechaCorta(x.fecha).slice(0, 5)}</span>
                  <span className="txt"><strong>{conceptoDe(x, tr)}</strong><small>{tr(TIPO[x.tipo])}{x.detalle ? ` · ${detalleDe(x, tr)}` : ''}{x.vencida ? ` · ${tr('vencida')}` : ''}</small></span>
                  <span className="teso-imp"><span className={x.importe > 0 ? 'teso-in' : x.tipo === 'hacienda' ? 'teso-hac' : 'teso-out'}>{x.importe > 0 ? '+' : '−'}{eur(Math.abs(x.importe))}</span><small>{eur(x.saldo)}</small></span>
                </>
              );
              if (x.pregunta) return <li key={i}><div className="fila">{fila}</div><YaPresentado pregunta={x.pregunta} importe={-x.importe} puede={puede(u, 'contabilidad')} /></li>;
              return <li key={i}>{x.url ? <Ir href={x.url} className="fila">{fila}</Ir> : <div className="fila">{fila}</div>}</li>;
            })}
          </ul>
        </section>
      ))}
      </>}

      <details className="como-se-calcula"><summary>{tr('Cómo se calcula')}</summary><p className="grupo-pie arriba">{tr('Cobros: facturas sin cobrar a su vencimiento (las vencidas, hoy) y las recurrentes. Pagos: gastos pendientes a su vencimiento (los vencidos, hoy) y los que se repiten cada uno de los 3 últimos meses. Hacienda: {iva}, 130, 115 y 111 de los trimestres sin marcar como presentados; el del trimestre en curso es una previsión con lo apuntado hasta hoy. Revísala de vez en cuando.', { iva: usaIgic(fiscalDe(u)) ? 'IGIC (420)' : '303' })}</p></details>
    </main>
  );
}

export async function generateMetadata() { return { title: (await textos())('Tesorería') }; }
