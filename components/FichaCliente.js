'use client';

import { confirmar as confirmarAccion } from './Confirmar';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { volverA } from '@/lib/transicion';
import useCambiosSinGuardar from './useCambiosSinGuardar';
import { FORMAS, TIPOS_VINCULO, valoresDe } from '@/lib/terceros';
import { eur } from '@/lib/formato';
import { IDIOMAS_FACTURA, MONEDAS } from '@/lib/idiomas';
import { conHuecos } from '@/lib/huecos';
import { useT } from '@/components/Idioma';

export function FormularioFicha({ datos = {}, id, proveedor = false, editar = true, puedeRiesgo = false, comerciales = [], zonas = [], borrar = false }) {
  const router = useRouter();
  const tr = useT();
  const prefijo = useId();
  const ocupado = useRef(false);
  const campos = ['nombre', 'nif', 'pais', 'direccion', 'ciudad', 'contacto', 'email', 'telefono', 'formaCobro', 'formaPago', 'plazo', 'comercial', 'zona', 'riesgoMax', 'idioma', 'moneda', 'vinculo', 'vinculoModulos', 'notas'];
  const [f, setF] = useState(() => Object.fromEntries(campos.map((k) => [k, k === 'vinculoModulos' ? Boolean(datos[k]) : datos[k] ?? ''])));
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const sinGuardar = useCambiosSinGuardar(f);
  const url = proveedor ? '/api/proveedores/ficha' : '/api/clientes';
  const lista = proveedor ? '/gastos/proveedores' : '/clientes';
  const enviar = async (e, eliminar = false) => {
    e.preventDefault();
    if (!editar || ocupado.current) return;
    if (eliminar && !(await confirmarAccion({ titulo: tr('Borrar ficha'), texto: tr('¿Borrar esta ficha?'), aceptar: tr('Borrar ficha'), peligro: true }))) return;
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
      await sinGuardar.guardado();
      // Borrada: de vuelta a la lista; creada: su ficha en lugar del formulario vacío. Así «atrás» no lleva a ninguno de los dos.
      if (eliminar) { volverA(router, lista, 'atras', true); return; }
      if (!id) router.replace(`${lista}/${encodeURIComponent((proveedor ? d.ficha : d.cliente).id)}`);
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
      <label htmlFor={nombre}>{tr(etiqueta)}</label>
      {tipo === 'select' ? <select {...props}><option value="">{tr('Sin definir')}</option>{FORMAS.map((v) => <option key={v.id} value={v.id}>{tr(v.nombre)}</option>)}</select>
        : tipo === 'textarea' ? <textarea {...props} rows={4} maxLength={500} /> : <input {...props} type={tipo} />}
      <div id={`${nombre}-nota`}>{ayuda && <small className="ficha-ayuda">{ayuda}</small>}{errores[k] && <p className="error" role="alert">{tr(errores[k])}</p>}</div>
    </div>;
  };
  return <form className="formulario ficha-form" onSubmit={enviar}>
    {error && <p className="error" role="alert">{tr(error)}</p>}
    {aviso && <p role="status">{tr(aviso)}</p>}
    {!editar && <p className="nota">{tr('Solo tienes permiso para consultar esta ficha.')}</p>}
    <div className="ficha-rejilla">
      {campo('nombre', 'Nombre', { required: true, maxLength: 120, readOnly: Boolean(datos.id), ayuda: datos.id ? tr('El nombre se fija con el primero: las facturas lo llevan') : '' })}
      {campo('nif', 'NIF', { maxLength: 20, autoCapitalize: 'characters', autoCorrect: 'off', spellCheck: false })}
      {campo('pais', 'País', { maxLength: 2, placeholder: 'ES', ayuda: tr('Dos letras, si no es ES') })}
      {campo('direccion', 'Dirección', { maxLength: 120 })}{campo('ciudad', 'Ciudad', { maxLength: 120 })}
      {campo('contacto', 'Persona de contacto', { maxLength: 80, autoComplete: 'off', ayuda: tr('Con quien tratas. Saldrá en el saludo de los correos («Hola, Pepe»)') })}
      {campo('email', 'Email', { tipo: 'email', autoComplete: 'email' })}{campo('telefono', 'Teléfono', { tipo: 'tel', autoComplete: 'tel', inputMode: 'tel', maxLength: 30 })}
      {campo(proveedor ? 'formaPago' : 'formaCobro', proveedor ? 'Forma de pago' : 'Forma de cobro', { tipo: 'select' })}
      {campo('plazo', 'Plazo en días', { inputMode: 'numeric', placeholder: tr('Según Ajustes') })}
      {campo('comercial', 'Comercial', { list: `${prefijo}-comerciales`, maxLength: 80 })}
      {campo('zona', 'Zona', { list: `${prefijo}-zonas`, maxLength: 80 })}
      {!proveedor && campo('riesgoMax', 'Riesgo máximo (€)', { inputMode: 'decimal', ayuda: `${tr('Vacío = sin límite · 0 = solo al contado. No se podrán emitir facturas que lo superen.')}${!puedeRiesgo ? ` ${tr('Solo quien administra la empresa puede cambiarlo.')}` : ''}` })}
      {!proveedor && <div className="ficha-campo"><label htmlFor={`${prefijo}-idioma`}>{tr('Idioma de sus facturas')}</label><select id={`${prefijo}-idioma`} className="campo" value={f.idioma || 'es'} disabled={!editar || enviando} onChange={(e) => setF((x) => ({ ...x, idioma: e.target.value }))}>{IDIOMAS_FACTURA.map((x) => <option key={x.id} value={x.id}>{tr(x.nombre)}</option>)}</select></div>}
      {!proveedor && <div className="ficha-campo"><label htmlFor={`${prefijo}-moneda`}>{tr('Moneda de sus facturas')}</label><select id={`${prefijo}-moneda`} className="campo" value={f.moneda || 'EUR'} disabled={!editar || enviando} onChange={(e) => setF((x) => ({ ...x, moneda: e.target.value }))}>{MONEDAS.map((m) => <option key={m} value={m}>{m === 'EUR' ? tr('Euros (EUR)') : m}</option>)}</select><div><small className="ficha-ayuda">{tr('La factura nueva sale en este idioma y esta moneda (con el cambio del BCE).')}</small></div></div>}
      {/* Parte vinculada del modelo 232 (art. 18.2 LIS): la marca la empresa, Fisquo no la deduce de los datos. */}
      <div className="ficha-campo ficha-ancho">
        <label htmlFor={`${prefijo}-vinculo`}>{tr('Parte vinculada (modelo 232)')}</label>
        <select id={`${prefijo}-vinculo`} className="campo" value={f.vinculo || ''} disabled={!editar || enviando} onChange={(e) => { setF((x) => ({ ...x, vinculo: e.target.value, vinculoModulos: e.target.value ? x.vinculoModulos : false })); setAviso(''); }}>
          <option value="">{tr('No está vinculado')}</option>
          {Object.entries(TIPOS_VINCULO).map(([k, v]) => <option key={k} value={k}>{tr(v.nombre)} ({v.norma})</option>)}
        </select>
        {f.vinculo && <label className="check"><input type="checkbox" checked={Boolean(f.vinculoModulos)} disabled={!editar || enviando} onChange={(e) => { setF((x) => ({ ...x, vinculoModulos: e.target.checked })); setAviso(''); }} />{tr('Es una persona física en módulos con el 25 % o más de la sociedad (sus operaciones son «específicas»)')}</label>}
        <div><small className="ficha-ayuda">{tr('Si es socio, administrador, consejero, familiar de alguno de ellos o sociedad de tu grupo, márcalo aquí: Impuestos suma sus operaciones del año y te dice si toca presentar el modelo 232.')}</small></div>
      </div>
      {campo('notas', 'Notas', { tipo: 'textarea' })}
    </div>
    <datalist id={`${prefijo}-comerciales`}>{comerciales.map((v) => <option key={v} value={v} />)}</datalist>
    <datalist id={`${prefijo}-zonas`}>{zonas.map((v) => <option key={v} value={v} />)}</datalist>
    {editar && <div className="ficha-acciones"><button type="submit" className="boton" disabled={enviando}>{tr(enviando ? 'Guardando…' : datos.id ? 'Guardar cambios' : 'Crear ficha')}</button>{borrar && id && <button type="button" className="borrar" disabled={enviando} onClick={(e) => enviar(e, true)}>{tr('Borrar ficha')}</button>}</div>}
  </form>;
}

export default function FichaCliente({ cliente, ...props }) {
  return <FormularioFicha key={cliente?.id || 'nuevo'} datos={cliente} id={cliente?.id} {...props} />;
}

export function FiltrosFichas({ lista, filtros }) {
  const tr = useT();
  return <form method="get" className="ficha-filtros">
    <label>{tr('Buscar')}<input className="campo" name="q" defaultValue={filtros.q || ''} placeholder={tr('Nombre, NIF o email')} type="search" /></label>
    {['comercial', 'zona'].map((k) => <label key={k}>{tr(k === 'comercial' ? 'Comercial' : 'Zona')}<select className="campo" name={k} defaultValue={filtros[k] || ''}><option value="">{tr('Todos')}</option><option value="__sin__">{tr(k === 'comercial' ? 'Sin comercial' : 'Sin zona')}</option>{valoresDe(lista, k).map((v) => <option key={v} value={v}>{v}</option>)}</select></label>)}
    <button type="submit" className="boton sec">{tr('Aplicar filtros')}</button>
  </form>;
}

export function UsoRiesgo({ cliente, panel = false }) {
  const tr = useT();
  const { riesgo, limite, disponible, excedido } = cliente;
  const uso = limite === null ? 0 : limite > 0 ? riesgo / limite * 100 : riesgo > 0 ? 100 : 0;
  return <div className={`${panel ? 'ficha-riesgo-panel' : 'ficha-riesgo'} ${excedido ? 'ficha-excedido' : uso >= 80 ? 'ficha-alerta' : ''}`}>
    {panel ? <div className="ficha-cifras"><span>{conHuecos(tr('Te debe {importe}'), { importe: <strong>{eur(riesgo)}</strong> })}</span><span>{conHuecos(tr('Límite {importe}'), { importe: <strong>{limite === null ? tr('Sin límite') : eur(limite)}</strong> })}</span>{limite !== null && <span>{conHuecos(tr('Disponible {importe}'), { importe: <strong>{eur(disponible)}</strong> })}</span>}</div>
      : <><strong>{eur(riesgo)}{limite !== null ? ` / ${eur(limite)}` : ''}</strong>{limite === null && <small>{tr('Sin límite')}</small>}</>}
    {limite !== null && <div className="ficha-barra" role="meter" aria-label={tr('Uso del límite de riesgo')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, uso)} aria-valuetext={tr('{riesgo} de {limite}', { riesgo: eur(riesgo), limite: eur(limite) })}><span style={{ width: `${Math.min(100, uso)}%` }} /></div>}
    {excedido && <small>{tr('Por encima del límite')}</small>}
  </div>;
}

