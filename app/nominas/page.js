import Vacio from '@/components/Vacio';
import { textos, idiomaActual } from '@/lib/idiomaServidor';
import { conHuecos } from '@/lib/huecos';
import { mesEnIdioma } from '@/lib/textos/mes';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { r2, trimestre, limiteTrimestre } from '@/lib/calculos';
import { eur, fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import { historialNominas, equipoPorFecha } from '@/lib/historialNominas';
import { calculoNomina, modelo111 } from '@/lib/nominas';
import { FormEmpleado, GenerarMes } from '@/components/Nominas';
import Ir from '@/components/Ir';
import Volver from '@/components/Volver';
import SinBD from '@/components/SinBD';
import '../nominas.css';
import { hhmm, resumenMes } from '@/lib/jornada';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';

export default async function Nominas({ searchParams }) {
  const u = await requerir('nominas');
  const tr = await textos();
  const idioma = await idiomaActual();
  const [empleados, nominas, jornada] = await Promise.all([leer(u, 'empleados'), leer(u, 'nominas'), leer(u, 'jornada')]);
  if (!empleados) return <SinBD />;
  const h = hoy();
  const mes = h.slice(0, 7);
  const anio = Number(h.slice(0, 4));
  const activos = empleados.filter((e) => e.alta.slice(0, 7) <= mes && (!e.baja || e.baja.slice(0, 7) >= mes)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const { actuales, futuras, bajas: antiguos } = equipoPorFecha(empleados, h);
  const N = (nominas || []).sort((a, b) => b.mes.localeCompare(a.mes) || a.empleadoNombre.localeCompare(b.empleadoNombre));
  const delMes = N.filter((n) => n.mes === mes).map(calculoNomina);
  const faltan = activos.filter((e) => !N.some((n) => n.mes === mes && n.empleado === e.id)).length;
  const completas = N.filter((n) => n.mes === mes && n.detalle).length;
  const t = trimestre(h);
  const m111 = modelo111(N, anio, t);
  // El día 20 siguiente al trimestre, avanzando al próximo hábil cuando corresponda.
  const plazo111 = fechaTexto(limiteTrimestre(t, anio, 20));
  const { anios, anio: anioHistorial, meses } = historialNominas(N, anio, (await searchParams)?.anio);

  const indiceAnio = anios.indexOf(anioHistorial);
  const anterior = anios[indiceAnio + 1];
  const siguiente = anios[indiceAnio - 1];

  return (
    <main className="pagina mk-look">
      <Volver href="/mas">Más</Volver>
      <header className="cabecera"><h1 className="titulo">{tr('Equipo y nóminas')}</h1></header>

      {activos.length > 0 && (
        <section className="tarjeta bloque nomina-mes">
          <p className="rotulo-claro">{tr('Nóminas de {mes}', { mes: mesEnIdioma(mes, idioma) })}</p>
          {delMes.length ? <div className="dos-valores">
            <div><small>{tr('Netos a pagar')}</small><p className="grande">{eur(r2(delMes.reduce((s, x) => s + x.neto, 0)))}</p></div>
            <div><small>{tr('Coste empresa')}</small><p className="grande">{eur(r2(delMes.reduce((s, x) => s + x.coste, 0)))}</p></div>
          </div> : <p className="nota">{tr('Todavía no has hecho las de este mes.')}</p>}
          {faltan > 0
            ? <GenerarMes mes={mes} texto={delMes.length ? tr('Hacer las {n} que faltan', { n: faltan }) : tr('Hacer las nóminas de {mes}', { mes: mesEnIdioma(mes, idioma, true) })} />
            : <p className="nota">{delMes.length === 1 ? tr('✓ Hecha la nómina de este mes. Se apuntan solas como gasto.') : tr('✓ Hechas las {n} nóminas de este mes. Se apuntan solas como gasto.', { n: delMes.length })}</p>}
          {completas > 0 && <p className="nota">{conHuecos(tr('{enlace}: bases de cotización y conceptos de la Tabla 84 para la liquidación y el CRA. El envío por SILTRA lo hace quien tiene la autorización RED (tú o tu gestoría).'), { enlace: <a className="enlace-claro" href={`/api/nominas/red?mes=${mes}`} download>{tr('Datos para RED del mes (Excel)')}</a> })}</p>}
        </section>
      )}

      <section className="tarjeta bloque">
        <h2 className="tarjeta-titulo">{tr('Bases para la gestoría')}</h2>
        <form action="/api/nominas/bases" method="get" className="formulario">
          <label>{tr('Mes de las bases')}<input className="campo" type="month" name="mes" defaultValue={mes} required /></label>
          <button className="boton sec">{tr('Descargar bases del mes')}</button>
        </form>
        <p className="nota">{tr('CSV para que la gestoría prepare la liquidación en SILTRA / Sistema RED. Fisquo no envía nada a la Seguridad Social. Se incluyen el número de horas extra y su base en euros; los atrasos y las vacaciones del finiquito necesitan sus liquidaciones complementarias.')}</p>
      </section>

      {m111.perceptores > 0 && (
        <section className="tarjeta bloque">
          <h3>{tr('Modelo 111 · {trimestre}T {anio}', { trimestre: t, anio })}</h3>
          <dl className="mes-detalle" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
            <dt>{tr('Perceptores')}</dt><dd>{m111.perceptores}</dd>
            <dt>{tr('Sueldos pagados')}</dt><dd>{eur(m111.percepciones)}</dd>
            <dt><strong>{tr('Retenciones a ingresar')}</strong></dt><dd><strong>{eur(m111.retenciones)}</strong></dd>
          </dl>
          <p className="nota">{tr('Hasta el {plazo}. Si también pagas a profesionales con retención, súmala en el mismo modelo. Seguridad Social del trimestre: {importe} (se paga cada mes).', { plazo: tr(plazo111), importe: eur(m111.seguros) })}</p>
        </section>
      )}

      <div className="grupo-c nomina-jornada">
        <Ir href="/jornada" className="celda ir">
          <span className="txt">{tr('Registro de jornada')}<small>{tr('Fichajes, horas del mes y Excel para la Inspección')}</small></span>
        </Ir>
      </div>

      <p className="rotulo">{tr('Empleados')}</p>
      {actuales.length > 0 && (
        <ul className="grupo-lista bloque">
          {[...actuales].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((e) => (
            <li key={e.id}>
              <Ir href={`/nominas/empleado/${e.id}`} className="fila">
                <span className="txt"><strong>{e.nombre}</strong><small>{[(jornada || []).some((f) => f.empleado === e.id && f.fecha.startsWith(mes)) && tr('{horas} h este mes', { horas: hhmm(resumenMes(jornada, e, mes, h).trabajados) }), e.puesto, tr('desde {fecha}', { fecha: fechaCorta(e.alta) }), e.baja && e.baja > h && tr('Baja prevista el {fecha}', { fecha: fechaCorta(e.baja) })].filter(Boolean).join(' · ')}</small></span>
                <span className="imp">{eur(e.bruto)}<small>{tr('bruto/mes')}</small></span>
              </Ir>
            </li>
          ))}
        </ul>
      )}
      {!empleados.length && <Vacio icono="usuarios" titulo={tr('Añade a tu equipo')} accion={{ href: '#anadir-empleado', texto: tr('Añadir empleado') }}>{tr('Fisquo hará cada mes sus nóminas, las apuntará como gasto y te dirá cuánto ingresar en el modelo 111.')}</Vacio>}
      <div id="anadir-empleado"><FormEmpleado hoy={h} /></div>

      {futuras.length > 0 && (
        <>
          <p className="rotulo">{tr('Próximas incorporaciones')}</p>
          <ul className="grupo-lista bloque">
            {futuras.map((e) => (
              <li key={e.id}><Ir href={`/nominas/empleado/${e.id}`} className="fila"><span className="txt"><strong>{e.nombre}</strong><small>{tr('Alta el {fecha}', { fecha: fechaCorta(e.alta) })}{e.baja ? ` · ${tr('Baja prevista el {fecha}', { fecha: fechaCorta(e.baja) })}` : ''}</small></span></Ir></li>
            ))}
          </ul>
        </>
      )}

      {/* Junto al equipo, no al final de todo el historial de nóminas */}
      {antiguos.length > 0 && (
        <>
          <p className="rotulo">{tr('Ya no están')}</p>
          <ul className="grupo-lista bloque">
            {antiguos.map((e) => (
              <li key={e.id}><Ir href={`/nominas/empleado/${e.id}`} className="fila"><span className="txt"><strong>{e.nombre}</strong><small>{e.baja ? tr('Baja el {fecha}', { fecha: fechaCorta(e.baja) }) : tr('Alta el {fecha}', { fecha: fechaCorta(e.alta) })}</small></span></Ir></li>
            ))}
          </ul>
        </>
      )}

      <header className="cabecera modelos-cab nom-historial">
        <h2>{tr('Historial de nóminas')}</h2>
        <nav className="anios">
          {anterior ? <Ir href={`/nominas?anio=${anterior}`} tipo="cifras" aria-label={tr('Año anterior')}>‹</Ir> : <span className="off">‹</span>}
          <strong>{anioHistorial}</strong>
          {siguiente ? <Ir href={`/nominas?anio=${siguiente}`} tipo="cifras" aria-label={tr('Año siguiente')}>›</Ir> : <span className="off">›</span>}
        </nav>
      </header>
      {!meses.length && <Vacio compacto tipo="resultados" icono="usuarios" titulo={tr('Sin nóminas en {anio}', { anio: anioHistorial })} />}
      {meses.map((m) => (
        <div key={m}>
          <p className="rotulo">{mesEnIdioma(m, idioma).replace(/^./, (c) => c.toUpperCase())}</p>
          <ul className="grupo-lista bloque">
            {N.filter((n) => n.mes === m).map((n) => (
              <li key={n.id}>
                <Ir href={`/nominas/${n.id}`} className="fila">
                  <span className="txt"><strong>{n.empleadoNombre}</strong><small>{n.tipo === 'finiquito' ? `${tr('Finiquito')} · ` : ''}{tr('Bruto {bruto} · IRPF {irpf}', { bruto: eur(calculoNomina(n).totalDevengado ?? n.bruto), irpf: eur(calculoNomina(n).irpf) })}</small></span>
                  <span className={`imp ${n.pagada ? '' : 'pend'}`}>{eur(calculoNomina(n).neto)}<small>{n.pagada ? tr('Pagada') : tr('Por pagar')}</small></span>
                </Ir>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </main>
  );
}

export async function generateMetadata() {
  return { title: (await textos())('Equipo y nóminas') };
}
