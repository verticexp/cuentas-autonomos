'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import Deslizable from './Deslizable';
import { importes, leerImporte, numeroFactura } from '@/lib/calculos';
import { eur } from '@/lib/formato';


export default function FormFactura({ factura, clientes, numeros, hoy, rectifica: orig, plantilla, actividades }) {
  // IVA y retención de cada actividad, para rellenar la factura nueva.
  const defecto = (id) => { const a = actividades.find((x) => x.id === id) || actividades[0]; return { ivaPct: a.ivaPct, irpfPct: a.irpfPct }; };
  const router = useRouter();
  const nueva = !factura;
  const [f, setF] = useState(() => factura
    ? { ...factura, base: String(factura.base).replace('.', ',') }
    : orig
      ? { actividad: orig.actividad, fecha: hoy, cliente: orig.cliente, concepto: `Anulación de la factura ${numeroFactura(orig)}`, base: String(-orig.base).replace('.', ','), ivaPct: orig.ivaPct, irpfPct: orig.irpfPct, nota: '', cobrada: false, rectifica: orig.id }
      : plantilla
        ? { actividad: plantilla.actividad, fecha: hoy, cliente: plantilla.cliente, concepto: plantilla.concepto, base: String(plantilla.base).replace('.', ','), ivaPct: plantilla.ivaPct, irpfPct: plantilla.irpfPct, nota: plantilla.nota || '', cobrada: false }
      : { actividad: actividades[0].id, fecha: hoy, cliente: { nombre: '', nif: '', direccion: '', ciudad: '' }, concepto: '', base: '', nota: '', cobrada: false, ...defecto(actividades[0].id) });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const ponerCliente = (k, v) => poner('cliente', { ...f.cliente, [k]: v });
  const ordenados = [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const elegido = clientes.find((x) => x.nombre.toUpperCase() === f.cliente.nombre.trim().toUpperCase())?.id || '';
  const elegirCliente = (id) => {
    const c = clientes.find((x) => x.id === id);
    poner('cliente', c ? { nombre: c.nombre, nif: c.nif, direccion: c.direccion, ciudad: c.ciudad } : { nombre: '', nif: '', direccion: '', ciudad: '' });
  };
  const cambiarActividad = (a) => setF((x) => ({ ...x, actividad: a, ...(nueva && !orig ? defecto(a) : {}) }));

  const base = leerImporte(f.base) || 0;
  const t = importes({ base, ivaPct: Number(f.ivaPct), irpfPct: Number(f.irpfPct) });

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      const d = await llamar('/api/facturas', { method: nueva ? 'POST' : 'PATCH', body: JSON.stringify(f) });
      router.push(`/facturas/${nueva ? d.factura.id : f.id}`);
      router.refresh();
    } catch (err) { setError(err.message); setEnviando(false); }
  };

  return (
    <form className="formulario" onSubmit={enviar}>
      <p className="rotulo">{nueva ? `Se numerará como ${numeros[f.actividad]}` : `Factura ${numeroFactura(f)}`}{orig ? ` · rectifica la ${numeroFactura(orig)} (pon el importe que corrige; en negativo si anula)` : ''}</p>
      {actividades.length > 1 && <Deslizable className={`tipo ${actividades.length === 2 ? 'dos' : 'varias'}`}>
        {actividades.map(({ id, nombre }) => (
          <button type="button" key={id} className={f.actividad === id ? 'activo' : ''} onClick={() => cambiarActividad(id)}>{nombre}</button>
        ))}
      </Deslizable>}

      <label>Fecha<input className="campo" type="date" value={f.fecha} onChange={(e) => poner('fecha', e.target.value)} required /></label>

      <fieldset>
        <legend>Cliente</legend>
        <select className="campo" value={elegido} onChange={(e) => elegirCliente(e.target.value)}>
          <option value="">+ Cliente nuevo</option>
          {ordenados.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input className="campo" placeholder="Razón social" value={f.cliente.nombre} onChange={(e) => ponerCliente('nombre', e.target.value)} required />
        <input className="campo" placeholder="NIF / CIF" value={f.cliente.nif} onChange={(e) => ponerCliente('nif', e.target.value)} />
        <input className="campo" placeholder="Dirección" value={f.cliente.direccion} onChange={(e) => ponerCliente('direccion', e.target.value)} />
        <input className="campo" placeholder="Ciudad y CP" value={f.cliente.ciudad} onChange={(e) => ponerCliente('ciudad', e.target.value)} />
      </fieldset>

      <label>Concepto<input className="campo" placeholder="Bolos DJ mayo" value={f.concepto} onChange={(e) => poner('concepto', e.target.value)} /></label>
      <div className="dos-col">
        <label>Fecha del evento (opcional)<input className="campo" type="date" value={f.evento?.fecha || ''} onChange={(e) => poner('evento', { ...f.evento, fecha: e.target.value })} /></label>
        <label>Lugar (opcional)<input className="campo" placeholder="Hotel Arts" value={f.evento?.lugar || ''} onChange={(e) => poner('evento', { ...f.evento, lugar: e.target.value })} /></label>
      </div>
      <label>Base (sin IVA)<input className="campo" inputMode="decimal" placeholder="0,00" value={f.base} onChange={(e) => poner('base', e.target.value)} required /></label>

      <div className="dos-col">
        <label>IVA
          <select className="campo" value={f.ivaPct} onChange={(e) => poner('ivaPct', Number(e.target.value))}>
            {[21, 10, 0].map((n) => <option key={n} value={n}>{n}%</option>)}
          </select>
        </label>
        <label>IRPF
          <select className="campo" value={f.irpfPct} onChange={(e) => poner('irpfPct', Number(e.target.value))}>
            {[15, 7, 0].map((n) => <option key={n} value={n}>{n}%</option>)}
          </select>
        </label>
      </div>

      <label>Nota en la factura (opcional)
        <input className="campo" placeholder="Ej.: operación exenta de IVA, inversión del sujeto pasivo" value={f.nota || ''} onChange={(e) => poner('nota', e.target.value)} />
      </label>

      <label className="check"><input type="checkbox" checked={f.cobrada} onChange={(e) => poner('cobrada', e.target.checked)} /> Ya está cobrada</label>

      <div className="totales">
        <span>IVA {eur(t.iva)}</span><span>IRPF −{eur(t.irpf)}</span><strong>Total {eur(t.total)}</strong>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : nueva ? 'Crear factura' : 'Guardar cambios'}</button>
    </form>
  );
}
