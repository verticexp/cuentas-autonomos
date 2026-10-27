'use client';

import { useT } from '@/components/Idioma';

import { TIPOS_IGIC } from '@/lib/igic';

import { confirmar as confirmarAccion } from './Confirmar';

import Vacio from '@/components/Vacio';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { eur, pctCorto } from '@/lib/formato';
import '@/app/catalogo.css';
import useEnvio from './useEnvio';

// Página del catálogo: añadir, editar y quitar productos o servicios.
export default function Catalogo({ productos, editar, inventario = false, igic = false }) {
  const tr = useT();
  const [enviando, envolver] = useEnvio();
  const router = useRouter();
  const vacio = { nombre: '', precio: '', ivaPct: igic ? 7 : 21 };
  const [p, setP] = useState(vacio);
  const [error, setError] = useState('');
  // El alta, plegada tras «+ Añadir al catálogo» como «+ Añadir empleado»: lo que se viene a ver es la lista. Abierta si
  // aún no hay nada; tocar un producto la abre para editarlo.
  const [abierto, setAbierto] = useState(productos.length === 0);
  const formulario = useRef(null);
  const cerrar = () => { setP(vacio); setError(''); setAbierto(false); };
  const editarProducto = (x) => {
    setP({ ...x, precio: String(x.precio).replace('.', ',') });
    setAbierto(true);
    requestAnimationFrame(() => formulario.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  };
  const poner = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    try { await llamar('/api/productos', { method: 'POST', body: JSON.stringify(p) }); setP(vacio); if (p.id) setAbierto(false); router.refresh(); } catch (err) { setError(err.message); }
  };
  const quitar = async (id) => {
    if (!(await confirmarAccion({ titulo: tr("Quitar del catálogo"), texto: tr("¿Quitar del catálogo? Las facturas ya hechas no cambian."), aceptar: tr("Quitar"), peligro: true }))) return;
    try { await llamar(`/api/productos?id=${id}`, { method: 'DELETE' }); router.refresh(); } catch (err) { setError(err.message); }
  };
  return (
    <>
      {editar && !abierto && <button type="button" id="anadir-catalogo" className="boton sec ancho catalogo-nuevo" onClick={() => setAbierto(true)}>{tr("+ Añadir al catálogo")}</button>}
      {editar && abierto && (
        <form ref={formulario} id="anadir-catalogo" className="formulario tarjeta catalogo-form" onSubmit={envolver(guardar)}>
          <h3>{(p.id ? tr("Editar") : tr("Añadir"))}</h3>
          <label>{tr("Nombre")}<input className="campo" required placeholder={tr("Sesión DJ 4 horas")} value={p.nombre} onChange={(e) => poner('nombre', e.target.value)} /></label>
          <div className="dos-col">
            <label>{(tr("Precio sin") + " ")}{(igic ? "IGIC" : "IVA")}<input className="campo" inputMode="decimal" required placeholder={"0,00"} value={p.precio} onChange={(e) => poner('precio', e.target.value)} /></label>
            <label>{(igic ? "IGIC" : "IVA")}
              <select className="campo" value={p.ivaPct} onChange={(e) => poner('ivaPct', Number(e.target.value))}>
                {(igic ? TIPOS_IGIC : [21, 10, 4, 0]).map((n) => <option key={n} value={n}>{n}%</option>)}
              </select>
            </label>
          </div>
          {inventario && <>
            <label className="cat-servicio"><input type="checkbox" checked={Boolean(p.servicio)} onChange={(e) => poner('servicio', e.target.checked)} />{tr("Es un servicio (no lleva stock)")}</label>
            {!p.servicio && <>
              <div className="dos-col">
                <label>{tr("Referencia")}<input className="campo" placeholder={tr("CAB-XLR-10")} value={p.sku || ''} onChange={(e) => poner('sku', e.target.value)} /></label>
                <label>{(tr("Coste sin") + " ")}{(igic ? "IGIC" : "IVA")}<input className="campo" inputMode="decimal" placeholder={"0,00"} value={p.coste ?? ''} onChange={(e) => poner('coste', e.target.value)} /></label>
              </div>
              <div className="dos-col">
                <label>{tr("Stock mínimo")}<input className="campo" inputMode="decimal" placeholder={tr("Avisa al llegar aquí")} value={p.minimo ?? ''} onChange={(e) => poner('minimo', e.target.value)} /></label>
                <label>{tr("Pedir hasta")}<input className="campo" inputMode="decimal" placeholder={tr("El doble del mínimo")} value={p.maximo ?? ''} onChange={(e) => poner('maximo', e.target.value)} /></label>
              </div>
              <div className="dos-col">
                <label>{tr("Proveedor habitual")}<input className="campo" placeholder={tr("Opcional")} value={p.proveedor || ''} onChange={(e) => poner('proveedor', e.target.value)} /></label>
                <label>{tr("Código de barras")}<input className="campo" inputMode="numeric" placeholder={tr("Opcional")} value={p.codigo || ''} onChange={(e) => poner('codigo', e.target.value)} /></label>
              </div>
            </>}
          </>}
          {error && <p className="error" role="alert">{tr(error)}</p>}
          <div className="dos-col">
            <button type="button" className="boton sec" onClick={cerrar}>{tr("Cancelar")}</button>
            <button className="boton" disabled={enviando}>{(p.id ? tr("Guardar cambios") : tr("Añadir al catálogo"))}</button>
          </div>
        </form>
      )}
      {!editar && <p id="cat-permisos-ayuda" className="nota">{tr("Solo tienes permiso para consultar el catálogo.")}</p>}
      {productos.length > 0 ? (
        <ul className="catalogo">
          {productos.map((x) => (
            <li key={x.id}>
              <button type="button" className="cat-info" disabled={!editar} aria-describedby={!editar ? "cat-permisos-ayuda" : undefined} onClick={() => editar && editarProducto(x)}>
                <strong>{x.nombre}</strong><small>{(inventario && !x.servicio && x.sku ? `${x.sku} · ` : "")}{(igic ? "IGIC" : "IVA")} {pctCorto(x.ivaPct)}{(inventario && x.servicio ? (" " + tr("· servicio")) : "")}</small>
              </button>
              <span className="cat-precio">{eur(x.precio)}</span>
              {editar && <button type="button" className="cat-quitar" aria-label={tr("Quitar {v1}", { v1: x.nombre })} onClick={() => quitar(x.id)}>×</button>}
            </li>
          ))}
        </ul>
      ) : <Vacio icono="datos" titulo={tr("Guarda lo que vendes a menudo")} accion={editar && { href: '#anadir-catalogo', texto: tr('Añadir al catálogo') }}>{tr("Añade tus productos o servicios para usarlos en la próxima factura.")}</Vacio>}
    </>
  );
}
