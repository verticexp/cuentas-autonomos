import { requerir } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { clave, leer, leerUno, redis } from '@/lib/redis';
import { fiscalDe } from '@/lib/empresa';
import { informe } from '@/lib/contabilidad';
import { CUENTAS } from '@/lib/asientos';
import { cuentasAnuales, ESTRUCTURA_BALANCE, LINEAS_PYG, SECCIONES } from '@/lib/cuentasAnuales';
import FormCuentasAnuales from '@/components/CuentasAnuales';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import Deslizable from '@/components/Deslizable';
import { Borrar } from '@/components/Acciones';
import { Apertura, NuevoAsiento } from '@/components/Asiento';
import '@/app/modelos.css';
import '@/app/contabilidad.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';
const VISTAS = [['pyg', 'Resultados'], ['balance', 'Balance'], ['diario', 'Diario'], ['sumas', 'Sumas y saldos'], ['mayor', 'Mayor'], ['bienes', 'Amortizaciones'], ['anuales', 'Cuentas anuales']];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ORIGEN = { factura: (id) => `/facturas/${encodeURIComponent(id)}`, gasto: (id) => `/gastos/${encodeURIComponent(id)}`, nomina: (id) => `/nominas/${encodeURIComponent(id)}` };
const TIPO = { apertura: 'Apertura', manual: 'Manual', amortizacion: 'Amortización', impuesto: 'Impuestos', cierre: 'Cierre', regularizacion: 'Cierre', factura: 'Factura', gasto: 'Gasto', nomina: 'Nómina' };

// Una partida con su desglose plegado; las cifras del año anterior, al lado.
function Partida({ p, ant }) {
  const cifras = <span className="cont-cifras"><span>{eur(p.importe)}</span>{ant !== undefined && <small>{ant === null ? '—' : eur(ant)}</small>}</span>;
  if (!p.detalle.length) return <div className="cont-fila"><span className="cont-n">{p.nombre}</span>{cifras}</div>;
  return (
    <details className="cont-fila cont-det">
      <summary><span className="cont-n">{p.nombre}</span>{cifras}</summary>
      <dl>{p.detalle.map((d) => <div key={d.id}><dt>{d.nombre}</dt><dd>{eur(d.importe)}</dd></div>)}</dl>
    </details>
  );
}
const Total = ({ n, v, ant }) => <div className="cont-fila cont-total"><span className="cont-n">{n}</span><span className="cont-cifras"><span>{eur(v)}</span>{ant !== undefined && <small>{ant === null ? '—' : eur(ant)}</small>}</span></div>;
const imp = (v) => (v ? eur(v) : '');

export default async function Contabilidad({ searchParams }) {
  const u = await requerir('resumen');
  const [facturas, gastos, nominas, manuales, saldo] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), leer(u, 'asientos'), redis?.get(clave(u, 'saldo'))]);
  if (!facturas) return <SinBD />;
  const sp = await searchParams;
  const h = hoy();
  const actual = Number(h.slice(0, 4));
  const anio = Number(sp.anio) || actual;
  const ver = VISTAS.some(([v]) => v === sp.ver) ? sp.ver : 'pyg';
  const p = /^[1-4]$/.test(sp.p || '') ? sp.p : '';
  const cuenta = /^\d{1,9}$/.test(sp.cuenta || '') ? sp.cuenta : '572';
  const fiscal = fiscalDe(u);
  const sociedad = fiscal.tipo === 'sociedad';
  const d = informe({ facturas, gastos, nominas: nominas || [], manuales: manuales || [], saldo, fiscal, pagos130: u.pagos130 || {}, pagos202: u.pagos202 || {}, cuotaIS: u.cuotaIS || {} }, anio, p, h, { cuenta: ver === 'mayor' ? cuenta : '' });
  const mesPorDefecto = String(Number(d.fecha.slice(5, 7))).padStart(2, '0');
  const mes = /^(0[1-9]|1[0-2])$/.test(sp.mes || '') ? sp.mes : mesPorDefecto;
  const url = (c) => { const q = new URLSearchParams(Object.entries({ anio, ver, p, ...c }).filter(([, v]) => v)); return `/contabilidad?${q}`; };
  const A = d.actual, B = d.anterior;
  const ant = (id) => (B ? B.partidas.find((x) => x.id === id).importe : undefined);
  const antDe = (fn) => (B ? fn(B) : undefined);
  const visibles = (ids) => A.partidas.filter((x) => ids.includes(x.id) && (x.importe || ant(x.id) || x.id === 'cifra'));
  const totalLibro = (k) => d.libro.reduce((s, b) => s + b[k], 0);
  const escribe = puede(u, 'resumen');
  const ca = ver === 'anuales' && sociedad && cuentasAnuales({ asientos: d.asientos, gastos, nominas: nominas || [], empresa: u, anio, guardado: (await leerUno(u, 'cuentasAnuales', String(anio))) || {} });
  const cerrado = anio < actual;
  // Filas del balance oficial con importe en alguno de los dos años (las masas, siempre).
  const filasBalance = (nodos, nivel = 0) => nodos.flatMap((n) => ((ca.bal[0].v[n.id] || ca.bal[1].v[n.id] || nivel === 0) ? [{ ...n, nivel }, ...(n.hijos ? filasBalance(n.hijos, nivel + 1) : [])] : []));
  const FilaOf = ({ t, a, b, nivel = 0, fuerte }) => <div className={`cont-fila${fuerte ? ' cont-total' : ''}`} style={{ paddingLeft: nivel * 10 }}><span className="cont-n">{t}</span><span className="cont-cifras"><span>{eur(a)}</span><small>{eur(b)}</small></span></div>;

  return (
    <main className="pagina mk-look modelos contabilidad">
      <Volver href="/">Resumen</Volver>
      <header className="cabecera modelos-cab">
        <h1 className="titulo">Contabilidad</h1>
        <nav className="anios">
          <Ir href={url({ anio: anio - 1 })} tipo="cifras" aria-label="Año anterior">‹</Ir>
          <strong>{anio}</strong>
          {anio < actual ? <Ir href={url({ anio: anio + 1 })} tipo="cifras" aria-label="Año siguiente">›</Ir> : <span className="off">›</span>}
        </nav>
      </header>
      <Deslizable className="chips cont-vistas">
        {VISTAS.map(([v, n]) => <Ir key={v} href={url({ ver: v, p: '' })} tipo="fundido" className={v === ver ? 'activo' : ''}>{n}</Ir>)}
      </Deslizable>

      {ver === 'pyg' && <>
        <nav className="segmentado cont-periodo">
          {['', '1', '2', '3', '4'].map((x) => <Ir key={x} href={url({ p: x })} tipo="fundido" className={x === p ? 'activo' : ''}>{x ? `${x}T` : 'Año'}</Ir>)}
        </nav>
        <section className="bloque">
          <div className="tarjeta cont-tabla">
            <div className="cont-fila cont-cab"><span className="cont-n">Cuenta de pérdidas y ganancias</span><span className="cont-cifras"><span>{d.nombre.actual}</span>{B && <small>{d.nombre.anterior}</small>}</span></div>
            {visibles(['cifra', 'otrosIngresos', 'aprovisionamientos', 'personal', 'explotacion', 'amortizacion', 'excepcionales']).map((x) => <Partida key={x.id} p={x} ant={ant(x.id)} />)}
            <Total n="A) Resultado de explotación" v={A.explotacion} ant={antDe((b) => b.explotacion)} />
            {visibles(['ingresosFin', 'financieros']).map((x) => <Partida key={x.id} p={x} ant={ant(x.id)} />)}
            <Total n="B) Resultado financiero" v={A.financiero} ant={antDe((b) => b.financiero)} />
            <Total n="C) Resultado antes de impuestos" v={A.antes} ant={antDe((b) => b.antes)} />
            {visibles(['impuesto']).map((x) => <Partida key={x.id} p={x} ant={ant(x.id)} />)}
            <Total n="D) Resultado del ejercicio" v={A.resultado} ant={antDe((b) => b.resultado)} />
          </div>
          <p className="grupo-pie">{B && d.parcial ? `${d.nombre.anterior}: hasta el ${fechaCorta(`${anio - 1}-${h.slice(5)}`)}, para comparar lo mismo. ` : ''}{A.partidas[0].importe ? `Margen antes de impuestos: ${A.margen.toLocaleString('es-ES')} %. ` : ''}Modelo del plan general contable de pymes, sacado del libro diario. Toca cada partida para ver sus cuentas.{sociedad ? ' El Impuesto sobre Sociedades se contabiliza al cerrar el año.' : ' Como autónomo, el IRPF no es gasto de la actividad: no aparece aquí.'}</p>
        </section>
      </>}

      {ver === 'balance' && (
        <section className="bloque">
          <div className="tarjetas cont-balance">
            {[['Activo', d.bal.activo, d.bal.total], ['Patrimonio neto y pasivo', d.bal.pasivo, d.bal.totalPasivo]].map(([t, lado, total]) => (
              <div key={t} className="tarjeta cont-tabla">
                <div className="cont-fila cont-cab"><span className="cont-n">{t}</span><span className="cont-cifras"><span>{eur(total)}</span></span></div>
                {lado.map((x) => <Partida key={x.id} p={x} />)}
              </div>
            ))}
          </div>
          {d.banco && Math.abs(d.banco.diferencia) >= 0.01 && <p className="cont-alerta">El banco de la contabilidad (cuenta 572) da {eur(d.banco.contable)} y en tu banco hay {eur(d.banco.real)}: faltan {eur(Math.abs(d.banco.diferencia))} por apuntar (préstamos, aportaciones, retiradas, cobros o pagos que no están en Netto). Apúntalos en el diario o revisa la apertura.</p>}
          <p className="grupo-pie">A {fechaCorta(d.bal.fecha)}, modelo abreviado. Sale de la suma de todos los asientos, así que siempre cuadra. Toca cada masa para ver sus cuentas.</p>
        </section>
      )}

      {ver === 'diario' && (
        <section className="bloque">
          <Deslizable className="chips cont-meses">
            {MESES.map((n, i) => { const m = String(i + 1).padStart(2, '0'); return <Ir key={m} href={url({ mes: m })} tipo="fundido" className={m === mes ? 'activo' : ''}>{n}</Ir>; })}
          </Deslizable>
          {escribe && <div className="cont-acciones">
            <NuevoAsiento hoy={anio === actual ? h : `${anio}-12-31`} cuentas={Object.entries(CUENTAS)} />
            <Apertura fecha={[...facturas, ...gastos].map((x) => x.fecha).sort()[0] || h} sociedad={sociedad} previa={d.apertura} />
          </div>}
          {d.diario.filter((a) => a.fecha.slice(5, 7) === mes).map((a) => (
            <article key={a.n} className="tarjeta cont-asiento">
              <header>
                <span className="cont-num">{a.n}</span>
                <span className="cont-n"><strong>{a.concepto}</strong><small>{fechaCorta(a.fecha)} · {TIPO[a.origen?.tipo] || 'Automático'}</small></span>
                {a.origen && ORIGEN[a.origen.tipo] && <Ir href={ORIGEN[a.origen.tipo](a.origen.id)} className="cont-ver">Ver</Ir>}
                {escribe && a.origen && ['manual', 'apertura'].includes(a.origen.tipo) && <Borrar url={`/api/asientos?id=${encodeURIComponent(a.origen.id)}`} pregunta={`¿Borrar el asiento «${a.concepto}»?`} />}
              </header>
              <table className="cont-lineas">
                <thead><tr><th>Cuenta</th><th>Debe</th><th>Haber</th></tr></thead>
                <tbody>{a.lineas.map((l, i) => (
                  <tr key={i}><td className={l.haber ? 'haber' : ''}><Ir href={url({ ver: 'mayor', cuenta: l.cuenta })} tipo="fundido">{l.cuenta}</Ir> {CUENTAS[l.cuenta] || ''}</td><td>{imp(l.debe)}</td><td>{imp(l.haber)}</td></tr>
                ))}</tbody>
              </table>
            </article>
          ))}
          {!d.diario.some((a) => a.fecha.slice(5, 7) === mes) && <div className="vacio"><p>Sin asientos en este mes</p><p>Cada factura, gasto, nómina, cobro y pago genera el suyo.</p></div>}
          <p className="grupo-pie">Libro diario de {anio}: {d.diario.length} asientos. Netto los genera solos de tus facturas (y sus cobros), gastos (y sus pagos), nóminas, amortizaciones, liquidaciones de IVA y retenciones de los trimestres marcados como presentados, y el cierre de cada año. Los apuntados a mano se pueden borrar.</p>
        </section>
      )}

      {ver === 'sumas' && (
        <section className="bloque">
          <ul className="grupo-lista cont-sumas">
            {d.sumas.filas.map((x) => (
              <li key={x.cuenta}>
                <Ir href={url({ ver: 'mayor', cuenta: x.cuenta })} tipo="fundido" className="fila">
                  <span className="txt"><strong>{x.cuenta} · {x.nombre}</strong><small>{x.inicial ? `Inicial ${eur(x.inicial)} · ` : ''}Debe {eur(x.debe)} · Haber {eur(x.haber)}</small></span>
                  <span className="imp">{eur(x.saldo)}</span>
                </Ir>
              </li>
            ))}
          </ul>
          <p className="grupo-pie">Total debe {eur(d.sumas.debe)} · total haber {eur(d.sumas.haber)}{d.sumas.debe === d.sumas.haber ? ': cuadra.' : '.'} Saldo = debe − haber (en negativo, saldo acreedor). Las cuentas de balance llevan su saldo de años anteriores; las de gastos e ingresos, solo el año (antes del cierre). Toca una para ver su mayor.</p>
        </section>
      )}

      {ver === 'mayor' && d.mayor && (
        <section className="bloque">
          <form className="cont-buscar" action="/contabilidad">
            <input type="hidden" name="anio" value={anio} /><input type="hidden" name="ver" value="mayor" />
            <input className="campo" name="cuenta" list="cuentas-mayor" inputMode="numeric" defaultValue={cuenta} placeholder="Cuenta (572, 430…)" aria-label="Cuenta" />
            <datalist id="cuentas-mayor">{d.sumas.filas.map((x) => <option key={x.cuenta} value={x.cuenta}>{x.nombre}</option>)}</datalist>
            <button className="boton sec">Ver</button>
          </form>
          <div className="cont-resumen">
            <div><span>Saldo inicial</span><strong>{eur(d.mayor.inicial)}</strong></div>
            <div><span>Movimientos</span><strong>{d.mayor.movs.length}</strong></div>
            <div><span>Saldo final</span><strong>{eur(d.mayor.final)}</strong></div>
          </div>
          <h2 className="grupo-t">{d.mayor.cuenta} · {d.mayor.nombre}</h2>
          <ul className="grupo-lista">
            {d.mayor.movs.slice(-300).reverse().map((m, i) => (
              <li key={i}><div className="fila">
                <span className="txt"><strong>{m.concepto}</strong><small>{fechaCorta(m.fecha)} · asiento {m.n}{m.cuenta !== d.mayor.cuenta ? ` · ${m.cuenta}` : ''}</small></span>
                <span className="imp-col"><span className={`imp${m.haber ? ' cont-haber' : ''}`}>{m.debe ? `+${eur(m.debe)}` : `−${eur(m.haber)}`}</span><small className="nota">{eur(m.saldo)}</small></span>
              </div></li>
            ))}
          </ul>
          {!d.mayor.movs.length && <div className="vacio"><p>Sin movimientos en {anio}</p></div>}
          <p className="grupo-pie">Libro mayor: cada apunte de la cuenta (y sus subcuentas), del más reciente al más antiguo, con el saldo después de cada uno (debe − haber){d.mayor.movs.length > 300 ? '. Se ven los 300 últimos; el Excel los tiene todos' : ''}.</p>
        </section>
      )}

      {ver === 'bienes' && (
        <section className="bloque">
          {d.libro.length ? <>
            <div className="cont-resumen">
              <div><span>Lo que costaron</span><strong>{eur(totalLibro('valor'))}</strong></div>
              <div><span>Amortización de {anio}</span><strong>{eur(totalLibro('anio'))}</strong></div>
              <div><span>Pendiente</span><strong>{eur(totalLibro('pendiente'))}</strong></div>
            </div>
            <ul className="grupo-lista">
              {d.libro.map((b) => (
                <li key={b.id}>
                  <Ir href={`/gastos/${encodeURIComponent(b.id)}`} className="fila">
                    <span className="txt">
                      <strong>{b.concepto}</strong>
                      <small>{fechaCorta(b.fecha)} · {b.tipo.nombre} · {b.libertad ? 'entero el año de compra (300 € o menos)' : `${b.coef} % al año, hasta el ${fechaCorta(b.fin)}`}</small>
                      <small>Costó {eur(b.valor)} · quedan {eur(b.pendiente)}</small>
                      <span className="cont-barra" aria-hidden><span style={{ width: `${Math.round((b.acumulada / b.valor) * 100)}%` }} /></span>
                    </span>
                    <span className="imp-col">
                      <span className="imp">{eur(b.anio)}</span>
                      <span className="estado-txt">en {anio}</span>
                    </span>
                  </Ir>
                </li>
              ))}
            </ul>
          </> : <div className="vacio"><p>Sin bienes de inversión</p><p>Cuando compres algo que vas a usar varios años (un ordenador, un equipo, un vehículo…), márcalo al apuntar el gasto como «bien de inversión».</p></div>}
          <p className="grupo-pie">Libro registro de bienes de inversión. Cada bien se amortiza por días desde la compra con el coeficiente máximo de la tabla oficial ({sociedad ? 'Ley del Impuesto sobre Sociedades' : 'estimación directa simplificada'}); lo que vale 300 € o menos, entero el año de compra. Cada trimestre va un asiento de amortización al diario; el IVA de la compra se deduce entero en el 303 (casillas 30 y 31).</p>
        </section>
      )}

      {ver === 'anuales' && !sociedad && (
        <section className="bloque">
          <div className="vacio"><p>Los autónomos no depositan cuentas anuales</p><p>El depósito en el Registro Mercantil es para las sociedades. Como autónomo, con el libro diario, los libros registro y el de bienes de inversión que ya lleva Netto cumples; descárgalos en Excel abajo.</p></div>
        </section>
      )}

      {ca && <>
        <section className="bloque">
          {!cerrado && <p className="cont-alerta">El ejercicio {anio} aún no ha terminado: esto es un borrador con lo apuntado hasta hoy. Las cuentas de {anio - 1} están en el año anterior (‹).</p>}
          <div className="cont-resumen">
            <div><span>Modelo</span><strong>{ca.modelo.nombre}</strong></div>
            <div><span>Total activo</span><strong>{eur(ca.tamano.activo)}</strong></div>
            <div><span>Cifra de negocios</span><strong>{eur(ca.tamano.cifra)}</strong></div>
          </div>
          <p className="grupo-pie">{ca.modelo.detalle} {ca.cuadra ? 'El balance cuadra.' : 'Ojo: el balance no cuadra; revisa los asientos manuales.'}</p>
          <div className="grupo-c">
            {[['Formular las cuentas (administradores)', ca.plazos.formular], ['Aprobarlas en junta de socios', ca.plazos.aprobar], ['Depositarlas en el Registro Mercantil', ca.plazos.depositar]].map(([t, f]) => (
              <div key={t} className="celda"><span className="txt">{t}<small>Hasta el {fechaCorta(f)}{h > f ? ' · plazo pasado' : ''}</small></span></div>
            ))}
          </div>
          <p className="grupo-pie">El depósito es de un mes desde la aprobación: la fecha es la máxima si la junta se celebra el último día.</p>
        </section>

        <section className="bloque">
          <h2 className="grupo-t">Balance de pymes a 31-12-{anio}</h2>
          <div className="tarjeta cont-tabla">
            <div className="cont-fila cont-cab"><span className="cont-n">Activo</span><span className="cont-cifras"><span>{anio}</span><small>{anio - 1}</small></span></div>
            {filasBalance(ESTRUCTURA_BALANCE.activo).map((n) => <FilaOf key={n.id} t={n.t} a={ca.bal[0].v[n.id]} b={ca.bal[1].v[n.id]} nivel={n.nivel} fuerte={n.nivel === 0} />)}
            <FilaOf t="TOTAL ACTIVO" a={ca.bal[0].activo} b={ca.bal[1].activo} fuerte />
          </div>
          <div className="tarjeta cont-tabla">
            <div className="cont-fila cont-cab"><span className="cont-n">Patrimonio neto y pasivo</span><span className="cont-cifras"><span>{anio}</span><small>{anio - 1}</small></span></div>
            {filasBalance(ESTRUCTURA_BALANCE.pasivo).map((n) => <FilaOf key={n.id} t={n.t} a={ca.bal[0].v[n.id]} b={ca.bal[1].v[n.id]} nivel={n.nivel} fuerte={n.nivel === 0} />)}
            <FilaOf t="TOTAL PATRIMONIO NETO Y PASIVO" a={ca.bal[0].pasivo} b={ca.bal[1].pasivo} fuerte />
          </div>
        </section>

        <section className="bloque">
          <h2 className="grupo-t">Pérdidas y ganancias de pymes de {anio}</h2>
          <div className="tarjeta cont-tabla">
            {LINEAS_PYG.flatMap((l) => [
              ...(l.id === 13 ? [<FilaOf key="A" t="A) Resultado de explotación" a={ca.pyg[0].A} b={ca.pyg[1].A} fuerte />] : []),
              ...(l.id === 18 ? [<FilaOf key="B" t="B) Resultado financiero" a={ca.pyg[0].B} b={ca.pyg[1].B} fuerte />, <FilaOf key="C" t="C) Resultado antes de impuestos" a={ca.pyg[0].C} b={ca.pyg[1].C} fuerte />] : []),
              ...(ca.pyg[0].v[l.id] || ca.pyg[1].v[l.id] ? [<FilaOf key={l.id} t={l.t} a={ca.pyg[0].v[l.id]} b={ca.pyg[1].v[l.id]} nivel={1} />] : []),
            ])}
            <FilaOf t="D) Resultado del ejercicio" a={ca.pyg[0].D} b={ca.pyg[1].D} fuerte />
          </div>
        </section>

        <section className="bloque">
          {escribe && <FormCuentasAnuales anio={anio} datos={ca.datos} memoria={ca.memoria} borrador={ca.borrador} secciones={SECCIONES} />}
          <a className="boton cont-excel" href={`/api/cuentas-anuales?anio=${anio}`} download>Descargar las cuentas anuales (PDF)</a>
          <p className="grupo-pie">El PDF lleva la portada, el balance y la cuenta de pérdidas y ganancias de pymes con {anio - 1} al lado, el estado de cambios en el patrimonio neto, la memoria, la hoja de formulación para que la firmen los administradores y el certificado de aprobación de la junta. Para depositarlas, el Registro pide sus modelos oficiales (los del Colegio de Registradores o la aplicación D2): copia estas cifras, que siguen los mismos epígrafes, o pásale el PDF a tu gestor.</p>
        </section>
      </>}

      <a className="boton sec cont-excel" href={`/api/contabilidad?anio=${anio}${p ? `&p=${p}` : ''}`} download>Descargar en Excel</a>
      <p className="grupo-pie arriba">Libro diario, mayor, sumas y saldos, pérdidas y ganancias, balance y bienes de inversión de {anio}, en una sola hoja de cálculo para tu gestor.</p>
    </main>
  );
}
