'use client';

import { useState } from 'react';
import Link from 'next/link';
import { eur, fechaCorta } from '@/lib/formato';
import '@/app/importar.css';

const TIPOS = [['clientes', 'Clientes'], ['facturas', 'Facturas'], ['gastos', 'Gastos'], ['productos', 'Productos']];
const DESTINO = { facturas: '/facturas', gastos: '/gastos', productos: '/facturas/catalogo' };
const CAMPO = { nombre: 'Nombre', nif: 'NIF', email: 'Email', direccion: 'Dirección', cp: 'CP', ciudad: 'Población', numero: 'Número', fecha: 'Fecha', cliente: 'Cliente', concepto: 'Concepto', base: 'Base', ivaPct: '% IVA', iva: 'IVA', irpfPct: '% IRPF', irpf: 'Retención', total: 'Total', estado: 'Estado', pendiente: 'Pendiente', proveedor: 'Proveedor', proveedorNif: 'NIF proveedor', precio: 'Precio' };
const ESTADO = { nuevo: 'Nuevo', duplicado: 'Ya existe', error: 'Error' };

// Una línea legible de cada fila de la vista previa.
function resumen(tipo, d) {
  if (tipo === 'clientes') return [d.nombre, [d.nif, d.ciudad, d.email].filter(Boolean).join(' · ')];
  if (tipo === 'productos') return [d.nombre, `${eur(d.precio)} · IVA ${d.ivaPct} %`];
  if (tipo === 'gastos') return [d.concepto, `${fechaCorta(d.fecha)} · ${eur(d.base)} + IVA ${d.ivaPct} %${d.pendiente ? ' · sin pagar' : ''}`];
  return [`${d.importada} · ${d.cliente.nombre}`, `${fechaCorta(d.fecha)} · ${eur(d.base)} + IVA ${d.ivaPct} %${d.irpfPct ? ` − IRPF ${d.irpfPct} %` : ''} · ${d.cobrada ? 'cobrada' : 'pendiente'}`];
}

// Importar desde Holded o Excel: se elige qué, se sube el archivo, se revisa la vista previa y se guarda.
export default function Importar() {
  const [tipo, setTipo] = useState('clientes');
  const [archivo, setArchivo] = useState(null);
  const [vista, setVista] = useState(null);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const pedir = async (guardar) => {
    setOcupado(true); setMsg('');
    const fd = new FormData();
    fd.set('tipo', tipo); fd.set('archivo', archivo);
    if (guardar) fd.set('guardar', '1');
    try {
      const r = await fetch('/api/importar', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setVista(null); setMsg(d.error || 'No se pudo leer el archivo'); return; }
      setVista(d);
      if (guardar) setMsg(`✓ Importados ${d.guardados}`);
    } catch { setMsg('Sin conexión: inténtalo de nuevo'); } finally { setOcupado(false); }
  };
  const cambiar = (t) => { setTipo(t); setVista(null); setMsg(''); };
  const hecho = vista && 'guardados' in vista;
  return (
    <div className="importar">
      <section className="formulario tarjeta">
        <h3>Qué quieres importar</h3>
        <div className="tipo importar-tipos">{TIPOS.map(([k, n]) => <button type="button" key={k} className={tipo === k ? 'activo' : ''} onClick={() => cambiar(k)}>{n}</button>)}</div>
        <p className="nota">Desde Holded: exporta {TIPOS.find((t) => t[0] === tipo)[1].toLowerCase()} a Excel y súbelo tal cual. También vale un Excel o CSV tuyo con la primera fila de títulos.</p>
        <label className="importar-archivo">
          <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => { setArchivo(e.target.files?.[0] || null); setVista(null); setMsg(''); }} />
        </label>
        <button className="boton" disabled={!archivo || ocupado} onClick={() => pedir(false)}>{ocupado && !vista ? 'Leyendo…' : 'Ver vista previa'}</button>
        {msg && <p role="status" className={msg.startsWith('✓') ? 'nota guardado' : 'error'}>{msg}</p>}
      </section>

      {vista && (
        <section className="importar-previa">
          <p className="resumen-linea importar-cuenta">
            <span>Nuevos <strong>{vista.nuevos}</strong></span>
            <span>Ya existen <strong>{vista.duplicados}</strong></span>
            {vista.errores > 0 && <span className="rojo">Con errores <strong>{vista.errores}</strong></span>}
          </p>
          <p className="nota">Columnas: {Object.entries(vista.columnas).map(([k, c]) => `${CAMPO[k] || k} ← «${c}»`).join(' · ')}</p>
          <ul className="grupo-lista importar-filas">
            {vista.items.slice(0, 100).map((x) => {
              const [a, b] = x.datos ? resumen(tipo, x.datos) : [`Fila ${x.n}`, x.error];
              return (
                <li key={x.n} className={`fila importar-fila i-${x.estado}`}>
                  <span className="txt"><strong>{a}</strong><small>{b}</small></span>
                  <span className={`importar-estado i-${x.estado}`}>{hecho && x.estado === 'nuevo' ? 'Importado' : ESTADO[x.estado]}</span>
                </li>
              );
            })}
          </ul>
          {vista.items.length > 100 && <p className="nota">Y {vista.items.length - 100} filas más.</p>}
          {hecho
            ? DESTINO[tipo] && <Link href={DESTINO[tipo]} className="boton sec">Ver {TIPOS.find((t) => t[0] === tipo)[1].toLowerCase()}</Link>
            : <button className="boton" disabled={!vista.nuevos || ocupado} onClick={() => pedir(true)}>{ocupado ? 'Importando…' : vista.nuevos ? `Importar ${vista.nuevos}` : 'No hay nada nuevo'}</button>}
          {!hecho && vista.duplicados > 0 && <p className="nota">Lo que ya existe no se toca{tipo === 'facturas' ? ': se compara por serie y número' : tipo === 'clientes' ? ': se compara por nombre o NIF' : tipo === 'gastos' ? ': se compara por fecha, importe y concepto' : ': se compara por nombre'}.</p>}
        </section>
      )}
    </div>
  );
}
