'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { navegar, volverA } from '@/lib/transicion';
import { SS_EMPRESA, SS_TRABAJADOR, calculoNomina, nominaCompleta } from '@/lib/nominas';
import { leerImporte } from '@/lib/calculos';
import { Cotizacion, Modelo145, IncidenciasNomina } from './DatosNomina';
import { eur, hoy as hoyActual, pctCorto } from '@/lib/formato';

// Alta o edición de un empleado.
export function FormEmpleado({ empleado, hoy }) {
  const router = useRouter();
  const nuevo = !empleado;
  const mes = (hoy || hoyActual()).slice(0, 7);
  const [e, setE] = useState(empleado || { nombre: '', nif: '', puesto: '', alta: hoy, baja: '', bruto: '', irpfPct: 12, ssTrabajadorPct: SS_TRABAJADOR, ssEmpresaPct: SS_EMPRESA, email: '', horasSemana: 40, precioHoraExtra: '', cotizacion: { grupo: '', temporal: false, pagas: 2, prorrateadas: true, atPct: 1.5 } });
  const [abierto, setAbierto] = useState(!nuevo);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k, v) => setE({ ...e, [k]: v });
  // Nómina completa: con los datos de cotización, el cálculo de 2026 (y el IRPF del 145 si están); si no, los %.
  const bruto = leerImporte(e.bruto) || 0;
  const completa = e.cotizacion?.grupo && bruto > 0 ? nominaCompleta({ ...e, bruto, cotizacion: { ...e.cotizacion, grupo: Number(e.cotizacion.grupo), pagas: Number(e.cotizacion.pagas ?? 2), atPct: Number(String(e.cotizacion.atPct ?? 1.5).replace(',', '.')), prorrateadas: e.cotizacion.prorrateadas !== false } }, { bruto, mes }) : null;
  const c = completa && !completa.error ? calculoNomina(completa) : calculoNomina(e);

  async function enviar(ev) {
    ev.preventDefault();
    setEnviando(true); setError('');
    try {
      await llamar('/api/empleados', { method: nuevo ? 'POST' : 'PATCH', body: JSON.stringify(e) });
      if (nuevo) { setAbierto(false); setE({ ...e, nombre: '', nif: '', puesto: '', bruto: '', email: '' }); router.refresh(); }
      else if (e.baja && e.baja !== empleado.baja) { navegar(router, `/nominas/empleado/${e.id}/finiquito`); router.refresh(); }
      else volverA(router, '/nominas', 'atras', true);
    } catch (err) { setError(err.message); }
    setEnviando(false);
  }

  if (!abierto) return <button type="button" className="boton sec ancho" onClick={() => setAbierto(true)}>+ Añadir empleado</button>;
  return (
    <form className="formulario tarjeta" onSubmit={enviar}>
      {nuevo && <h3>Nuevo empleado</h3>}
      <label>Nombre y apellidos<input className="campo" placeholder="Nombre y apellidos" value={e.nombre} onChange={(x) => poner('nombre', x.target.value)} required /></label>
      <div className="dos-col">
        <label>DNI / NIE<input spellCheck={false} autoCorrect="off" autoCapitalize="characters" className="campo" placeholder="DNI / NIE" value={e.nif} onChange={(x) => poner('nif', x.target.value)} /></label>
        <label>Puesto<input className="campo" placeholder="Puesto" value={e.puesto} onChange={(x) => poner('puesto', x.target.value)} /></label>
      </div>
      <div className="dos-col">
        <label>Alta<input className="campo" type="date" value={e.alta} onChange={(x) => poner('alta', x.target.value)} required /></label>
        <label>Baja (si ya no está)<input className="campo" type="date" value={e.baja} onChange={(x) => poner('baja', x.target.value)} /></label>
      </div>
      <label>{e.cotizacion && e.cotizacion.prorrateadas === false ? 'Sueldo bruto al mes (sin las pagas extra)' : 'Sueldo bruto al mes (con pagas extra prorrateadas)'}<input className="campo" inputMode="decimal" placeholder="Ej. 1.800" value={e.bruto} onChange={(x) => poner('bruto', x.target.value)} required /></label>
      <label>Número de afiliación a la Seguridad Social (para RED)<input className="campo" inputMode="numeric" value={e.naf || ''} onChange={(x) => poner('naf', x.target.value)} placeholder="Opcional" /></label>
      <label>Código postal de su domicilio (para el modelo 190)<input className="campo" inputMode="numeric" autoComplete="off" maxLength={5} value={e.cp || ''} onChange={(x) => poner('cp', x.target.value.replace(/\D/g, ''))} placeholder="28013" /></label>
      <label className="check"><input type="checkbox" checked={Boolean(e.cotizacion)} onChange={(x) => poner('cotizacion', x.target.checked ? { grupo: '', temporal: false, pagas: 2, prorrateadas: true, atPct: 1.5 } : undefined)} /> Nómina completa: bases y cuotas de 2026 por su grupo de cotización</label>
      {e.cotizacion && <Cotizacion valor={e.cotizacion} cambiar={(v) => poner('cotizacion', v)} parcial={(Number(e.horasSemana) || 40) < 40} />}
      {e.cotizacion && <label className="check"><input type="checkbox" checked={Boolean(e.datos145)} onChange={(x) => poner('datos145', x.target.checked ? { situacionFamiliar: 3, nacimiento: '', discapacidad: 'no', contrato: 'general', descendientes: [], ascendientes: [] } : undefined)} /> IRPF automático con su modelo 145</label>}
      {e.cotizacion && e.datos145 && <Modelo145 valor={e.datos145} cambiar={(v) => poner('datos145', v)} />}
      <div className="tres-col">
        {!(e.cotizacion && e.datos145) && <label>IRPF %<input className="campo" inputMode="decimal" value={e.irpfPct} onChange={(x) => poner('irpfPct', x.target.value)} /></label>}
        {!e.cotizacion && <label>SS trabajador %<input className="campo" inputMode="decimal" value={e.ssTrabajadorPct} onChange={(x) => poner('ssTrabajadorPct', x.target.value)} /></label>}
        {!e.cotizacion && <label>SS empresa %<input className="campo" inputMode="decimal" value={e.ssEmpresaPct} onChange={(x) => poner('ssEmpresaPct', x.target.value)} /></label>}
      </div>
      {completa?.error && <p className="error" role="alert">{completa.error}</p>}
      {c.bruto > 0 && <p className="nota nomina-calculo">Cobra <strong>{eur(c.neto)}</strong> netos · a la empresa le cuesta <strong>{eur(c.coste)}</strong> al mes{completa && !completa.error ? ` · IRPF ${String(completa.irpfPct).replace('.', ',')} %${completa.detalle.irpf.calculado !== null ? ' (calculado)' : ''}` : ''}</p>}
      {!e.cotizacion && <p className="nota">Los % de Seguridad Social son los generales; tu gestoría te dice el exacto (sobre todo el de la empresa, que depende de la actividad). Con la nómina completa, Fisquo calcula bases y cuotas.</p>}
      <p className="rotulo" style={{ margin: '6px 0 0' }}>Registro de jornada</p>
      <label>Email con el que ficha (su cuenta de Fisquo)<input autoComplete="email" className="campo" type="email" placeholder="Opcional" value={e.email || ''} onChange={(x) => poner('email', x.target.value)} /></label>
      <div className="dos-col">
        <label>Horas a la semana<input className="campo" inputMode="decimal" value={e.horasSemana ?? 40} onChange={(x) => poner('horasSemana', x.target.value)} /></label>
        <label>Precio hora extra (€)<input className="campo" inputMode="decimal" placeholder="Si se pagan" value={e.precioHoraExtra || ''} onChange={(x) => poner('precioHoraExtra', x.target.value)} /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dos-col">
        {nuevo && <button type="button" className="boton sec" onClick={() => setAbierto(false)}>Cancelar</button>}
        <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : nuevo ? 'Añadir' : 'Guardar cambios'}</button>
      </div>
    </form>
  );
}

// Crea las nóminas del mes para todos los empleados de alta.
export function GenerarMes({ mes, texto }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function generar() {
    setError('');
    setEnviando(true);
    try { await llamar('/api/nominas', { method: 'POST', body: JSON.stringify({ mes }) }); router.refresh(); }
    catch (e) { setError(e.message); }
    setEnviando(false);
  }
  return <><button type="button" className="boton ancho" disabled={enviando} onClick={generar}>{enviando ? 'Haciendo nóminas…' : texto}</button>{error && <span className="error" role="alert">{error}</span>}</>;
}

// Detalle de una nómina: corregir importes y marcarla como pagada.
export function FormNomina({ nomina }) {
  const router = useRouter();
  const [n, setN] = useState({ ...nomina, bruto: nomina.ajustes?.bruto ?? nomina.bruto, ...nomina.ajustes });
  const [msg, setMsg] = useState('');
  const poner = (k, v) => setN({ ...n, [k]: v });
  const c = calculoNomina(nomina);
  async function guardar(cambios) {
    setMsg('Guardando…');
    try { await llamar('/api/nominas', { method: 'PATCH', body: JSON.stringify({ id: n.id, ...cambios }) }); setMsg('Guardado'); if ('pagada' in cambios) setN({ ...n, pagada: cambios.pagada }); router.refresh(); }
    catch (e) { setMsg(e.message); }
  }
  return (
    <>
      {n.detalle && <DesgloseCompleto n={nomina} />}
      {nomina.finiquito && <div className="tarjeta bloque"><h2>Finiquito</h2><dl className="nomina-desglose">{nomina.finiquito.lineas.map((l) => <Fragment key={l.concepto}><dt>{l.concepto}</dt><dd>{eur(l.importe)}</dd></Fragment>)}</dl></div>}
      {(nomina.detalle?.avisos || []).map((a) => <p className="nota" key={a}>{a}</p>)}
      <dl className="tarjeta bloque nomina-desglose">
        <dt>{n.tipo === 'finiquito' ? 'Total devengado' : 'Sueldo bruto'}</dt><dd>{eur(c.totalDevengado ?? c.bruto)}</dd>
        <dt>Retención IRPF ({pctCorto(n.irpfPct)})</dt><dd>−{eur(c.irpf)}</dd>
        <dt>Seguridad Social del trabajador ({pctCorto(n.ssTrabajadorPct)})</dt><dd>−{eur(c.ssTrabajador)}</dd>
        <dt><strong>Neto a pagar</strong></dt><dd><strong>{eur(c.neto)}</strong></dd>
        <dt>Seguridad Social de la empresa ({pctCorto(n.ssEmpresaPct)})</dt><dd>{eur(c.ssEmpresa)}</dd>
        <dt><strong>Coste para la empresa</strong></dt><dd><strong>{eur(c.coste)}</strong></dd>
      </dl>
      <button type="button" className={`boton ancho ${n.pagada ? 'sec' : ''}`} disabled={msg === 'Guardando…'} onClick={() => guardar({ pagada: !n.pagada })}>{n.pagada ? '✓ Pagada · desmarcar' : 'Marcar como pagada'}</button>
      {n.tipo === 'finiquito' && msg && <p role="status">{msg}</p>}
      {n.tipo !== 'finiquito' && <form className="formulario tarjeta" onSubmit={(e) => { e.preventDefault(); guardar(n.completa ? { bruto: n.bruto, it: n.it || null, atrasos: n.atrasos || null, numeroHorasExtra: n.numeroHorasExtra ?? n.detalle?.numeroHorasExtra ?? (n.horas?.extra || 0) / 60, numeroHorasExtraFuerzaMayor: n.numeroHorasExtraFuerzaMayor ?? n.detalle?.numeroHorasExtraFuerzaMayor ?? 0, horasExtraFuerzaMayor: n.horasExtraFuerzaMayor ?? 0, pagaExtra: n.pagaExtra ?? n.detalle?.pagaExtra ?? 0, horasExtra: n.horasExtra ?? n.detalle?.horasExtraResto ?? n.detalle?.horasExtra ?? 0, irpfPct: n.irpfManual ?? (n.detalle?.irpf?.manual ? n.irpfPct : '') } : { bruto: n.bruto, irpfPct: n.irpfPct, ssTrabajadorPct: n.ssTrabajadorPct, ssEmpresaPct: n.ssEmpresaPct }); }}>
        <h3>Corregir esta nómina</h3>
        <p className="nota" style={{ margin: 0 }}>El bruto ordinario incluye pagas y horas extra. La IT sustituye el salario de sus días y los atrasos se añaden al resultado. No cambia la ficha del empleado.</p>
        <label>Bruto ordinario antes de IT y atrasos<input className="campo" inputMode="decimal" value={n.bruto} onChange={(x) => poner('bruto', x.target.value)} required /></label>
        {n.completa ? (
          <div className="tres-col">
            <label>Paga extra incluida<input className="campo" inputMode="decimal" value={n.pagaExtra ?? n.detalle?.pagaExtra ?? 0} onChange={(x) => poner('pagaExtra', x.target.value)} /></label>
            <label>Resto de horas extra incluidas (€)<input className="campo" inputMode="decimal" value={n.horasExtra ?? n.detalle?.horasExtraResto ?? n.detalle?.horasExtra ?? 0} onChange={(x) => poner('horasExtra', x.target.value)} /></label>
            <label>IRPF % (vacío: automático)<input className="campo" inputMode="decimal" value={n.irpfManual ?? (n.detalle?.irpf?.manual ? n.irpfPct : '')} onChange={(x) => poner('irpfManual', x.target.value)} /></label>
          </div>
        ) : (
          <div className="tres-col">
            <label>IRPF %<input className="campo" inputMode="decimal" value={n.irpfPct} onChange={(x) => poner('irpfPct', x.target.value)} /></label>
            <label>SS trab. %<input className="campo" inputMode="decimal" value={n.ssTrabajadorPct} onChange={(x) => poner('ssTrabajadorPct', x.target.value)} /></label>
            <label>SS emp. %<input className="campo" inputMode="decimal" value={n.ssEmpresaPct} onChange={(x) => poner('ssEmpresaPct', x.target.value)} /></label>
          </div>
        )}
        {n.completa && <label>Horas extra de fuerza mayor incluidas (€)<input className="campo" inputMode="decimal" value={n.horasExtraFuerzaMayor ?? n.detalle?.horasExtraFuerzaMayor ?? 0} onChange={(x) => poner('horasExtraFuerzaMayor', x.target.value)} /></label>}
        {n.completa && <div className="dos-col">
          <label>Número de horas extra (resto)<input className="campo" inputMode="decimal" value={n.numeroHorasExtra ?? n.detalle?.numeroHorasExtra ?? (n.horas?.extra || 0) / 60} onChange={(x) => poner('numeroHorasExtra', x.target.value)} /></label>
          <label>Número de horas extra de fuerza mayor<input className="campo" inputMode="decimal" value={n.numeroHorasExtraFuerzaMayor ?? n.detalle?.numeroHorasExtraFuerzaMayor ?? 0} onChange={(x) => poner('numeroHorasExtraFuerzaMayor', x.target.value)} /></label>
        </div>}
        {n.completa && <IncidenciasNomina valor={n} cambiar={setN} mes={n.mes} />}
        {msg && <p role="status" className={msg === 'Guardado' ? 'nota guardado' : msg === 'Guardando…' ? 'nota' : 'error'}>{msg === 'Guardado' ? '✓ Guardado' : msg}</p>}
        <button className="boton" disabled={msg === 'Guardando…'}>Guardar</button>
      </form>}
    </>
  );
}

// Desglose de una nómina completa: bases de cotización y cuotas de cada concepto (lib/nominas.js nominaCompleta).
const NOMBRES_CUOTA = { contingenciasComunes: 'Contingencias comunes', desempleo: 'Desempleo', fogasa: 'FOGASA', formacion: 'Formación profesional', mei: 'Mecanismo de equidad (MEI)', at: 'Accidentes de trabajo', horasExtra: 'Horas extra', solidaridad: 'Cotización de solidaridad' };
function DesgloseCompleto({ n }) {
  const d = n.detalle;
  const filas = (lado) => Object.entries(d.cuotas[lado]).filter(([k, v]) => k !== 'total' && v);
  return (
    <div className="tarjeta bloque nomina-completa">
      <p className="rotulo">Bases de cotización</p>
      <dl className="nomina-desglose">
        <dt>Contingencias comunes</dt><dd>{eur(d.base)}</dd>
        <dt>Accidentes de trabajo y desempleo</dt><dd>{eur(d.baseAT)}</dd>
        {d.prorrata > 0 && <><dt>Prorrata de las pagas extra (incluida)</dt><dd>{eur(d.prorrata)}</dd></>}
        {d.exceso > 0 && <><dt>Por encima de la base máxima (solidaridad)</dt><dd>{eur(d.exceso)}</dd></>}
      </dl>
      {d.it && <><p className="rotulo">Incapacidad temporal · {d.it.dias} días</p><dl className="nomina-desglose">
        <dt>Salario de días trabajados (incluye el día del accidente)</dt><dd>{eur(d.it.salarioTrabajado)}</dd>
        <dt>Días sin prestación / al 60 % / al 75 %</dt><dd>{d.it.tramos.sinPrestacion} / {d.it.tramos.al60} / {d.it.tramos.al75}</dd>
        <dt>Prestación a cargo de la empresa</dt><dd>{eur(d.it.empresa)}</dd>
        <dt>Pago delegado (a deducir en la liquidación de cuotas)</dt><dd>{eur(d.it.pagoDelegado)}</dd>
        <dt>Complemento de convenio a cargo de la empresa</dt><dd>{eur(d.it.complemento)}</dd>
      </dl></>}
      {d.atrasos && <p>Atrasos: {eur(d.atrasos.importe)} · {d.atrasos.meses.join(', ')}</p>}
      <p className="rotulo">Cuotas del trabajador</p>
      <dl className="nomina-desglose">{filas('trabajador').map(([k, v]) => <Fragment key={k}><dt>{NOMBRES_CUOTA[k] || k}</dt><dd>{eur(v)}</dd></Fragment>)}</dl>
      <p className="rotulo">Cuotas de la empresa</p>
      <dl className="nomina-desglose">{filas('empresa').map(([k, v]) => <Fragment key={k}><dt>{NOMBRES_CUOTA[k] || k}</dt><dd>{eur(v)}</dd></Fragment>)}</dl>
      <p className="nota">IRPF: {String(d.irpf.tipo).replace('.', ',')} % {d.irpf.manual ? '(puesto a mano)' : d.administrador ? '(el fijo de un administrador)' : d.irpf.calculado !== null ? `calculado con su modelo 145 (sobre ${eur(d.irpf.anual)} al año)` : '(el de su ficha)'}{d.irpf.bajoMinimo !== undefined ? `; pediste un ${String(d.irpf.bajoMinimo).replace('.', ',')} %, pero la retención no puede bajar de la que toca` : ''}. Grupo {d.grupo}{d.temporal ? ', contrato temporal' : ''}{d.parcial < 1 ? `, jornada al ${Math.round(d.parcial * 100)} %` : ''}.</p>
    </div>
  );
}
