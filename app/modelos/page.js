import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { actividadesDe, fiscalDe, modelosDe, usa130, usa303 } from '@/lib/empresa';
import { casillas303, minoracion130, r2, resumenAnual } from '@/lib/calculos';
import Rend130 from '@/components/Rend130';
import { modelo111 } from '@/lib/nominas';
import { borradorRenta, modelo115, modelo180, modelo190, modelo202, modelo347, modelo349, modelo390, retencionesProfesionales, MINIMO_PERSONAL, RET_ALQUILER } from '@/lib/modelos';
import CuotaIS from '@/components/CuotaIS';
import { eur, hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import '@/app/modelos.css';

export const dynamic = 'force-dynamic';
const T = [1, 2, 3, 4];
const MES = ['abril', 'julio', 'octubre'];
// Hasta cuándo se presenta cada trimestre: el 4T, en enero (303, 130 y 349 hasta el 30; las retenciones, 111 y 115, hasta el 20).
const plazo = (t, anio, dia = 30) => (t === 4 ? `${dia} de enero de ${anio + 1}` : `20 de ${MES[t - 1]}`);

const Casillas = ({ filas }) => <dl>{filas.filter(Boolean).map(([t, v, b]) => <div key={t} className={b ? 'fuerte' : ''}><dt>{t}</dt><dd>{typeof v === 'number' ? eur(v) : v}</dd></div>)}</dl>;

export default async function Modelos({ searchParams }) {
  const u = await requerir('resumen');
  const [facturas, gastos, nominas, empleados] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), leer(u, 'empleados')]);
  if (!facturas) return <SinBD />;
  const actual = Number(hoy().slice(0, 4));
  const anio = Number((await searchParams).anio) || actual;
  const f = fiscalDe(u);
  // Se enseña cada modelo si le toca por su situación fiscal o si ya hay datos que lo piden.
  const hay115 = f.alquiler || gastos.some((g) => g.alquiler);
  const hay349 = f.intracom || modelo349(facturas, anio, undefined, gastos).total > 0;
  const m390 = usa303(f) && modelo390(facturas, gastos, anio);
  const conRetencion = gastos.some((g) => Number(g.irpfPct) > 0);
  const m190 = (f.trabajadores || nominas?.length > 0 || conRetencion) && modelo190(nominas || [], empleados || [], anio, gastos);
  const renta = f.tipo === 'autonomo' && borradorRenta(facturas, gastos, anio, u.pagos130?.[anio], { ivaCoste: !usa303(f) });
  const m180 = hay115 && modelo180(gastos, anio);
  const m347 = modelo347(facturas, gastos, anio);
  const c303 = usa303(f);
  const ids = actividadesDe(u).map((a) => a.id);
  const rendAnterior = u.rend130?.[anio - 1];
  const r130 = usa130(f) && resumenAnual(facturas, gastos, anio, u.pagos130?.[anio] || {}, ids, { ivaCoste: !c303, minoracion: minoracion130(rendAnterior) });
  // Lo que Netto sabe del año anterior, como sugerencia (si ese año no está entero en Netto, no vale: lo confirma la persona).
  const conAnterior = usa130(f) && facturas.some((x) => x.fecha.startsWith(`${anio - 1}-`));
  const sugerido = conAnterior ? resumenAnual(facturas, gastos, anio - 1, {}, ids, { ivaCoste: !c303 }).trimestres[3].rendAcum : null;
  const hay111 = f.trabajadores || nominas?.length > 0 || conRetencion;

  return (
    <main className="pagina modelos">
      <Volver href="/">Resumen</Volver>
      <header className="cabecera modelos-cab">
        <h1 className="titulo">Impuestos</h1>
        <nav className="anios">
          <Ir href={`/modelos?anio=${anio - 1}`} tipo="cifras" aria-label="Año anterior">‹</Ir>
          <strong>{anio}</strong>
          {anio < actual ? <Ir href={`/modelos?anio=${anio + 1}`} tipo="cifras" aria-label="Año siguiente">›</Ir> : <span className="off">›</span>}
        </nav>
      </header>
      <p className="grupo-pie arriba">Calculados con lo que hay en Netto. Son orientativos: revísalos con tu gestor antes de presentarlos.</p>

      <section className="bloque" id="calendario">
        <h2 className="grupo-t">Qué presentas y cuándo</h2>
        <div className="grupo-c">
          {modelosDe(f).map((m) => <div key={m.id} className="celda"><span className="modelo-num">{m.num || m.id}</span><span className="txt">{m.nombre}<small>{m.cuando}</small></span></div>)}
        </div>
        <p className="grupo-pie">Según cómo trabajas ({f.tipo === 'sociedad' ? 'sociedad' : 'autónomo'}). Si algo no encaja, cámbialo en Ajustes › Actividades y modelos.</p>
      </section>

      {c303 && (
        <section className="bloque" id="m303">
          <h2 className="grupo-t">303 · IVA trimestral</h2>
          <p className="grupo-pie arriba">El IVA de tus facturas menos el de tus gastos. Si sale negativo, se compensa en los trimestres siguientes.</p>
          <div className="tarjetas">
            {T.map((t) => { const c = casillas303(facturas, gastos, anio, t); return (
              <div key={t} className="tarjeta"><h3>{t}T {anio}</h3>
                <Casillas filas={[
                  c['01'] && ['01 · Base al 4 %', c['01']], c['03'] && ['03 · Cuota al 4 %', c['03']],
                  c['04'] && ['04 · Base al 10 %', c['04']], c['06'] && ['06 · Cuota al 10 %', c['06']],
                  ['07 · Base al 21 %', c['07']], ['09 · Cuota al 21 %', c['09']],
                  c['10'] && ['10 · Compras a la UE: base', c['10']], c['11'] && ['11 · Compras a la UE: cuota', c['11']],
                  c['12'] && ['12 · Compras de fuera de la UE: base', c['12']], c['13'] && ['13 · Compras de fuera de la UE: cuota', c['13']],
                  ['27 · Total IVA devengado', c['27']], ['28 · Base del IVA soportado', c['28']], ['29 · IVA soportado', c['29']],
                  c['36'] && ['36 · Compras a la UE: base deducible', c['36']], c['37'] && ['37 · Compras a la UE: cuota deducible', c['37']],
                  c['59'] && ['59 · Empresas de otros países de la UE', c['59']],
                  [c['46'] < 0 ? '46 · A compensar' : '46 · Resultado', Math.abs(c['46']), true],
                ]} />
                <p className="nota">Hasta el {plazo(t, anio)}.</p>
              </div>
            ); })}
          </div>
        </section>
      )}

      {r130 && (
        <section className="bloque" id="m130">
          <h2 className="grupo-t">130 · Pago a cuenta del IRPF</h2>
          <p className="grupo-pie arriba">Acumulado desde enero: el 20 % de tu rendimiento, menos las retenciones de tus facturas y lo que ya pagaste en trimestres anteriores. Marca cada trimestre como presentado en el Resumen.</p>
          <Rend130 anio={anio - 1} valor={rendAnterior ?? null} sugerido={sugerido} minoracion={minoracion130(rendAnterior)} />
          <div className="tarjetas">
            {r130.trimestres.map((q) => (
              <div key={q.t} className="tarjeta"><h3>{q.t}T {anio}</h3>
                <Casillas filas={[
                  ['01 · Ingresos', q.ingAcum], ['02 · Gastos (con el 5 % de difícil justificación)', q.gasAcum], ['03 · Rendimiento neto', q.rendAcum],
                  ['04 · 20 % de la 03', r2(0.2 * Math.max(0, q.rendAcum))], ['05 · Pagado en trimestres anteriores', q.pagosPrev],
                  ['06 · Retenciones de tus facturas', q.retAcum], ['07 · Resultado', q.c07],
                  q.minoracion && ['13 · Minoración por el rendimiento de ' + (anio - 1), q.minoracion], q.negPrev && ['15 · Negativos de trimestres anteriores', q.negPrev],
                  ['19 · A ingresar', q.m130, true],
                ]} />
                <p className="nota">Hasta el {plazo(q.t, anio)}.{q.presentado ? ' Marcado como presentado.' : ''}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {hay111 && (
        <section className="bloque" id="m111">
          <h2 className="grupo-t">111 · Retenciones de trabajadores y profesionales</h2>
          <p className="grupo-pie arriba">Lo retenido en las nóminas del trimestre y en las facturas de profesionales (los gastos con retención, por ejemplo tu gestoría).</p>
          <div className="tarjetas">
            {T.map((t) => { const m = modelo111(nominas || [], anio, t); const p = retencionesProfesionales(gastos, anio, t); return (
              <div key={t} className="tarjeta"><h3>{t}T {anio}</h3>
                {m.perceptores || p.perceptores ? <Casillas filas={[
                  m.perceptores && ['01 · Trabajadores', String(m.perceptores)], m.perceptores && ['02 · Sueldos pagados', m.percepciones], m.perceptores && ['03 · Retenciones', m.retenciones],
                  p.perceptores && ['07 · Profesionales', String(p.perceptores)], p.perceptores && ['08 · Lo que les pagaste (base)', p.base], p.perceptores && ['09 · Retenciones', p.retenciones],
                  ['28 · A ingresar', r2(m.retenciones + p.retenciones), true],
                ]} /> : <p className="nota">Sin nóminas ni profesionales con retención este trimestre.</p>}
                <p className="nota">Hasta el {plazo(t, anio, 20)}.</p>
              </div>
            ); })}
          </div>
        </section>
      )}

      {f.tipo === 'sociedad' && (
        <section className="bloque" id="m202">
          <h2 className="grupo-t">202 · Pagos a cuenta del Impuesto sobre Sociedades</h2>
          <p className="grupo-pie arriba">El 18 % de la cuota del último Impuesto sobre Sociedades presentado (menos deducciones, bonificaciones y retenciones; sin restar los pagos a cuenta). Si salió a cero o es el primer año, no se presenta. Si facturas más de 6 millones, se calcula de otra forma: lo hace tu gestor.</p>
          <div className="tarjetas">
            <CuotaIS anio={anio - 2} valor={u.cuotaIS?.[anio - 2] ?? null} uso="el pago de abril" />
            <CuotaIS anio={anio - 1} valor={u.cuotaIS?.[anio - 1] ?? null} uso="los pagos de octubre y diciembre" />
          </div>
          <div className="tarjetas">
            {modelo202(u.cuotaIS, anio).map((x) => (
              <div key={x.p} className="tarjeta"><h3>{x.p}P {anio} · {x.mes}</h3>
                {x.cuota === null ? <p className="nota">Falta la cuota del Impuesto sobre Sociedades de {x.de}.</p>
                  : x.pago ? <Casillas filas={[[`Cuota de ${x.de}`, x.cuota], ['18 % · A ingresar', x.pago, true]]} />
                  : <p className="nota">La cuota de {x.de} fue cero: no se presenta.</p>}
                <p className="nota">Hasta el 20 de {x.mes}.</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {hay115 && (
        <section className="bloque" id="m115">
          <h2 className="grupo-t">115 · Retenciones del alquiler</h2>
          <p className="grupo-pie arriba">El {RET_ALQUILER} % de la renta (sin IVA) de los gastos marcados como alquiler del local.</p>
          <div className="tarjetas">
            {T.map((t) => { const m = modelo115(gastos, anio, t); return (
              <div key={t} className="tarjeta"><h3>{t}T {anio}</h3>{m.base ? <Casillas filas={[['01 · Perceptores', String(m.perceptores)], ['02 · Base de las retenciones', m.base], ['03 · Retenciones a ingresar', m.retenciones, true]]} /> : <p className="nota">Sin alquiler este trimestre.</p>}<p className="nota">Hasta el {plazo(t, anio, 20)}.</p></div>
            ); })}
          </div>
        </section>
      )}

      {hay349 && (
        <section className="bloque" id="m349">
          <h2 className="grupo-t">349 · Empresas de la UE</h2>
          <p className="grupo-pie arriba">Facturas a clientes con NIF-IVA de otro país de la UE (clave S, servicios prestados) y gastos de proveedores de la UE con su NIF-IVA (clave I, servicios recibidos; si son bienes, la clave es A). Solo se presenta el trimestre en que haya alguna.</p>
          <div className="tarjetas">
            {T.map((t) => { const m = modelo349(facturas, anio, t, gastos); return (
              <div key={t} className="tarjeta"><h3>{t}T {anio}</h3>
                {m.operadores.length ? <><Casillas filas={[...m.operadores.map((c) => [`${c.nif} · ${c.nombre} (${c.clave})`, c.base]), ['Total', m.total, true]]} /><p className="nota">Hasta el {plazo(t, anio)}.</p></> : <p className="nota">Sin operaciones: no se presenta.</p>}
              </div>
            ); })}
          </div>
        </section>
      )}

      {m390 && (
        <section className="bloque" id="m390">
          <h2 className="grupo-t">390 · Resumen anual del IVA</h2>
          <div className="tarjeta">
            <Casillas filas={[
              m390.base4 && ['Base al 4 %', m390.base4], m390.cuota4 && ['Cuota al 4 %', m390.cuota4],
              m390.base10 && ['Base al 10 %', m390.base10], m390.cuota10 && ['Cuota al 10 %', m390.cuota10],
              ['Base al 21 %', m390.base21], ['Cuota al 21 %', m390.cuota21],
              m390.baseUE && ['Compras a la UE (base)', m390.baseUE], m390.cuotaUE && ['Compras a la UE (cuota)', m390.cuotaUE],
              m390.baseFuera && ['Compras de fuera de la UE (base)', m390.baseFuera], m390.cuotaFuera && ['Compras de fuera de la UE (cuota)', m390.cuotaFuera],
              ['Total IVA devengado', m390.devengado, true],
              ['Base del IVA soportado', m390.baseDed], ['Total IVA deducible', m390.deducible, true],
              ['Resultado del año', m390.resultado, true],
              ...m390.trimestres.map((v, i) => [`303 del ${i + 1}T`, v]),
              m390.sinIva && ['Operaciones sin IVA', m390.sinIva], ['Volumen de operaciones', m390.volumen],
            ]} />
          </div>
        </section>
      )}

      <section className="bloque" id="m347">
        <h2 className="grupo-t">347 · Operaciones de más de 3.005,06 €</h2>
        <p className="grupo-pie arriba">Clientes y proveedores con los que pasas de 3.005,06 € en el año, IVA incluido. No entra lo que ya va en el 349, lo de fuera de la UE, lo que lleva retención (va en el 190 o el 180) ni los tickets sin proveedor. Se presenta en febrero de {anio + 1}.</p>
        {m347.ventas.length || m347.compras.length ? (
          <div className="tarjetas">
            {[['Clientes (clave B)', m347.ventas], ['Proveedores (clave A)', m347.compras]].filter(([, l]) => l.length).map(([t, l]) => (
              <div key={t} className="tarjeta"><h3>{t}</h3>
                <Casillas filas={l.map((o) => [`${o.nif ? `${o.nif} · ` : ''}${o.nombre} (${o.trimestres.map((x, i) => `${i + 1}T ${eur(x)}`).filter((_, i) => o.trimestres[i]).join(' · ')})`, o.total])} />
              </div>
            ))}
          </div>
        ) : <div className="tarjeta"><p className="nota">Nadie pasa de 3.005,06 € este año: no se presenta.</p></div>}
        {m347.sinNif.length > 0 && <p className="nota">Sin NIF: {m347.sinNif.map((o) => o.nombre).join(', ')}. Añádelo en sus facturas o gastos: sin él no se puede declarar.</p>}
      </section>

      {m180 && (
        <section className="bloque" id="m180">
          <h2 className="grupo-t">180 · Resumen anual del alquiler</h2>
          <div className="tarjeta">
            {m180.arrendadores.length ? <Casillas filas={[...m180.arrendadores.map((p) => [`${p.nif ? `${p.nif} · ` : ''}${p.nombre}`, `${eur(p.base)} · ret. ${eur(p.retenciones)}`]), ['Retenciones del año', m180.retenciones, true]]} /> : <p className="nota">Sin alquileres este año.</p>}
          </div>
        </section>
      )}

      {m190 && (
        <section className="bloque" id="m190">
          <h2 className="grupo-t">190 · Resumen anual de retenciones</h2>
          <div className="tarjeta">
            {m190.perceptores.length ? <Casillas filas={[...m190.perceptores.map((p) => [`${p.nif ? `${p.nif} · ` : ''}${p.nombre} (${p.clave})`, `${eur(p.percepciones)} · ret. ${eur(p.retenciones)}`]), ['Percepciones del año', m190.percepciones], ['Retenciones del año', m190.retenciones, true]]} /> : <p className="nota">Sin nóminas este año.</p>}
          </div>
        </section>
      )}

      {renta && (
        <section className="bloque" id="m100">
          <h2 className="grupo-t">Borrador de la renta {anio}</h2>
          <p className="grupo-pie arriba">Solo tu actividad (estimación directa simplificada). No incluye otros ingresos, deducciones ni tu situación familiar: tómalo como una idea de cuánto te saldrá.</p>
          <div className="tarjeta">
            <Casillas filas={[
              ['Ingresos de la actividad', renta.ingresos], ['Gastos deducibles', -renta.gastos], ['5 % gastos de difícil justificación', -renta.difJust],
              ['Rendimiento neto', renta.rendimiento, true],
              [`Cuota (escala general, mínimo personal de ${eur(MINIMO_PERSONAL)})`, renta.cuota],
              ['Retenciones de tus facturas', -renta.retenciones], ['Pagos del 130 marcados', -renta.pagos130],
              [renta.resultado >= 0 ? 'Saldría a pagar' : 'Saldría a devolver', Math.abs(renta.resultado), true],
            ]} />
            <p className="nota">Tipo medio: {String(renta.tipoMedio).replace('.', ',')} %.</p>
          </div>
        </section>
      )}
    </main>
  );
}
