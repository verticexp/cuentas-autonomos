'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { navegar } from '@/lib/transicion';
import { SS_EMPRESA, SS_TRABAJADOR, calculoNomina } from '@/lib/nominas';
import { eur } from '@/lib/formato';

// Alta o edición de un empleado.
export function FormEmpleado({ empleado, hoy }) {
  const router = useRouter();
  const nuevo = !empleado;
  const [e, setE] = useState(empleado || { nombre: '', nif: '', puesto: '', alta: hoy, baja: '', bruto: '', irpfPct: 12, ssTrabajadorPct: SS_TRABAJADOR, ssEmpresaPct: SS_EMPRESA });
  const [abierto, setAbierto] = useState(!nuevo);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k, v) => setE({ ...e, [k]: v });
  const c = calculoNomina(e);

  async function enviar(ev) {
    ev.preventDefault();
    setEnviando(true); setError('');
    try {
      await llamar('/api/empleados', { method: nuevo ? 'POST' : 'PATCH', body: JSON.stringify(e) });
      if (nuevo) { setAbierto(false); setE({ ...e, nombre: '', nif: '', puesto: '', bruto: '' }); router.refresh(); }
      else { navegar(router, '/nominas', 'atras'); router.refresh(); }
    } catch (err) { setError(err.message); }
    setEnviando(false);
  }

  if (!abierto) return <button type="button" className="boton sec ancho" onClick={() => setAbierto(true)}>+ Añadir empleado</button>;
  return (
    <form className="formulario tarjeta" onSubmit={enviar}>
      {nuevo && <h3>Nuevo empleado</h3>}
      <input className="campo" placeholder="Nombre y apellidos" value={e.nombre} onChange={(x) => poner('nombre', x.target.value)} required />
      <div className="dos-col">
        <input className="campo" placeholder="DNI / NIE" value={e.nif} onChange={(x) => poner('nif', x.target.value)} />
        <input className="campo" placeholder="Puesto" value={e.puesto} onChange={(x) => poner('puesto', x.target.value)} />
      </div>
      <div className="dos-col">
        <label>Alta<input className="campo" type="date" value={e.alta} onChange={(x) => poner('alta', x.target.value)} required /></label>
        <label>Baja (si ya no está)<input className="campo" type="date" value={e.baja} onChange={(x) => poner('baja', x.target.value)} /></label>
      </div>
      <label>Sueldo bruto al mes (con pagas extra prorrateadas)<input className="campo" inputMode="decimal" placeholder="Ej. 1.800" value={e.bruto} onChange={(x) => poner('bruto', x.target.value)} required /></label>
      <div className="tres-col">
        <label>IRPF %<input className="campo" inputMode="decimal" value={e.irpfPct} onChange={(x) => poner('irpfPct', x.target.value)} /></label>
        <label>SS trabajador %<input className="campo" inputMode="decimal" value={e.ssTrabajadorPct} onChange={(x) => poner('ssTrabajadorPct', x.target.value)} /></label>
        <label>SS empresa %<input className="campo" inputMode="decimal" value={e.ssEmpresaPct} onChange={(x) => poner('ssEmpresaPct', x.target.value)} /></label>
      </div>
      {c.bruto > 0 && <p className="nota nomina-calculo">Cobra <strong>{eur(c.neto)}</strong> netos · a la empresa le cuesta <strong>{eur(c.coste)}</strong> al mes</p>}
      <p className="nota">Los % de Seguridad Social son los generales; tu gestoría te dice el exacto (sobre todo el de la empresa, que depende de la actividad).</p>
      {error && <p className="error">{error}</p>}
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
  const [enviando, setEnviando] = useState(false);
  async function generar() {
    setEnviando(true);
    try { await llamar('/api/nominas', { method: 'POST', body: JSON.stringify({ mes }) }); router.refresh(); }
    catch (e) { alert(e.message); }
    setEnviando(false);
  }
  return <button type="button" className="boton ancho" disabled={enviando} onClick={generar}>{enviando ? 'Haciendo nóminas…' : texto}</button>;
}

// Detalle de una nómina: corregir importes y marcarla como pagada.
export function FormNomina({ nomina }) {
  const router = useRouter();
  const [n, setN] = useState(nomina);
  const [msg, setMsg] = useState('');
  const poner = (k, v) => setN({ ...n, [k]: v });
  const c = calculoNomina(n);
  async function guardar(cambios) {
    setMsg('Guardando…');
    try { await llamar('/api/nominas', { method: 'PATCH', body: JSON.stringify({ id: n.id, ...cambios }) }); setMsg('Guardado'); router.refresh(); }
    catch (e) { setMsg(e.message); }
  }
  return (
    <>
      <dl className="tarjeta bloque nomina-desglose">
        <dt>Sueldo bruto</dt><dd>{eur(c.bruto)}</dd>
        <dt>Retención IRPF ({n.irpfPct} %)</dt><dd>−{eur(c.irpf)}</dd>
        <dt>Seguridad Social del trabajador ({n.ssTrabajadorPct} %)</dt><dd>−{eur(c.ssTrabajador)}</dd>
        <dt><strong>Neto a pagar</strong></dt><dd><strong>{eur(c.neto)}</strong></dd>
        <dt>Seguridad Social de la empresa ({n.ssEmpresaPct} %)</dt><dd>{eur(c.ssEmpresa)}</dd>
        <dt><strong>Coste para la empresa</strong></dt><dd><strong>{eur(c.coste)}</strong></dd>
      </dl>
      <button type="button" className={`boton ancho ${n.pagada ? 'sec' : ''}`} onClick={() => { setN({ ...n, pagada: !n.pagada }); guardar({ pagada: !n.pagada }); }}>{n.pagada ? '✓ Pagada · desmarcar' : 'Marcar como pagada'}</button>
      <form className="formulario tarjeta" onSubmit={(e) => { e.preventDefault(); guardar({ bruto: n.bruto, irpfPct: n.irpfPct, ssTrabajadorPct: n.ssTrabajadorPct, ssEmpresaPct: n.ssEmpresaPct }); }}>
        <h3>Corregir esta nómina</h3>
        <p className="nota" style={{ margin: 0 }}>Para pagas extra, horas o atrasos de este mes. No cambia la ficha del empleado.</p>
        <label>Bruto del mes<input className="campo" inputMode="decimal" value={n.bruto} onChange={(x) => poner('bruto', x.target.value)} required /></label>
        <div className="tres-col">
          <label>IRPF %<input className="campo" inputMode="decimal" value={n.irpfPct} onChange={(x) => poner('irpfPct', x.target.value)} /></label>
          <label>SS trab. %<input className="campo" inputMode="decimal" value={n.ssTrabajadorPct} onChange={(x) => poner('ssTrabajadorPct', x.target.value)} /></label>
          <label>SS emp. %<input className="campo" inputMode="decimal" value={n.ssEmpresaPct} onChange={(x) => poner('ssEmpresaPct', x.target.value)} /></label>
        </div>
        {msg && <p role="status" className={msg === 'Guardado' ? 'nota guardado' : msg === 'Guardando…' ? 'nota' : 'error'}>{msg === 'Guardado' ? '✓ Guardado' : msg}</p>}
        <button className="boton">Guardar</button>
      </form>
    </>
  );
}
