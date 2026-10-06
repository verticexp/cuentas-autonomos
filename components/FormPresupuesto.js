'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import Deslizable from './Deslizable';
import { baseLinea, importes, leerImporte } from '@/lib/calculos';
import '@/app/lineas.css';
import { eur } from '@/lib/formato';

const VACIO = { nombre: '', nif: '', direccion: '', ciudad: '' };
const aTexto = (n) => String(n ?? '').replace('.', ',');
const lineaVacia = () => ({ concepto: '', cantidad: '1', precio: '' });
// Los presupuestos antiguos tienen un solo concepto con su base: pasan a ser una línea.
const lineasDe = (x) => (x.lineas?.length
  ? x.lineas.map((l) => ({ concepto: l.concepto, cantidad: aTexto(l.cantidad), precio: aTexto(l.precio) }))
  : [{ concepto: x.concepto || '', cantidad: '1', precio: aTexto(x.base) }]);

export default function FormPresupuesto({ presupuesto, clientes, actividades, hoy, numero }) {
  const router = useRouter();
  const nuevo = !presupuesto;
  const defecto = (id) => { const a = actividades.find((x) => x.id === id) || actividades[0]; return { ivaPct: a.ivaPct, irpfPct: a.irpfPct }; };
  const [p, setP] = useState(() => presupuesto
    ? { ...presupuesto, lineas: lineasDe(presupuesto) }
    : { actividad: actividades[0].id, fecha: hoy, cliente: VACIO, lineas: [lineaVacia()], nota: '', evento: { fecha: '', lugar: '' }, senalPct: 30, validez: 15, ...defecto(actividades[0].id) });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const ponerCliente = (k, v) => poner('cliente', { ...p.cliente, [k]: v });
  const elegido = clientes.find((x) => x.nombre.toUpperCase() === p.cliente.nombre.trim().toUpperCase())?.id || '';
  const elegirCliente = (id) => { const c = clientes.find((x) => x.id === id); poner('cliente', c ? { nombre: c.nombre, nif: c.nif, direccion: c.direccion, ciudad: c.ciudad } : VACIO); };
  const ponerLinea = (i, k, v) => setP((x) => ({ ...x, lineas: x.lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const quitarLinea = (i) => setP((x) => ({ ...x, lineas: x.lineas.filter((_, j) => j !== i) }));
  const anadirLinea = () => setP((x) => ({ ...x, lineas: [...x.lineas, lineaVacia()] }));
  const nums = p.lineas.map((l) => ({ cantidad: leerImporte(l.cantidad) || 0, precio: leerImporte(l.precio) || 0 }));
  const base = Math.round(nums.reduce((s, l) => s + baseLinea(l), 0) * 100) / 100;
  const t = importes({ base, ivaPct: Number(p.ivaPct), irpfPct: Number(p.irpfPct) });

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      const d = await llamar('/api/presupuestos', { method: nuevo ? 'POST' : 'PATCH', body: JSON.stringify({ ...p, lineas: p.lineas.map((l) => ({ ...l, ivaPct: p.ivaPct })) }) });
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
      <div className="dos-col">
        <label>Fecha del evento<input className="campo" type="date" value={p.evento?.fecha || ''} onChange={(e) => poner('evento', { ...p.evento, fecha: e.target.value })} /></label>
        <label>Lugar<input className="campo" placeholder="Hotel Arts" value={p.evento?.lugar || ''} onChange={(e) => poner('evento', { ...p.evento, lugar: e.target.value })} /></label>
      </div>
      <fieldset className="lineas">
        <legend>Conceptos</legend>
        {p.lineas.map((l, i) => (
          <div className="linea" key={i}>
            <div className="linea-cab">
              <input className="campo" placeholder={i ? 'Concepto' : 'Sonido e iluminación para boda'} aria-label="Concepto" value={l.concepto} onChange={(e) => ponerLinea(i, 'concepto', e.target.value)} required />
              {p.lineas.length > 1 && <button type="button" className="linea-quitar" aria-label="Quitar concepto" onClick={() => quitarLinea(i)}>×</button>}
            </div>
            <div className="linea-nums dos">
              <label>Cantidad<input className="campo" inputMode="decimal" value={l.cantidad} onChange={(e) => ponerLinea(i, 'cantidad', e.target.value)} /></label>
              <label>Precio (sin IVA)<input className="campo" inputMode="decimal" placeholder="0,00" value={l.precio} onChange={(e) => ponerLinea(i, 'precio', e.target.value)} required /></label>
            </div>
            {p.lineas.length > 1 && <p className="linea-total">{eur(baseLinea(nums[i]))}</p>}
          </div>
        ))}
        <button type="button" className="boton sec" onClick={anadirLinea}>+ Añadir otro concepto</button>
      </fieldset>
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
        <span>Base {eur(t.base)}</span><span>IVA {eur(t.iva)}</span>{t.irpf > 0 && <span>IRPF −{eur(t.irpf)}</span>}<strong>Total {eur(t.total)}</strong>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : nuevo ? 'Crear presupuesto' : 'Guardar cambios'}</button>
    </form>
  );
}
