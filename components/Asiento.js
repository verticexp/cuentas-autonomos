'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { useT } from '@/components/Idioma';
import { parseImporte } from '@/lib/importe';

const num = (v) => parseImporte(v) || 0;
import { r2 } from '@/lib/redondeo';
import { eur, eurSin } from '@/lib/formato';
import { CUENTAS_PERSONAL, NOMBRES_PERSONAL, asientosPersonal, totalesPersonal } from '@/lib/personal';

// Asiento apuntado a mano: fecha, concepto y líneas al debe o al haber. No se guarda si no cuadra.
// cuentas: [[código, nombre]] para sugerirlas al escribir.
export function NuevoAsiento({ hoy, cuentas }) {
  const tr = useT();
  const router = useRouter();
  const ayudaId = useId();
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

  if (!abierto) return <button type="button" className="boton sec" onClick={() => setAbierto(true)}>{tr('Apuntar un asiento')}</button>;
  return (
    <form className="formulario tarjeta asiento-form" onSubmit={enviar}>
      <h3>{tr('Asiento manual')}</h3>
      <div className="dos-col">
        <label>{tr('Fecha')}<input className="campo" type="date" value={a.fecha} onChange={(e) => setA({ ...a, fecha: e.target.value })} required /></label>
        <label>{tr('Concepto')}<input className="campo" placeholder={tr('Concepto')} value={a.concepto} onChange={(e) => setA({ ...a, concepto: e.target.value })} required /></label>
      </div>
      <datalist id="cuentas-pgc">{cuentas.map(([c, n]) => <option key={c} value={c}>{tr(n)}</option>)}</datalist>
      {a.lineas.map((l, i) => (
        <div key={i} className="asiento-linea">
          <input className="campo" list="cuentas-pgc" inputMode="numeric" placeholder={tr('Cuenta')} value={l.cuenta} onChange={(e) => linea(i, 'cuenta', e.target.value.trim())} aria-label={tr('Cuenta')} />
          <input className="campo" inputMode="decimal" placeholder={tr('Debe')} value={l.debe} onChange={(e) => linea(i, 'debe', e.target.value)} disabled={Boolean(l.haber)} aria-label={tr('Debe')} />
          <input className="campo" inputMode="decimal" placeholder={tr('Haber')} value={l.haber} onChange={(e) => linea(i, 'haber', e.target.value)} disabled={Boolean(l.debe)} aria-label={tr('Haber')} />
        </div>
      ))}
      <button type="button" className="boton sec pequeno" onClick={() => setA({ ...a, lineas: [...a.lineas, vacia] })}>{tr('Añadir línea')}</button>
      <p className={`nota${d !== h ? ' rojo' : ''}`}>{d !== h ? tr('Debe {debe} · Haber {haber} · descuadre de {descuadre}', { debe: eurSin(d), haber: eurSin(h), descuadre: eurSin(Math.abs(r2(d - h))) }) : tr('Debe {debe} · Haber {haber} · cuadra', { debe: eurSin(d), haber: eurSin(h) })}</p>
      {error && <p className="error" role="alert">{tr(error)}</p>}
      {(d !== h || !d) && <p id={ayudaId} className="nota">{!d ? tr('Añade un importe al debe y al haber.') : tr('El debe y el haber deben coincidir.')}</p>}
      <div className="gasto-guardar">
        <button className="boton" disabled={enviando || d !== h || !d} aria-describedby={d !== h || !d ? ayudaId : undefined}>{enviando ? tr('Guardando…') : tr('Guardar asiento')}</button>
        <button type="button" className="boton sec" onClick={() => { setAbierto(false); setError(''); }}>{tr('Cancelar')}</button>
      </div>
    </form>
  );
}

// Asiento de apertura: lo que había al empezar a llevar la contabilidad en Fisquo (lo que no sale de facturas ni gastos).
export function Apertura({ fecha, sociedad, previa }) {
  const tr = useT();
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

  if (!abierto) return <button type="button" className="boton sec" onClick={() => setAbierto(true)}>{tr('Cambiar la apertura')}</button>;
  return (
    <form className="formulario tarjeta asiento-form" onSubmit={enviar}>
      <h3>{tr('Saldos de apertura')}</h3>
      <p className="nota">{tr('Lo que había el día que empiezas a llevar las cuentas en Fisquo y no sale de tus facturas ni gastos. Lo que falte para cuadrar va a {destino}.', { destino: sociedad ? tr('reservas (remanente)') : tr('remanente') })}</p>
      <label className="asiento-campo">{tr('Fecha')}<input className="campo" type="date" value={x.fecha} onChange={poner('fecha')} required /></label>
      <label className="asiento-campo">{tr('Saldo en el banco')}<input className="campo" inputMode="decimal" placeholder="0,00" value={x.banco} onChange={poner('banco')} /></label>
      <label className="asiento-campo">{sociedad ? tr('Capital social') : tr('Capital aportado')}<input className="campo" inputMode="decimal" placeholder="0,00" value={x.capital} onChange={poner('capital')} /></label>
      <label className="asiento-campo">{tr('Préstamos: lo que se devuelve en más de un año')}<input className="campo" inputMode="decimal" placeholder="0,00" value={x.largo} onChange={poner('largo')} /></label>
      <label className="asiento-campo">{tr('Préstamos: lo que se devuelve este año')}<input className="campo" inputMode="decimal" placeholder="0,00" value={x.corto} onChange={poner('corto')} /></label>
      {error && <p className="error" role="alert">{tr(error)}</p>}
      <div className="gasto-guardar">
        <button className="boton" disabled={enviando}>{enviando ? tr('Guardando…') : tr('Guardar apertura')}</button>
        {previa && <button type="button" className="boton sec" onClick={() => setAbierto(false)}>{tr('Cancelar')}</button>}
      </div>
    </form>
  );
}

// Gastos de personal del listado de la gestoría: se piden los importes por cuentas (sueldos, IRPF, Seguridad Social del
// trabajador y de la empresa, resto de personal) y Fisquo monta el asiento; si ya está pagado, también los de pago.
export function AsientoPersonal({ hoy }) {
  const tr = useT();
  const router = useRouter();
  const ayudaId = useId();
  const vacio = { fecha: hoy, concepto: '', sueldos: '', ssEmpresa: '', irpf: '', ssTrabajador: '', otros: [], pagoLiquido: '', pagoSS: '', pagoIRPF: '' };
  const [abierto, setAbierto] = useState(false);
  const [a, setA] = useState(vacio);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k) => (e) => setA({ ...a, [k]: e.target.value });
  const otro = (i, k, v) => setA({ ...a, otros: a.otros.map((o, j) => (j === i ? { ...o, [k]: v } : o)) });
  const t = totalesPersonal(a);
  const previa = asientosPersonal(a);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      await llamar('/api/asientos', { method: 'POST', body: JSON.stringify({ personal: a }) });
      setA(vacio); setAbierto(false);
      router.refresh();
    } catch (err) { setError(err.message); }
    setEnviando(false);
  };

  if (!abierto) return <button type="button" className="boton sec" onClick={() => setAbierto(true)}>{tr('Apuntar nóminas y personal')}</button>;
  return (
    <form className="formulario tarjeta asiento-form" onSubmit={enviar}>
      <h3>{tr('Gastos de personal')}</h3>
      <p className="nota">{tr('Copia los importes del listado de tu gestoría. Si ya hiciste esas nóminas en Equipo y nóminas, no las apuntes aquí: se contarían dos veces.')}</p>
      <div className="dos-col">
        <label className="asiento-campo">{tr('Fecha del asiento')}<input className="campo" type="date" value={a.fecha} onChange={poner('fecha')} required /></label>
        <label className="asiento-campo">{tr('Concepto')}<input className="campo" placeholder={tr('Nóminas de octubre')} value={a.concepto} onChange={poner('concepto')} /></label>
      </div>
      <label className="asiento-campo">{tr('Sueldos y salarios, bruto (640)')}<input className="campo" inputMode="decimal" placeholder="0,00" value={a.sueldos} onChange={poner('sueldos')} required /></label>
      <label className="asiento-campo">{tr('Retenciones de IRPF practicadas (4751)')}<input className="campo" inputMode="decimal" placeholder="0,00" value={a.irpf} onChange={poner('irpf')} /></label>
      <label className="asiento-campo">{tr('Seguridad Social a cargo del trabajador (476)')}<input className="campo" inputMode="decimal" placeholder="0,00" value={a.ssTrabajador} onChange={poner('ssTrabajador')} /></label>
      <label className="asiento-campo">{tr('Seguridad Social a cargo de la empresa (642)')}<input className="campo" inputMode="decimal" placeholder="0,00" value={a.ssEmpresa} onChange={poner('ssEmpresa')} /></label>
      <p className="rotulo" style={{ margin: '6px 0 0' }}>{tr('Resto de gastos de personal')}</p>
      {a.otros.map((o, i) => (
        <div key={i} className="asiento-linea personal-otro">
          <select className="campo" value={o.cuenta} onChange={(e) => otro(i, 'cuenta', e.target.value)} aria-label={tr('Cuenta de personal')}>
            {CUENTAS_PERSONAL.map(([c, n]) => <option key={c} value={c}>{c} · {tr(n)}</option>)}
          </select>
          <input className="campo" inputMode="decimal" placeholder="0,00" value={o.importe} onChange={(e) => otro(i, 'importe', e.target.value)} aria-label={tr('Importe')} />
          <button type="button" className="boton sec pequeno" onClick={() => setA({ ...a, otros: a.otros.filter((_, j) => j !== i) })}>{tr('Quitar')}</button>
        </div>
      ))}
      <button type="button" className="boton sec pequeno" onClick={() => setA({ ...a, otros: [...a.otros, { cuenta: CUENTAS_PERSONAL[0][0], importe: '' }] })}>{tr('Añadir indemnizaciones u otros gastos de personal')}</button>
      <p className="rotulo" style={{ margin: '6px 0 0' }}>{tr('Pagos (si ya están hechos)')}</p>
      <label className="asiento-campo">{tr('Líquido a los empleados, pagado el')}<input className="campo" type="date" value={a.pagoLiquido} onChange={poner('pagoLiquido')} /></label>
      <label className="asiento-campo">{tr('Seguridad Social, pagada el')}<input className="campo" type="date" value={a.pagoSS} onChange={poner('pagoSS')} /></label>
      <label className="asiento-campo">{tr('IRPF (modelo 111), pagado el')}<input className="campo" type="date" value={a.pagoIRPF} onChange={poner('pagoIRPF')} /></label>
      {t.sueldos > 0 && (
        <table className="cont-lineas personal-resumen">
          <thead><tr><th>{tr('Asiento')}</th><th>{tr('Debe')}</th><th>{tr('Haber')}</th></tr></thead>
          <tbody>
            {previa.asientos?.[0].lineas.map((l) => <tr key={l.cuenta}><td className={l.haber ? 'haber' : ''}>{l.cuenta} {tr(NOMBRES_PERSONAL[l.cuenta] || '')}</td><td>{l.debe ? eurSin(l.debe) : ''}</td><td>{l.haber ? eurSin(l.haber) : ''}</td></tr>)}
          </tbody>
        </table>
      )}
      {t.sueldos > 0 && <p className="nota">{tr('Gasto de personal {gasto} · líquido a pagar {liquido} · Seguridad Social a ingresar {ss}', { gasto: eur(t.gasto), liquido: eur(t.liquido), ss: eur(t.ss) })}</p>}
      {error && <p className="error" role="alert">{tr(error)}</p>}
      <div className="gasto-guardar">
        <button className="boton" disabled={enviando || Boolean(previa.error)} aria-describedby={previa.error ? ayudaId : undefined}>{enviando ? tr('Guardando…') : tr('Guardar asiento')}</button>
        <button type="button" className="boton sec" onClick={() => { setAbierto(false); setError(''); }}>{tr('Cancelar')}</button>
      </div>
      {previa.error && <p id={ayudaId} className="nota rojo">{tr(previa.error)}</p>}
    </form>
  );
}
