import Termino from '@/components/Termino';
import Vacio from '@/components/Vacio';
import { requerir } from '@/lib/auth';
import { DETALLE, puede } from '@/lib/permisos';
import { clave, leer, leerUno, redis } from '@/lib/redis';
import { actividadesDe, fiscalDe } from '@/lib/empresa';
import { informe } from '@/lib/contabilidad';
import { CUENTAS } from '@/lib/asientos';
import { cuentasAnuales, ESTRUCTURA_BALANCE, LINEAS_PYG, SECCIONES } from '@/lib/cuentasAnuales';
import { librosRegistro } from '@/lib/librosRegistro';
import FormCuentasAnuales from '@/components/CuentasAnuales';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import Deslizable from '@/components/Deslizable';
import { Borrar } from '@/components/Acciones';
import { Apertura, AsientoPersonal, NuevoAsiento } from '@/components/Asiento';
import '@/app/modelos.css';
import { vistasContabilidad } from '@/lib/modulos';
import '@/app/contabilidad.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ORIGEN = { factura: (id) => `/facturas/${encodeURIComponent(id)}`, gasto: (id) => `/gastos/${encodeURIComponent(id)}`, nomina: (id) => `/nominas/${encodeURIComponent(id)}` };
const TIPO = { apertura: 'Apertura', manual: 'Manual', amortizacion: 'Amortización', impuesto: 'Impuestos', cierre: 'Cierre', regularizacion: 'Cierre', factura: 'Factura', gasto: 'Gasto', nomina: 'Nómina' };

// Una partida con su desglose plegado; las cifras del año anterior, al lado.
function Partida({ p, ant }) {
  const nombre = p.id === 'amortizacion' ? <Termino id="amortizacion">{p.nombre}</Termino> : p.nombre;
  const cifras = <span className="cont-cifras"><span>{eur(p.importe)}</span>{ant !== undefined && <small>{ant === null ? '—' : eur(ant)}</small>}</span>;
  if (!p.detalle.length) return <div className="cont-fila"><span className="cont-n">{nombre}</span>{cifras}</div>;
  return (
    <details className="cont-fila cont-det">
      <summary><span className="cont-n">{nombre}</span>{cifras}</summary>
      <dl>{p.detalle.map((d) => <div key={d.id}><dt>{d.nombre}</dt><dd>{eur(d.importe)}</dd></div>)}</dl>
    </details>
  );
}
const Total = ({ n, v, ant }) => <div className="cont-fila cont-total"><span className="cont-n">{n}</span><span className="cont-cifras"><span>{eur(v)}</span>{ant !== undefined && <small>{ant === null ? '—' : eur(ant)}</small>}</span></div>;
const imp = (v) => (v ? eur(v) : '');

export default async function Contabilidad({ searchParams }) {
  const u = await requerir(DETALLE);
  const [facturas, gastos, nominas, manuales, saldo, productos, ajustes, albaranes] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), leer(u, 'asientos'), redis?.get(clave(u, 'saldo')), leer(u, 'productos'), leer(u, 'stock'), leer(u, 'albaranes')]);
  if (!facturas) return <SinBD />;
  const sp = await searchParams;
  const h = hoy();
  const actual = Number(h.slice(0, 4));
  const anio = Number(sp.anio) || actual;
  const fiscal = fiscalDe(u);
  const sociedad = fiscal.tipo === 'sociedad';
  // Autónomos: solo lo que les pide la ley (libros registro y amortizaciones) y su cuenta de resultados (lib/modulos.js).
  const vistas = vistasContabilidad(fiscal);
  const ver = vistas.some(([v]) => v === sp.ver) ? sp.ver : vistas[0][0];
  const p = /^[1-4]$/.test(sp.p || '') ? sp.p : '';
  const cuenta = /^\d{1,9}$/.test(sp.cuenta || '') ? sp.cuenta : '572';
  const libros = ver === 'libros' && librosRegistro({ facturas, gastos, nominas: nominas || [], productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [], fiscal, actividades: actividadesDe(u), empresa: { nombre: u.emisor?.nombre || '', nif: u.emisor?.nif || '' } }, anio, h);
  const d = informe({ facturas, gastos, nominas: nominas || [], manuales: manuales || [], saldo, fiscal, pagos130: u.pagos130 || {}, pres303: u.pres303 || {}, pagos202: u.pagos202 || {}, cuotaIS: u.cuotaIS || {}, productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [] }, anio, p, h, { cuenta: ver === 'mayor' ? cuenta : '' });
  const mesPorDefecto = String(Number(d.fecha.slice(5, 7))).padStart(2, '0');
  const mes = /^(0[1-9]|1[0-2])$/.test(sp.mes || '') ? sp.mes : mesPorDefecto;
  const url = (c) => { const q = new URLSearchParams(Object.entries({ anio, ver, p, ...c }).filter(([, v]) => v)); return `/contabilidad?${q}`; };
  const A = d.actual, B = d.anterior;
  const ant = (id) => (B ? B.partidas.find((x) => x.id === id).importe : undefined);
  const antDe = (fn) => (B ? fn(B) : undefined);
  const visibles = (ids) => A.partidas.filter((x) => ids.includes(x.id) && (x.importe || ant(x.id) || x.id === 'cifra'));
  const totalLibro = (k) => d.libro.reduce((s, b) => s + b[k], 0);
  const escribe = puede(u, DETALLE);
  const ca = ver === 'anuales' && sociedad && cuentasAnuales({ asientos: d.asientos, gastos, nominas: nominas || [], empresa: u, anio, guardado: (await leerUno(u, 'cuentasAnuales', String(anio))) || {} });
  const cerrado = anio < actual;
  // Filas del balance oficial con importe en alguno de los dos años (las masas, siempre).
  const filasBalance = (nodos, nivel = 0) => nodos.flatMap((n) => ((ca.bal[0].v[n.id] || ca.bal[1].v[n.id] || nivel === 0) ? [{ ...n, nivel }, ...(n.hijos ? filasBalance(n.hijos, nivel + 1) : [])] : []));
  const FilaOf = ({ t, a, b, nivel = 0, fuerte }) => <div className={`cont-fila${fuerte ? ' cont-total' : ''}`} style={{ paddingLeft: nivel * 10 }}><span className="cont-n">{t}</span><span className="cont-cifras"><span>{eur(a)}</span><small>{eur(b)}</small></span></div>;

  return (
    <main className="pagina mk-look modelos contabilidad">
      <Volver href="/">Resumen</Volver>
      <header className="cabecera modelos-cab">
        <h1 className="titulo">{sociedad ? 'Contabilidad' : 'Libros registro'}</h1>
        <nav className="anios">
          <Ir href={url({ anio: anio - 1 })} tipo="cifras" aria-label="Año anterior">‹</Ir>
          <strong>{anio}</strong>
          {anio < actual ? <Ir href={url({ anio: anio + 1 })} tipo="cifras" aria-label="Año siguiente">›</Ir> : <span className="off">›</span>}
        </nav>
      </header>
      <Deslizable className="chips cont-vistas">
        {vistas.map(([v, n]) => <Ir key={v} href={url({ ver: v, p: '' })} tipo="fundido" className={v === ver ? 'activo' : ''}>{n}</Ir>)}
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
          {d.banco && Math.abs(d.banco.diferencia) >= 0.01 && <p className="cont-alerta">El banco de la contabilidad (cuenta 572) da {eur(d.banco.contable)} y en tu banco hay {eur(d.banco.real)}: faltan {eur(Math.abs(d.banco.diferencia))} por apuntar (préstamos, aportaciones, retiradas, cobros o pagos que no están en Fisquo). Apúntalos en el diario o revisa la apertura.</p>}
          <p className="grupo-pie">A {fechaCorta(d.bal.fecha)}, modelo abreviado. Sale de la suma de todos los <Termino id="asiento">asientos</Termino>, así que siempre cuadra. Toca cada masa para ver sus cuentas.</p>
        </section>
      )}

      {ver === 'diario' && (
        <section className="bloque">
          <Deslizable className="chips cont-meses">
            {MESES.map((n, i) => { const m = String(i + 1).padStart(2, '0'); return <Ir key={m} href={url({ mes: m })} tipo="fundido" className={m === mes ? 'activo' : ''}>{n}</Ir>; })}
          </Deslizable>
          {escribe && <div className="cont-acciones">
            <AsientoPersonal hoy={anio === actual ? h : `${anio}-12-31`} />
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
          {!d.diario.some((a) => a.fecha.slice(5, 7) === mes) && <Vacio icono="contabilidad" tipo="resultados" titulo="Sin asientos en este mes" accion={{ href: url({ mes: null, p: null }), texto: 'Ver el último mes' }}>Cada factura, gasto, nómina, cobro y pago genera el suyo.</Vacio>}
          <p className="grupo-pie">Libro diario de {anio}: {d.diario.length} <Termino id="asiento">asientos</Termino>. Fisquo los genera solos de tus facturas (y sus cobros), gastos (y sus pagos), nóminas, <Termino id="amortizacion">amortizaciones</Termino>, liquidaciones de IVA y retenciones de los trimestres marcados como presentados, y el cierre de cada año. Los apuntados a mano se pueden borrar.</p>
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

      {ver === 'mayor' && (
        <section className="bloque">
          <form className="cont-buscar" action="/contabilidad">
            <input type="hidden" name="anio" value={anio} /><input type="hidden" name="ver" value="mayor" />
            <input id="cuenta-mayor" className="campo" name="cuenta" list="cuentas-mayor" inputMode="numeric" defaultValue={cuenta} placeholder="Cuenta (572, 430…)" aria-label="Cuenta" />
            <datalist id="cuentas-mayor">{d.sumas.filas.map((x) => <option key={x.cuenta} value={x.cuenta}>{x.nombre}</option>)}</datalist>
            <button type="submit" className="boton sec">Ver</button>
          </form>
          {d.mayor ? <>
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
          {!d.mayor.movs.length && <Vacio compacto tipo="resultados" icono="contabilidad" titulo={`Sin movimientos en ${anio}`} accion={{ href: '#cuenta-mayor', texto: 'Ver otra cuenta' }} />}
          <p className="grupo-pie">Libro mayor: cada apunte de la cuenta (y sus subcuentas), del más reciente al más antiguo, con el saldo después de cada uno (debe − haber){d.mayor.movs.length > 300 ? '. Se ven los 300 últimos; el Excel los tiene todos' : ''}.</p>
          </> : <Vacio compacto icono="contabilidad" titulo="Esa cuenta no existe en el plan contable" accion={{ href: '#cuenta-mayor', texto: 'Elegir cuenta' }} />}
        </section>
      )}

      {ver === 'bienes' && (
        <section className="bloque">
          {d.libro.length ? <>
            <div className="cont-resumen">
              <div><span>Lo que costaron</span><strong>{eur(totalLibro('valor'))}</strong></div>
              <div><span><Termino id="amortizacion">Amortización</Termino> de {anio}</span><strong>{eur(totalLibro('anio'))}</strong></div>
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
          </> : <Vacio icono="datos" titulo="Registra una compra que usarás varios años" accion={{ href: '/gastos#apuntar-gasto', texto: 'Añadir gasto' }}>Marca «bien de inversión» al apuntar el gasto, por ejemplo, de un ordenador.</Vacio>}
          <p className="grupo-pie">Libro registro de bienes de inversión. Cada bien se amortiza por días desde la compra con el coeficiente máximo de la tabla oficial ({sociedad ? 'Ley del Impuesto sobre Sociedades' : 'estimación directa simplificada'}); lo que vale 300 € o menos, entero el año de compra. Cada trimestre va un <Termino id="asiento">asiento</Termino> de amortización al diario; el IVA de la compra se deduce entero en el 303 (casillas 30 y 31).</p>
        </section>
      )}

      {libros && (
        <section className="bloque">
          <div className="cont-resumen">
            <div><span>Ingresos</span><strong>{eur(libros.totales.ingresos)}</strong></div>
            <div><span>Gastos deducibles</span><strong>{eur(libros.totales.gastos)}</strong></div>
            <div><span>Rendimiento</span><strong>{eur(libros.totales.ingresos - libros.totales.gastos)}</strong></div>
          </div>
          <div className="grupo-c">
            {[[sociedad ? 'Facturas expedidas' : 'Facturas expedidas y ventas e ingresos', libros.resumen.ingresos, `IVA repercutido ${eur(libros.totales.ivaRepercutido)}${libros.totales.retenciones ? ` · retenciones ${eur(libros.totales.retenciones)}` : ''}`],
              [sociedad ? 'Facturas recibidas' : 'Facturas recibidas y compras y gastos', libros.resumen.gastos, `IVA soportado ${eur(libros.totales.ivaSoportado)}${libros.totales.amortizacion ? ` · amortizaciones ${eur(libros.totales.amortizacion)}` : ''}`],
              ['Bienes de inversión', libros.resumen.bienes, 'Con lo amortizado al inicio, en el año y lo pendiente']].map(([t, n, s]) => (
              <div key={t} className="celda"><span className="txt">{t}<small>{n} {n === 1 ? 'anotación' : 'anotaciones'} · {s}</small></span></div>
            ))}
          </div>
          {libros.sinIae && <p className="cont-alerta">Falta el epígrafe del IAE de alguna actividad: ponlo en Ajustes › Actividades y modelos para que salga en los libros.</p>}
          <a className="boton cont-excel" href={`/api/libros?anio=${anio}`} download>Descargar los libros registro de {anio}</a>
          <p className="grupo-pie">{sociedad
            ? 'Libros registro del IVA con el formato electrónico de la AEAT (un Excel por libro, con el nombre que pide Hacienda). Como sociedad, además llevas la contabilidad completa: la tienes en las demás pestañas.'
            : 'Es lo que te pide la ley si estás en estimación directa: los libros registro del IVA y del IRPF, unificados y con el formato electrónico de la AEAT (un Excel por libro, con el nombre que pide Hacienda). Sirven para un requerimiento y se pueden importar en el Pre303. En Resultados ves tu beneficio real del año, que te puede pedir el banco.'}</p>
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
      <p className="grupo-pie">Libro diario de {anio} para importar en el programa de tu gestoría: <a href={`/api/exportar/contable?formato=a3&anio=${anio}`} download>A3</a> · <a href={`/api/exportar/contable?formato=contaplus&anio=${anio}`} download>ContaPlus</a> · <a href={`/api/exportar/contable?formato=contasol&anio=${anio}`} download>Contasol</a></p>
    </main>
  );
}

export const metadata = { title: 'Contabilidad' };
