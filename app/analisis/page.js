import { usarFuncion } from '@/lib/usoPlan';
import SinPlan from '@/components/SinPlan';
import { requerir } from '@/lib/auth';
import { clave, leer, redis } from '@/lib/redis';
import { fiscalDe } from '@/lib/empresa';
import { informe } from '@/lib/contabilidad';
import { balanceContable } from '@/lib/asientos';
import { analisis } from '@/lib/analisis';
import { eur, fechaCorta, hoy, pct } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import '@/app/tesoreria.css';
import '@/app/modelos.css';
import '@/app/contabilidad.css';
import '@/app/analisis.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';

const num = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const valor = (r) => (r.valor === null ? '—' : r.unidad === '%' ? pct(r.valor) : r.unidad === 'días' ? `${Math.round(r.valor)} días` : num.format(r.valor));
const GRUPOS = [
  ['Liquidez', 'Si puedes pagar lo que vence pronto', ['liquidez', 'acida', 'tesoreria']],
  ['Solvencia', 'Si lo que tienes cubre lo que debes', ['solvencia', 'endeudamiento', 'autonomia']],
  ['Rentabilidad', 'Cuánto deja la actividad', ['margenNeto', 'roa', 'roe']],
  ['Plazos', 'Cuánto tardas en cobrar y en pagar', ['cobro', 'pago']],
];

// Una fila de la cuenta de resultados: importe y, al lado, el del periodo anterior.
const Fila = ({ n, v, ant, fuerte, sub }) => (
  <div className={`cont-fila${fuerte ? ' cont-total' : ''}${sub ? ' ana-sub' : ''}`}>
    <span className="cont-n">{n}</span>
    <span className="cont-cifras"><span>{eur(v)}</span>{ant !== undefined && <small>{ant === null ? '—' : eur(ant)}</small>}</span>
  </div>
);

export default async function Analisis({ searchParams }) {
  const u = await requerir('resumen');
  if (await usarFuncion(u, 'analisis')) return <SinPlan usuario={u} funcion="analisis" />;
  const [facturas, gastos, nominas, manuales, saldo, productos, ajustes, albaranes] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), leer(u, 'asientos'), redis?.get(clave(u, 'saldo')), leer(u, 'productos'), leer(u, 'stock'), leer(u, 'albaranes')]);
  if (!facturas) return <SinBD />;
  const sp = await searchParams;
  const h = hoy();
  const actual = Number(h.slice(0, 4));
  const anio = Number(sp.anio) || actual;
  const p = /^[1-4]$/.test(sp.p || '') ? sp.p : '';
  const fiscal = fiscalDe(u);
  const d = informe({ facturas, gastos, nominas: nominas || [], manuales: manuales || [], saldo, fiscal, pagos130: u.pagos130 || {}, pagos202: u.pagos202 || {}, cuotaIS: u.cuotaIS || {}, productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [] }, anio, p, h);
  // El balance, al cierre del periodo (o a hoy si aún no ha acabado).
  const bal = balanceContable(d.asientos, d.per.hasta > h ? h : d.per.hasta, { sociedad: fiscal.tipo === 'sociedad' });
  const a = analisis({ pyg: d.actual, anterior: d.anterior, bal, per: d.per, hoy: h, facturas, gastos });
  const B = a.anterior;
  const ant = (k) => (B ? B[k] : undefined);
  const e = a.equilibrio;
  const url = (c) => { const q = new URLSearchParams(Object.entries({ anio, p, ...c }).filter(([, v]) => v)); return `/analisis?${q}`; };
  const ratio = (id) => a.ratios.find((r) => r.id === id);
  const variacion = (k) => (B && B[k] ? Math.round(((a[k] - B[k]) / Math.abs(B[k])) * 100) : null);
  const sinDatos = d.sinDatos;

  return (
    <main className="pagina mk-look modelos analisis">
      <Volver href="/">Resumen</Volver>
      <header className="cabecera modelos-cab">
        <h1 className="titulo">Análisis</h1>
        <nav className="anios">
          <Ir href={url({ anio: anio - 1 })} tipo="cifras" aria-label="Año anterior">‹</Ir>
          <strong>{anio}</strong>
          {anio < actual ? <Ir href={url({ anio: anio + 1 })} tipo="cifras" aria-label="Año siguiente">›</Ir> : <span className="off">›</span>}
        </nav>
      </header>
      <nav className="segmentado cont-periodo">
        {['', '1', '2', '3', '4'].map((x) => <Ir key={x} href={url({ p: x })} tipo="fundido" className={x === p ? 'activo' : ''}>{x ? `${x}T` : 'Año'}</Ir>)}
      </nav>

      {sinDatos ? <div className="vacio"><p>Aún no hay nada que analizar</p><p>Cuando apuntes facturas y gastos, aquí verás tu margen bruto, el EBITDA, el punto de equilibrio y los ratios.</p></div> : <>
        <div className="teso-cifras">
          <div className="teso-cifra"><span>Margen bruto</span><strong>{eur(a.margenBruto)}</strong><small className="ana-pie">{a.margenBrutoPct === null ? '' : `${num.format(a.margenBrutoPct)} % de las ventas`}</small></div>
          <div className="teso-cifra"><span>EBITDA</span><strong className={a.ebitda < 0 ? 'teso-out' : ''}>{eur(a.ebitda)}</strong><small className="ana-pie">{a.ebitdaPct === null ? '' : `${num.format(a.ebitdaPct)} % de las ventas`}</small></div>
          <div className="teso-cifra"><span>Resultado</span><strong className={a.resultado < 0 ? 'teso-out' : ''}>{eur(a.resultado)}</strong><small className="ana-pie">{a.netoPct === null ? '' : `${num.format(a.netoPct)} % de las ventas`}</small></div>
          <div className="teso-cifra final"><span>Punto de equilibrio</span><strong>{e.ventasEquilibrio === null ? '—' : eur(e.ventasEquilibrio)}</strong><small className="ana-pie">{e.estado === 'superado' ? 'Ya lo has superado' : e.estado === 'por-debajo' ? `Te faltan ${eur(e.faltan)}` : e.estado === 'sin-fijos' ? 'Sin costes fijos' : 'Sin margen para calcularlo'}</small></div>
        </div>
        {d.parcial && <p className="grupo-pie">El periodo no ha terminado: son las cifras hasta el {fechaCorta(h)}{B ? `, comparadas con el mismo tramo de ${anio - 1}` : ''}.</p>}

        <section className="bloque">
          <h2 className="grupo-t">De las ventas al EBITDA</h2>
          <div className="tarjeta cont-tabla">
            <div className="cont-fila cont-cab"><span className="cont-n">Cuenta de resultados</span><span className="cont-cifras"><span>{d.nombre.actual}</span>{B && <small>{d.nombre.anterior}</small>}</span></div>
            <Fila n="Ventas (cifra de negocios)" v={a.ventas} ant={ant('ventas')} />
            <Fila n="Compras (aprovisionamientos)" v={-a.aprovisionamientos} ant={B ? -B.aprovisionamientos : undefined} sub />
            <Fila n="Margen bruto" v={a.margenBruto} ant={ant('margenBruto')} fuerte />
            {(a.otrosIngresos !== 0 || Boolean(B?.otrosIngresos)) && <Fila n="Otros ingresos de explotación" v={a.otrosIngresos} ant={ant('otrosIngresos')} sub />}
            <Fila n="Gastos de personal" v={-a.personal} ant={B ? -B.personal : undefined} sub />
            <Fila n="Otros gastos de explotación" v={-a.gastosExplotacion} ant={B ? -B.gastosExplotacion : undefined} sub />
            {(a.excepcionales !== 0 || Boolean(B?.excepcionales)) && <Fila n="Otros resultados" v={a.excepcionales} ant={ant('excepcionales')} sub />}
            <Fila n="EBITDA" v={a.ebitda} ant={ant('ebitda')} fuerte />
            <Fila n="Amortización del inmovilizado" v={-a.amortizacion} ant={B ? -B.amortizacion : undefined} sub />
            <Fila n="Resultado de explotación (EBIT)" v={a.ebit} ant={ant('ebit')} fuerte />
            <Fila n="Resultado financiero" v={a.financiero} ant={ant('financiero')} sub />
            <Fila n="Resultado antes de impuestos" v={a.antes} ant={ant('antes')} fuerte />
            {(a.impuesto !== 0 || Boolean(B?.impuesto)) && <Fila n="Impuesto sobre beneficios" v={a.impuesto} ant={ant('impuesto')} sub />}
            <Fila n="Resultado del ejercicio" v={a.resultado} ant={ant('resultado')} fuerte />
          </div>
          <p className="grupo-pie">
            EBITDA es lo que gana la actividad antes de amortizaciones, intereses e impuestos: lo que genera en caja de forma «operativa». Margen bruto = ventas menos lo que cuesta producir o comprar lo vendido (cuentas 60 y 61).
            {variacion('ebitda') !== null && ` El EBITDA ${variacion('ebitda') >= 0 ? 'sube' : 'baja'} un ${Math.abs(variacion('ebitda'))} % frente a ${d.nombre.anterior}.`}
            {!fiscal.tipo || fiscal.tipo !== 'sociedad' ? ' Como autónomo, el IRPF no es gasto de la actividad y no aparece.' : ''}
          </p>
        </section>

        <section className="bloque">
          <h2 className="grupo-t">Punto de equilibrio</h2>
          <div className="tarjeta ana-pe">
            {e.estado === 'imposible' && <p className="ana-txt">Con el margen bruto de este periodo ({e.margenContribucionPct === null ? 'sin ventas' : `${num.format(e.margenContribucionPct)} %`}) no se puede calcular: no hay margen con el que cubrir los costes fijos. Hace falta vender con margen positivo.</p>}
            {e.estado === 'sin-fijos' && <p className="ana-txt">No hay costes fijos en este periodo, así que cualquier venta con margen ya deja beneficio.</p>}
            {(e.estado === 'superado' || e.estado === 'por-debajo') && <>
              <p className="ana-txt">Necesitas vender <strong>{eur(e.ventasEquilibrio)}</strong> en este periodo ({eur(e.mensual)} al mes) para no perder dinero.{' '}
                {e.estado === 'superado' ? <>Llevas <strong>{eur(a.ventas)}</strong>: estás <strong className="teso-in">{eur(e.margenSeguridad)}</strong> por encima ({num.format(e.margenSeguridadPct)} % de margen de seguridad).</> : <>Llevas <strong>{eur(a.ventas)}</strong>: te faltan <strong className="teso-out">{eur(e.faltan)}</strong>.</>}</p>
              <span className="ana-barra" aria-hidden><span className={e.estado === 'superado' ? '' : 'neg'} style={{ width: `${Math.min(100, Math.round((a.ventas / Math.max(1, e.ventasEquilibrio)) * 100))}%` }} /></span>
            </>}
            <dl>
              <div><dt>Costes fijos</dt><dd>{eur(e.costesFijos)}</dd></div>
              <div><dt>Margen de contribución</dt><dd>{e.margenContribucionPct === null ? '—' : pct(e.margenContribucionPct)}</dd></div>
              {e.ventasMensuales != null && <div><dt>Ventas medias al mes</dt><dd>{eur(e.ventasMensuales)}</dd></div>}
              <div className="fuerte"><dt>Ventas de equilibrio</dt><dd>{e.ventasEquilibrio === null ? '—' : eur(e.ventasEquilibrio)}</dd></div>
            </dl>
          </div>
          <p className="grupo-pie">Ventas de equilibrio = costes fijos ÷ margen de contribución. Se toman como variables las compras y aprovisionamientos (suben con las ventas); como fijos, el personal, los demás gastos, la amortización y los intereses. Es una aproximación: si algún gasto fijo depende de lo que vendes (comisiones, por ejemplo), el punto real será algo distinto.</p>
        </section>

        <section className="bloque">
          <h2 className="grupo-t">Ratios financieros</h2>
          {fiscal.tipo !== 'sociedad' && a.patrimonioNeto <= 0 && a.activo > 0 && <p className="cont-alerta">Tu patrimonio neto es {eur(a.patrimonioNeto)}: sin un asiento de apertura con tu capital y tu banco, el balance se queda corto y varios ratios salen vacíos. Apúntalo en Contabilidad › Diario.</p>}
          {fiscal.tipo === 'sociedad' && a.patrimonioNeto <= 0 && a.activo > 0 && <p className="cont-alerta">El patrimonio neto es {eur(a.patrimonioNeto)}: las deudas superan a lo que tiene la empresa, o falta el asiento de apertura con el capital.</p>}
          {GRUPOS.map(([titulo, detalle, ids]) => (
            <div key={titulo} className="ana-grupo">
              <h3 className="ana-gt">{titulo}<small>{detalle}</small></h3>
              <ul className="grupo-lista ana-ratios">
                {ids.map(ratio).map((r) => (
                  <li key={r.id}>
                    <details className="ana-ratio">
                      <summary>
                        <span className={`ana-punto ${r.estado || 'nada'}`} aria-label={r.estado === 'bien' ? 'Bien' : r.estado === 'ojo' ? 'Ojo' : r.estado === 'mal' ? 'Mal' : 'Sin valorar'} />
                        <span className="txt"><strong>{r.nombre}</strong><small>Referencia: {r.referencia}</small></span>
                        <span className="ana-valor">{valor(r)}</span>
                      </summary>
                      <p>{r.ayuda}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="tarjeta cont-tabla ana-fm">
            <Fila n="Fondo de maniobra (activo corriente − pasivo corriente)" v={a.fondoManiobra} fuerte />
          </div>
          <p className="grupo-pie">Calculados con el balance a {fechaCorta(bal.fecha)}. Los ratios de rentabilidad son del periodo, sin anualizar. Los verdes, ámbar y rojos son orientativos: lo normal depende del sector y de si eres autónomo o sociedad.</p>
        </section>
      </>}

      <p className="grupo-pie arriba">Todo sale de la <Ir href="/contabilidad">contabilidad</Ir> de Netto, así que cuadra con ella. Para ver lo que te deben los clientes, por fechas de vencimiento, abre la <Ir href="/cartera">cartera de cobros</Ir>.</p>
    </main>
  );
}
