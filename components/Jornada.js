'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import useEnvio from './useEnvio';
import { useT } from '@/components/Idioma';
import { conHuecos } from '@/lib/huecos';

const hora = (m) => (m ? m.slice(11, 16) : '');
// Fecha + hora → «AAAA-MM-DDTHH:MM». Si la hora es anterior a la de referencia, es del día siguiente (turnos de noche).
function momento(fecha, h, despuesDe) {
  if (!fecha || !/^\d{2}:\d{2}$/.test(h || '')) return '';
  let m = `${fecha}T${h}`;
  if (despuesDe && m < despuesDe) m = `${new Date(Date.parse(`${fecha}T12:00:00Z`) + 864e5).toISOString().slice(0, 10)}T${h}`;
  return m;
}
const duracion = (a, b) => Math.max(0, Math.round((Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 60000));
const hhmm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

// Botones para fichar: entrada, pausa, vuelta y salida, con la hora del servidor.
export function Fichar({ estado, desde, hoyMin, ahora }) {
  const tr = useT();
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [reloj, setReloj] = useState(ahora);
  // Cuenta lo que lleva hoy mientras está dentro (se refresca cada minuto).
  useEffect(() => {
    const t = setInterval(() => setReloj(new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16).replace(' ', 'T')), 30000);
    return () => clearInterval(t);
  }, []);
  const accion = async (a) => {
    setOcupado(true); setMsg('');
    try { await llamar('/api/jornada', { method: 'POST', body: JSON.stringify({ accion: a }) }); router.refresh(); } catch (e) { setMsg(e.message); } finally { setOcupado(false); }
  };
  const lleva = hoyMin + (estado === 'dentro' && desde ? duracion(desde, reloj) : 0);
  const TEXTO = { fuera: tr('Fuera'), dentro: tr('Trabajando desde las {hora}', { hora: hora(desde) }), pausa: tr('En pausa desde las {hora}', { hora: hora(desde) }) };
  return (
    <section className={`jor-fichar ${estado}`}>
      <p className="jor-estado"><span className="jor-punto" aria-hidden />{TEXTO[estado]}</p>
      <p className="jor-hoy">{conHuecos(tr('Hoy llevas {horas}'), { horas: <strong>{hhmm(lleva)} h</strong> })}</p>
      <div className="jor-botones">
        {estado === 'fuera' && <button className="boton" disabled={ocupado} onClick={() => accion('entrar')}>{tr('Fichar entrada')}</button>}
        {estado === 'dentro' && <>
          <button className="boton sec" disabled={ocupado} onClick={() => accion('pausa')}>{tr('Pausa')}</button>
          <button className="boton" disabled={ocupado} onClick={() => accion('salir')}>{tr('Fichar salida')}</button>
        </>}
        {estado === 'pausa' && <>
          <button className="boton" disabled={ocupado} onClick={() => accion('volver')}>{tr('Volver de la pausa')}</button>
          <button className="boton sec" disabled={ocupado} onClick={() => accion('salir')}>{tr('Fichar salida')}</button>
        </>}
      </div>
      {msg && <p className="rojo jor-msg" role="alert">{tr(msg)}</p>}
    </section>
  );
}

// Formulario de una jornada: horas de entrada y salida, pausas y el motivo (obligatorio: queda en el registro).
function FormJornada({ inicial, empleados, enviar, cancelar, boton }) {
  const tr = useT();
  const [enviando, envolver] = useEnvio();
  const [d, setD] = useState(inicial);
  const [msg, setMsg] = useState('');
  const pon = (k, v) => setD({ ...d, [k]: v });
  const ok = async (ev) => {
    ev.preventDefault(); setMsg('');
    const entrada = momento(d.fecha, d.entrada);
    const pausas = d.pausas.filter((p) => p.inicio || p.fin).map((p) => ({ inicio: momento(d.fecha, p.inicio, entrada), fin: momento(d.fecha, p.fin, entrada) }));
    try { await enviar({ empleado: d.empleado, entrada, salida: momento(d.fecha, d.salida, entrada), pausas, motivo: d.motivo }); } catch (e) { setMsg(e.message); }
  };
  return (
    <form className="formulario tarjeta jor-form" onSubmit={envolver(ok)}>
      {empleados && (
        <select className="campo" value={d.empleado} onChange={(e) => pon('empleado', e.target.value)} required aria-label={tr('Empleado')}>
          <option value="">{tr('Elige a quién')}</option>
          {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
      )}
      <label>{tr('Día')}<input className="campo" type="date" value={d.fecha} onChange={(e) => pon('fecha', e.target.value)} required /></label>
      <div className="dos-col">
        <label>{tr('Entrada')}<input className="campo" type="time" value={d.entrada} onChange={(e) => pon('entrada', e.target.value)} required /></label>
        <label>{tr('Salida')}<input className="campo" type="time" value={d.salida} onChange={(e) => pon('salida', e.target.value)} required /></label>
      </div>
      {d.pausas.map((p, i) => (
        <div key={i} className="jor-pausa">
          <label>{tr('Pausa desde')}<input className="campo" type="time" value={p.inicio} onChange={(e) => pon('pausas', d.pausas.map((x, j) => (j === i ? { ...x, inicio: e.target.value } : x)))} /></label>
          <label>{tr('hasta')}<input className="campo" type="time" value={p.fin} onChange={(e) => pon('pausas', d.pausas.map((x, j) => (j === i ? { ...x, fin: e.target.value } : x)))} /></label>
          <button type="button" className="jor-quitar" onClick={() => pon('pausas', d.pausas.filter((_, j) => j !== i))} aria-label={tr('Quitar pausa')}>×</button>
        </div>
      ))}
      <button type="button" className="jor-anadir" onClick={() => pon('pausas', [...d.pausas, { inicio: '', fin: '' }])}>{tr('+ Añadir pausa')}</button>
      <label>{tr('Motivo (queda en el registro)')}<input className="campo" value={d.motivo} onChange={(e) => pon('motivo', e.target.value)} placeholder={tr('Ej. se olvidó de fichar la salida')} required minLength={3} /></label>
      {msg && <p className="error" role="alert">{tr(msg)}</p>}
      <div className="dos-col">
        <button type="button" className="boton sec" onClick={cancelar}>{tr('Cancelar')}</button>
        <button className="boton" disabled={enviando}>{boton}</button>
      </div>
    </form>
  );
}

// Corregir una jornada (quien lleva las nóminas).
export function EditarJornada({ f }) {
  const tr = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <button type="button" className="jor-editar" onClick={() => setAbierto(true)}>{tr('Corregir')}</button>;
  return (
    <div className="jor-editando">
      <FormJornada
        inicial={{ fecha: f.fecha, entrada: hora(f.entrada), salida: hora(f.salida), pausas: (f.pausas || []).map((p) => ({ inicio: hora(p.inicio), fin: hora(p.fin) })), motivo: '' }}
        boton={tr('Guardar corrección')} cancelar={() => setAbierto(false)}
        enviar={async (b) => { await llamar('/api/jornada', { method: 'PATCH', body: JSON.stringify({ id: f.id, ...b }) }); setAbierto(false); router.refresh(); }}
      />
    </div>
  );
}

// Apuntar a mano un día que no se fichó.
export function NuevaJornada({ empleados, hoy }) {
  const tr = useT();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <button type="button" className="boton sec ancho" onClick={() => setAbierto(true)}>{tr('+ Apuntar un día a mano')}</button>;
  return (
    <FormJornada
      empleados={empleados} inicial={{ empleado: '', fecha: hoy, entrada: '09:00', salida: '17:00', pausas: [], motivo: '' }}
      boton={tr('Apuntar')} cancelar={() => setAbierto(false)}
      enviar={async (b) => { await llamar('/api/jornada', { method: 'POST', body: JSON.stringify({ accion: 'manual', ...b }) }); setAbierto(false); router.refresh(); }}
    />
  );
}
