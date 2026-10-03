'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur } from '@/lib/formato';
import '@/app/catalogo.css';

// Página del catálogo: añadir, editar y quitar productos o servicios.
export default function Catalogo({ productos, editar }) {
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
        <form className="formulario tarjeta catalogo-form" onSubmit={guardar}>
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
                <strong>{x.nombre}</strong><small>IVA {x.ivaPct}%</small>
              </button>
              <span className="cat-precio">{eur(x.precio)}</span>
              {editar && <button type="button" className="cat-quitar" aria-label={`Quitar ${x.nombre}`} onClick={() => quitar(x.id)}>×</button>}
            </li>
          ))}
        </ul>
      ) : <p className="nota">Aún no hay nada. Añade lo que facturas a menudo y luego, al hacer una factura, lo pones en un toque.</p>}
    </>
  );
}
