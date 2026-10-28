import Vacio from '@/components/Vacio';
import { textos } from '@/lib/idiomaServidor';
import { conHuecos } from '@/lib/huecos';
import { usarFuncion } from '@/lib/usoPlan';
import SinPlan from '@/components/SinPlan';
import { requerir } from '@/lib/auth';
import { clave, leer, redis } from '@/lib/redis';
import { fiscalDe } from '@/lib/empresa';
import { esSociedad } from '@/lib/modulos';
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
import { gastosQueVe, nominasQueVe } from '@/lib/nominas';

export const dynamic = 'force-dynamic';
// «1T 2025» sale como «Q1 2025» en inglés; el año solo se queda.
const nombrePeriodo = (tr, s) => { const m = /^([1-4])T (\d{4})$/.exec(s || ''); return m ? `${tr('{trimestre}T', { trimestre: m[1] })} ${m[2]}` : s; };

const num = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const valor = (r, tr) => (r.valor === null ? '—' : r.unidad === '%' ? pct(r.valor) : r.unidad === 'días' ? tr('{n} días', { n: Math.round(r.valor) }) : num.format(r.valor));
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
  const tr = await textos();
  if (await usarFuncion(u, 'analisis')) return <SinPlan usuario={u} funcion="analisis" />;
  const [facturas, gastosLeidos, nominasLeidas, manuales, saldo, productos, ajustes, albaranes] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), leer(u, 'asientos'), redis?.get(clave(u, 'saldo')), leer(u, 'productos'), leer(u, 'stock'), leer(u, 'albaranes')]);
  // Sin el permiso «Nóminas», las de cada persona van juntas por mes (lib/nominas.js, Codex H2).
  const gastos = gastosQueVe(u, gastosLeidos), nominas = nominasQueVe(u, nominasLeidas);
  if (!facturas) return <SinBD />;
  const sp = await searchParams;
  const h = hoy();
  const actual = Number(h.slice(0, 4));
  const anio = Number(sp.anio) || actual;
  const p = /^[1-4]$/.test(sp.p || '') ? sp.p : '';
  const fiscal = fiscalDe(u);
  const capital = (await leer(u, 'capital')) || [];
  const d = informe({ facturas, gastos, nominas: nominas || [], manuales: manuales || [], saldo, fiscal, pagos130: u.pagos130 || {}, pres303: u.pres303 || {}, pres369: u.pres369 || {}, pres123: u.pres123 || {}, pres111: u.pres111 || {}, pres115: u.pres115 || {}, pagadosHacienda: u.pagadosHacienda || {}, prorrata: u.prorrata || {}, capital, pagos202: u.pagos202 || {}, cuotaIS: u.cuotaIS || {}, binsPrevias: u.binsPrevias || {}, fondosPropios: u.fondosPropios || {}, productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [] }, anio, p, h);
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
  // Los datos de cualquier año permiten volver a un periodo con actividad.
  const hayDatos = !sinDatos || [facturas, gastos, nominas, manuales, capital, productos, ajustes, albaranes].some((lista) => lista?.length > 0) || Boolean(saldo?.importe);

  return (
    <main className="pagina mk-look modelos analisis">
      <Volver href="/">Resumen</Volver>
      <header className="cabecera modelos-cab">
        <h1 className="titulo">{tr('Análisis')}</h1>
        {hayDatos && <nav className="anios" aria-label={tr('Año')}>
          <Ir href={url({ anio: anio - 1 })} tipo="cifras" aria-label={tr('Año anterior')}>‹</Ir>
          <strong>{anio}</strong>
          {anio < actual ? <Ir href={url({ anio: anio + 1 })} tipo="cifras" aria-label={tr('Año siguiente')}>›</Ir> : <span className="off">›</span>}
        </nav>}
      </header>
      {hayDatos && <nav className="segmentado cont-periodo" aria-label={tr('Periodo')}>
        {['', '1', '2', '3', '4'].map((x) => <Ir key={x} href={url({ p: x })} tipo="fundido" className={x === p ? 'activo' : ''}>{x ? tr('{trimestre}T', { trimestre: x }) : tr('Año')}</Ir>)}
      </nav>}

      {sinDatos ? <Vacio icono="beneficio" tipo={p || anio !== actual ? 'resultados' : 'vacio'} titulo={tr('Aún no hay nada que analizar')} accion={{ href: '/facturas/nueva', texto: tr('Nueva factura') }} secundaria={p || anio !== actual ? { href: '/analisis', texto: tr('Quitar filtros') } : { href: '/gastos#apuntar-gasto', texto: tr('Añadir gasto') }}>{tr('Apunta tus ventas y gastos para comparar lo que ganas y lo que gastas.')}</Vacio> : <>
        <div className="teso-cifras">
          <div className="teso-cifra"><span>{tr('Margen bruto')}</span><strong>{eur(a.margenBruto)}</strong><small className="ana-pie">{a.margenBrutoPct === null ? '' : tr('{pct} de las ventas', { pct: pct(a.margenBrutoPct) })}</small></div>
          <div className="teso-cifra"><span>{tr('EBITDA')}</span><strong className={a.ebitda < 0 ? 'teso-out' : ''}>{eur(a.ebitda)}</strong><small className="ana-pie">{a.ebitdaPct === null ? '' : tr('{pct} de las ventas', { pct: pct(a.ebitdaPct) })}</small></div>
          <div className="teso-cifra"><span>{tr('Resultado')}</span><strong className={a.resultado < 0 ? 'teso-out' : ''}>{eur(a.resultado)}</strong><small className="ana-pie">{a.netoPct === null ? '' : tr('{pct} de las ventas', { pct: pct(a.netoPct) })}</small></div>
          <div className="teso-cifra final"><span>{tr('Punto de equilibrio')}</span><strong>{e.ventasEquilibrio === null ? '—' : eur(e.ventasEquilibrio)}</strong><small className="ana-pie">{e.estado === 'superado' ? tr('Ya lo has superado') : e.estado === 'por-debajo' ? tr('Te faltan {importe}', { importe: eur(e.faltan) }) : e.estado === 'sin-fijos' ? tr('Sin costes fijos') : tr('Sin margen para calcularlo')}</small></div>
        </div>
        {d.parcial && <p className="grupo-pie">{B ? tr('El periodo no ha terminado: son las cifras hasta el {fecha}, comparadas con el mismo tramo de {anterior}.', { fecha: fechaCorta(h), anterior: anio - 1 }) : tr('El periodo no ha terminado: son las cifras hasta el {fecha}.', { fecha: fechaCorta(h) })}</p>}

        <section className="bloque">
          <h2 className="grupo-t">{tr('De las ventas al EBITDA')}</h2>
          <div className="tarjeta cont-tabla">
            <div className="cont-fila cont-cab"><span className="cont-n">{tr('Cuenta de resultados')}</span><span className="cont-cifras"><span>{nombrePeriodo(tr, d.nombre.actual)}</span>{B && <small>{nombrePeriodo(tr, d.nombre.anterior)}</small>}</span></div>
            <Fila n={tr('Ventas (cifra de negocios)')} v={a.ventas} ant={ant('ventas')} />
            <Fila n={tr('Compras (aprovisionamientos)')} v={-a.aprovisionamientos} ant={B ? -B.aprovisionamientos : undefined} sub />
            <Fila n={tr('Margen bruto')} v={a.margenBruto} ant={ant('margenBruto')} fuerte />
            {(a.otrosIngresos !== 0 || Boolean(B?.otrosIngresos)) && <Fila n={tr('Otros ingresos de explotación')} v={a.otrosIngresos} ant={ant('otrosIngresos')} sub />}
            <Fila n={tr('Gastos de personal')} v={-a.personal} ant={B ? -B.personal : undefined} sub />
            <Fila n={tr('Otros gastos de explotación')} v={-a.gastosExplotacion} ant={B ? -B.gastosExplotacion : undefined} sub />
            {(a.excepcionales !== 0 || Boolean(B?.excepcionales)) && <Fila n={tr('Otros resultados')} v={a.excepcionales} ant={ant('excepcionales')} sub />}
            <Fila n={tr('EBITDA')} v={a.ebitda} ant={ant('ebitda')} fuerte />
            <Fila n={tr('Amortización del inmovilizado')} v={-a.amortizacion} ant={B ? -B.amortizacion : undefined} sub />
            <Fila n={tr('Resultado de explotación (EBIT)')} v={a.ebit} ant={ant('ebit')} fuerte />
            <Fila n={tr('Resultado financiero')} v={a.financiero} ant={ant('financiero')} sub />
            <Fila n={tr('Resultado antes de impuestos')} v={a.antes} ant={ant('antes')} fuerte />
            {(a.impuesto !== 0 || Boolean(B?.impuesto)) && <Fila n={tr('Impuesto sobre beneficios')} v={a.impuesto} ant={ant('impuesto')} sub />}
            <Fila n={tr('Resultado del ejercicio')} v={a.resultado} ant={ant('resultado')} fuerte />
          </div>
          <p className="grupo-pie">
            {tr('EBITDA es lo que gana la actividad antes de amortizaciones, intereses e impuestos: lo que genera en caja de forma «operativa». Margen bruto = ventas menos lo que cuesta producir o comprar lo vendido (cuentas 60 y 61).')}
            {variacion('ebitda') !== null && ` ${variacion('ebitda') >= 0 ? tr('El EBITDA sube un {n} % frente a {periodo}.', { n: Math.abs(variacion('ebitda')), periodo: nombrePeriodo(tr, d.nombre.anterior) }) : tr('El EBITDA baja un {n} % frente a {periodo}.', { n: Math.abs(variacion('ebitda')), periodo: nombrePeriodo(tr, d.nombre.anterior) })}`}
            {!fiscal.tipo || fiscal.tipo !== 'sociedad' ? ` ${tr('Como autónomo, el IRPF no es gasto de la actividad y no aparece.')}` : ''}
          </p>
        </section>

        <section className="bloque">
          <h2 className="grupo-t">{tr('Punto de equilibrio')}</h2>
          <div className="tarjeta ana-pe">
            {e.estado === 'imposible' && <p className="ana-txt">{tr('Con el margen bruto de este periodo ({margen}) no se puede calcular: no hay margen con el que cubrir los costes fijos. Hace falta vender con margen positivo.', { margen: e.margenContribucionPct === null ? tr('sin ventas') : pct(e.margenContribucionPct) })}</p>}
            {e.estado === 'sin-fijos' && <p className="ana-txt">{tr('No hay costes fijos en este periodo, así que cualquier venta con margen ya deja beneficio.')}</p>}
            {(e.estado === 'superado' || e.estado === 'por-debajo') && <>
              <p className="ana-txt">{conHuecos(tr('Necesitas vender {ventas} en este periodo ({mensual} al mes) para no perder dinero.'), { ventas: <strong>{eur(e.ventasEquilibrio)}</strong>, mensual: eur(e.mensual) })}{' '}
                {e.estado === 'superado' ? conHuecos(tr('Llevas {ventas}: estás {margen} por encima ({pct} de margen de seguridad).'), { ventas: <strong>{eur(a.ventas)}</strong>, margen: <strong className="teso-in">{eur(e.margenSeguridad)}</strong>, pct: pct(e.margenSeguridadPct) }) : conHuecos(tr('Llevas {ventas}: te faltan {faltan}.'), { ventas: <strong>{eur(a.ventas)}</strong>, faltan: <strong className="teso-out">{eur(e.faltan)}</strong> })}</p>
              <span className="ana-barra" aria-hidden><span className={e.estado === 'superado' ? '' : 'neg'} style={{ width: `${Math.min(100, Math.round((a.ventas / Math.max(1, e.ventasEquilibrio)) * 100))}%` }} /></span>
            </>}
            <dl>
              <div><dt>{tr('Costes fijos')}</dt><dd>{eur(e.costesFijos)}</dd></div>
              <div><dt>{tr('Margen de contribución')}</dt><dd>{e.margenContribucionPct === null ? '—' : pct(e.margenContribucionPct)}</dd></div>
              {e.ventasMensuales != null && <div><dt>{tr('Ventas medias al mes')}</dt><dd>{eur(e.ventasMensuales)}</dd></div>}
              <div className="fuerte"><dt>{tr('Ventas de equilibrio')}</dt><dd>{e.ventasEquilibrio === null ? '—' : eur(e.ventasEquilibrio)}</dd></div>
            </dl>
          </div>
          <p className="grupo-pie">{tr('Ventas de equilibrio = costes fijos ÷ margen de contribución. Se toman como variables las compras y aprovisionamientos (suben con las ventas); como fijos, el personal, los demás gastos, la amortización y los intereses. Es una aproximación: si algún gasto fijo depende de lo que vendes (comisiones, por ejemplo), el punto real será algo distinto.')}</p>
        </section>

        {/* Los ratios salen del balance: solo para sociedades (lib/modulos.js). */}
        {esSociedad(fiscal) && <>
        <section className="bloque">
          <h2 className="grupo-t">{tr('Ratios financieros')}</h2>
          {a.patrimonioNeto <= 0 && a.activo > 0 && <p className="cont-alerta">{tr('El patrimonio neto es {importe}: las deudas superan a lo que tiene la empresa, o falta el asiento de apertura con el capital.', { importe: eur(a.patrimonioNeto) })}</p>}
          {GRUPOS.map(([titulo, detalle, ids]) => (
            <div key={titulo} className="ana-grupo">
              <h3 className="ana-gt">{tr(titulo)}<small>{tr(detalle)}</small></h3>
              <ul className="grupo-lista ana-ratios">
                {ids.map(ratio).map((r) => (
                  <li key={r.id}>
                    <details className="ana-ratio">
                      <summary>
                        <span className={`ana-punto ${r.estado || 'nada'}`} aria-label={r.estado === 'bien' ? tr('Bien') : r.estado === 'ojo' ? tr('Ojo') : r.estado === 'mal' ? tr('Mal') : tr('Sin valorar')} />
                        <span className="txt"><strong>{tr(r.nombre)}</strong><small>{tr('Referencia: {referencia}', { referencia: tr(r.referencia) })}</small></span>
                        <span className="ana-valor">{valor(r, tr)}</span>
                      </summary>
                      <p>{tr(r.ayuda)}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="tarjeta cont-tabla ana-fm">
            <Fila n={tr('Fondo de maniobra (activo corriente − pasivo corriente)')} v={a.fondoManiobra} fuerte />
          </div>
          <p className="grupo-pie">{tr('Calculados con el balance a {fecha}. Los ratios de rentabilidad son del periodo, sin anualizar. Los verdes, ámbar y rojos son orientativos: lo normal depende del sector y de si eres autónomo o sociedad.', { fecha: fechaCorta(bal.fecha) })}</p>
        </section>
        </>}
      </>}

      <details className="como-se-calcula"><summary>{tr('Cómo se calcula')}</summary><p className="grupo-pie arriba">{esSociedad(fiscal) ? conHuecos(tr('Todo sale de la {contabilidad} de Fisquo, así que cuadra con ella.'), { contabilidad: <Ir href="/contabilidad">{tr('contabilidad')}</Ir> }) : conHuecos(tr('Todo sale de tus facturas y gastos, así que cuadra con tus {libros}.'), { libros: <Ir href="/contabilidad">{tr('libros registro')}</Ir> })} {conHuecos(tr('Para ver lo que te deben los clientes, por fechas de vencimiento, abre la {cartera}.'), { cartera: <Ir href="/cartera">{tr('cartera de cobros')}</Ir> })}</p></details>
    </main>
  );
}

export async function generateMetadata() {
  return { title: (await textos())('Análisis') };
}
