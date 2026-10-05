import { redirect } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { inicioDe, puede } from '@/lib/permisos';
import { abiertoDe, ahoraMadrid, estadoDe, hhmm, horaDe, minutos, resumenMes } from '@/lib/jornada';
import { miEmpleado } from '@/lib/jornadaServidor';
import { nombreMes } from '@/lib/nominas';
import { fechaTexto } from '@/lib/formato';
import { EditarJornada, Fichar, NuevaJornada } from '@/components/Jornada';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import '@/app/nominas.css';
import '@/app/jornada.css';

export const dynamic = 'force-dynamic';
const masMes = (mes, n) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

export default async function RegistroJornada({ searchParams }) {
  const u = await requerir();
  const ahora = ahoraMadrid();
  const hoy = ahora.slice(0, 10);
  const gestor = puede(u, 'nominas');
  const { empleados, yo } = await miEmpleado(u, hoy);
  if (!gestor && !yo) redirect(inicioDe(u));
  const q = await searchParams;
  const mesHoy = hoy.slice(0, 7);
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes || '') && q.mes <= mesHoy ? q.mes : mesHoy;
  const todos = (await leer(u, 'jornada')) || [];
  const visibles = gestor ? todos : todos.filter((f) => f.empleado === yo.id);
  const delMes = visibles.filter((f) => f.fecha.startsWith(mes)).sort((a, b) => b.entrada.localeCompare(a.entrada));
  const porId = Object.fromEntries(empleados.map((e) => [e.id, e]));
  const abierto = yo && abiertoDe(todos, yo.id);
  const estado = estadoDe(abierto);
  const hoyMin = yo ? todos.filter((f) => f.empleado === yo.id && f.fecha === hoy && f.salida).reduce((s, f) => s + minutos(f), 0) : 0;
  const desde = estado === 'pausa' ? abierto.pausas.at(-1).inicio : estado === 'dentro' ? (abierto.pausas.at(-1)?.fin || abierto.entrada) : null;
  // Lo trabajado hoy en el tramo abierto antes de la última pausa.
  const previo = abierto ? (() => { let s = 0, ini = abierto.entrada; for (const p of abierto.pausas) { s += Math.round((Date.parse(`${p.inicio}:00Z`) - Date.parse(`${ini}:00Z`)) / 60000); ini = p.fin || p.inicio; } return s; })() : 0;
  const quienes = gestor ? empleados.filter((e) => (e.alta.slice(0, 7) <= mes && (!e.baja || e.baja.slice(0, 7) >= mes)) || delMes.some((f) => f.empleado === e.id)).sort((a, b) => a.nombre.localeCompare(b.nombre)) : [yo];
  const hasta = mes === mesHoy ? hoy : undefined;
  const dias = [...new Set(delMes.map((f) => f.fecha))];

  return (
    <main className="pagina jornada">
      <Volver href={gestor ? '/nominas' : '/ajustes'}>{gestor ? 'Nóminas' : 'Ajustes'}</Volver>
      <h1 className="titulo">Registro de jornada</h1>

      {yo && <Fichar estado={estado} desde={desde} hoyMin={hoyMin + previo} ahora={ahora} />}

      <nav className="jor-meses" aria-label="Mes">
        <Ir href={`/jornada?mes=${masMes(mes, -1)}`} tipo="cifras" aria-label="Mes anterior">‹</Ir>
        <strong>{nombreMes(mes)}</strong>
        {mes < mesHoy ? <Ir href={`/jornada?mes=${masMes(mes, 1)}`} tipo="cifras" aria-label="Mes siguiente">›</Ir> : <span className="off">›</span>}
      </nav>

      <section className="grupo">
        <ul className="grupo-lista jor-resumen">
          {quienes.map((e) => {
            const r = resumenMes(visibles, e, mes, hasta);
            return (
              <li key={e.id} className="fila">
                <span className="txt"><strong>{e.nombre}</strong><small>{r.dias === 1 ? '1 día' : `${r.dias} días`} · su jornada {hhmm(r.teoricos)} h{mes === mesHoy ? ' hasta hoy' : ''}{r.abiertos ? ' · fichaje abierto' : ''}</small></span>
                <span className="imp">{hhmm(r.trabajados)} h<small className={r.diferencia > 0 ? 'jor-extra' : ''}>{r.diferencia > 0 ? `+${hhmm(r.diferencia)} h extra` : r.diferencia < 0 ? `faltan ${hhmm(-r.diferencia)} h` : 'justas'}</small></span>
              </li>
            );
          })}
          {!quienes.length && <li className="fila"><span className="txt"><small>Aún no hay empleados. Añádelos en Nóminas.</small></span></li>}
        </ul>
        <a className="boton sec ancho jor-exportar" href={`/api/jornada/exportar?mes=${mes}`}>Descargar el registro (Excel)</a>
        <p className="grupo-pie">Listo para la Inspección de Trabajo: cada jornada con entrada, salida, pausas y correcciones. Se guarda 4 años.</p>
      </section>

      {gestor && empleados.length > 0 && <NuevaJornada empleados={empleados.filter((e) => !e.baja || e.baja >= `${mes}-01`)} hoy={mes === mesHoy ? hoy : `${mes}-01`} />}

      {dias.map((d) => (
        <section key={d} className="grupo">
          <h2 className="grupo-t">{fechaTexto(d)}</h2>
          <ul className="grupo-lista jor-dia">
            {delMes.filter((f) => f.fecha === d).map((f) => {
              const m = minutos(f);
              return (
                <li key={f.id}>
                  <div className="fila">
                    <span className="txt">
                      {gestor && <strong>{porId[f.empleado]?.nombre || 'Empleado borrado'}</strong>}
                      <span className="jor-horas">{horaDe(f.entrada)} – {f.salida ? horaDe(f.salida) : <em>sin salida</em>}</span>
                      {(f.pausas?.length > 0 || f.cambios?.length > 0 || f.manual) && (
                        <small>
                          {f.pausas?.length > 0 && `Pausas ${f.pausas.map((p) => `${horaDe(p.inicio)}–${p.fin ? horaDe(p.fin) : '…'}`).join(', ')}`}
                          {(f.cambios?.length > 0 || f.manual) && <span className="jor-corregida">{f.cambios?.length ? `Corregida: ${f.cambios.at(-1).motivo}` : `A mano: ${f.manual}`}</span>}
                        </small>
                      )}
                    </span>
                    <span className="imp">{m === null ? '—' : `${hhmm(m)} h`}</span>
                  </div>
                  {gestor && f.salida && <EditarJornada f={f} />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!dias.length && <div className="vacio"><p>Sin fichajes en {nombreMes(mes).split(' ')[0]}</p><p>{yo ? 'Ficha la entrada al empezar y la salida al acabar.' : 'Cada empleado ficha desde su cuenta de Netto (pon su email en su ficha), o apúntalo tú a mano.'}</p></div>}
    </main>
  );
}
