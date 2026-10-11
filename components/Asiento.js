'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { parseImporte } from '@/lib/importe';

const num = (v) => parseImporte(v) || 0;
const r2 = (n) => Math.round(n * 100) / 100;

// Asiento apuntado a mano: fecha, concepto y líneas al debe o al haber. No se guarda si no cuadra.
// cuentas: [[código, nombre]] para sugerirlas al escribir.
export function NuevoAsiento({ hoy, cuentas }) {
  const router = useRouter();
  const vacia = { cuenta: '', debe: '', haber: '' };
  const [abierto, setAbierto] = useState(false);
  const [a, setA] = useState({ fecha: hoy, concepto: '', lineas: [vacia, vacia] });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const linea = (i, k, v) => setA((x) => ({ ...x, lineas: x.lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const d = r2(a.lineas.reduce((s, l) => s + num(l.debe), 0)), h = r2(a.lineas.reduce((s, l) => s + num(l.haber), 0));

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      await llamar('/api/asientos', { method: 'POST', body: JSON.stringify({ ...a, lineas: a.lineas.map((l) => ({ cuenta: l.cuenta, debe: num(l.debe), haber: num(l.haber) })) }) });
      setA({ fecha: hoy, concepto: '', lineas: [vacia, vacia] }); setAbierto(false);
      router.refresh();
    } catch (err) { setError(err.message); }
    setEnviando(false);
  };

  if (!abierto) return <button type="button" className="boton sec" onClick={() => setAbierto(true)}>Apuntar un asiento</button>;
  return (
    <form className="formulario tarjeta asiento-form" onSubmit={enviar}>
      <h3>Asiento manual</h3>
      <div className="dos-col">
        <input className="campo" type="date" value={a.fecha} onChange={(e) => setA({ ...a, fecha: e.target.value })} required />
        <input className="campo" placeholder="Concepto" value={a.concepto} onChange={(e) => setA({ ...a, concepto: e.target.value })} required />
      </div>
      <datalist id="cuentas-pgc">{cuentas.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</datalist>
      {a.lineas.map((l, i) => (
        <div key={i} className="asiento-linea">
          <input className="campo" list="cuentas-pgc" inputMode="numeric" placeholder="Cuenta" value={l.cuenta} onChange={(e) => linea(i, 'cuenta', e.target.value.trim())} aria-label="Cuenta" />
          <input className="campo" inputMode="decimal" placeholder="Debe" value={l.debe} onChange={(e) => linea(i, 'debe', e.target.value)} disabled={Boolean(l.haber)} aria-label="Debe" />
          <input className="campo" inputMode="decimal" placeholder="Haber" value={l.haber} onChange={(e) => linea(i, 'haber', e.target.value)} disabled={Boolean(l.debe)} aria-label="Haber" />
        </div>
      ))}
      <button type="button" className="boton sec pequeno" onClick={() => setA({ ...a, lineas: [...a.lineas, vacia] })}>Añadir línea</button>
      <p className={`nota${d !== h ? ' rojo' : ''}`}>Debe {d.toLocaleString('es-ES', { minimumFractionDigits: 2 })} · Haber {h.toLocaleString('es-ES', { minimumFractionDigits: 2 })}{d !== h ? ` · descuadre de ${Math.abs(r2(d - h)).toLocaleString('es-ES', { minimumFractionDigits: 2 })}` : ' · cuadra'}</p>
      {error && <p className="error">{error}</p>}
      <div className="gasto-guardar">
        <button className="boton" disabled={enviando || d !== h || !d}>{enviando ? 'Guardando…' : 'Guardar asiento'}</button>
        <button type="button" className="boton sec" onClick={() => { setAbierto(false); setError(''); }}>Cancelar</button>
      </div>
    </form>
  );
}

// Asiento de apertura: lo que había al empezar a llevar la contabilidad en Netto (lo que no sale de facturas ni gastos).
export function Apertura({ fecha, sociedad, previa }) {
  const router = useRouter();
  const de = (c) => previa?.lineas.find((l) => l.cuenta === c);
  const v = (c) => { const l = de(c); return l ? String(l.debe || l.haber).replace('.', ',') : ''; };
  const [x, setX] = useState({ fecha: previa?.fecha || fecha, banco: v('572'), capital: v(sociedad ? '100' : '102'), largo: v('170'), corto: v('520') });
  const [abierto, setAbierto] = useState(!previa);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k) => (e) => setX({ ...x, [k]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      await llamar('/api/asientos', { method: 'POST', body: JSON.stringify({ apertura: { ...x, banco: num(x.banco), capital: num(x.capital), largo: num(x.largo), corto: num(x.corto) } }) });
      setAbierto(false);
      router.refresh();
    } catch (err) { setError(err.message); }
    setEnviando(false);
  };

  if (!abierto) return <button type="button" className="boton sec" onClick={() => setAbierto(true)}>Cambiar la apertura</button>;
  return (
    <form className="formulario tarjeta asiento-form" onSubmit={enviar}>
      <h3>Saldos de apertura</h3>
      <p className="nota">Lo que había el día que empiezas a llevar las cuentas en Netto y no sale de tus facturas ni gastos. Lo que falte para cuadrar va a {sociedad ? 'reservas (remanente)' : 'remanente'}.</p>
      <label className="asiento-campo">Fecha<input className="campo" type="date" value={x.fecha} onChange={poner('fecha')} required /></label>
      <label className="asiento-campo">Saldo en el banco<input className="campo" inputMode="decimal" placeholder="0,00" value={x.banco} onChange={poner('banco')} /></label>
      <label className="asiento-campo">{sociedad ? 'Capital social' : 'Capital aportado'}<input className="campo" inputMode="decimal" placeholder="0,00" value={x.capital} onChange={poner('capital')} /></label>
      <label className="asiento-campo">Préstamos: lo que se devuelve en más de un año<input className="campo" inputMode="decimal" placeholder="0,00" value={x.largo} onChange={poner('largo')} /></label>
      <label className="asiento-campo">Préstamos: lo que se devuelve este año<input className="campo" inputMode="decimal" placeholder="0,00" value={x.corto} onChange={poner('corto')} /></label>
      {error && <p className="error">{error}</p>}
      <div className="gasto-guardar">
        <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar apertura'}</button>
        {previa && <button type="button" className="boton sec" onClick={() => setAbierto(false)}>Cancelar</button>}
      </div>
    </form>
  );
}
