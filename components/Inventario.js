'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { estadoPedidoProv } from '../lib/albaranes.js';

const MOTIVOS = [['recuento', 'Recuento: he contado y hay…'], ['inicial', 'Stock inicial'], ['rotura', 'Rotura o merma'], ['perdida', 'Pérdida o robo'], ['regalo', 'Muestra o regalo'], ['consumo', 'Consumo: gastado en un servicio'], ['otro', 'Otro (con signo: −2 sale, 5 entra)']];

// Ajustar el stock de un producto a mano: contarlo, darlo de alta al empezar o sacar lo roto.
export function Ajuste({ producto, hoy, coste, consumo = false }) {
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
      <h3>Ajustar el stock</h3>
      <select className="campo" value={x.motivo} onChange={poner('motivo')} aria-label="Motivo">{MOTIVOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
      <div className="dos-col">
        <input className="campo" inputMode="decimal" required placeholder={x.motivo === 'recuento' ? 'Contadas' : 'Unidades'} value={x.cantidad} onChange={poner('cantidad')} aria-label="Unidades" />
        <input className="campo" type="date" value={x.fecha} onChange={poner('fecha')} aria-label="Fecha" />
      </div>
      {x.motivo === 'recuento' && <label className="check"><input type="checkbox" checked={x.como === 'consumo'} onChange={(e) => setX({ ...x, como: e.target.checked ? 'consumo' : '' })} /> Si falta, es material gastado en servicios (consumo, no pérdida)</label>}
      {entra && <input className="campo" inputMode="decimal" placeholder="Coste por unidad sin IVA" value={x.coste} onChange={poner('coste')} aria-label="Coste por unidad" />}
      <input className="campo" placeholder="Nota (opcional)" value={x.nota} onChange={poner('nota')} />
      {msg && <p className={msg.startsWith('✓') ? 'nota' : 'error'}>{msg}</p>}
      <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : 'Apuntar'}</button>
    </form>
  );
}

// Copia el pedido de un proveedor para pegarlo en un correo o en WhatsApp.
export function CopiarPedido({ texto }) {
  const [hecho, setHecho] = useState(false);
  return <button type="button" className="boton sec pequeno" onClick={async () => { try { await navigator.clipboard.writeText(texto); setHecho(true); setTimeout(() => setHecho(false), 2000); } catch { /* sin portapapeles */ } }}>{hecho ? '✓ Copiado' : 'Copiar el pedido'}</button>;
}

// Convierte una propuesta de «Qué pedir» en un pedido al proveedor (queda «en camino» hasta recibirlo).
export function HacerPedido({ proveedor, items, hoy }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const hacer = async () => {
    setOcupado(true);
    try {
      await llamar('/api/pedidos-proveedor', { method: 'POST', body: JSON.stringify({ proveedor, fecha: hoy, lineas: items.map((x) => ({ producto: x.id, cantidad: x.cantidad, coste: x.unitario })) }) });
      router.replace('/inventario?ver=pedidos');
      router.refresh();
    } catch (e) { alert(e.message); setOcupado(false); }
  };
  return <button type="button" className="boton pequeno" disabled={ocupado || proveedor === 'Sin proveedor'} title={proveedor === 'Sin proveedor' ? 'Pon el proveedor del producto en el catálogo' : ''} onClick={hacer}>{ocupado ? 'Creando…' : 'Hacer el pedido'}</button>;
}

// Recibir un pedido a proveedor: lo que ha llegado y a qué coste. Se apunta el gasto (pendiente de pago) con su stock.
export function RecibirPedido({ pedido, hoy }) {
  const router = useRouter();
  const estado = estadoPedidoProv(pedido);
  const idem = useRef(null);
  const [abierto, setAbierto] = useState(false);
  const [x, setX] = useState({ fecha: hoy, ivaPct: 21, lineas: estado.lineas.filter((l) => l.pendiente > 0).map((l) => ({ linea: l.linea, producto: l.producto, concepto: l.concepto, cantidad: String(l.pendiente).replace('.', ','), coste: String(l.coste).replace('.', ',') })) });
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
    if (!confirm('¿Cancelar lo pendiente de este pedido? Las compras recibidas se conservan.')) return;
    try { await llamar('/api/pedidos-proveedor', { method: 'POST', body: JSON.stringify({ accion: 'cancelar', id: pedido.id }) }); router.refresh(); } catch (e) { alert(e.message); }
  };
  if (estado.estado === 'recibido' || estado.estado === 'cancelado') return null;
  const resumen = <p className="nota">{estado.estado === 'parcial' ? 'Recibido parcialmente' : 'Pendiente de recibir'} · {estado.lineas.filter((l) => l.pendiente > 0).map((l) => `${l.concepto}: ${l.pendiente} pendientes`).join(' · ')}</p>;
  if (!abierto) return <>{resumen}<div className="inv-acciones"><button type="button" className="boton pequeno" onClick={() => setAbierto(true)}>{estado.estado === 'parcial' ? 'Recibir el resto' : 'Recibir'}</button><button type="button" className="boton sec pequeno" onClick={cancelar}>Cancelar</button></div></>;
  return (
    <form className="formulario inv-recibir" onSubmit={recibir}>
      {resumen}
      {x.lineas.map((l, i) => (
        <div key={i} className="inv-recibir-linea">
          <span>{l.concepto}</span>
          <input className="campo" inputMode="decimal" value={l.cantidad} onChange={(e) => ponerLinea(i, 'cantidad', e.target.value)} aria-label={`Unidades recibidas de ${l.concepto}`} />
          <input className="campo" inputMode="decimal" value={l.coste} onChange={(e) => ponerLinea(i, 'coste', e.target.value)} aria-label={`Coste por unidad de ${l.concepto}`} />
        </div>
      ))}
      <p className="nota">Unidades que han llegado y coste por unidad sin IVA (el de la factura o el albarán del proveedor).</p>
      <div className="dos-col">
        <label>Fecha<input className="campo" type="date" value={x.fecha} onChange={(e) => setX({ ...x, fecha: e.target.value })} /></label>
        <label>IVA<select className="campo" value={x.ivaPct} onChange={(e) => setX({ ...x, ivaPct: Number(e.target.value) })}>{[21, 10, 4, 0].map((n) => <option key={n} value={n}>{n}%</option>)}</select></label>
      </div>
      {msg && <p className="error">{msg}</p>}
      <button className="boton" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Apuntar la compra'}</button>
    </form>
  );
}
