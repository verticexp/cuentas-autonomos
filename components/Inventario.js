'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';

const MOTIVOS = [['recuento', 'Recuento: he contado y hay…'], ['inicial', 'Stock inicial'], ['rotura', 'Rotura o merma'], ['perdida', 'Pérdida o robo'], ['regalo', 'Muestra o regalo'], ['otro', 'Otro (con signo: −2 sale, 5 entra)']];

// Ajustar el stock de un producto a mano: contarlo, darlo de alta al empezar o sacar lo roto.
export function Ajuste({ producto, hoy, coste }) {
  const router = useRouter();
  const [x, setX] = useState({ motivo: 'recuento', cantidad: '', coste: coste ? String(coste).replace('.', ',') : '', fecha: hoy, nota: '' });
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const poner = (k) => (e) => { setX({ ...x, [k]: e.target.value }); setMsg(''); };
  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setMsg('');
    try {
      const d = await llamar('/api/inventario', { method: 'POST', body: JSON.stringify({ ...x, producto }) });
      setMsg(d.sinCambios ? 'Coincide con lo que dice Netto: no hace falta ajustar.' : '✓ Apuntado');
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
        <input className="campo" inputMode="decimal" required placeholder={x.motivo === 'recuento' ? 'Unidades contadas' : 'Unidades'} value={x.cantidad} onChange={poner('cantidad')} aria-label="Unidades" />
        <input className="campo" type="date" value={x.fecha} onChange={poner('fecha')} aria-label="Fecha" />
      </div>
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
