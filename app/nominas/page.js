import Vacio from '@/components/Vacio';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { r2, trimestre, limiteTrimestre } from '@/lib/calculos';
import { eur, fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import { historialNominas, equipoPorFecha } from '@/lib/historialNominas';
import { calculoNomina, modelo111, nombreMes } from '@/lib/nominas';
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

  return (
    <main className="pagina mk-look">
      <Volver href="/mas">Más</Volver>
      <header className="cabecera"><h1 className="titulo">Equipo y nóminas</h1></header>

      {activos.length > 0 && (
        <section className="tarjeta bloque nomina-mes">
          <p className="rotulo-claro">Nóminas de {nombreMes(mes)}</p>
          <div className="dos-valores">
            <div><small>Netos a pagar</small><p className="grande">{eur(r2(delMes.reduce((s, x) => s + x.neto, 0)))}</p></div>
            <div><small>Coste empresa</small><p className="grande">{eur(r2(delMes.reduce((s, x) => s + x.coste, 0)))}</p></div>
          </div>
          {faltan > 0
            ? <GenerarMes mes={mes} texto={delMes.length ? `Hacer las ${faltan} que faltan` : `Hacer las nóminas de ${nombreMes(mes).split(' ')[0]}`} />
            : <p className="nota">✓ {delMes.length === 1 ? 'Hecha la nómina' : `Hechas las ${delMes.length} nóminas`} de este mes. Se apuntan solas como gasto.</p>}
          {completas > 0 && <p className="nota"><a className="enlace-claro" href={`/api/nominas/red?mes=${mes}`} download>Datos para RED del mes (Excel)</a>: bases de cotización y conceptos de la Tabla 84 para la liquidación y el CRA. El envío por SILTRA lo hace quien tiene la autorización RED (tú o tu gestoría).</p>}
        </section>
      )}

      {m111.perceptores > 0 && (
        <section className="tarjeta bloque">
          <h3>Modelo 111 · {t}T {anio}</h3>
          <dl className="mes-detalle" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
            <dt>Perceptores</dt><dd>{m111.perceptores}</dd>
            <dt>Sueldos pagados</dt><dd>{eur(m111.percepciones)}</dd>
            <dt><strong>Retenciones a ingresar</strong></dt><dd><strong>{eur(m111.retenciones)}</strong></dd>
          </dl>
          <p className="nota">Hasta el {plazo111}. Si también pagas a profesionales con retención, súmala en el mismo modelo. Seguridad Social del trimestre: {eur(m111.seguros)} (se paga cada mes).</p>
        </section>
      )}

      <div className="grupo-c nomina-jornada">
        <Ir href="/jornada" className="celda ir">
          <span className="txt">Registro de jornada<small>Fichajes, horas del mes y Excel para la Inspección</small></span>
        </Ir>
      </div>

      <p className="rotulo">Empleados</p>
      {actuales.length > 0 && (
        <ul className="grupo-lista bloque">
          {[...actuales].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((e) => (
            <li key={e.id}>
              <Ir href={`/nominas/empleado/${e.id}`} className="fila">
                <span className="txt"><strong>{e.nombre}</strong><small>{[(jornada || []).some((f) => f.empleado === e.id && f.fecha.startsWith(mes)) && `${hhmm(resumenMes(jornada, e, mes, h).trabajados)} h este mes`, e.puesto, `desde ${fechaCorta(e.alta)}`, e.baja && e.baja > h && `Baja prevista el ${fechaCorta(e.baja)}`].filter(Boolean).join(' · ')}</small></span>
                <span className="imp">{eur(e.bruto)}<small>bruto/mes</small></span>
              </Ir>
            </li>
          ))}
        </ul>
      )}
      {!empleados.length && <Vacio icono="usuarios" titulo="Añade a tu equipo" accion={{ href: '#anadir-empleado', texto: 'Añadir empleado' }}>Fisquo hará cada mes sus nóminas, las apuntará como gasto y te dirá cuánto ingresar en el modelo 111.</Vacio>}
      <div id="anadir-empleado"><FormEmpleado hoy={h} /></div>

      {futuras.length > 0 && (
        <>
          <p className="rotulo">Próximas incorporaciones</p>
          <ul className="grupo-lista bloque">
            {futuras.map((e) => (
              <li key={e.id}><Ir href={`/nominas/empleado/${e.id}`} className="fila"><span className="txt"><strong>{e.nombre}</strong><small>Alta el {fechaCorta(e.alta)}{e.baja ? ` · Baja prevista el ${fechaCorta(e.baja)}` : ''}</small></span></Ir></li>
            ))}
          </ul>
        </>
      )}

      <h2>Historial de nóminas</h2>
      <form action="/nominas" method="get" className="bloque">
        <label htmlFor="anio-nominas">Año del historial</label>{' '}
        <select id="anio-nominas" name="anio" defaultValue={anioHistorial} key={anioHistorial} className="campo">
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>{' '}
        <button type="submit" className="boton sec">Ver año</button>
      </form>
      {!meses.length && <Vacio compacto tipo="resultados" icono="usuarios" titulo={`Sin nóminas en ${anioHistorial}`} />}
      {meses.map((m) => (
        <div key={m}>
          <p className="rotulo">{nombreMes(m)}</p>
          <ul className="grupo-lista bloque">
            {N.filter((n) => n.mes === m).map((n) => (
              <li key={n.id}>
                <Ir href={`/nominas/${n.id}`} className="fila">
                  <span className="txt"><strong>{n.empleadoNombre}</strong><small>Bruto {eur(n.bruto)} · IRPF {eur(calculoNomina(n).irpf)}</small></span>
                  <span className={`imp ${n.pagada ? '' : 'pend'}`}>{eur(calculoNomina(n).neto)}<small>{n.pagada ? 'Pagada' : 'Por pagar'}</small></span>
                </Ir>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {antiguos.length > 0 && (
        <>
          <p className="rotulo">Ya no están</p>
          <ul className="grupo-lista bloque">
            {antiguos.map((e) => (
              <li key={e.id}><Ir href={`/nominas/empleado/${e.id}`} className="fila"><span className="txt"><strong>{e.nombre}</strong><small>{e.baja ? `Baja el ${fechaCorta(e.baja)}` : `Alta el ${fechaCorta(e.alta)}`}</small></span></Ir></li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

export const metadata = { title: 'Equipo y nóminas' };
