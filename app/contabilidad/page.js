import Termino from '@/components/Termino';
import { textos } from '@/lib/idiomaServidor';
import { conHuecos } from '@/lib/huecos';
import Vacio from '@/components/Vacio';
import { requerir } from '@/lib/auth';
import { DETALLE, puede } from '@/lib/permisos';
import { clave, leer, leerUno, redis } from '@/lib/redis';
import { actividadesDe, fiscalDe } from '@/lib/empresa';
import { informe } from '@/lib/contabilidad';
import { CUENTAS } from '@/lib/asientos';
import { cuentasAnuales, ESTRUCTURA_BALANCE, filasPygOficial, SECCIONES, TOTALES_BALANCE } from '@/lib/cuentasAnuales';
import { librosRegistro } from '@/lib/librosRegistro';
import CuadreBanco from '@/components/contabilidad/CuadreBanco';
import FormCuentasAnuales from '@/components/CuentasAnuales';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import ExportarDiario from '@/components/ExportarDiario';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import Deslizable from '@/components/Deslizable';
import { Borrar } from '@/components/Acciones';
import { Apertura, AsientoPersonal, NuevoAsiento } from '@/components/Asiento';
import '@/app/modelos.css';
import { vistasContabilidad } from '@/lib/modulos';
import '@/app/contabilidad.css';

import '@/app/mk.css';
import { gastosQueVe, nominasQueVe, veSueldos } from '@/lib/nominas';

export const dynamic = 'force-dynamic';
// «1T 2025» sale como «Q1 2025» en inglés; el año solo se queda.
const nombrePeriodo = (tr, s) => { const m = /^([1-4])T (\d{4})$/.exec(s || ''); return m ? `${tr('{trimestre}T', { trimestre: m[1] })} ${m[2]}` : s; };
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ORIGEN = { factura: (id) => `/facturas/${encodeURIComponent(id)}`, gasto: (id) => `/gastos/${encodeURIComponent(id)}`, nomina: (id) => `/nominas/${encodeURIComponent(id)}` };
const TIPO = { apertura: 'Apertura', manual: 'Manual', amortizacion: 'Amortización', impuesto: 'Impuestos', cierre: 'Cierre', regularizacion: 'Regularización', 'cierre-contable': 'Cierre contable', 'apertura-contable': 'Apertura contable', factura: 'Factura', gasto: 'Gasto', nomina: 'Nómina' };

// «572 · Bancos»: el número de la cuenta se queda y el nombre se traduce.
const nombreCta = (tr, s) => { const m = /^(\d+) · (.+)$/.exec(s); return m ? `${m[1]} · ${tr(m[2])}` : tr(s); };

// Una partida con su desglose plegado; las cifras del año anterior, al lado.
function Partida({ p, ant, tr }) {
  // Dentro de un <summary> no cabe otro botón: la definición solo va cuando la partida no se despliega.
  const nombre = p.id === 'amortizacion' && !p.detalle.length ? <Termino id="amortizacion">{tr(p.nombre)}</Termino> : tr(p.nombre);
  const cifras = <span className="cont-cifras"><span>{eur(p.importe)}</span>{ant !== undefined && <small>{ant === null ? '—' : eur(ant)}</small>}</span>;
  if (!p.detalle.length) return <div className="cont-fila"><span className="cont-n">{nombre}</span>{cifras}</div>;
  return (
    <details className="cont-fila cont-det">
      <summary><span className="cont-n">{nombre}</span>{cifras}</summary>
      <dl>{p.detalle.map((d) => <div key={d.id}><dt>{nombreCta(tr, d.nombre)}</dt><dd>{eur(d.importe)}</dd></div>)}</dl>
    </details>
  );
}
const Total = ({ n, v, ant }) => <div className="cont-fila cont-total"><span className="cont-n">{n}</span><span className="cont-cifras"><span>{eur(v)}</span>{ant !== undefined && <small>{ant === null ? '—' : eur(ant)}</small>}</span></div>;
const imp = (v) => (v ? eur(v) : '');

export default async function Contabilidad({ searchParams }) {
  const u = await requerir(DETALLE);
  const tr = await textos();
  const [facturas, gastosLeidos, nominasLeidas, manuales, saldo, productos, ajustes, albaranes] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), leer(u, 'asientos'), redis?.get(clave(u, 'saldo')), leer(u, 'productos'), leer(u, 'stock'), leer(u, 'albaranes')]);
  // Sin el permiso «Nóminas», las de cada persona van juntas por mes (lib/nominas.js, Codex H2).
  const gastos = gastosQueVe(u, gastosLeidos), nominas = nominasQueVe(u, nominasLeidas);
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
  // Los movimientos del banco, solo para el cuadre con la 572 (components/contabilidad/CuadreBanco.js): en las vistas que lo enseñan.
  const movimientos = sociedad && ['balance', 'diario', 'mayor'].includes(ver) ? await leer(u, 'banco') : [];
  const d = informe({ facturas, gastos, nominas: nominas || [], manuales: manuales || [], saldo, movimientos: movimientos || [], bancoConectado: Boolean(u.banco?.conectado), fiscal, pagos130: u.pagos130 || {}, pres303: u.pres303 || {}, pres369: u.pres369 || {}, pres123: u.pres123 || {}, pres111: u.pres111 || {}, pres115: u.pres115 || {}, pagadosHacienda: u.pagadosHacienda || {}, prorrata: u.prorrata || {}, capital: (await leer(u, 'capital')) || [], pagos202: u.pagos202 || {}, cuotaIS: u.cuotaIS || {}, binsPrevias: u.binsPrevias || {}, fondosPropios: u.fondosPropios || {}, productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [] }, anio, p, h, { cuenta: ver === 'mayor' ? cuenta : '' });
  const mesPorDefecto = String(Number(d.fecha.slice(5, 7))).padStart(2, '0');
  const mes = /^(0[1-9]|1[0-2])$/.test(sp.mes || '') ? sp.mes : mesPorDefecto;
  const url = (c) => { const q = new URLSearchParams(Object.entries({ anio, ver, p, ...c }).filter(([, v]) => v)); return `/contabilidad?${q}`; };
  const A = d.actual, B = d.anterior;
  const ant = (id) => (B ? B.partidas.find((x) => x.id === id).importe : undefined);
  const antDe = (fn) => (B ? fn(B) : undefined);
  const visibles = (ids) => A.partidas.filter((x) => ids.includes(x.id) && (x.importe || ant(x.id) || x.id === 'cifra'));
  const totalLibro = (k) => d.libro.reduce((s, b) => s + b[k], 0);
  const escribe = puede(u, 'contabilidad');
  // Sin ningún asiento (cuenta nueva) o sin asientos en el año que se mira: una explicación y lo que lo llena, no tablas a cero.
  const sinAsientos = !d.asientos.length, anioVacio = !d.diario.length;
  const vacioContable = (todo) => (
    <Vacio icono="contabilidad" titulo={sinAsientos ? tr('Aún no hay nada que contabilizar') : tr('Sin asientos en {anio}', { anio })}
      accion={puede(u, 'facturar') && { href: '/facturas/nueva', texto: tr('Nueva factura') }} secundaria={puede(u, 'gastar') && { href: '/gastos#apuntar-gasto', texto: tr('Añadir gasto') }}>
      {sinAsientos ? tr('La contabilidad se hace sola: cada factura, gasto, nómina, cobro y pago genera su asiento, y aquí verás {que}.', { que: tr(todo) }) : tr('Cuando haya facturas, gastos o nóminas de {anio}, aquí verás {que}. Cambia de año con las flechas de arriba.', { anio, que: tr(todo) })}
    </Vacio>
  );
  const ca = ver === 'anuales' && sociedad && cuentasAnuales({ asientos: d.asientos, gastos, nominas: nominas || [], empresa: u, anio, guardado: (await leerUno(u, 'cuentasAnuales', String(anio))) || {} });
  const cerrado = anio < actual;
  // Filas del balance oficial con importe en alguno de los dos años (las masas, siempre). Todas las casillas, también las
  // que valen cero, van en el CSV del modelo PYMES.
  const filasBalance = (nodos, nivel = 0) => nodos.flatMap((n) => ((ca.bal[0].v[n.id] || ca.bal[1].v[n.id] || nivel === 0) ? [{ ...n, nivel }, ...(n.hijos ? filasBalance(n.hijos, nivel + 1) : [])] : []));
  const FilaOf = ({ t, codigo, a, b, nivel = 0, fuerte }) => <div className={`cont-fila${fuerte ? ' cont-total' : ''}`} style={{ paddingLeft: nivel * 10 }}><span className="cont-n"><small className="cont-casilla">{codigo}</small>{tr(t)}</span><span className="cont-cifras"><span>{eur(a)}</span><small>{eur(b)}</small></span></div>;

  return (
    <main className="pagina mk-look modelos contabilidad">
      <Volver href="/">Resumen</Volver>
      <header className="cabecera modelos-cab">
        <h1 className="titulo">{sociedad ? tr('Contabilidad') : tr('Libros registro')}</h1>
        <nav className="anios">
          <Ir href={url({ anio: anio - 1 })} tipo="cifras" aria-label={tr('Año anterior')}>‹</Ir>
          <strong>{anio}</strong>
          {anio < actual ? <Ir href={url({ anio: anio + 1 })} tipo="cifras" aria-label={tr('Año siguiente')}>›</Ir> : <span className="off">›</span>}
        </nav>
      </header>
      <Deslizable className="chips cont-vistas">
        {vistas.map(([v, n]) => <Ir key={v} href={url({ ver: v, p: '' })} tipo="fundido" className={v === ver ? 'activo' : ''}>{tr(n)}</Ir>)}
      </Deslizable>

      {ver === 'pyg' && anioVacio && <section className="bloque">{vacioContable('tu cuenta de resultados')}</section>}
      {ver === 'pyg' && !anioVacio && <>
        <nav className="segmentado cont-periodo">
          {['', '1', '2', '3', '4'].map((x) => <Ir key={x} href={url({ p: x })} tipo="fundido" className={x === p ? 'activo' : ''}>{x ? tr('{trimestre}T', { trimestre: x }) : tr('Año')}</Ir>)}
        </nav>
        <section className="bloque">
          <div className="tarjeta cont-tabla">
            <div className="cont-fila cont-cab"><span className="cont-n">{tr('Cuenta de pérdidas y ganancias')}</span><span className="cont-cifras"><span>{nombrePeriodo(tr, d.nombre.actual)}</span>{B && <small>{nombrePeriodo(tr, d.nombre.anterior)}</small>}</span></div>
            {visibles(['cifra', 'otrosIngresos', 'aprovisionamientos', 'personal', 'explotacion', 'amortizacion', 'excepcionales']).map((x) => <Partida key={x.id} p={x} ant={ant(x.id)} tr={tr} />)}
            <Total n={tr('A) Resultado de explotación')} v={A.explotacion} ant={antDe((b) => b.explotacion)} />
            {visibles(['ingresosFin', 'financieros']).map((x) => <Partida key={x.id} p={x} ant={ant(x.id)} tr={tr} />)}
            <Total n={tr('B) Resultado financiero')} v={A.financiero} ant={antDe((b) => b.financiero)} />
            <Total n={tr('C) Resultado antes de impuestos')} v={A.antes} ant={antDe((b) => b.antes)} />
            {visibles(['impuesto']).map((x) => <Partida key={x.id} p={x} ant={ant(x.id)} tr={tr} />)}
            <Total n={tr('D) Resultado del ejercicio')} v={A.resultado} ant={antDe((b) => b.resultado)} />
          </div>
          <p className="grupo-pie">{[
            B && d.parcial ? tr('{periodo}: hasta el {fecha}, para comparar lo mismo.', { periodo: nombrePeriodo(tr, d.nombre.anterior), fecha: fechaCorta(`${anio - 1}-${h.slice(5)}`) }) : '',
            A.partidas[0].importe ? tr('Margen antes de impuestos: {margen} %.', { margen: A.margen.toLocaleString('es-ES') }) : '',
            tr('Modelo del plan general contable de pymes, sacado del libro diario. Toca cada partida para ver sus cuentas.'),
            sociedad ? tr('El Impuesto sobre Sociedades se contabiliza al cerrar el año.') : tr('Como autónomo, el IRPF no es gasto de la actividad: no aparece aquí.'),
          ].filter(Boolean).join(' ')}</p>
        </section>
      </>}

      {ver === 'balance' && sinAsientos && <section className="bloque">{vacioContable('el balance')}</section>}
      {ver === 'balance' && !sinAsientos && (
        <section className="bloque">
          <div className="tarjetas cont-balance">
            {[['Activo', d.bal.activo, d.bal.total], ['Patrimonio neto y pasivo', d.bal.pasivo, d.bal.totalPasivo]].map(([t, lado, total]) => (
              <div key={t} className="tarjeta cont-tabla">
                <div className="cont-fila cont-cab"><span className="cont-n">{tr(t)}</span><span className="cont-cifras"><span>{eur(total)}</span></span></div>
                {lado.map((x) => <Partida key={x.id} p={x} tr={tr} />)}
              </div>
            ))}
          </div>

          <p className="grupo-pie">{conHuecos(tr('A {fecha}, modelo abreviado. Sale de la suma de todos los {asientos}, así que siempre cuadra. Toca cada masa para ver sus cuentas.', { fecha: fechaCorta(d.bal.fecha) }), { asientos: <Termino id="asiento">{tr('asientos')}</Termino> })}</p>
        </section>
      )}

      {sociedad && ['balance', 'diario', 'mayor'].includes(ver) && <CuadreBanco datos={d.banco} />}

      {ver === 'diario' && (
        <section className="bloque">
          <Deslizable className="chips cont-meses">
            {MESES.map((n, i) => { const m = String(i + 1).padStart(2, '0'); return <Ir key={m} href={url({ mes: m })} tipo="fundido" className={m === mes ? 'activo' : ''}>{tr(n)}</Ir>; })}
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
                <span className="cont-n"><strong>{a.concepto}</strong><small>{fechaCorta(a.fecha)} · {tr(TIPO[a.origen?.tipo] || 'Automático', { contexto: 'asiento' })}</small></span>
                {a.origen && ORIGEN[a.origen.tipo] && (a.origen.tipo !== 'nomina' || veSueldos(u)) && <Ir href={ORIGEN[a.origen.tipo](a.origen.id)} className="cont-ver">{tr('Ver')}</Ir>}
                {escribe && a.origen && ['manual', 'apertura'].includes(a.origen.tipo) && <Borrar url={`/api/asientos?id=${encodeURIComponent(a.origen.id)}`} pregunta={tr('¿Borrar el asiento «{concepto}»?', { concepto: a.concepto })} />}
              </header>
              <table className="cont-lineas">
                <thead><tr><th>{tr('Cuenta')}</th><th>{tr('Debe')}</th><th>{tr('Haber')}</th></tr></thead>
                <tbody>{a.lineas.map((l, i) => (
                  <tr key={i}><td className={l.haber ? 'haber' : ''}><Ir href={url({ ver: 'mayor', cuenta: l.cuenta })} tipo="fundido">{l.cuenta}</Ir> {tr(CUENTAS[l.cuenta] || '')}</td><td>{imp(l.debe)}</td><td>{imp(l.haber)}</td></tr>
                ))}</tbody>
              </table>
            </article>
          ))}
          {anioVacio && <>{vacioContable('el libro diario')}</>}
          {!anioVacio && !d.diario.some((a) => a.fecha.slice(5, 7) === mes) && <Vacio icono="contabilidad" tipo="resultados" titulo={tr('Sin asientos en este mes')} accion={{ href: url({ mes: null, p: null }), texto: tr('Ver el último mes') }}>{tr('Cada factura, gasto, nómina, cobro y pago genera el suyo.')}</Vacio>}
          <p className="grupo-pie">{conHuecos(tr('Libro diario de {anio}: {n} {asientos}. Fisquo los genera solos de tus facturas (y sus cobros), gastos (y sus pagos), nóminas, {amortizaciones}, liquidaciones de IVA y retenciones de los trimestres marcados como presentados, y el cierre de cada año. Los apuntados a mano se pueden borrar.', { anio, n: d.diario.length }), { asientos: <Termino id="asiento">{tr('asientos')}</Termino>, amortizaciones: <Termino id="amortizacion">{tr('amortizaciones')}</Termino> })}</p>
        </section>
      )}

      {ver === 'sumas' && anioVacio && <section className="bloque">{vacioContable('las sumas y saldos de cada cuenta')}</section>}
      {ver === 'sumas' && !anioVacio && (
        <section className="bloque">
          <ul className="grupo-lista cont-sumas">
            {d.sumas.filas.map((x) => (
              <li key={x.cuenta}>
                <Ir href={url({ ver: 'mayor', cuenta: x.cuenta })} tipo="fundido" className="fila">
                  <span className="txt"><strong>{x.cuenta} · {tr(x.nombre)}</strong><small>{x.inicial ? tr('Inicial {inicial} · Debe {debe} · Haber {haber}', { inicial: eur(x.inicial), debe: eur(x.debe), haber: eur(x.haber) }) : tr('Debe {debe} · Haber {haber}', { debe: eur(x.debe), haber: eur(x.haber) })}</small></span>
                  <span className="imp">{eur(x.saldo)}</span>
                </Ir>
              </li>
            ))}
          </ul>
          <p className="grupo-pie">{d.sumas.debe === d.sumas.haber ? tr('Total debe {debe} · total haber {haber}: cuadra.', { debe: eur(d.sumas.debe), haber: eur(d.sumas.haber) }) : tr('Total debe {debe} · total haber {haber}.', { debe: eur(d.sumas.debe), haber: eur(d.sumas.haber) })} {tr('Saldo = debe − haber (en negativo, saldo acreedor). Las cuentas de balance llevan su saldo de años anteriores; las de gastos e ingresos, solo el año (antes del cierre). Toca una para ver su mayor.')}</p>
        </section>
      )}

      {ver === 'mayor' && (
        <section className="bloque">
          <form className="cont-buscar" action="/contabilidad">
            <input type="hidden" name="anio" value={anio} /><input type="hidden" name="ver" value="mayor" />
            <input id="cuenta-mayor" className="campo" name="cuenta" list="cuentas-mayor" inputMode="numeric" defaultValue={cuenta} placeholder={tr('Cuenta (572, 430…)')} aria-label={tr('Cuenta')} />
            <datalist id="cuentas-mayor">{d.sumas.filas.map((x) => <option key={x.cuenta} value={x.cuenta}>{tr(x.nombre)}</option>)}</datalist>
            <button type="submit" className="boton sec">{tr('Ver')}</button>
          </form>
          {d.mayor ? <>
          <div className="cont-resumen">
            <div><span>{tr('Saldo inicial')}</span><strong>{eur(d.mayor.inicial)}</strong></div>
            <div><span>{tr('Movimientos')}</span><strong>{d.mayor.movs.length}</strong></div>
            <div><span>{tr('Saldo final')}</span><strong>{eur(d.mayor.final)}</strong></div>
          </div>
          <h2 className="grupo-t">{d.mayor.cuenta} · {tr(d.mayor.nombre)}</h2>
          <ul className="grupo-lista">
            {d.mayor.movs.slice(-300).reverse().map((m, i) => (
              <li key={i}><div className="fila">
                <span className="txt"><strong>{m.concepto}</strong><small>{m.cuenta !== d.mayor.cuenta ? tr('{fecha} · asiento {n} · {cuenta}', { fecha: fechaCorta(m.fecha), n: m.n, cuenta: m.cuenta }) : tr('{fecha} · asiento {n}', { fecha: fechaCorta(m.fecha), n: m.n })}</small></span>
                <span className="imp-col"><span className={`imp${m.haber ? ' cont-haber' : ''}`}>{m.debe ? `+${eur(m.debe)}` : `−${eur(m.haber)}`}</span><small className="nota">{eur(m.saldo)}</small></span>
              </div></li>
            ))}
          </ul>
          {!d.mayor.movs.length && (sinAsientos ? vacioContable('el libro mayor de cada cuenta') : <Vacio compacto tipo="resultados" icono="contabilidad" titulo={tr('Sin movimientos en {anio}', { anio })} accion={{ href: '#cuenta-mayor', texto: tr('Ver otra cuenta') }} />)}
          <p className="grupo-pie">{d.mayor.movs.length > 300 ? tr('Libro mayor: cada apunte de la cuenta (y sus subcuentas), del más reciente al más antiguo, con el saldo después de cada uno (debe − haber). Se ven los 300 últimos; el Excel los tiene todos.') : tr('Libro mayor: cada apunte de la cuenta (y sus subcuentas), del más reciente al más antiguo, con el saldo después de cada uno (debe − haber).')}</p>
          </> : <Vacio compacto icono="contabilidad" titulo={tr('Esa cuenta no existe en el plan contable')} accion={{ href: '#cuenta-mayor', texto: tr('Elegir cuenta') }} />}
        </section>
      )}

      {ver === 'bienes' && (
        <section className="bloque">
          {d.libro.length ? <>
            <div className="cont-resumen">
              <div><span>{tr('Lo que costaron')}</span><strong>{eur(totalLibro('valor'))}</strong></div>
              <div><span>{conHuecos(tr('{amortizacion} de {anio}', { anio }), { amortizacion: <Termino id="amortizacion">{tr('Amortización')}</Termino> })}</span><strong>{eur(totalLibro('anio'))}</strong></div>
              <div><span>{tr('Pendiente')}</span><strong>{eur(totalLibro('pendiente'))}</strong></div>
            </div>
            <ul className="grupo-lista">
              {d.libro.map((b) => (
                <li key={b.id}>
                  <Ir href={`/gastos/${encodeURIComponent(b.id)}`} className="fila">
                    <span className="txt">
                      <strong>{b.concepto}</strong>
                      <small>{b.libertad ? tr('{fecha} · {tipo} · entero el año de compra (300 € o menos)', { fecha: fechaCorta(b.fecha), tipo: tr(b.tipo.nombre) }) : tr('{fecha} · {tipo} · {coef} % al año, hasta el {fin}', { fecha: fechaCorta(b.fecha), tipo: tr(b.tipo.nombre), coef: b.coef, fin: fechaCorta(b.fin) })}</small>
                      <small>{tr('Costó {valor} · quedan {pendiente}', { valor: eur(b.valor), pendiente: eur(b.pendiente) })}</small>
                      <span className="cont-barra" aria-hidden><span style={{ width: `${Math.round((b.acumulada / b.valor) * 100)}%` }} /></span>
                    </span>
                    <span className="imp-col">
                      <span className="imp">{eur(b.anio)}</span>
                      <span className="estado-txt">{tr('en {anio}', { anio })}</span>
                    </span>
                  </Ir>
                </li>
              ))}
            </ul>
          </> : <Vacio icono="datos" titulo={tr('Registra una compra que usarás varios años')} accion={{ href: '/gastos#apuntar-gasto', texto: tr('Añadir gasto') }}>{tr('Marca «bien de inversión» al apuntar el gasto, por ejemplo, de un ordenador.')}</Vacio>}
          <p className="grupo-pie">{conHuecos(tr('Libro registro de bienes de inversión. Cada bien se amortiza por días desde la compra con el coeficiente máximo de la tabla oficial ({regimen}); lo que vale 300 € o menos, entero el año de compra. Cada trimestre va un {asiento} de amortización al diario; el IVA de la compra se deduce entero en el 303 (casillas 30 y 31).', { regimen: sociedad ? tr('Ley del Impuesto sobre Sociedades') : tr('estimación directa simplificada') }), { asiento: <Termino id="asiento">{tr('asiento')}</Termino> })}</p>
        </section>
      )}

      {libros && (
        <section className="bloque">
          {!libros.resumen.ingresos && !libros.resumen.gastos && !libros.resumen.bienes ? (
            <Vacio icono="contabilidad" titulo={tr('Aún no hay nada que anotar en {anio}', { anio })} accion={puede(u, 'facturar') && { href: '/facturas/nueva', texto: tr('Nueva factura') }} secundaria={puede(u, 'gastar') && { href: '/gastos#apuntar-gasto', texto: tr('Añadir gasto') }}>
              {tr('Los libros registro se rellenan solos con cada factura emitida, cada gasto y cada bien de inversión que apuntes. Cuando los haya, aquí verás el resumen y podrás descargarlos con el formato de la AEAT.')}
            </Vacio>
          ) : <>
          <div className="cont-resumen">
            <div><span>{tr('Ingresos')}</span><strong>{eur(libros.totales.ingresos)}</strong></div>
            <div><span>{tr('Gastos deducibles')}</span><strong>{eur(libros.totales.gastos)}</strong></div>
            <div><span>{tr('Rendimiento')}</span><strong>{eur(libros.totales.ingresos - libros.totales.gastos)}</strong></div>
          </div>
          <div className="grupo-c">
            {[[sociedad ? 'Facturas expedidas' : 'Facturas expedidas y ventas e ingresos', libros.resumen.ingresos, libros.totales.retenciones ? tr('IVA repercutido {iva} · retenciones {retenciones}', { iva: eur(libros.totales.ivaRepercutido), retenciones: eur(libros.totales.retenciones) }) : tr('IVA repercutido {iva}', { iva: eur(libros.totales.ivaRepercutido) })],
              [sociedad ? 'Facturas recibidas' : 'Facturas recibidas y compras y gastos', libros.resumen.gastos, libros.totales.amortizacion ? tr('IVA soportado {iva} · amortizaciones {amortizaciones}', { iva: eur(libros.totales.ivaSoportado), amortizaciones: eur(libros.totales.amortizacion) }) : tr('IVA soportado {iva}', { iva: eur(libros.totales.ivaSoportado) })],
              ['Bienes de inversión', libros.resumen.bienes, tr('Con lo amortizado al inicio, en el año y lo pendiente')]].map(([t, n, s]) => (
              <div key={t} className="celda"><span className="txt">{tr(t)}<small>{n === 1 ? tr('{n} anotación · {detalle}', { n, detalle: s }) : tr('{n} anotaciones · {detalle}', { n, detalle: s })}</small></span></div>
            ))}
          </div>
          {libros.sinIae && <p className="cont-alerta">{tr('Falta el epígrafe del IAE de alguna actividad: ponlo en Ajustes › Actividades e impuestos para que salga en los libros.')}</p>}
          <a className="boton cont-excel" href={`/api/libros?anio=${anio}`} download>{tr('Descargar los libros registro de {anio}', { anio })}</a>
          </>}
          <p className="grupo-pie">{sociedad
            ? tr('Libros registro del IVA con el formato electrónico de la AEAT (un Excel por libro, con el nombre que pide Hacienda). Como sociedad, además llevas la contabilidad completa: la tienes en las demás pestañas.')
            : tr('Es lo que te pide la ley si estás en estimación directa: los libros registro del IVA y del IRPF, unificados y con el formato electrónico de la AEAT (un Excel por libro, con el nombre que pide Hacienda). Sirven para un requerimiento y se pueden importar en el Pre303. En Resultados ves tu beneficio real del año, que te puede pedir el banco.')}</p>
        </section>
      )}

      {ca && <>
        <section className="bloque">
          {!cerrado && <p className="cont-alerta">{tr('El ejercicio {anio} aún no ha terminado: esto es un borrador con lo apuntado hasta hoy. Las cuentas de {anterior} están en el año anterior (‹).', { anio, anterior: anio - 1 })}</p>}
          <div className="cont-resumen">
            <div><span>{tr('Modelo')}</span><strong>{tr(ca.modelo.nombre)}</strong></div>
            <div><span>{tr('Total activo')}</span><strong>{eur(ca.tamano.activo)}</strong></div>
            <div><span>{tr('Cifra de negocios')}</span><strong>{eur(ca.tamano.cifra)}</strong></div>
          </div>
          <p className="grupo-pie">{tr(ca.modelo.detalle)} {ca.cuadra ? tr('El balance cuadra.') : tr('Ojo: el balance no cuadra; revisa los asientos manuales.')}</p>
          <div className="grupo-c">
            {[['Formular las cuentas (administradores)', ca.plazos.formular], ['Aprobarlas en junta de socios', ca.plazos.aprobar], ['Depositarlas en el Registro Mercantil', ca.plazos.depositar]].map(([t, f]) => (
              <div key={t} className="celda"><span className="txt">{tr(t)}<small>{h > f ? tr('Hasta el {fecha} · plazo pasado', { fecha: fechaCorta(f) }) : tr('Hasta el {fecha}', { fecha: fechaCorta(f) })}</small></span></div>
            ))}
          </div>
          <p className="grupo-pie">{tr('El depósito es de un mes desde la aprobación: la fecha es la máxima si la junta se celebra el último día.')}</p>
        </section>

        {sinAsientos && <section className="bloque">{vacioContable('el balance y la cuenta de pérdidas y ganancias de las cuentas anuales')}</section>}
        {!sinAsientos && <section className="bloque">
          <h2 className="grupo-t">{tr('Balance de pymes al 31/12/{anio}', { anio })}</h2>
          <div className="tarjeta cont-tabla">
            <div className="cont-fila cont-cab"><span className="cont-n">{tr('Activo', { contexto: 'balance' })}</span><span className="cont-cifras"><span>{anio}</span><small>{anio - 1}</small></span></div>
            {filasBalance(ESTRUCTURA_BALANCE.activo).map((n) => <FilaOf key={n.id} codigo={n.codigo} t={n.t} a={ca.bal[0].v[n.id]} b={ca.bal[1].v[n.id]} nivel={n.nivel} fuerte={n.nivel === 0} />)}
            <FilaOf {...TOTALES_BALANCE[0]} a={ca.bal[0].activo} b={ca.bal[1].activo} fuerte />
          </div>
          <div className="tarjeta cont-tabla">
            <div className="cont-fila cont-cab"><span className="cont-n">{tr('Patrimonio neto y pasivo')}</span><span className="cont-cifras"><span>{anio}</span><small>{anio - 1}</small></span></div>
            {filasBalance(ESTRUCTURA_BALANCE.pasivo).map((n) => <FilaOf key={n.id} codigo={n.codigo} t={n.t} a={ca.bal[0].v[n.id]} b={ca.bal[1].v[n.id]} nivel={n.nivel} fuerte={n.nivel === 0} />)}
            <FilaOf {...TOTALES_BALANCE[1]} a={ca.bal[0].pasivo} b={ca.bal[1].pasivo} fuerte />
          </div>
        </section>}

        {!sinAsientos && <section className="bloque">
          <h2 className="grupo-t">{tr('Pérdidas y ganancias de pymes de {anio}', { anio })}</h2>
          <div className="tarjeta cont-tabla">
            <div className="cont-fila cont-cab"><span className="cont-n">{tr('Concepto y casilla')}</span><span className="cont-cifras"><span>{anio}</span><small>{anio - 1}</small></span></div>
            {filasPygOficial().filter((l) => !l.p || ca.pyg[0].v[l.id] || ca.pyg[1].v[l.id]).map((l) => <FilaOf key={l.id} codigo={l.codigo} t={l.t} a={l.p ? ca.pyg[0].v[l.id] : ca.pyg[0][l.id]} b={l.p ? ca.pyg[1].v[l.id] : ca.pyg[1][l.id]} nivel={String(l.id).includes('.') ? 2 : l.p ? 1 : 0} fuerte={!l.p} />)}
          </div>
        </section>}

        <section className="bloque">
          {escribe && <FormCuentasAnuales anio={anio} datos={ca.datos} memoria={ca.memoria} borrador={ca.borrador} secciones={SECCIONES} />}
          <a className="boton sec cont-excel" href={`/api/cuentas-anuales?anio=${anio}&formato=pymes`} download>{tr('Balance y PyG con las casillas del modelo PYMES (CSV)')}</a>
          <p className="grupo-pie">{tr('Para pasar las cifras al programa de depósito del Registro Mercantil (D2) o a la gestoría. Fisquo no deposita nada. Sin un vencimiento conocido, clientes y proveedores figuran a corto plazo.')}</p>
          <a className="boton cont-excel" href={`/api/cuentas-anuales?anio=${anio}`} download>{tr('Descargar las cuentas anuales (PDF)')}</a>
          <p className="grupo-pie">{tr('El PDF lleva la portada, el balance y la cuenta de pérdidas y ganancias de pymes con {anterior} al lado, el estado de cambios en el patrimonio neto, la memoria, la hoja de formulación para que la firmen los administradores y el certificado de aprobación de la junta. Para depositarlas, el Registro pide sus modelos oficiales (los del Colegio de Registradores o la aplicación D2): copia estas cifras, que siguen los mismos epígrafes, o pásale el PDF a tu gestor.', { anterior: anio - 1 })}</p>
        </section>
      </>}

      <a className="boton sec cont-excel" href={`/api/contabilidad?anio=${anio}${p ? `&p=${p}` : ''}`} download>{tr('Descargar en Excel')}</a>
      <p className="grupo-pie arriba">{tr('Libro diario, mayor, sumas y saldos, pérdidas y ganancias, balance y bienes de inversión de {anio}, en una sola hoja de cálculo para tu gestor.', { anio })}</p>
      <section className="bloque">
        <ExportarDiario base="/api/exportar/contable" anios={[anio]} />
        <p className="grupo-pie">{tr('Libro diario de {anio} para importar en el programa de tu gestoría (A3, ContaPlus o ContaSol). Pregúntale cuántos dígitos tienen sus subcuentas: el programa solo acepta los mismos.', { anio })}</p>
      </section>
    </main>
  );
}

// Un autónomo la ve como «Libros registro» (lib/modulos.js PARA_AUTONOMO): la pestaña dice lo mismo que la pantalla.
export async function generateMetadata() {
  const u = await requerir(DETALLE);
  const tr = await textos();
  return { title: vistasContabilidad(fiscalDe(u))[0][0] === 'libros' ? tr('Libros registro') : tr('Contabilidad') };
}
