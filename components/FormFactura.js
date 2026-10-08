'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { navegar } from '@/lib/transicion';
import Deslizable from './Deslizable';
import { baseLinea, desglose, importes, leerImporte, numeroFactura, r2 } from '@/lib/calculos';
import '@/app/lineas.css';
import '@/app/catalogo.css';
import { eur } from '@/lib/formato';

const aTexto = (n) => String(n ?? '').replace('.', ',');
const lineaVacia = (ivaPct) => ({ concepto: '', cantidad: '1', precio: '', dto: '', ivaPct });
// Las facturas antiguas (una base, un IVA) se abren como una sola línea.
const lineasDe = (x) => (x.lineas?.length
  ? x.lineas.map((l) => ({ concepto: l.concepto, cantidad: aTexto(l.cantidad), precio: aTexto(l.precio), dto: l.dto ? aTexto(l.dto) : '', ivaPct: l.ivaPct }))
  : [{ concepto: x.concepto || '', cantidad: '1', precio: aTexto(x.base), dto: '', ivaPct: x.ivaPct }]);
const numero = (v) => leerImporte(v) || 0;

export default function FormFactura({ factura, clientes, numeros, hoy, rectifica: orig, plantilla, actividades, productos = [] }) {
  // IVA y retención de cada actividad, para rellenar la factura nueva.
  const defecto = (id) => { const a = actividades.find((x) => x.id === id) || actividades[0]; return { ivaPct: a.ivaPct, irpfPct: a.irpfPct }; };
  const router = useRouter();
  const nueva = !factura;
  const [f, setF] = useState(() => factura
    ? { ...factura, lineas: lineasDe(factura) }
    : orig
      ? { actividad: orig.actividad, fecha: hoy, cliente: orig.cliente, irpfPct: orig.irpfPct, nota: '', cobrada: false, rectifica: orig.id,
        lineas: orig.lineas?.length
          ? lineasDe(orig).map((l) => ({ ...l, precio: aTexto(-numero(l.precio)) }))
          : [{ concepto: `Anulación de la factura ${numeroFactura(orig)}`, cantidad: '1', precio: aTexto(-orig.base), dto: '', ivaPct: orig.ivaPct }] }
      : plantilla
        ? { actividad: plantilla.actividad, fecha: hoy, cliente: plantilla.cliente, lineas: lineasDe(plantilla), irpfPct: plantilla.irpfPct, nota: plantilla.nota || '', cobrada: false }
      : { actividad: actividades[0].id, fecha: hoy, cliente: { nombre: '', nif: '', direccion: '', ciudad: '' }, lineas: [lineaVacia(defecto(actividades[0].id).ivaPct)], nota: '', cobrada: false, irpfPct: defecto(actividades[0].id).irpfPct });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const poner = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const ponerCliente = (k, v) => poner('cliente', { ...f.cliente, [k]: v });
  const ordenados = [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const elegido = clientes.find((x) => x.nombre.toUpperCase() === f.cliente.nombre.trim().toUpperCase())?.id || '';
  const elegirCliente = (id) => {
    const c = clientes.find((x) => x.id === id);
    poner('cliente', c ? { nombre: c.nombre, nif: c.nif, direccion: c.direccion, ciudad: c.ciudad, email: c.email || '' } : { nombre: '', nif: '', direccion: '', ciudad: '' });
  };
  const cambiarActividad = (a) => setF((x) => (nueva && !orig
    ? { ...x, actividad: a, irpfPct: defecto(a).irpfPct, lineas: x.lineas.map((l) => ({ ...l, ivaPct: defecto(a).ivaPct })) }
    : { ...x, actividad: a }));
  const ponerLinea = (i, k, v) => setF((x) => ({ ...x, lineas: x.lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const quitarLinea = (i) => setF((x) => ({ ...x, lineas: x.lineas.filter((_, j) => j !== i) }));
  // Del catálogo: rellena la última línea si está vacía; si no, añade una.
  const delCatalogo = (p) => setF((x) => {
    const l = { concepto: p.nombre, cantidad: '1', precio: aTexto(p.precio), dto: '', ivaPct: p.ivaPct };
    const ult = x.lineas.at(-1);
    return { ...x, lineas: ult && !ult.concepto && !ult.precio ? [...x.lineas.slice(0, -1), l] : [...x.lineas, l] };
  });
  const anadirLinea = () => setF((x) => ({ ...x, lineas: [...x.lineas, lineaVacia(x.lineas.at(-1)?.ivaPct ?? defecto(x.actividad).ivaPct)] }));

  const nums = f.lineas.map((l) => ({ cantidad: numero(l.cantidad), precio: numero(l.precio), dto: Number(String(l.dto).replace(',', '.')) || 0, ivaPct: Number(l.ivaPct) }));
  const base = r2(nums.reduce((s, l) => s + baseLinea(l), 0));
  const t = importes({ base, lineas: nums, irpfPct: Number(f.irpfPct) });
  const tipos = desglose({ lineas: nums });

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      const d = await llamar('/api/facturas', { method: nueva ? 'POST' : 'PATCH', body: JSON.stringify(f) });
      if (nueva) navegar(router, `/facturas/${d.factura.id}`, 'fundido');
      router.refresh();
    } catch (err) { setError(err.message); setEnviando(false); }
  };

  return (
    <form className="formulario ff" onSubmit={enviar}>
      <div className="ff-campos">
      <p className="rotulo">{nueva ? `Se numerará como ${numeros[f.actividad]}` : `Factura ${numeroFactura(f)}`}{orig ? ` · rectifica la ${numeroFactura(orig)} (pon el importe que corrige: en negativo si anula)` : ''}</p>
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
        <input className="campo" type="email" placeholder="Email (para enviarle la factura)" value={f.cliente.email || ''} onChange={(e) => ponerCliente('email', e.target.value)} />
      </fieldset>

      <div className="dos-col">
        <label>Fecha del evento (opcional)<input className="campo" type="date" value={f.evento?.fecha || ''} onChange={(e) => poner('evento', { ...f.evento, fecha: e.target.value })} /></label>
        <label>Lugar (opcional)<input className="campo" placeholder="Hotel Arts" value={f.evento?.lugar || ''} onChange={(e) => poner('evento', { ...f.evento, lugar: e.target.value })} /></label>
      </div>
      <fieldset className="lineas">
        <legend>Conceptos</legend>
        {f.lineas.map((l, i) => (
          <div className="linea" key={i}>
            <div className="linea-cab">
              <input className="campo" placeholder={i ? 'Concepto' : 'Bolo DJ boda'} aria-label="Concepto" value={l.concepto} onChange={(e) => ponerLinea(i, 'concepto', e.target.value)} required />
              {f.lineas.length > 1 && <button type="button" className="linea-quitar" aria-label="Quitar línea" onClick={() => quitarLinea(i)}>×</button>}
            </div>
            <div className="linea-nums">
              <label>Cantidad<input className="campo" inputMode="decimal" value={l.cantidad} onChange={(e) => ponerLinea(i, 'cantidad', e.target.value)} /></label>
              <label>Precio<input className="campo" inputMode="decimal" placeholder="0,00" value={l.precio} onChange={(e) => ponerLinea(i, 'precio', e.target.value)} /></label>
              <label>Dto. %<input className="campo" inputMode="decimal" placeholder="0" value={l.dto} onChange={(e) => ponerLinea(i, 'dto', e.target.value)} /></label>
              <label>IVA
                <select className="campo" value={l.ivaPct} onChange={(e) => ponerLinea(i, 'ivaPct', Number(e.target.value))}>
                  {[...new Set([21, 10, 4, 0, Number(l.ivaPct)])].map((n) => <option key={n} value={n}>{n}%</option>)}
                </select>
              </label>
            </div>
            <p className="linea-total">{eur(baseLinea(nums[i]))}</p>
          </div>
        ))}
        {productos.length > 0 && <div className="catalogo-chips" aria-label="Añadir del catálogo">{productos.map((p) => <button type="button" key={p.id} onClick={() => delCatalogo(p)}>+ {p.nombre}</button>)}</div>}
        <button type="button" className="boton sec" onClick={anadirLinea}>+ Añadir otro concepto</button>
      </fieldset>

      <label>IRPF
        <select className="campo" value={f.irpfPct} onChange={(e) => poner('irpfPct', Number(e.target.value))}>
          {[...new Set([15, 7, 0, Number(f.irpfPct) || 0])].map((n) => <option key={n} value={n}>{n}%</option>)}
        </select>
      </label>

      <label>Nota en la factura (opcional)
        <input className="campo" placeholder="Ej.: operación exenta de IVA, inversión del sujeto pasivo" value={f.nota || ''} onChange={(e) => poner('nota', e.target.value)} />
      </label>

      <label className="check"><input type="checkbox" checked={f.cobrada} onChange={(e) => poner('cobrada', e.target.checked)} /> Ya está cobrada</label>

      <div className="totales">
        <span>Base {eur(t.base)}</span>{tipos.length > 1 ? tipos.map((x) => <span key={x.pct}>IVA {x.pct}% {eur(x.iva)}</span>) : <span>IVA {eur(t.iva)}</span>}<span>IRPF −{eur(t.irpf)}</span><strong>Total {eur(t.total)}</strong>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : nueva ? 'Crear factura' : 'Guardar cambios'}</button>
      </div>

      {/* En el ordenador, la factura se va dibujando al lado mientras se rellena */}
      <aside className="ff-vista" aria-label="Vista previa">
        <div className="ff-papel">
          <div className="ff-papel-cab"><b>Factura {nueva ? numeros[f.actividad] : numeroFactura(f)}</b><small>{f.fecha ? new Date(`${f.fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</small></div>
          <div className="ff-para"><small>Para</small><b>{f.cliente.nombre || 'Tu cliente'}</b>{f.cliente.nif && <small>{f.cliente.nif}</small>}</div>
          <ul className="ff-lineas">
            {f.lineas.map((l, i) => (
              <li key={i}><span>{l.concepto || 'Concepto'}<small>{aTexto(nums[i].cantidad)} × {eur(nums[i].precio)}{nums[i].dto ? ` · −${aTexto(nums[i].dto)} %` : ''}</small></span><b>{eur(baseLinea(nums[i]))}</b></li>
            ))}
          </ul>
          <dl className="ff-tot">
            <div><dt>Base</dt><dd>{eur(t.base)}</dd></div>
            {tipos.length > 1 ? tipos.map((x) => <div key={x.pct}><dt>IVA {x.pct} %</dt><dd>{eur(x.iva)}</dd></div>) : <div><dt>IVA</dt><dd>{eur(t.iva)}</dd></div>}
            {Number(f.irpfPct) > 0 && <div><dt>IRPF {f.irpfPct} %</dt><dd>−{eur(t.irpf)}</dd></div>}
          </dl>
          <p className="ff-total"><span>Total</span><b key={t.total}>{eur(t.total)}</b></p>
          {f.cobrada && <span className="estado-txt e-cobrada">Cobrada</span>}
        </div>
      </aside>
    </form>
  );
}
