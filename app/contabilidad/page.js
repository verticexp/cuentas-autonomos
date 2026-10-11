import { requerir } from '@/lib/auth';
import { clave, leer, redis } from '@/lib/redis';
import { actividadesDe, fiscalDe, nombresActividad } from '@/lib/empresa';
import { informe } from '@/lib/contabilidad';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import '@/app/modelos.css';
import '@/app/contabilidad.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';
const VISTAS = [['pyg', 'Resultados'], ['bienes', 'Amortizaciones'], ['balance', 'Balance']];

// Una partida con su desglose plegado; las cifras del año anterior, al lado.
function Partida({ p, ant }) {
  const cifras = <span className="cont-cifras"><span>{eur(p.importe)}</span>{ant !== undefined && <small>{ant === null ? '—' : eur(ant)}</small>}</span>;
  if (!p.detalle.length) return <div className="cont-fila"><span className="cont-n">{p.nombre}</span>{cifras}</div>;
  return (
    <details className="cont-fila cont-det">
      <summary><span className="cont-n">{p.nombre}</span>{cifras}</summary>
      <dl>{p.detalle.map((d) => <div key={d.id ?? d.nombre}><dt>{d.nombre}</dt><dd>{eur((p.signo ?? 1) * d.importe)}</dd></div>)}</dl>
    </details>
  );
}
const Total = ({ n, v, ant }) => <div className="cont-fila cont-total"><span className="cont-n">{n}</span><span className="cont-cifras"><span>{eur(v)}</span>{ant !== undefined && <small>{ant === null ? '—' : eur(ant)}</small>}</span></div>;

export default async function Contabilidad({ searchParams }) {
  const u = await requerir('resumen');
  const [facturas, gastos, nominas, saldo] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), redis?.get(clave(u, 'saldo'))]);
  if (!facturas) return <SinBD />;
  const sp = await searchParams;
  const h = hoy();
  const actual = Number(h.slice(0, 4));
  const anio = Number(sp.anio) || actual;
  const ver = VISTAS.some(([v]) => v === sp.ver) ? sp.ver : 'pyg';
  const p = /^[1-4]$/.test(sp.p || '') ? sp.p : '';
  const fiscal = fiscalDe(u);
  const d = informe({ facturas, gastos, nominas: nominas || [], saldo, fiscal, pagos202: u.pagos202 || {}, nombres: nombresActividad(actividadesDe(u)) }, anio, p, h);
  const url = (c) => { const q = new URLSearchParams(Object.entries({ anio, ver, p, ...c }).filter(([, v]) => v)); return `/contabilidad?${q}`; };
  const A = d.actual, B = d.anterior;
  const ant = (fn) => (B ? fn(B) : undefined);
  const totalLibro = (k) => d.libro.reduce((s, b) => s + b[k], 0);

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
      <nav className="segmentado">
        {VISTAS.map(([v, n]) => <Ir key={v} href={url({ ver: v })} tipo="fundido" className={v === ver ? 'activo' : ''}>{n}</Ir>)}
      </nav>

      {ver === 'pyg' && <>
        <nav className="chips cont-periodo">
          {['', '1', '2', '3', '4'].map((x) => <Ir key={x} href={url({ p: x })} tipo="fundido" className={x === p ? 'activo' : ''}>{x ? `${x}T` : 'Año'}</Ir>)}
        </nav>
        <section className="bloque">
          <div className="tarjeta cont-tabla">
            <div className="cont-fila cont-cab"><span className="cont-n">Cuenta de pérdidas y ganancias</span><span className="cont-cifras"><span>{d.nombre.actual}</span>{B && <small>{d.nombre.anterior}</small>}</span></div>
            {A.partidas.slice(0, 5).map((x, i) => <Partida key={x.id} p={x} ant={ant((b) => b.partidas[i].importe)} />)}
            <Total n="A.1) Resultado de explotación" v={A.explotacion} ant={ant((b) => b.explotacion)} />
            <Partida p={A.partidas[5]} ant={ant((b) => b.partidas[5].importe)} />
            <Total n="A.2) Resultado financiero" v={A.financiero} ant={ant((b) => b.financiero)} />
            <Total n="A.3) Resultado antes de impuestos" v={A.antes} ant={ant((b) => b.antes)} />
            {d.regimen === 'sociedad' && !p && <div className="cont-fila"><span className="cont-n">17. Impuesto sobre beneficios</span><span className="cont-cifras"><span>{eur(A.impuesto)}</span>{B && <small>{eur(B.impuesto)}</small>}</span></div>}
            <Total n="A.4) Resultado del ejercicio" v={A.resultado} ant={ant((b) => b.resultado)} />
          </div>
          <p className="grupo-pie">{B && d.parcial ? `${d.nombre.anterior}: hasta el ${fechaCorta(`${anio - 1}-${h.slice(5)}`)}, para comparar lo mismo. ` : ''}{A.partidas[0].importe ? `Margen antes de impuestos: ${A.margen.toLocaleString('es-ES')} %. ` : ''}Modelo abreviado del plan general contable de pymes, sin IVA. Los gastos van a su partida según su categoría (la eliges al apuntarlo o Netto la deduce del concepto). Los bienes de inversión no cuentan enteros: solo su amortización.{d.regimen === 'sociedad' ? ' El impuesto sale del borrador del Impuesto sobre Sociedades.' : ' Como autónomo, el IRPF no es gasto de la actividad: no aparece aquí.'}</p>
        </section>
      </>}

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
          <p className="grupo-pie">Libro registro de bienes de inversión. Cada bien se amortiza por días desde la compra con el coeficiente máximo de la tabla oficial ({d.regimen === 'sociedad' ? 'Ley del Impuesto sobre Sociedades' : 'estimación directa simplificada'}); lo que vale 300 € o menos, entero el año de compra. La amortización ya resta en {d.regimen === 'sociedad' ? 'el borrador del Impuesto sobre Sociedades' : 'el 130 y en el borrador de la renta'}; el IVA de la compra se deduce entero en el 303 (casillas 30 y 31).</p>
        </section>
      )}

      {ver === 'balance' && (
        <section className="bloque">
          <div className="tarjetas cont-balance">
            {[['Activo', d.bal.activo], ['Patrimonio neto y pasivo', d.bal.pasivo]].map(([t, lado]) => (
              <div key={t} className="tarjeta cont-tabla">
                <div className="cont-fila cont-cab"><span className="cont-n">{t}</span><span className="cont-cifras"><span>{eur(d.bal.total)}</span></span></div>
                {lado.map((x) => <Partida key={x.id} p={x} />)}
              </div>
            ))}
          </div>
          <p className="grupo-pie">A {fechaCorta(d.bal.fecha)}. Orientativo: Netto no lleva la contabilidad por partida doble, así que el capital, las reservas, los préstamos y lo que no esté apuntado salen juntos en «Fondos propios y otros», por diferencia.{d.bal.sinBanco ? ' Sin el saldo del banco, la tesorería cuenta como 0 €: conéctalo o apúntalo en Tesorería.' : ''} Clientes y proveedores, con IVA.</p>
        </section>
      )}

      <a className="boton sec cont-excel" href={`/api/contabilidad?anio=${anio}${p ? `&p=${p}` : ''}`} download>Descargar en Excel</a>
      <p className="grupo-pie arriba">Calculado con lo que hay en Netto. Revísalo con tu gestor antes de presentar las cuentas anuales.</p>
    </main>
  );
}
