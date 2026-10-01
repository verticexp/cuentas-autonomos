'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import Deslizable from './Deslizable';

export default function FormGasto({ hoy, gasto, actividades }) {
  const router = useRouter();
  const vacio = { fecha: hoy, actividad: actividades[0].id, concepto: '', base: '', ivaPct: 21 };
  const [g, setG] = useState(gasto ? { ...gasto, base: String(gasto.base).replace('.', ',') } : vacio);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k, v) => setG((x) => ({ ...x, [k]: v }));

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      await llamar('/api/gastos', { method: gasto ? 'PATCH' : 'POST', body: JSON.stringify(g) });
      if (gasto) { router.push('/gastos'); router.refresh(); return; }
      setG(vacio);
      router.refresh();
    } catch (err) { setError(err.message); }
    setEnviando(false);
  };

  return (
    <form className="formulario tarjeta" onSubmit={enviar}>
      <h3>{gasto ? 'Editar gasto' : 'Añadir gasto deducible'}</h3>
      {actividades.length > 1 && <Deslizable className={`tipo ${actividades.length === 2 ? 'dos' : 'varias'}`}>
        {actividades.map(({ id, nombre }) => (
          <button type="button" key={id} className={g.actividad === id ? 'activo' : ''} onClick={() => poner('actividad', id)}>{nombre}</button>
        ))}
      </Deslizable>}
      <input className="campo" placeholder="Concepto" value={g.concepto} onChange={(e) => poner('concepto', e.target.value)} required />
      <div className="dos-col">
        <input className="campo" inputMode="decimal" placeholder="Base sin IVA" value={g.base} onChange={(e) => poner('base', e.target.value)} required />
        <select className="campo" value={g.ivaPct} onChange={(e) => poner('ivaPct', Number(e.target.value))}>
          {[21, 10, 4, 0].map((n) => <option key={n} value={n}>IVA {n}%</option>)}
        </select>
      </div>
      <input className="campo" type="date" value={g.fecha} onChange={(e) => poner('fecha', e.target.value)} required />
      {error && <p className="error">{error}</p>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : gasto ? 'Guardar cambios' : 'Añadir'}</button>
    </form>
  );
}
