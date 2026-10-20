'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORMAS, valoresDe } from '@/lib/terceros';
import { eur } from '@/lib/formato';

export function FormularioFicha({ datos = {}, id, proveedor = false, editar = true, puedeRiesgo = false, comerciales = [], zonas = [], borrar = false }) {
  const router = useRouter();
  const prefijo = useId();
  const ocupado = useRef(false);
  const campos = ['nombre', 'nif', 'pais', 'direccion', 'ciudad', 'email', 'telefono', 'formaCobro', 'formaPago', 'plazo', 'comercial', 'zona', 'riesgoMax', 'notas'];
  const [f, setF] = useState(() => Object.fromEntries(campos.map((k) => [k, datos[k] ?? ''])));
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const url = proveedor ? '/api/proveedores/ficha' : '/api/clientes';
  const lista = proveedor ? '/gastos/proveedores' : '/clientes';
  const enviar = async (e, eliminar = false) => {
    e.preventDefault();
    if (!editar || ocupado.current) return;
    if (eliminar && !(await confirmarAccion({ titulo: 'Borrar ficha', texto: '¿Borrar esta ficha?', aceptar: 'Borrar ficha', peligro: true }))) return;
    ocupado.current = true; setEnviando(true); setError(''); setErrores({}); setAviso('');
    try {
      const cuerpo = { ...f, ...(id ? { id } : {}) };
      if (proveedor) { delete cuerpo.riesgoMax; delete cuerpo.formaCobro; } else delete cuerpo.formaPago;
      const r = await fetch(eliminar ? `${url}?id=${encodeURIComponent(id)}` : url, {
        method: eliminar ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' },
        ...(!eliminar ? { body: JSON.stringify(cuerpo) } : {}),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 423 && d.bloqueada) {
        window.location.replace(`/bloqueo?a=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      if (!r.ok) { setErrores(d.errores || {}); throw new Error(d.error || 'No se ha podido guardar la ficha'); }
      if (eliminar) router.push(lista);
      else if (!id) router.push(`${lista}/${encodeURIComponent((proveedor ? d.ficha : d.cliente).id)}`);
      else setAviso('Guardado');
      router.refresh();
    } catch (err) { setError(err.message); }
    finally { ocupado.current = false; setEnviando(false); }
  };
  const campo = (k, etiqueta, opciones = {}) => {
    const { ayuda, tipo = 'text', ...resto } = opciones;
    const nombre = `${prefijo}-${k}`;
    const props = { id: nombre, name: k, className: 'campo', value: f[k], onChange: (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setAviso(''); }, disabled: !editar || enviando || (k === 'riesgoMax' && !puedeRiesgo), 'aria-invalid': Boolean(errores[k]), 'aria-describedby': ayuda || errores[k] ? `${nombre}-nota` : undefined, ...resto };
    return <div className={`ficha-campo ${k === 'notas' ? 'ficha-ancho' : ''}`} key={k}>
      <label htmlFor={nombre}>{etiqueta}</label>
      {tipo === 'select' ? <select {...props}><option value="">Sin definir</option>{FORMAS.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select>
        : tipo === 'textarea' ? <textarea {...props} rows={4} maxLength={500} /> : <input {...props} type={tipo} />}
      <div id={`${nombre}-nota`}>{ayuda && <small className="ficha-ayuda">{ayuda}</small>}{errores[k] && <p className="error">{errores[k]}</p>}</div>
    </div>;
  };
  return <form className="formulario ficha-form" onSubmit={enviar}>
    {error && <p className="error" role="alert">{error}</p>}
    {aviso && <p role="status">{aviso}</p>}
    {!editar && <p className="nota">Solo tienes permiso para consultar esta ficha.</p>}
    <div className="ficha-rejilla">
      {campo('nombre', 'Nombre', { required: true, maxLength: 120, readOnly: Boolean(datos.id), ayuda: datos.id ? 'El nombre se fija con el primero: las facturas lo llevan' : '' })}
      {campo('nif', 'NIF', { maxLength: 20, autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false })}
      {campo('pais', 'País', { maxLength: 2, placeholder: 'ES', ayuda: 'Dos letras, si no es ES' })}
      {campo('direccion', 'Dirección', { maxLength: 120 })}{campo('ciudad', 'Ciudad', { maxLength: 120 })}
      {campo('email', 'Email', { tipo: 'email', autoComplete: 'email' })}{campo('telefono', 'Teléfono', { tipo: 'tel', autoComplete: 'tel', inputMode: 'tel', maxLength: 30 })}
      {campo(proveedor ? 'formaPago' : 'formaCobro', proveedor ? 'Forma de pago' : 'Forma de cobro', { tipo: 'select' })}
      {campo('plazo', 'Plazo en días', { inputMode: 'numeric', placeholder: 'Según Ajustes' })}
      {campo('comercial', 'Comercial', { list: `${prefijo}-comerciales`, maxLength: 80 })}
      {campo('zona', 'Zona', { list: `${prefijo}-zonas`, maxLength: 80 })}
      {!proveedor && campo('riesgoMax', 'Riesgo máximo (€)', { inputMode: 'decimal', ayuda: `Vacío = sin límite · 0 = solo al contado. No se podrán emitir facturas que lo superen.${!puedeRiesgo ? ' Solo quien administra la empresa puede cambiarlo.' : ''}` })}
      {campo('notas', 'Notas', { tipo: 'textarea' })}
    </div>
    <datalist id={`${prefijo}-comerciales`}>{comerciales.map((v) => <option key={v} value={v} />)}</datalist>
    <datalist id={`${prefijo}-zonas`}>{zonas.map((v) => <option key={v} value={v} />)}</datalist>
    {editar && <div className="ficha-acciones"><button type="submit" className="boton" disabled={enviando}>{enviando ? 'Guardando…' : datos.id ? 'Guardar cambios' : 'Crear ficha'}</button>{borrar && id && <button type="button" className="borrar" disabled={enviando} onClick={(e) => enviar(e, true)}>Borrar ficha</button>}</div>}
  </form>;
}

export default function FichaCliente({ cliente, ...props }) {
  return <FormularioFicha key={cliente?.id || 'nuevo'} datos={cliente} id={cliente?.id} {...props} />;
}

export function FiltrosFichas({ lista, filtros }) {
  return <form method="get" className="ficha-filtros">
    <label>Buscar<input className="campo" name="q" defaultValue={filtros.q || ''} placeholder="Nombre, NIF o email" type="search" /></label>
    {['comercial', 'zona'].map((k) => <label key={k}>{k === 'comercial' ? 'Comercial' : 'Zona'}<select className="campo" name={k} defaultValue={filtros[k] || ''}><option value="">Todos</option><option value="__sin__">{k === 'comercial' ? 'Sin comercial' : 'Sin zona'}</option>{valoresDe(lista, k).map((v) => <option key={v} value={v}>{v}</option>)}</select></label>)}
    <button type="submit" className="boton sec">Aplicar filtros</button>
  </form>;
}

export function UsoRiesgo({ cliente, panel = false }) {
  const { riesgo, limite, disponible, excedido } = cliente;
  const uso = limite === null ? 0 : limite > 0 ? riesgo / limite * 100 : riesgo > 0 ? 100 : 0;
  return <div className={`${panel ? 'ficha-riesgo-panel' : 'ficha-riesgo'} ${excedido ? 'ficha-excedido' : uso >= 80 ? 'ficha-alerta' : ''}`}>
    {panel ? <div className="ficha-cifras"><span>Te debe <strong>{eur(riesgo)}</strong></span><span>Límite <strong>{limite === null ? 'Sin límite' : eur(limite)}</strong></span>{limite !== null && <span>Disponible <strong>{eur(disponible)}</strong></span>}</div>
      : <><strong>{eur(riesgo)}{limite !== null ? ` / ${eur(limite)}` : ''}</strong>{limite === null && <small>Sin límite</small>}</>}
    {limite !== null && <div className="ficha-barra" role="meter" aria-label="Uso del límite de riesgo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, uso)} aria-valuetext={`${eur(riesgo)} de ${eur(limite)}`}><span style={{ width: `${Math.min(100, uso)}%` }} /></div>}
    {excedido && <small>Por encima del límite</small>}
  </div>;
}

