import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { r2, trimestre } from '@/lib/calculos';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import { calculoNomina, modelo111, nombreMes } from '@/lib/nominas';
import { FormEmpleado, GenerarMes } from '@/components/Nominas';
import Ir from '@/components/Ir';
import Volver from '@/components/Volver';
import SinBD from '@/components/SinBD';
import '../nominas.css';

export const dynamic = 'force-dynamic';

export default async function Nominas() {
  const u = await requerir('nominas');
  const [empleados, nominas] = await Promise.all([leer(u, 'empleados'), leer(u, 'nominas')]);
  if (!empleados) return <SinBD />;
  const h = hoy();
  const mes = h.slice(0, 7);
  const anio = Number(h.slice(0, 4));
  const activos = empleados.filter((e) => e.alta.slice(0, 7) <= mes && (!e.baja || e.baja.slice(0, 7) >= mes)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const antiguos = empleados.filter((e) => !activos.includes(e));
  const N = (nominas || []).sort((a, b) => b.mes.localeCompare(a.mes) || a.empleadoNombre.localeCompare(b.empleadoNombre));
  const delMes = N.filter((n) => n.mes === mes).map(calculoNomina);
  const faltan = activos.filter((e) => !N.some((n) => n.mes === mes && n.empleado === e.id)).length;
  const t = trimestre(h);
  const m111 = modelo111(N, anio, t);
  // Plazo del 111: del 1 al 20 del mes siguiente al trimestre (el 4T, hasta el 20 de enero).
  const plazo111 = t === 4 ? `20 de enero de ${anio + 1}` : `20 de ${['abril', 'julio', 'octubre'][t - 1]}`;
  const meses = [...new Set(N.map((n) => n.mes))].slice(0, 12);

  return (
    <main className="pagina">
      <Volver href="/ajustes">Ajustes</Volver>
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

      <p className="rotulo">Empleados</p>
      {activos.length > 0 && (
        <ul className="grupo-lista bloque">
          {activos.map((e) => (
            <li key={e.id}>
              <Ir href={`/nominas/empleado/${e.id}`} className="fila">
                <span className="txt"><strong>{e.nombre}</strong><small>{[e.puesto, `desde ${fechaCorta(e.alta)}`].filter(Boolean).join(' · ')}</small></span>
                <span className="imp">{eur(e.bruto)}<small>bruto/mes</small></span>
              </Ir>
            </li>
          ))}
        </ul>
      )}
      {!empleados.length && <p className="nota">Añade a tu equipo y Netto hará cada mes sus nóminas, las apuntará como gasto y te dirá cuánto ingresar en el modelo 111.</p>}
      <FormEmpleado hoy={h} />

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
