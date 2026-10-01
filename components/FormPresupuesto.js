'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import Deslizable from './Deslizable';
import { importes, leerImporte } from '@/lib/calculos';
import { eur } from '@/lib/formato';

const VACIO = { nombre: '', nif: '', direccion: '', ciudad: '' };

export default function FormPresupuesto({ presupuesto, clientes, actividades, hoy, numero }) {
  const router = useRouter();
  const nuevo = !presupuesto;
  const defecto = (id) => { const a = actividades.find((x) => x.id === id) || actividades[0]; return { ivaPct: a.ivaPct, irpfPct: a.irpfPct }; };
  const [p, setP] = useState(() => presupuesto
    ? { ...presupuesto, base: String(presupuesto.base).replace('.', ',') }
    : { actividad: actividades[0].id, fecha: hoy, cliente: VACIO, concepto: '', base: '', nota: '', evento: { fecha: '', lugar: '' }, senalPct: 30, validez: 15, ...defecto(actividades[0].id) });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const ponerCliente = (k, v) => poner('cliente', { ...p.cliente, [k]: v });
  const elegido = clientes.find((x) => x.nombre.toUpperCase() === p.cliente.nombre.trim().toUpperCase())?.id || '';
  const elegirCliente = (id) => { const c = clientes.find((x) => x.id === id); poner('cliente', c ? { nombre: c.nombre, nif: c.nif, direccion: c.direccion, ciudad: c.ciudad } : VACIO); };
  const t = importes({ base: leerImporte(p.base) || 0, ivaPct: Number(p.ivaPct), irpfPct: Number(p.irpfPct) });

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      const d = await llamar('/api/presupuestos', { method: nuevo ? 'POST' : 'PATCH', body: JSON.stringify(p) });
      router.push(`/presupuestos/${nuevo ? d.presupuesto.id : p.id}`);
      router.refresh();
    } catch (err) { setError(err.message); setEnviando(false); }
  };

  return (
    <form className="formulario" onSubmit={enviar}>
      {nuevo && <p className="rotulo">Se numerará como {numero}</p>}
      {actividades.length > 1 && <Deslizable className={`tipo ${actividades.length === 2 ? 'dos' : 'varias'}`}>
        {actividades.map(({ id, nombre }) => (
          <button type="button" key={id} className={p.actividad === id ? 'activo' : ''} onClick={() => setP((x) => ({ ...x, actividad: id, ...(nuevo ? defecto(id) : {}) }))}>{nombre}</button>
        ))}
      </Deslizable>}
      <label>Fecha<input className="campo" type="date" value={p.fecha} onChange={(e) => poner('fecha', e.target.value)} required /></label>
      <fieldset>
        <legend>Cliente</legend>
        <select className="campo" value={elegido} onChange={(e) => elegirCliente(e.target.value)}>
          <option value="">+ Cliente nuevo</option>
          {[...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input className="campo" placeholder="Nombre o razón social" value={p.cliente.nombre} onChange={(e) => ponerCliente('nombre', e.target.value)} required />
        <input className="campo" placeholder="NIF / CIF" value={p.cliente.nif} onChange={(e) => ponerCliente('nif', e.target.value)} />
        <input className="campo" placeholder="Dirección" value={p.cliente.direccion} onChange={(e) => ponerCliente('direccion', e.target.value)} />
        <input className="campo" placeholder="Ciudad y CP" value={p.cliente.ciudad} onChange={(e) => ponerCliente('ciudad', e.target.value)} />
      </fieldset>
      <label>Concepto<input className="campo" placeholder="Sonido e iluminación para boda" value={p.concepto} onChange={(e) => poner('concepto', e.target.value)} required /></label>
      <div className="dos-col">
        <label>Fecha del evento<input className="campo" type="date" value={p.evento?.fecha || ''} onChange={(e) => poner('evento', { ...p.evento, fecha: e.target.value })} /></label>
        <label>Lugar<input className="campo" placeholder="Hotel Arts" value={p.evento?.lugar || ''} onChange={(e) => poner('evento', { ...p.evento, lugar: e.target.value })} /></label>
      </div>
      <label>Base (sin IVA)<input className="campo" inputMode="decimal" placeholder="0,00" value={p.base} onChange={(e) => poner('base', e.target.value)} required /></label>
      <div className="dos-col">
        <label>IVA
          <select className="campo" value={p.ivaPct} onChange={(e) => poner('ivaPct', Number(e.target.value))}>{[21, 10, 0].map((n) => <option key={n} value={n}>{n}%</option>)}</select>
        </label>
        <label>IRPF
          <select className="campo" value={p.irpfPct} onChange={(e) => poner('irpfPct', Number(e.target.value))}>{[15, 7, 0].map((n) => <option key={n} value={n}>{n}%</option>)}</select>
        </label>
      </div>
      <div className="dos-col">
        <label>Señal al aceptar
          <select className="campo" value={p.senalPct} onChange={(e) => poner('senalPct', Number(e.target.value))}>{[0, 20, 30, 50].map((n) => <option key={n} value={n}>{n ? `${n}%` : 'Sin señal'}</option>)}</select>
        </label>
        <label>Válido durante
          <select className="campo" value={p.validez} onChange={(e) => poner('validez', Number(e.target.value))}>{[7, 15, 30, 60].map((n) => <option key={n} value={n}>{n} días</option>)}</select>
        </label>
      </div>
      <label>Condiciones (opcional)<input className="campo" placeholder="Incluye montaje y desmontaje" value={p.nota || ''} onChange={(e) => poner('nota', e.target.value)} /></label>
      <div className="totales">
        <span>IVA {eur(t.iva)}</span>{t.irpf > 0 && <span>IRPF −{eur(t.irpf)}</span>}<strong>Total {eur(t.total)}</strong>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : nuevo ? 'Crear presupuesto' : 'Guardar cambios'}</button>
    </form>
  );
}
