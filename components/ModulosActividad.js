'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';

// Datos de módulos de una actividad para un año (lib/estimacionObjetiva.js): lo que sale de la Orden de módulos con los
// datos-base a 1 de enero. Con ellos Fisquo calcula el 131 y, en el régimen simplificado, el IVA de cada trimestre.
const TIPOS = [
  ['datos', 'Con signos, índices y módulos'],
  ['sinDatos', 'Sin poder determinar los datos-base (2 % de lo que ingresas)'],
  ['agricola', 'Agrícola, ganadera o forestal (2 % de lo que ingresas)'],
];
const texto = (v) => (v === undefined || v === null ? '' : String(v).replace('.', ','));

export default function ModulosActividad({ anio, actividad, nombre, datos, simplificado = false, soloLectura = false }) {
  const router = useRouter();
  const [d, setD] = useState({ tipo: datos?.tipo || 'datos', rendimiento: texto(datos?.rendimiento), asalariados: texto(datos?.asalariados ?? 0), joven: Boolean(datos?.joven), cuota: texto(datos?.iva?.cuota), ingreso: texto(datos?.iva?.ingreso), minima: texto(datos?.iva?.minima) });
  const [msg, setMsg] = useState('');
  const poner = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const guardar = async (e) => {
    e.preventDefault(); setMsg('');
    const cuerpo = { tipo: d.tipo, ...(d.tipo === 'datos' ? { rendimiento: d.rendimiento, asalariados: d.asalariados || '0' } : {}), ...(d.tipo === 'agricola' && d.joven ? { joven: true } : {}), ...(simplificado ? { iva: { cuota: d.cuota, ingreso: d.ingreso, minima: d.minima || '0' } } : {}) };
    try { await llamar('/api/cuenta', { method: 'PATCH', body: JSON.stringify({ modulos: { anio, actividad, datos: cuerpo } }) }); setMsg('Guardado'); router.refresh(); } catch (err) { setMsg(err.message); }
  };
  if (soloLectura) {
    return <p className="nota"><strong>{nombre}</strong>: {datos ? `${TIPOS.find(([k]) => k === datos.tipo)?.[1]}${datos.tipo === 'datos' ? ` · rendimiento neto ${texto(datos.rendimiento)} € · personal asalariado ${texto(datos.asalariados)}` : ''}` : 'sin datos de módulos'}. Lo cambia quien tiene el permiso «Contabilidad».</p>;
  }
  return (
    <form className="formulario tarjeta bloque modulos-actividad" onSubmit={guardar}>
      <p><strong>{nombre}</strong> · {anio}</p>
      <label>Tipo de actividad
        <select className="campo" value={d.tipo} onChange={(e) => poner('tipo', e.target.value)}>
          {TIPOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </label>
      {d.tipo === 'datos' && (
        <div className="dos-col">
          <label>Rendimiento neto anual (de la Orden de módulos)<input className="campo" inputMode="decimal" value={d.rendimiento} onChange={(e) => poner('rendimiento', e.target.value)} placeholder="12.500,00" /></label>
          <label>Personal asalariado (unidades)<input className="campo" inputMode="decimal" value={d.asalariados} onChange={(e) => poner('asalariados', e.target.value)} placeholder="0" /></label>
        </div>
      )}
      {d.tipo === 'agricola' && <label className="check"><input type="checkbox" checked={d.joven} onChange={(e) => poner('joven', e.target.checked)} /> Agricultor joven o asalariado agrario con los requisitos de la disposición adicional sexta del Reglamento (25 % menos)</label>}
      {simplificado && (
        <>
          <p className="nota">IVA en el régimen simplificado, con los datos de la Orden para tu actividad:</p>
          <div className="dos-col">
            <label>Cuota anual devengada por operaciones corrientes<input className="campo" inputMode="decimal" value={d.cuota} onChange={(e) => poner('cuota', e.target.value)} placeholder="3.000,00" /></label>
            <label>Ingresos a cuenta (% de la cuota)<input className="campo" inputMode="decimal" value={d.ingreso} onChange={(e) => poner('ingreso', e.target.value)} placeholder="6" /></label>
          </div>
          <label>Cuota mínima (% de la cuota devengada)<input className="campo" inputMode="decimal" value={d.minima} onChange={(e) => poner('minima', e.target.value)} placeholder="20" /></label>
        </>
      )}
      <div className="fila-act"><button className="boton sec pequeno">Guardar</button>{msg && <span className={msg === 'Guardado' ? 'nota' : 'error'} role="status">{msg}</span>}</div>
    </form>
  );
}
