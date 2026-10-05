'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { calcularDieta, KM, limiteDia } from '@/lib/dietas';
import { eur } from '@/lib/formato';
import '@/app/dietas.css';

// Kilometraje y dietas: se apunta como gasto con lo exento (o deducible) ya calculado.
export default function Dietas({ hoy, actividades, autonomo }) {
  const router = useRouter();
  const vacio = { tipo: 'km', quien: autonomo ? 'titular' : 'empleado', fecha: hoy, actividad: actividades[0].id, km: '', dias: '1', pernocta: false, extranjero: false, pagado: '', ivaPct: 10, electronico: true, persona: '', motivo: '' };
  const [d, setD] = useState(vacio);
  const [msg, setMsg] = useState('');
  const poner = (k, v) => { setD((x) => ({ ...x, [k]: v })); setMsg(''); };
  const titular = autonomo && d.tipo === 'manutencion' && d.quien === 'titular';
  const listo = (d.tipo === 'km' ? d.km : d.dias) !== '' && (!titular || d.pagado !== '');
  const c = listo ? calcularDieta({ ...d, quien: titular ? 'titular' : 'empleado' }) : null;
  const enviar = async (e) => {
    e.preventDefault();
    try {
      const r = await llamar('/api/gastos/dieta', { method: 'POST', body: JSON.stringify({ ...d, quien: titular ? 'titular' : 'empleado' }) });
      setMsg(`✓ Apuntado: ${r.gasto.concepto}`);
      setD((x) => ({ ...vacio, tipo: x.tipo, quien: x.quien }));
      router.refresh();
    } catch (err) { setMsg(err.message); }
  };
  const tipos = [['km', 'Kilometraje'], ['manutencion', 'Dietas y comidas']];
  return (
    <form className="formulario tarjeta dietas" onSubmit={enviar}>
      <h3>Kilometraje y dietas</h3>
      <div className="tipo dos">{tipos.map(([k, n]) => <button type="button" key={k} className={d.tipo === k ? 'activo' : ''} onClick={() => poner('tipo', k)}>{n}</button>)}</div>
      {autonomo && d.tipo === 'manutencion' && (
        <div className="tipo dos">
          <button type="button" className={titular ? 'activo' : ''} onClick={() => poner('quien', 'titular')}>Tus comidas</button>
          <button type="button" className={!titular ? 'activo' : ''} onClick={() => poner('quien', 'empleado')}>Pagadas a un trabajador</button>
        </div>
      )}
      {actividades.length > 1 && <select className="campo" value={d.actividad} onChange={(e) => poner('actividad', e.target.value)}>{actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>}
      {!titular && <input className="campo" placeholder="Trabajador (opcional)" value={d.persona} onChange={(e) => poner('persona', e.target.value)} />}
      <input className="campo" placeholder="Motivo o destino (opcional)" value={d.motivo} onChange={(e) => poner('motivo', e.target.value)} />
      {d.tipo === 'km' ? (
        <div className="dos-col">
          <label>Kilómetros<input className="campo" inputMode="decimal" placeholder="0" value={d.km} onChange={(e) => poner('km', e.target.value)} required /></label>
          <label>Le pagas<input className="campo" inputMode="decimal" placeholder={`${String(KM).replace('.', ',')} €/km`} value={d.pagado} onChange={(e) => poner('pagado', e.target.value)} /></label>
        </div>
      ) : (
        <>
          <div className="dos-col">
            <label>Días<input className="campo" inputMode="numeric" value={d.dias} onChange={(e) => poner('dias', e.target.value)} required /></label>
            <label>{titular ? 'Pagaste con IVA' : 'Le pagas'}<input className="campo" inputMode="decimal" placeholder={titular ? '0,00' : 'El límite'} value={d.pagado} onChange={(e) => poner('pagado', e.target.value)} required={titular} /></label>
          </div>
          <label className="gasto-pendiente"><input type="checkbox" checked={d.pernocta} onChange={(e) => poner('pernocta', e.target.checked)} />Con noche fuera (en otro municipio)</label>
          <label className="gasto-pendiente"><input type="checkbox" checked={d.extranjero} onChange={(e) => poner('extranjero', e.target.checked)} />En el extranjero</label>
          {titular && <label className="gasto-pendiente"><input type="checkbox" checked={d.electronico} onChange={(e) => poner('electronico', e.target.checked)} />Pagado con tarjeta, en restaurante u hotel</label>}
        </>
      )}
      <input className="campo" type="date" value={d.fecha} onChange={(e) => poner('fecha', e.target.value)} required />
      {c && !c.error && (
        <p className="dieta-calculo" role="status">
          {c.tipo === 'km' ? <>Exento: {String(c.km).replace('.', ',')} km × {String(KM).replace('.', ',')} € = <strong>{eur(c.exento)}</strong></>
            : <>Límite: {eur(limiteDia(d))} al día × {c.dias} = <strong>{eur(Math.round(c.limiteDia * c.dias * 100) / 100)}</strong></>}
          {titular ? <> · Deducible <strong>{eur(c.deducible)}</strong> (base {eur(c.base)} + IVA {c.ivaPct} %)</> : <> · Gasto {eur(c.base)}</>}
          {c.exceso > 0 && <span className="rojo"> · {titular ? `${eur(c.exceso)} no deducible` : `${eur(c.exceso)} de más: va en su nómina con retención`}</span>}
        </p>
      )}
      {c?.error && <p className="nota">{c.error}</p>}
      {msg && <p className={msg.startsWith('✓') ? 'nota' : 'error'}>{msg}</p>}
      <button className="boton">Apuntar como gasto</button>
      <p className="nota dieta-norma">Importes de 2026: {String(KM).replace('.', ',')} €/km; comidas 26,67 € al día (53,34 € con noche) en España y 48,08 € (91,35 €) en el extranjero. Art. 9 del Reglamento del IRPF; para el autónomo, art. 30.2.5ª de la Ley. Guarda los justificantes del viaje.</p>
    </form>
  );
}
