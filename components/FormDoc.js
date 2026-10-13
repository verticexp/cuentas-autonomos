'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { navegar } from '@/lib/transicion';
import { baseLinea, leerImporte, r2 } from '@/lib/calculos';
import { eur } from '@/lib/formato';
import '@/app/lineas.css';
import '@/app/catalogo.css';

const aTexto = (n) => String(n ?? '').replace('.', ',');
const numero = (v) => leerImporte(v) || 0;
const lineaVacia = (ivaPct) => ({ concepto: '', cantidad: '1', precio: '', dto: '', ivaPct });
const NOMBRE = { pedido: 'pedido', albaran: 'albarán' };

// Pedido de un cliente o albarán de entrega: cliente y líneas (del catálogo, para el stock). El albarán resta el stock al
// guardarlo; luego uno o varios albaranes se agrupan en una factura.
export default function FormDoc({ tipo, doc = null, plantilla = null, clientes = [], productos = [], stock = null, hoy, ivaPct = 21, numero: num }) {
  const router = useRouter();
  const base = doc || plantilla;
  const [x, setX] = useState(() => ({
    fecha: doc?.fecha || hoy,
    entrega: doc?.entrega || '',
    cliente: base?.cliente || { nombre: '', nif: '', direccion: '', ciudad: '', email: '' },
    lineas: base?.lineas?.length ? base.lineas.map((l) => ({ ...l, cantidad: aTexto(l.cantidad), precio: aTexto(l.precio), dto: l.dto ? aTexto(l.dto) : '' })) : [lineaVacia(ivaPct)],
    nota: doc?.nota || '',
    pedido: base?.pedido || '',
  }));
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k, v) => setX((y) => ({ ...y, [k]: v }));
  const ponerCliente = (k, v) => poner('cliente', { ...x.cliente, [k]: v });
  const ponerLinea = (i, k, v) => setX((y) => ({ ...y, lineas: y.lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const elegido = clientes.find((c) => c.nombre.toUpperCase() === x.cliente.nombre.trim().toUpperCase())?.id || '';
  const elegirCliente = (id) => { const c = clientes.find((y) => y.id === id); poner('cliente', c ? { nombre: c.nombre, nif: c.nif || '', direccion: c.direccion || '', ciudad: c.ciudad || '', email: c.email || '' } : { nombre: '', nif: '', direccion: '', ciudad: '', email: '' }); };
  const delCatalogo = (p) => setX((y) => {
    const l = { concepto: p.nombre, cantidad: '1', precio: aTexto(p.precio), dto: '', ivaPct: p.ivaPct, producto: p.id };
    const ult = y.lineas.at(-1);
    return { ...y, lineas: ult && !ult.concepto && !ult.precio ? [...y.lineas.slice(0, -1), l] : [...y.lineas, l] };
  });
  const nums = x.lineas.map((l) => ({ cantidad: numero(l.cantidad), precio: numero(l.precio), dto: Number(String(l.dto).replace(',', '.')) || 0 }));
  const total = r2(nums.reduce((s, l) => s + baseLinea(l), 0));

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      const d = await llamar('/api/albaranes', { method: 'POST', body: JSON.stringify({ ...x, tipo, id: doc?.id }) });
      navegar(router, `/albaranes/${d.doc.id}`, 'fundido');
      router.refresh();
    } catch (err) { setError(err.message); setEnviando(false); }
  };

  return (
    <form className="formulario" onSubmit={enviar}>
      {num && <p className="rotulo">{doc ? `${tipo === 'pedido' ? 'Pedido' : 'Albarán'} ${num}` : `Se numerará como ${num}`}</p>}
      <div className="dos-col">
        <label>Fecha<input className="campo" type="date" value={x.fecha} onChange={(e) => poner('fecha', e.target.value)} required /></label>
        {tipo === 'pedido' && <label>Entrega prevista (opcional)<input className="campo" type="date" value={x.entrega} onChange={(e) => poner('entrega', e.target.value)} /></label>}
      </div>
      <fieldset disabled={Boolean(x.pedido) && tipo === 'albaran'}>
        <legend>Cliente</legend>
        {!x.pedido && <select className="campo" value={elegido} onChange={(e) => elegirCliente(e.target.value)}>
          <option value="">+ Cliente nuevo</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>}
        <input className="campo" placeholder="Razón social" value={x.cliente.nombre} onChange={(e) => ponerCliente('nombre', e.target.value)} required />
        <input className="campo" placeholder="NIF / CIF" value={x.cliente.nif} onChange={(e) => ponerCliente('nif', e.target.value)} />
        <input className="campo" placeholder="Dirección de entrega" value={x.cliente.direccion} onChange={(e) => ponerCliente('direccion', e.target.value)} />
        <input className="campo" placeholder="Ciudad y CP" value={x.cliente.ciudad} onChange={(e) => ponerCliente('ciudad', e.target.value)} />
      </fieldset>
      <fieldset className="lineas">
        <legend>Productos</legend>
        {x.lineas.map((l, i) => {
          const queda = stock && l.producto ? stock[l.producto] : undefined;
          return (
            <div className="linea" key={i}>
              <div className="linea-cab">
                <input className="campo" placeholder="Concepto" aria-label="Concepto" value={l.concepto} onChange={(e) => ponerLinea(i, 'concepto', e.target.value)} required />
                {x.lineas.length > 1 && <button type="button" className="linea-quitar" aria-label="Quitar línea" onClick={() => poner('lineas', x.lineas.filter((_, j) => j !== i))}>×</button>}
              </div>
              <div className="linea-nums">
                <label>Cantidad<input className="campo" inputMode="decimal" value={l.cantidad} onChange={(e) => ponerLinea(i, 'cantidad', e.target.value)} /></label>
                <label>Precio<input className="campo" inputMode="decimal" placeholder="0,00" value={l.precio} onChange={(e) => ponerLinea(i, 'precio', e.target.value)} /></label>
                <label>Dto. %<input className="campo" inputMode="decimal" placeholder="0" value={l.dto} onChange={(e) => ponerLinea(i, 'dto', e.target.value)} /></label>
                <label>IVA<select className="campo" value={l.ivaPct} onChange={(e) => ponerLinea(i, 'ivaPct', Number(e.target.value))}>{[...new Set([21, 10, 4, 0, Number(l.ivaPct)])].map((n) => <option key={n} value={n}>{n}%</option>)}</select></label>
              </div>
              <p className="linea-total">{queda !== undefined && tipo === 'albaran' && <span className={`linea-stock${queda < nums[i].cantidad ? ' falta' : ''}`}>{queda < nums[i].cantidad ? `Solo quedan ${queda}` : `Quedan ${queda}`}</span>}{eur(baseLinea(nums[i]))}</p>
            </div>
          );
        })}
        {!x.pedido && productos.length > 0 && <div className="catalogo-chips" aria-label="Añadir del catálogo">{productos.map((p) => <button type="button" key={p.id} onClick={() => delCatalogo(p)}>+ {p.nombre}</button>)}</div>}
        {!x.pedido && <button type="button" className="boton sec" onClick={() => poner('lineas', [...x.lineas, lineaVacia(x.lineas.at(-1)?.ivaPct ?? ivaPct)])}>+ Añadir otra línea</button>}
      </fieldset>
      <label>Nota (opcional)<input className="campo" value={x.nota} onChange={(e) => poner('nota', e.target.value)} placeholder={tipo === 'albaran' ? 'Ej.: entregado a Marta en recepción' : 'Ej.: entregar por la mañana'} /></label>
      <div className="totales"><strong>Total sin IVA {eur(total)}</strong></div>
      {error && <p className="error">{error}</p>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : doc ? 'Guardar cambios' : `Crear ${NOMBRE[tipo]}`}</button>
    </form>
  );
}
