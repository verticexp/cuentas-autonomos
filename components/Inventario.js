'use client';

import { TIPOS_IGIC } from '@/lib/igic';

import { confirmar as confirmarAccion } from './Confirmar';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { useT } from '@/components/Idioma';
import { estadoPedidoProv } from '../lib/albaranes.js';

const MOTIVOS = [['recuento', 'Recuento: he contado y hay…'], ['inicial', 'Stock inicial'], ['rotura', 'Rotura o merma'], ['perdida', 'Pérdida o robo'], ['regalo', 'Muestra o regalo'], ['consumo', 'Consumo: gastado en un servicio'], ['otro', 'Otro (con signo: −2 sale, 5 entra)']];

// Ajustar el stock de un producto a mano: contarlo, darlo de alta al empezar o sacar lo roto.
export function Ajuste({ producto, hoy, coste, consumo = false, igic = false }) {
  const tr = useT();
  const router = useRouter();
  const [x, setX] = useState({ motivo: 'recuento', como: consumo ? 'consumo' : '', cantidad: '', coste: coste ? String(coste).replace('.', ',') : '', fecha: hoy, nota: '' });
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k) => (e) => { setX({ ...x, [k]: e.target.value }); setMsg(''); };
  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setMsg('');
    try {
      const d = await llamar('/api/inventario', { method: 'POST', body: JSON.stringify({ ...x, producto }) });
      setMsg(d.sinCambios ? 'Coincide con lo que dice Fisquo: no hace falta ajustar.' : '✓ Apuntado');
      setX({ ...x, cantidad: '', nota: '' });
      router.refresh();
    } catch (err) { setMsg(err.message); }
    setEnviando(false);
  };
  const entra = ['inicial', 'otro'].includes(x.motivo);
  return (
    <form className="formulario tarjeta inv-ajuste" onSubmit={enviar}>
      <h3>{tr('Ajustar el stock')}</h3>
      <select className="campo" value={x.motivo} onChange={poner('motivo')} aria-label={tr('Motivo')}>{MOTIVOS.map(([k, t]) => <option key={k} value={k}>{tr(t)}</option>)}</select>
      <div className="dos-col">
        <input className="campo" inputMode="decimal" required placeholder={x.motivo === 'recuento' ? tr('Contadas') : tr('Unidades')} value={x.cantidad} onChange={poner('cantidad')} aria-label={tr('Unidades')} />
        <input className="campo" type="date" value={x.fecha} onChange={poner('fecha')} aria-label={tr('Fecha')} />
      </div>
      {x.motivo === 'recuento' && <label className="check"><input type="checkbox" checked={x.como === 'consumo'} onChange={(e) => setX({ ...x, como: e.target.checked ? 'consumo' : '' })} /> {tr('Si falta, es material gastado en servicios (consumo, no pérdida)')}</label>}
      {entra && <input className="campo" inputMode="decimal" placeholder={tr('Coste por unidad sin {impuesto}', { impuesto: igic ? 'IGIC' : 'IVA' })} value={x.coste} onChange={poner('coste')} aria-label={tr('Coste por unidad')} />}
      <input className="campo" aria-label={tr('Nota del movimiento (opcional)')} placeholder={tr('Nota (opcional)')} value={x.nota} onChange={poner('nota')} />
      {msg && <p className={msg.startsWith('✓') ? 'nota' : 'error'}>{tr(msg)}</p>}
      <button className="boton" disabled={enviando}>{enviando ? tr('Guardando…') : tr('Apuntar')}</button>
    </form>
  );
}

// Copia el pedido de un proveedor para pegarlo en un correo o en WhatsApp.
export function CopiarPedido({ texto }) {
  const tr = useT();
  const [hecho, setHecho] = useState(false);
  return <button type="button" className="boton sec pequeno" onClick={async () => { try { await navigator.clipboard.writeText(texto); setHecho(true); setTimeout(() => setHecho(false), 2000); } catch { /* sin portapapeles */ } }}>{hecho ? tr('✓ Copiado') : tr('Copiar el pedido')}</button>;
}

// Convierte una propuesta de «Qué pedir» en un pedido al proveedor (queda «en camino» hasta recibirlo).
export function HacerPedido({ proveedor, items, hoy }) {
  const tr = useT();
  const router = useRouter();
  const ayudaId = useId();
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const hacer = async () => {
    setError('');
    setOcupado(true);
    try {
      await llamar('/api/pedidos-proveedor', { method: 'POST', body: JSON.stringify({ proveedor, fecha: hoy, lineas: items.map((x) => ({ producto: x.id, cantidad: x.cantidad, coste: x.unitario })) }) });
      router.replace('/inventario?ver=pedidos');
      router.refresh();
    } catch (e) { setError(e.message); setOcupado(false); }
  };
  return <><button type="button" className="boton pequeno" disabled={ocupado || proveedor === 'Sin proveedor'} aria-describedby={proveedor === 'Sin proveedor' ? ayudaId : undefined} onClick={hacer}>{ocupado ? tr('Creando…') : tr('Hacer el pedido')}</button>{proveedor === 'Sin proveedor' && <span id={ayudaId} className="nota">{tr('Pon el proveedor del producto en el catálogo.')}</span>}{error && <span className="error" role="alert">{tr(error)}</span>}</>;
}

// Recibir un pedido a proveedor: lo que ha llegado y a qué coste. Se apunta el gasto (pendiente de pago) con su stock.
export function RecibirPedido({ pedido, hoy, igic = false }) {
  const tr = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const estado = estadoPedidoProv(pedido);
  const idem = useRef(null);
  const [abierto, setAbierto] = useState(false);
  const [x, setX] = useState({ fecha: hoy, ivaPct: igic ? 7 : 21, lineas: estado.lineas.filter((l) => l.pendiente > 0).map((l) => ({ linea: l.linea, producto: l.producto, concepto: l.concepto, cantidad: String(l.pendiente).replace('.', ','), coste: String(l.coste).replace('.', ',') })) });
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ponerLinea = (i, k, v) => setX((y) => ({ ...y, lineas: y.lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const recibir = async (e) => {
    e.preventDefault();
    setOcupado(true); setMsg('');
    try {
      idem.current ||= crypto.randomUUID();
      const d = await llamar('/api/pedidos-proveedor', { method: 'POST', body: JSON.stringify({ accion: 'recibir', id: pedido.id, idem: idem.current, fecha: x.fecha, ivaPct: x.ivaPct, recibido: x.lineas }) });
      router.replace(`/gastos/${d.gasto.id}`);
      router.refresh();
    } catch (err) { setMsg(err.message); setOcupado(false); }
  };
  const cancelar = async () => {
    setError('');
    if (!(await confirmarAccion({ titulo: tr('Cancelar pedido'), texto: tr('¿Cancelar lo pendiente de este pedido? Las compras recibidas se conservan.'), aceptar: tr('Cancelar pedido'), peligro: true }))) return;
    try { await llamar('/api/pedidos-proveedor', { method: 'POST', body: JSON.stringify({ accion: 'cancelar', id: pedido.id }) }); router.refresh(); } catch (e) { setError(e.message); }
  };
  if (estado.estado === 'recibido' || estado.estado === 'cancelado') return null;
  const resumen = <p className="nota">{estado.estado === 'parcial' ? tr('Recibido parcialmente') : tr('Pendiente de recibir')} · {estado.lineas.filter((l) => l.pendiente > 0).map((l) => tr('{concepto}: {n} pendientes', { concepto: l.concepto, n: l.pendiente })).join(' · ')}</p>;
  if (!abierto) return <>{resumen}{error && <p className="error" role="alert">{tr(error)}</p>}<div className="inv-acciones"><button type="button" className="boton pequeno" onClick={() => setAbierto(true)}>{estado.estado === 'parcial' ? tr('Recibir el resto') : tr('Recibir')}</button><button type="button" className="boton sec pequeno" onClick={cancelar}>{tr('Cancelar')}</button></div></>;
  return (
    <form className="formulario inv-recibir" onSubmit={recibir}>
      {resumen}
      {x.lineas.map((l, i) => (
        <div key={i} className="inv-recibir-linea">
          <span>{l.concepto}</span>
          <input className="campo" inputMode="decimal" value={l.cantidad} onChange={(e) => ponerLinea(i, 'cantidad', e.target.value)} aria-label={tr('Unidades recibidas de {concepto}', { concepto: l.concepto })} />
          <input className="campo" inputMode="decimal" value={l.coste} onChange={(e) => ponerLinea(i, 'coste', e.target.value)} aria-label={tr('Coste por unidad de {concepto}', { concepto: l.concepto })} />
        </div>
      ))}
      <p className="nota">{tr('Unidades que han llegado y coste por unidad sin {impuesto} (el de la factura o el albarán del proveedor).', { impuesto: igic ? 'IGIC' : 'IVA' })}</p>
      <div className="dos-col">
        <label>{tr('Fecha')}<input className="campo" type="date" value={x.fecha} onChange={(e) => setX({ ...x, fecha: e.target.value })} /></label>
        <label>{igic ? 'IGIC' : 'IVA'}<select className="campo" value={x.ivaPct} onChange={(e) => setX({ ...x, ivaPct: Number(e.target.value) })}>{(igic ? TIPOS_IGIC : [21, 10, 4, 0]).map((n) => <option key={n} value={n}>{n}%</option>)}</select></label>
      </div>
      {error && <p className="error" role="alert">{tr(error)}</p>}
      {msg && <p className="error" role="alert">{tr(msg)}</p>}
      <button className="boton" disabled={ocupado}>{ocupado ? tr('Guardando…') : tr('Apuntar la compra')}</button>
    </form>
  );
}
