import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { fiscalDe, usa303 } from '@/lib/empresa';
import { borradorRenta, modelo115, modelo180, modelo190, modelo349, modelo390, MINIMO_PERSONAL, RET_ALQUILER } from '@/lib/modelos';
import { eur, hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import '@/app/modelos.css';

export const dynamic = 'force-dynamic';
const T = [1, 2, 3, 4];

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
  const hay349 = f.intracom || modelo349(facturas, anio).total > 0;
  const m390 = usa303(f) && modelo390(facturas, gastos, anio);
  const m190 = (f.trabajadores || nominas?.length > 0) && modelo190(nominas || [], empleados || [], anio);
  const renta = f.tipo === 'autonomo' && borradorRenta(facturas, gastos, anio, u.pagos130?.[anio]);
  const m180 = hay115 && modelo180(gastos, anio);

  return (
    <main className="pagina modelos">
      <Volver href="/">Resumen</Volver>
      <header className="cabecera modelos-cab">
        <h1 className="titulo">Modelos</h1>
        <nav className="anios">
          <Ir href={`/modelos?anio=${anio - 1}`} tipo="cifras" aria-label="Año anterior">‹</Ir>
          <strong>{anio}</strong>
          {anio < actual ? <Ir href={`/modelos?anio=${anio + 1}`} tipo="cifras" aria-label="Año siguiente">›</Ir> : <span className="off">›</span>}
        </nav>
      </header>
      <p className="grupo-pie arriba">Calculados con lo que hay en Netto. Son orientativos: revísalos con tu gestor antes de presentarlos.</p>

      {hay115 && (
        <section className="bloque" id="m115">
          <h2 className="grupo-t">115 · Retenciones del alquiler</h2>
          <p className="grupo-pie arriba">El {RET_ALQUILER} % de la renta (sin IVA) de los gastos marcados como alquiler del local.</p>
          <div className="tarjetas">
            {T.map((t) => { const m = modelo115(gastos, anio, t); return (
              <div key={t} className="tarjeta"><h3>{t}T {anio}</h3>{m.base ? <Casillas filas={[['01 · Perceptores', String(m.perceptores)], ['02 · Base de las retenciones', m.base], ['03 · Retenciones a ingresar', m.retenciones, true]]} /> : <p className="nota">Sin alquiler este trimestre.</p>}</div>
            ); })}
          </div>
        </section>
      )}

      {hay349 && (
        <section className="bloque" id="m349">
          <h2 className="grupo-t">349 · Clientes de la UE</h2>
          <p className="grupo-pie arriba">Facturas a clientes con NIF-IVA de otro país de la UE (clave S, servicios). Solo se presenta el trimestre en que haya alguna.</p>
          <div className="tarjetas">
            {T.map((t) => { const m = modelo349(facturas, anio, t); return (
              <div key={t} className="tarjeta"><h3>{t}T {anio}</h3>
                {m.operadores.length ? <Casillas filas={[...m.operadores.map((c) => [`${c.nif} · ${c.nombre} (${c.clave})`, c.base]), ['Total', m.total, true]]} /> : <p className="nota">Sin operaciones: no se presenta.</p>}
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
              ['Base al 21 %', m390.base21], ['Cuota al 21 %', m390.cuota21], ['Total IVA devengado', m390.devengado, true],
              ['Base del IVA soportado', m390.baseDed], ['Total IVA deducible', m390.deducible, true],
              ['Resultado del año', m390.resultado, true],
              ...m390.trimestres.map((v, i) => [`303 del ${i + 1}T`, v]),
              m390.sinIva && ['Operaciones sin IVA', m390.sinIva], ['Volumen de operaciones', m390.volumen],
            ]} />
          </div>
        </section>
      )}

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
            {m190.perceptores.length ? <Casillas filas={[...m190.perceptores.map((p) => [`${p.nif ? `${p.nif} · ` : ''}${p.nombre}`, `${eur(p.percepciones)} · ret. ${eur(p.retenciones)}`]), ['Percepciones del año', m190.percepciones], ['Retenciones del año', m190.retenciones, true]]} /> : <p className="nota">Sin nóminas este año.</p>}
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
