import Vacio from '@/components/Vacio';
import { usarFuncion } from '@/lib/usoPlan';
import SinPlan from '@/components/SinPlan';
import { requerir } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { leer, redis } from '@/lib/redis';
import { leerMarcados } from '@/lib/indices';
import { carteraCobros } from '@/lib/cartera';
import { FORMAS } from '@/lib/terceros';
import EfectoCobro from '@/components/EfectoCobro';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import Deslizable from '@/components/Deslizable';
import SinBD from '@/components/SinBD';
import '@/app/tesoreria.css';
import '@/app/cartera.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';

const cuando = (e) => (e.dias < 0 ? `vencida hace ${-e.dias} ${e.dias === -1 ? 'día' : 'días'}` : e.dias === 0 ? 'vence hoy' : `vence en ${e.dias} ${e.dias === 1 ? 'día' : 'días'}`);

export default async function Cartera({ searchParams }) {
  const u = await requerir('facturas');
  if (await usarFuncion(u, 'cartera')) return <SinPlan usuario={u} funcion="cartera" />;
  if (!redis) return <SinBD />;
  const h = hoy();
  const [pendientes, clientes] = await Promise.all([leerMarcados(u, 'facturas', 'p'), leer(u, 'clientes')]);
  const d = carteraCobros(pendientes, { hoy: h, plazo: u.emisor?.plazo, clientes: clientes || [] });
  const sp = await searchParams;
  const forma = d.porForma.some((x) => x.id === sp.forma) ? sp.forma : sp.forma === 'sin' && d.porForma.some((x) => !x.id) ? 'sin' : '';
  const porRecibir = sp.recibir === '1';
  const visibles = d.efectos.filter((e) => (!forma || e.forma === (forma === 'sin' ? '' : forma)) && (!porRecibir || (e.requiereRecepcion && !e.recibido)));
  const claveMes = (e) => (e.vencido ? 'vencido' : e.vence.slice(0, 7));
  const grupos = d.porMes.map((m) => {
    const efectos = visibles.filter((e) => claveMes(e) === m.mes);
    return { ...m, efectos, importe: Math.round(efectos.reduce((t, e) => t + e.pendiente, 0) * 100) / 100 };
  }).filter((g) => g.efectos.length);
  const url = (c) => { const q = new URLSearchParams(Object.entries({ forma, recibir: porRecibir ? '1' : '', ...c }).filter(([, v]) => v)); return q.size ? `/cartera?${q}` : '/cartera'; };
  const editable = puede(u, 'facturar');
  const alto = Math.max(1, ...d.porTramo.map((t) => t.importe));

  return (
    <main className="pagina mk-look tesoreria cartera">
      <Volver href="/tesoreria">Tesorería</Volver>
      <h1 className="titulo">Cartera de cobros</h1>
      {d.efectos.length > 0 && <a className="grupo-pie car-excel" href="/api/cartera" download>Descargar en Excel ›</a>}

      <div className="teso-cifras">
        <div className="teso-cifra"><span>Pendiente de cobro</span><strong className="teso-in">{eur(d.total)}</strong></div>
        <div className="teso-cifra"><span>Vencido</span><strong className={d.vencido ? 'teso-out' : ''}>{eur(d.vencido)}</strong></div>
        <div className="teso-cifra"><span>Por vencer</span><strong>{eur(d.aVencer)}</strong></div>
        <div className="teso-cifra"><span>{d.pmv !== null && d.pmv < 0 ? 'Vencimiento medio' : 'Vence de media en'}</span><strong>{d.pmv === null ? '—' : d.pmv < 0 ? `hace ${Math.round(-d.pmv)} d` : `${Math.round(d.pmv)} d`}</strong></div>
      </div>

      {d.efectos.length === 0 ? (
        <Vacio icono="cobrar" titulo="Nada pendiente de cobro" accion={editable && { href: '/facturas/nueva', texto: 'Nueva factura' }}>Cuando emitas una factura y no esté cobrada, aparecerá aquí ordenada por su vencimiento.</Vacio>
      ) : <>
        {d.porRecibir.n > 0 && <Ir href={url({ recibir: porRecibir ? '' : '1' })} className="car-aviso">{d.porRecibir.n} {d.porRecibir.n === 1 ? 'efecto' : 'efectos'} por recibir ({eur(d.porRecibir.importe)}): {porRecibir ? 'ver todos' : 'ver cuáles'} ›</Ir>}

        <section className="grupo">
          <h2 className="grupo-t">Por vencimiento</h2>
          <div className="grupo-c teso-meses">
            {d.porTramo.map((t) => (
              <div key={t.id} className="celda teso-mes">
                <span className="txt">{t.nombre}<small>{t.n} {t.n === 1 ? 'efecto' : 'efectos'}</small></span>
                <span className="teso-barra" aria-hidden><span className={t.id === 'vencido' ? 'neg' : ''} style={{ width: `${Math.round((t.importe / alto) * 100)}%` }} /></span>
                <span className={`v${t.id === 'vencido' && t.importe ? ' rojo' : ''}`}>{eur(t.importe)}</span>
              </div>
            ))}
          </div>
        </section>

        <Deslizable className="chips car-formas">
          <Ir href={url({ forma: '' })} tipo="fundido" className={!forma ? 'activo' : ''}>Todas</Ir>
          {d.porForma.map((x) => <Ir key={x.id || 'sin'} href={url({ forma: x.id || 'sin' })} tipo="fundido" className={(x.id || 'sin') === forma ? 'activo' : ''}>{x.nombre} · {x.n}</Ir>)}
        </Deslizable>
        {!visibles.length && <Vacio tipo="resultados" icono="cobrar" titulo="Ningún efecto con este filtro" accion={{ href: '/cartera', texto: 'Quitar filtros' }} />}

        {grupos.map((g) => (
          <section key={g.mes} className="grupo">
            <h2 className="grupo-t car-mes"><span>{g.mes === 'vencido' ? g.nombre : g.nombre[0].toUpperCase() + g.nombre.slice(1)}</span><small>{eur(g.importe)}</small></h2>
            <ul className="grupo-lista teso-lista car-lista">
              {g.efectos.map((e) => (
                <li key={e.id} className="car-efecto-fila">
                  <Ir href={e.url} className="fila">
                    <span className={`teso-tipo ${e.vencido ? 'vencida' : 'cobro'}`}>{fechaCorta(e.vence).replace(/\/20(\d\d)$/, '/$1')}</span>
                    <span className="txt"><strong>{e.cliente}</strong><small>{e.numero} · <span className={e.vencido ? 'car-venc' : ''}>{cuando(e)}</span>{e.concepto ? ` · ${e.concepto}` : ''}</small></span>
                    <span className="teso-imp"><span className={e.vencido ? 'teso-out' : 'teso-in'}>{eur(e.pendiente)}</span>{e.cobrado > 0 && <small>de {eur(e.total)}</small>}</span>
                  </Ir>
                  {editable
                    ? <EfectoCobro id={e.id} forma={e.forma} formas={FORMAS} requiere={e.requiereRecepcion} recibido={e.recibido} fecha={e.fechaRecepcion && fechaCorta(e.fechaRecepcion)} />
                    : <p className="car-solo">{e.formaNombre}{e.requiereRecepcion ? (e.recibido ? ' · recibido' : ' · pendiente de recibir') : ''}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="grupo">
          <h2 className="grupo-t">Por cliente</h2>
          <ul className="grupo-lista teso-lista">
            {d.porCliente.map((c) => (
              <li key={`${c.nif}|${c.cliente}`}>
                <div className="fila">
                  <span className="txt"><strong>{c.cliente}</strong><small>{c.n} {c.n === 1 ? 'efecto' : 'efectos'}{c.vencido ? ` · vencido ${eur(c.vencido)}` : ''}</small></span>
                  <span className="teso-imp"><span>{eur(c.importe)}</span><small>{Math.round((c.importe / d.total) * 100)} %</small></span>
                </div>
              </li>
            ))}
          </ul>
          {d.concentracion >= 50 && d.porCliente.length > 1 && <p className="grupo-pie">Ojo: {d.porCliente[0].cliente} concentra el {Math.round(d.concentracion)} % de lo pendiente.</p>}
        </section>
      </>}

      {d.abonos.n > 0 && <p className="grupo-pie arriba">Además hay {d.abonos.n} {d.abonos.n === 1 ? 'factura rectificativa pendiente' : 'facturas rectificativas pendientes'} por {eur(-d.abonos.importe)} que se te descuentan o devuelves: no cuentan en la cartera.</p>}
      <p className="grupo-pie arriba">Facturas emitidas sin cobrar, a su fecha de vencimiento; si se cobró una parte, solo lo que falta. Los cobros nuevos (a mano, por el banco o por Stripe) la actualizan solos. Forma de cobro: la que elijas en cada efecto o, si no, la de la ficha del cliente. Cheque, confirming y pagaré se marcan cuando los recibes; el resto cuenta como recibido.</p>
    </main>
  );
}

export const metadata = { title: 'Cartera de cobros' };
