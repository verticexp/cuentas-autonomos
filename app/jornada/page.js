import Vacio from '@/components/Vacio';
import { textos, idiomaActual } from '@/lib/idiomaServidor';
import { mesEnIdioma } from '@/lib/textos/mes';
import { redirect } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { inicioDe, puede } from '@/lib/permisos';
import { abiertoDe, ahoraMadrid, estadoDe, hhmm, horaDe, minutos, resumenMes } from '@/lib/jornada';
import { miEmpleado } from '@/lib/jornadaServidor';
import { fechaTexto } from '@/lib/formato';
import { EditarJornada, Fichar, NuevaJornada } from '@/components/Jornada';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import '@/app/nominas.css';
import '@/app/jornada.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';
const masMes = (mes, n) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

export default async function RegistroJornada({ searchParams }) {
  const u = await requerir();
  const tr = await textos();
  const idioma = await idiomaActual();
  const ahora = ahoraMadrid();
  const hoy = ahora.slice(0, 10);
  const gestor = puede(u, 'nominas');
  const { empleados, yo } = await miEmpleado(u, hoy);
  if (!gestor && !yo) redirect(inicioDe(u));
  const q = await searchParams;
  const mesHoy = hoy.slice(0, 7);
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes || '') && q.mes <= mesHoy ? q.mes : mesHoy;
  const persona = gestor && typeof q.persona === 'string' && empleados.some((e) => e.id === q.persona) ? q.persona : null;
  const filtroPersona = persona ? `&persona=${encodeURIComponent(persona)}` : '';
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
  const fichajes = persona ? delMes.filter((f) => f.empleado === persona) : delMes;
  const dias = [...new Set(fichajes.map((f) => f.fecha))].sort((a, b) => b.localeCompare(a));
  const plegar = gestor && !persona && dias.length > 7;

  const verDias = (fechas) => fechas.map((d) => (
    <section key={d} className="grupo">
      <h2 className="grupo-t">{tr(fechaTexto(d))}</h2>
      <ul className="grupo-lista jor-dia">
        {fichajes.filter((f) => f.fecha === d).map((f) => {
          const m = minutos(f);
          return (
            <li key={f.id}>
              <div className="fila">
                <span className="txt">
                  {gestor && !persona && <strong>{porId[f.empleado]?.nombre || tr('Empleado borrado')}</strong>}
                  <span className="jor-horas">{horaDe(f.entrada)} – {f.salida ? horaDe(f.salida) : <em>{tr('sin salida')}</em>}</span>
                  {(f.pausas?.length > 0 || f.cambios?.length > 0 || f.manual) && (
                    <small>
                      {f.pausas?.length > 0 && tr('Pausas {pausas}', { pausas: f.pausas.map((p) => `${horaDe(p.inicio)}–${p.fin ? horaDe(p.fin) : '…'}`).join(', ') })}
                      {(f.cambios?.length > 0 || f.manual) && <span className="jor-corregida">{f.cambios?.length ? tr('Corregida: {motivo}', { motivo: f.cambios.at(-1).motivo }) : tr('A mano: {motivo}', { motivo: f.manual })}</span>}
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
  ));

  return (
    <main className="pagina mk-look jornada">
      <Volver href={gestor ? '/nominas' : '/ajustes'}>{gestor ? 'Equipo y nóminas' : 'Ajustes'}</Volver>
      <h1 className="titulo">{tr('Registro de jornada')}</h1>

      {yo && <div id="fichar-jornada"><Fichar estado={estado} desde={desde} hoyMin={hoyMin + previo} ahora={ahora} /></div>}

      <nav className="jor-meses" aria-label={tr('Mes')}>
        <Ir href={`/jornada?mes=${masMes(mes, -1)}${filtroPersona}`} tipo="cifras" aria-label={tr('Mes anterior')}>‹</Ir>
        <strong>{mesEnIdioma(mes, idioma)}</strong>
        {mes < mesHoy ? <Ir href={`/jornada?mes=${masMes(mes, 1)}${filtroPersona}`} tipo="cifras" aria-label={tr('Mes siguiente')}>›</Ir> : <span className="off">›</span>}
      </nav>

      <section className="grupo">
        <ul className="grupo-lista jor-resumen">
          {quienes.map((e) => {
            const r = resumenMes(visibles, e, mes, hasta);
            const contenido = (
              <>
                <span className="txt"><strong>{e.nombre}</strong><small>{r.dias === 1 ? tr('1 día') : tr('{n} días', { n: r.dias })} · {tr(mes === mesHoy ? 'su jornada {horas} h hasta hoy' : 'su jornada {horas} h', { horas: hhmm(r.teoricos) })}{r.abiertos ? ` · ${tr('fichaje abierto')}` : ''}</small></span>
                <span className="imp">{hhmm(r.trabajados)} h<small className={r.diferencia > 0 ? 'jor-extra' : ''}>{r.diferencia > 0 ? tr('+{horas} h extra', { horas: hhmm(r.diferencia) }) : r.diferencia < 0 ? tr('faltan {horas} h', { horas: hhmm(-r.diferencia) }) : tr('justas')}</small></span>
              </>
            );
            return (
              <li key={e.id} className={gestor ? undefined : 'fila'}>
                {gestor ? <Ir href={`/jornada?mes=${mes}${persona === e.id ? '' : `&persona=${encodeURIComponent(e.id)}`}`} className={`fila${persona === e.id ? ' activa' : ''}`} aria-current={persona === e.id ? 'true' : undefined}>{contenido}</Ir> : contenido}
              </li>
            );
          })}
          {!quienes.length && <li><Vacio compacto icono="usuarios" titulo={tr('Añade a tu equipo')} accion={{ href: '/nominas#anadir-empleado', texto: tr('Ir a Equipo y nóminas') }} /></li>}
        </ul>
        <a className="boton sec ancho jor-exportar" href={`/api/jornada/exportar?mes=${mes}`}>{tr('Descargar el registro (Excel)')}</a>
        <p className="grupo-pie">{tr('Listo para la Inspección de Trabajo: cada jornada con entrada, salida, pausas y correcciones. Se guarda 4 años.')}</p>
      </section>

      {gestor && empleados.length > 0 && <div id="anadir-jornada"><NuevaJornada empleados={empleados.filter((e) => !e.baja || e.baja >= `${mes}-01`)} hoy={mes === mesHoy ? hoy : `${mes}-01`} /></div>}

      {persona && <Ir href={`/jornada?mes=${mes}`} className="jor-todos">{tr('Ver todo el equipo')}</Ir>}
      {verDias(plegar ? dias.slice(0, 7) : dias)}
      {plegar && (
        <details className="jor-anteriores plegable">
          <summary>{tr('Ver los {n} días anteriores', { n: dias.length - 7 })}</summary>
          {verDias(dias.slice(7))}
        </details>
      )}
      {!dias.length && <Vacio icono="plazo" titulo={yo ? tr('Registra tu jornada') : tr('Apunta la jornada de tu equipo')} accion={{ href: yo ? '#fichar-jornada' : empleados.length ? '#anadir-jornada' : '/nominas#anadir-empleado', texto: yo ? tr('Ir al fichaje') : empleados.length ? tr('Añadir jornada') : tr('Ir a Equipo y nóminas') }} secundaria={mes !== mesHoy && { href: '/jornada', texto: tr('Ver este mes') }}>{yo ? tr('Ficha la entrada al empezar y la salida al acabar.') : tr('Añade su email en Nóminas para que cada persona pueda fichar.')}</Vacio>}
    </main>
  );
}

export async function generateMetadata() {
  return { title: (await textos())('Registro de jornada') };
}
