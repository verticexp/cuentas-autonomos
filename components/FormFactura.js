'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { navegar } from '@/lib/transicion';
import Deslizable from './Deslizable';
import { baseLinea, desglose, importes, leerImporte, numeroFactura, r2 } from '@/lib/calculos';
import '@/app/lineas.css';
import '@/app/catalogo.css';
import { eur } from '@/lib/formato';
import { TIPOS_OPERACION } from '@/lib/operaciones';

const aTexto = (n) => String(n ?? '').replace('.', ',');
const lineaVacia = (ivaPct) => ({ concepto: '', cantidad: '1', precio: '', dto: '', ivaPct });
// Las facturas antiguas (una base, un IVA) se abren como una sola línea.
const lineasDe = (x) => (x.lineas?.length
  ? x.lineas.map((l) => ({ concepto: l.concepto, cantidad: aTexto(l.cantidad), precio: aTexto(l.precio), dto: l.dto ? aTexto(l.dto) : '', ivaPct: l.ivaPct, ...(l.producto ? { producto: l.producto } : {}), ...(l.albaran ? { albaran: l.albaran } : {}) }))
  : [{ concepto: x.concepto || '', cantidad: '1', precio: aTexto(x.base), dto: '', ivaPct: x.ivaPct }]);
const numero = (v) => leerImporte(v) || 0;

export default function FormFactura({ factura, clientes, numeros, hoy, rectifica: orig, plantilla, actividades, productos = [], stock = null, proyectos = [] }) {
  // IVA y retención de cada actividad, para rellenar la factura nueva.
  const defecto = (id) => { const a = actividades.find((x) => x.id === id) || actividades[0]; return { ivaPct: a.ivaPct, irpfPct: a.irpfPct }; };
  const router = useRouter();
  const nueva = !factura;
  const [f, setF] = useState(() => factura
    ? { ...factura, lineas: lineasDe(factura) }
    : orig
      ? { actividad: orig.actividad, fecha: hoy, cliente: orig.cliente, irpfPct: orig.irpfPct, nota: '', cobrada: false, rectifica: orig.id, proyecto: orig.proyecto || '',
        lineas: orig.lineas?.length
          ? lineasDe(orig).map((l) => ({ ...l, precio: aTexto(-numero(l.precio)) }))
          : [{ concepto: `Anulación de la factura ${numeroFactura(orig)}`, cantidad: '1', precio: aTexto(-orig.base), dto: '', ivaPct: orig.ivaPct }] }
      : plantilla
        ? { actividad: plantilla.actividad, fecha: hoy, cliente: plantilla.cliente, lineas: lineasDe(plantilla), irpfPct: plantilla.irpfPct, nota: plantilla.nota || '', cobrada: false, proyecto: plantilla.proyecto || '' }
      : { actividad: actividades[0].id, fecha: hoy, cliente: { nombre: '', nif: '', direccion: '', ciudad: '' }, lineas: [lineaVacia(defecto(actividades[0].id).ivaPct)], nota: '', cobrada: false, irpfPct: defecto(actividades[0].id).irpfPct });
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const prefijo = useId();
  const formulario = useRef(null);
  const enviandoRef = useRef(false);
  const enfocarError = useRef(false);
  const idCampo = (campo) => `${prefijo}-${campo}`;
  const clavesCampo = (campo, adicionales = []) => [campo, ...adicionales];
  const atributos = (campo, adicionales = []) => {
    const claves = clavesCampo(campo, adicionales).filter((k) => errores[k]);
    return { id: idCampo(campo), 'aria-invalid': claves.length ? 'true' : undefined,
      'aria-describedby': claves.length ? claves.map((k) => `${idCampo(k)}-error`).join(' ') : undefined };
  };
  const mensaje = (campo, adicionales = []) => clavesCampo(campo, adicionales).map((k) => errores[k]
    ? <span className="ff-error-campo" id={`${idCampo(k)}-error`} key={k}>{errores[k]}</span> : null);
  const limpiarErrores = (...claves) => setErrores((actuales) => Object.fromEntries(
    Object.entries(actuales).filter(([k]) => !claves.some((c) => k === c || k.startsWith(`${c}.`)))
  ));
  useEffect(() => {
    if (!enfocarError.current) return;
    enfocarError.current = false;
    formulario.current?.querySelector('[aria-invalid="true"]')?.focus();
  }, [errores]);
  const [enviando, setEnviando] = useState(false);
  // Clave de idempotencia de este formulario: si se pulsa dos veces o se reintenta, sale una sola factura.
  const [idem] = useState(() => crypto.randomUUID());

  const poner = (k, v) => { limpiarErrores(k); setF((x) => ({ ...x, [k]: v })); };
  const ponerCliente = (k, v) => {
    limpiarErrores(`cliente.${k}`);
    setF((x) => ({ ...x, cliente: { ...x.cliente, [k]: v } }));
  };
  const ordenados = [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const elegido = clientes.find((x) => x.nombre.toUpperCase() === f.cliente.nombre.trim().toUpperCase())?.id || '';
  const elegirCliente = (id) => {
    const c = clientes.find((x) => x.id === id);
    poner('cliente', c ? { nombre: c.nombre, nif: c.nif, direccion: c.direccion, ciudad: c.ciudad, email: c.email || '' } : { nombre: '', nif: '', direccion: '', ciudad: '' });
  };
  const cambiarActividad = (a) => {
    if (nueva && !orig) limpiarErrores('irpfPct', 'ivaPct', ...f.lineas.map((_, i) => `lineas.${i}.ivaPct`));
    setF((x) => (nueva && !orig
      ? { ...x, actividad: a, irpfPct: defecto(a).irpfPct, lineas: x.lineas.map((l) => ({ ...l, ivaPct: defecto(a).ivaPct })) }
      : { ...x, actividad: a }));
  };
  const ponerLinea = (i, k, v) => {
    limpiarErrores(`lineas.${i}.${k}`, ...(k === 'ivaPct' ? ['ivaPct'] : k !== 'concepto' ? ['base'] : []));
    setF((x) => ({ ...x, lineas: x.lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  };
  const quitarLinea = (i) => {
    setErrores((actuales) => Object.fromEntries(Object.entries(actuales).flatMap(([k, v]) => {
      if (k === 'lineas' || k === 'base') return [];
      const m = /^lineas\.(\d+)\.(.+)$/.exec(k);
      if (!m) return [[k, v]];
      const indice = Number(m[1]);
      return indice === i ? [] : [[`lineas.${indice > i ? indice - 1 : indice}.${m[2]}`, v]];
    })));
    setF((x) => ({ ...x, lineas: x.lineas.filter((_, j) => j !== i) }));
  };
  // Del catálogo: rellena la última línea si está vacía; si no, añade una.
  const delCatalogo = (p) => {
    const ult = f.lineas.at(-1);
    limpiarErrores('lineas', 'base', ...(ult && !ult.concepto && !ult.precio ? [`lineas.${f.lineas.length - 1}`] : []));
    setF((x) => {
      const l = { concepto: p.nombre, cantidad: '1', precio: aTexto(p.precio), dto: '', ivaPct: p.ivaPct, producto: p.id };
      const ult = x.lineas.at(-1);
      return { ...x, lineas: ult && !ult.concepto && !ult.precio ? [...x.lineas.slice(0, -1), l] : [...x.lineas, l] };
    });
  };
  const anadirLinea = () => { limpiarErrores('lineas', 'base'); setF((x) => ({ ...x, lineas: [...x.lineas, lineaVacia(x.lineas.at(-1)?.ivaPct ?? defecto(x.actividad).ivaPct)] })); };

  const nums = f.lineas.map((l) => ({ cantidad: numero(l.cantidad), precio: numero(l.precio), dto: Number(String(l.dto).replace(',', '.')) || 0, ivaPct: Number(l.ivaPct) }));
  const base = r2(nums.reduce((s, l) => s + baseLinea(l), 0));
  const t = importes({ base, lineas: nums, irpfPct: Number(f.irpfPct) });
  const tipos = desglose({ lineas: nums });

  const enviar = async (e) => {
    e.preventDefault();
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true); setError(''); setErrores({});
    try {
      const r = await fetch('/api/facturas', { headers: { 'Content-Type': 'application/json' }, method: nueva ? 'POST' : 'PATCH', body: JSON.stringify(nueva ? { ...f, idem } : f) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 423 && d.bloqueada) window.location.assign(`/bloqueo?a=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      if (!r.ok) {
        if (r.status === 400 && d.errores) {
          enfocarError.current = true;
          setErrores(d.errores);
        }
        throw new Error(d.error || 'Algo ha fallado');
      }
      if (nueva) navegar(router, `/facturas/${d.factura.id}`, 'fundido');
      router.refresh();
    } catch (err) { setError(err.message); setEnviando(false); enviandoRef.current = false; }
  };

  return (
    <form ref={formulario} className="formulario ff" onSubmit={enviar}>
      <div className="ff-campos">
      <p className="rotulo">{nueva ? `Se numerará como ${numeros[f.actividad]}` : `Factura ${numeroFactura(f)}`}{orig ? ` · rectifica la ${numeroFactura(orig)} (pon el importe que corrige: en negativo si anula)` : ''}</p>
      {actividades.length > 1 && <Deslizable className={`tipo ${actividades.length === 2 ? 'dos' : 'varias'}`}>
        {actividades.map(({ id, nombre }) => (
          <button type="button" key={id} className={f.actividad === id ? 'activo' : ''} onClick={() => cambiarActividad(id)}>{nombre}</button>
        ))}
      </Deslizable>}

      <label>Fecha<input {...atributos('fecha')} className="campo" type="date" value={f.fecha} onChange={(e) => poner('fecha', e.target.value)} required />{mensaje('fecha')}</label>

      <fieldset>
        <legend>Cliente</legend>
        <label className="ff-etiqueta-oculta" htmlFor={idCampo('cliente-selector')}>Elegir cliente</label>
        <select id={idCampo('cliente-selector')} className="campo" value={elegido} onChange={(e) => elegirCliente(e.target.value)}>
          <option value="">+ Cliente nuevo</option>
          {ordenados.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <label className="ff-etiqueta-oculta" htmlFor={idCampo('cliente.nombre')}>Razón social</label>
        <input {...atributos('cliente.nombre')} className="campo" placeholder="Ej.: Eventos SL" value={f.cliente.nombre} onChange={(e) => ponerCliente('nombre', e.target.value)} required />{mensaje('cliente.nombre')}
        <label className="ff-etiqueta-oculta" htmlFor={idCampo('cliente.nif')}>NIF / CIF</label>
        <input {...atributos('cliente.nif')} className="campo" placeholder="Ej.: B12345678" value={f.cliente.nif} onChange={(e) => ponerCliente('nif', e.target.value)} />{mensaje('cliente.nif')}
        <label className="ff-etiqueta-oculta" htmlFor={idCampo('cliente.direccion')}>Dirección</label>
        <input {...atributos('cliente.direccion')} className="campo" placeholder="Ej.: Calle Mayor, 1" value={f.cliente.direccion} onChange={(e) => ponerCliente('direccion', e.target.value)} />{mensaje('cliente.direccion')}
        <label className="ff-etiqueta-oculta" htmlFor={idCampo('cliente.ciudad')}>Ciudad y CP</label>
        <input {...atributos('cliente.ciudad')} className="campo" placeholder="Ej.: Barcelona, 08001" value={f.cliente.ciudad} onChange={(e) => ponerCliente('ciudad', e.target.value)} />{mensaje('cliente.ciudad')}
        <label className="ff-etiqueta-oculta" htmlFor={idCampo('cliente.email')}>Email (para enviarle la factura)</label>
        <input {...atributos('cliente.email')} className="campo" type="email" placeholder="Ej.: cliente@empresa.es" value={f.cliente.email || ''} onChange={(e) => ponerCliente('email', e.target.value)} />{mensaje('cliente.email')}
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
              <label className="ff-etiqueta-oculta" htmlFor={idCampo(`lineas.${i}.concepto`)}>Concepto</label>
              <input {...atributos(`lineas.${i}.concepto`)} className="campo" placeholder="Ej.: Bolo DJ boda" value={l.concepto} onChange={(e) => ponerLinea(i, 'concepto', e.target.value)} required />
              {f.lineas.length > 1 && <button type="button" className="linea-quitar" aria-label="Quitar línea" onClick={() => quitarLinea(i)}>×</button>}
            </div>
            {mensaje(`lineas.${i}.concepto`)}
            <div className="linea-nums">
              <label>Cantidad<input {...atributos(`lineas.${i}.cantidad`)} className="campo" inputMode="decimal" value={l.cantidad} onChange={(e) => ponerLinea(i, 'cantidad', e.target.value)} />{mensaje(`lineas.${i}.cantidad`)}</label>
              <label>Precio<input {...atributos(`lineas.${i}.precio`, i === 0 ? ['base'] : [])} className="campo" inputMode="decimal" placeholder="0,00" value={l.precio} onChange={(e) => ponerLinea(i, 'precio', e.target.value)} />{mensaje(`lineas.${i}.precio`, i === 0 ? ['base'] : [])}</label>
              <label>Dto. %<input {...atributos(`lineas.${i}.dto`)} className="campo" inputMode="decimal" placeholder="0" value={l.dto} onChange={(e) => ponerLinea(i, 'dto', e.target.value)} />{mensaje(`lineas.${i}.dto`)}</label>
              <label>IVA
                <select {...atributos(`lineas.${i}.ivaPct`, i === 0 ? ['ivaPct'] : [])} className="campo" value={l.ivaPct} onChange={(e) => ponerLinea(i, 'ivaPct', Number(e.target.value))}>
                  {[...new Set([21, 10, 4, 0, Number(l.ivaPct)])].map((n) => <option key={n} value={n}>{n}%</option>)}
                </select>{mensaje(`lineas.${i}.ivaPct`, i === 0 ? ['ivaPct'] : [])}
              </label>
            </div>
            <p className="linea-total">{stock && nueva && !orig && l.producto && stock[l.producto] !== undefined && <span className={`linea-stock${stock[l.producto] < nums[i].cantidad ? ' falta' : ''}`}>{stock[l.producto] < nums[i].cantidad ? `Solo quedan ${stock[l.producto]}` : `Quedan ${stock[l.producto]}`}</span>}{eur(baseLinea(nums[i]))}</p>
          </div>
        ))}
        {productos.length > 0 && <div className="catalogo-chips" aria-label="Añadir del catálogo">{productos.map((p) => <button type="button" key={p.id} onClick={() => delCatalogo(p)}>+ {p.nombre}</button>)}</div>}
        {mensaje('lineas')}
        <button {...atributos('lineas')} type="button" className="boton sec" onClick={anadirLinea}>+ Añadir otro concepto</button>
      </fieldset>

      <label>Proyecto, obra o local (opcional)
        <input className="campo" list="proyectos-factura" value={f.proyecto || ''} onChange={(e) => poner('proyecto', e.target.value)} placeholder="Para ver la rentabilidad de cada uno" maxLength={60} />
      </label>
      <datalist id="proyectos-factura">{proyectos.map((p) => <option key={p} value={p} />)}</datalist>

      {(nums.some((l) => l.ivaPct === 0) || errores.operacion) && <label>¿Por qué va sin IVA?
        <select {...atributos('operacion')} className="campo" value={f.operacion || ''} onChange={(e) => poner('operacion', e.target.value || undefined)}>
          <option value="">Según el cliente (UE: servicios intracomunitarios · fuera de la UE: no sujeta · España: exenta)</option>
          {Object.entries(TIPOS_OPERACION).map(([k, t]) => <option key={k} value={k}>{t.nombre}</option>)}
        </select>{mensaje('operacion')}
      </label>}

      {orig && <label>Motivo de la rectificación
        <select className="campo" value={f.motivoRectificacion || ''} onChange={(e) => poner('motivoRectificacion', e.target.value)}>
          <option value="">Otras causas (R4)</option>
          <option value="error">Error, devolución, descuento o resolución (R1, art. 80 Uno, Dos y Seis)</option>
          <option value="concurso">Concurso del cliente (R2, art. 80 Tres)</option>
          <option value="incobrable">Crédito incobrable (R3, art. 80 Cuatro)</option>
        </select>
      </label>}

      <label>IRPF
        <select {...atributos('irpfPct')} className="campo" value={f.irpfPct} onChange={(e) => poner('irpfPct', Number(e.target.value))}>
          {[...new Set([15, 7, 0, Number(f.irpfPct) || 0])].map((n) => <option key={n} value={n}>{n}%</option>)}
        </select>{mensaje('irpfPct')}
      </label>

      <label>Nota en la factura (opcional)
        <input className="campo" placeholder="Ej.: operación exenta de IVA, inversión del sujeto pasivo" value={f.nota || ''} onChange={(e) => poner('nota', e.target.value)} />
      </label>

      <label className="check"><input type="checkbox" checked={f.cobrada} onChange={(e) => poner('cobrada', e.target.checked)} /> Ya está cobrada</label>

      <div className="totales">
        <span>Base {eur(t.base)}</span>{tipos.length > 1 ? tipos.map((x) => <span key={x.pct}>IVA {x.pct}% {eur(x.iva)}</span>) : <span>IVA {eur(t.iva)}</span>}<span>IRPF −{eur(t.irpf)}</span><strong>Total {eur(t.total)}</strong>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
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
