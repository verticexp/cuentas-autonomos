'use client';

import Vacio from '@/components/Vacio';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur } from '@/lib/formato';
import '@/app/catalogo.css';

// Página del catálogo: añadir, editar y quitar productos o servicios.
export default function Catalogo({ productos, editar, inventario = false }) {
  const router = useRouter();
  const vacio = { nombre: '', precio: '', ivaPct: 21 };
  const [p, setP] = useState(vacio);
  const [error, setError] = useState('');
  const poner = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    try { await llamar('/api/productos', { method: 'POST', body: JSON.stringify(p) }); setP(vacio); router.refresh(); } catch (err) { setError(err.message); }
  };
  const quitar = async (id) => {
    if (!confirm('¿Quitar del catálogo? Las facturas ya hechas no cambian.')) return;
    try { await llamar(`/api/productos?id=${id}`, { method: 'DELETE' }); router.refresh(); } catch (err) { alert(err.message); }
  };
  return (
    <>
      {editar && (
        <form id="anadir-catalogo" className="formulario tarjeta catalogo-form" onSubmit={guardar}>
          <h3>{p.id ? 'Editar' : 'Añadir'}</h3>
          <label>Nombre<input className="campo" required placeholder="Sesión DJ 4 horas" value={p.nombre} onChange={(e) => poner('nombre', e.target.value)} /></label>
          <div className="dos-col">
            <label>Precio sin IVA<input className="campo" inputMode="decimal" required placeholder="0,00" value={p.precio} onChange={(e) => poner('precio', e.target.value)} /></label>
            <label>IVA
              <select className="campo" value={p.ivaPct} onChange={(e) => poner('ivaPct', Number(e.target.value))}>
                {[21, 10, 4, 0].map((n) => <option key={n} value={n}>{n}%</option>)}
              </select>
            </label>
          </div>
          {inventario && <>
            <label className="cat-servicio"><input type="checkbox" checked={Boolean(p.servicio)} onChange={(e) => poner('servicio', e.target.checked)} />Es un servicio (no lleva stock)</label>
            {!p.servicio && <>
              <div className="dos-col">
                <label>Referencia<input className="campo" placeholder="CAB-XLR-10" value={p.sku || ''} onChange={(e) => poner('sku', e.target.value)} /></label>
                <label>Coste sin IVA<input className="campo" inputMode="decimal" placeholder="0,00" value={p.coste ?? ''} onChange={(e) => poner('coste', e.target.value)} /></label>
              </div>
              <div className="dos-col">
                <label>Stock mínimo<input className="campo" inputMode="decimal" placeholder="Avisa al llegar aquí" value={p.minimo ?? ''} onChange={(e) => poner('minimo', e.target.value)} /></label>
                <label>Pedir hasta<input className="campo" inputMode="decimal" placeholder="El doble del mínimo" value={p.maximo ?? ''} onChange={(e) => poner('maximo', e.target.value)} /></label>
              </div>
              <div className="dos-col">
                <label>Proveedor habitual<input className="campo" placeholder="Opcional" value={p.proveedor || ''} onChange={(e) => poner('proveedor', e.target.value)} /></label>
                <label>Código de barras<input className="campo" inputMode="numeric" placeholder="Opcional" value={p.codigo || ''} onChange={(e) => poner('codigo', e.target.value)} /></label>
              </div>
            </>}
          </>}
          {error && <p className="error">{error}</p>}
          <div className={p.id ? 'dos-col' : ''}>
            {p.id && <button type="button" className="boton sec" onClick={() => setP(vacio)}>Cancelar</button>}
            <button className="boton">{p.id ? 'Guardar cambios' : 'Añadir al catálogo'}</button>
          </div>
        </form>
      )}
      {productos.length > 0 ? (
        <ul className="catalogo">
          {productos.map((x) => (
            <li key={x.id}>
              <button type="button" className="cat-info" disabled={!editar} onClick={() => setP({ ...x, precio: String(x.precio).replace('.', ',') })}>
                <strong>{x.nombre}</strong><small>{inventario && !x.servicio && x.sku ? `${x.sku} · ` : ''}IVA {x.ivaPct}%{inventario && x.servicio ? ' · servicio' : ''}</small>
              </button>
              <span className="cat-precio">{eur(x.precio)}</span>
              {editar && <button type="button" className="cat-quitar" aria-label={`Quitar ${x.nombre}`} onClick={() => quitar(x.id)}>×</button>}
            </li>
          ))}
        </ul>
      ) : <Vacio icono="datos" titulo="Guarda lo que vendes a menudo" accion={editar && { href: '#anadir-catalogo', texto: 'Añadir al catálogo' }}>Añade tus productos o servicios para usarlos en la próxima factura.</Vacio>}
    </>
  );
}
