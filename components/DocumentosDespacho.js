'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/Idioma';
import Vacio from '@/components/Vacio';
import { navegar } from '@/lib/transicion';
import { eur, fechaCorta } from '@/lib/formato';
import { AVISOS, CATEGORIA_INGRESO, ESTADOS_TEXTO, TIPOS } from '@/lib/documentos';
import { CATEGORIAS } from '@/lib/categorias';
import { nombresUnicos, zipNavegador } from '@/lib/zipNavegador';

// Ficha de un cliente «solo documentos» en Mi despacho (lib/documentos.js): sus documentos del trimestre con lo que ha
// leído la IA, para revisarlos y corregirlos; los avisos; pedirle algo; y exportar el trimestre a tu programa con un ZIP
// de los originales.
const FILTROS = [['todos', 'Todos'], ['revisar', 'Por revisar'], ['avisos', 'Con avisos'], ['revisado', 'Revisados']];
const FORMATOS = [['a3', 'A3 (SUENLACE.DAT)'], ['contaplus', 'ContaPlus'], ['contasol', 'ContaSol (APU.ods)']];
const IVA = [21, 10, 5, 4, 2, 0];
const IRPF = [0, 1, 2, 7, 15, 19];
const enFiltro = (d, f) => f === 'todos' || (f === 'avisos' ? d.avisos?.length > 0 : f === 'revisar' ? ['revisar', 'error', 'leyendo', 'cuarentena'].includes(d.estado) : d.estado === f);
const vacio = { tercero: '', nif: '', fecha: '', numero: '', concepto: '', base: '', ivaPct: 21, cuota: '', irpfPct: 0, irpf: '', total: '', categoria: '629' };

export default function DocumentosDespacho({ cliente, anio, t, hoy, titular, peticiones: pet0, inicial }) {
  const tr = useT();
  const router = useRouter();
  const [datos, setDatos] = useState(inicial);
  const [filtro, setFiltro] = useState('todos');
  const [abierto, setAbierto] = useState(null);
  const [form, setForm] = useState(null);
  const [original, setOriginal] = useState(null);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [peticiones, setPeticiones] = useState(pet0);
  const [pedir, setPedir] = useState('');
  const [exp, setExp] = useState({ formato: 'a3', codigo: '1', digitos: '8' });
  const [zip, setZip] = useState(null);
  const [completo, setCompleto] = useState(false);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/despacho/documentos?empresa=${encodeURIComponent(cliente.id)}&anio=${anio}&t=${t}`, { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setDatos(await r.json());
  }, [cliente.id, anio, t]);
  const leyendo = datos.documentos.some((d) => d.estado === 'leyendo');
  useEffect(() => {
    if (!leyendo) return undefined;
    const i = setInterval(cargar, 5000);
    return () => clearInterval(i);
  }, [leyendo, cargar]);

  const periodos = useMemo(() => {
    const y = Number(hoy.slice(0, 4));
    return [y, y - 1].flatMap((a) => [4, 3, 2, 1].map((q) => ({ anio: a, t: q }))).filter((p) => `${p.anio}-${String(p.t * 3 - 2).padStart(2, '0')}-01` <= hoy);
  }, [hoy]);
  const cambiarPeriodo = (v) => { const [a, q] = v.split('-'); navegar(router, `/despacho/${encodeURIComponent(cliente.id)}?anio=${a}&t=${q}`, 'pestana-der', undefined, false, { scroll: false }); };

  const accion = async (cuerpo) => {
    setOcupado(true); setMsg('');
    const r = await fetch('/api/despacho/documentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa: cliente.id, ...cuerpo }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) || {};
    setOcupado(false);
    if (!r?.ok) { setMsg(d.errores ? Object.values(d.errores).join(' · ') : d.error || tr('No se ha podido guardar')); return false; }
    await cargar();
    return true;
  };
  const abrir = (d) => {
    if (abierto === d.id) { setAbierto(null); return; }
    setAbierto(d.id); setMsg('');
    const x = d.datos || vacio;
    const f = { tipo: d.tipo || 'gasto', ...Object.fromEntries(Object.keys(vacio).map((k) => [k, x[k] ?? vacio[k]])) };
    setForm(f); setOriginal(f);
  };
  const guardar = async (d, revisar = false) => {
    // Solo lo que se ha cambiado: así, al tocar la base o el tipo, el servidor recalcula la cuota, el IRPF y el total.
    const { tipo, ...campos } = form;
    const cambios = Object.fromEntries(Object.entries(campos).filter(([k, v]) => String(v ?? '') !== String(original[k] ?? '')).map(([k, v]) => [k, v === '' && ['base', 'cuota', 'irpf', 'total'].includes(k) ? null : v]));
    const ok = await accion({ accion: 'corregir', id: d.id, tipo, datos: cambios });
    if (ok && revisar) await accion({ accion: 'revisado', id: d.id });
    if (ok) setAbierto(null);
  };
  const revisarSinAvisos = async () => {
    for (const d of datos.documentos.filter((x) => x.estado === 'revisar' && !x.avisos?.length)) await accion({ accion: 'revisado', id: d.id });
  };
  const pedirDoc = async (e) => {
    e.preventDefault();
    const r = await fetch('/api/despacho/peticiones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa: cliente.id, tipo: 'documento', texto: pedir }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) || {};
    if (!r?.ok) { setMsg(d.error || tr('No se ha podido enviar')); return; }
    setPedir(''); setMsg(tr('Petición enviada: la verá al entrar.'));
    if (d.peticion) setPeticiones((p) => [d.peticion, ...p]);
  };
  const descargarZip = async () => {
    const lista = datos.documentos.filter((d) => d.archivo && !['leyendo', 'cuarentena'].includes(d.estado));
    if (!lista.length) return;
    const nombres = nombresUnicos(lista.map((d) => `${d.datos?.fecha || String(d.recibido).slice(0, 10)}-${d.tipo === 'ingreso' ? 'venta' : 'gasto'}-${(d.datos?.tercero || d.nombre).replace(/[^\p{L}\p{N}.]+/gu, '-').slice(0, 50)}${/\.[a-z0-9]{2,4}$/i.test(d.nombre) ? d.nombre.slice(d.nombre.lastIndexOf('.')) : ''}`));
    const archivos = [];
    for (let i = 0; i < lista.length; i++) {
      setZip({ h: i, t: lista.length });
      const r = await fetch(`/api/despacho/documentos/archivo?empresa=${encodeURIComponent(cliente.id)}&id=${encodeURIComponent(lista[i].id)}`).catch(() => null);
      if (r?.ok) archivos.push({ nombre: nombres[i], datos: new Uint8Array(await r.arrayBuffer()) });
    }
    setZip(null);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipNavegador(archivos));
    a.download = `documentos-${cliente.nombre.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}-${t}T-${anio}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  const pasarCompleto = async () => {
    const r = await fetch('/api/despacho/documentos/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'completo', empresa: cliente.id }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) || {};
    if (!r?.ok) { setMsg(d.error || tr('No se ha podido cambiar')); return; }
    router.refresh();
  };
  const reenviar = async () => {
    const r = await fetch('/api/despacho/documentos/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'reenviar', empresa: cliente.id }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) || {};
    setMsg(r?.ok ? (d.enviado ? tr('Invitación reenviada.') : `${tr('No se ha podido enviar el correo: pásale este enlace.')} ${d.enlace || ''}`) : d.error || tr('No se ha podido reenviar'));
  };

  const r = datos.resumen || {};
  const lista = datos.documentos.filter((d) => enFiltro(d, filtro));
  const cambia = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const categorias = form?.tipo === 'ingreso' ? Object.entries(CATEGORIA_INGRESO) : CATEGORIAS.map((c) => [c.id, c.nombre]);
  const pendientes = peticiones.filter((p) => p.estado === 'pendiente');
  const exportar = `/api/despacho/documentos/exportar?empresa=${encodeURIComponent(cliente.id)}&anio=${anio}&t=${t}&formato=${exp.formato}&codigo=${encodeURIComponent(exp.codigo || '1')}&digitos=${encodeURIComponent(exp.digitos || '8')}`;

  return <div className="desp-docs">
    <header className="desp-cab">
      <h1 className="titulo">{cliente.nombre}</h1>
      <p className="resumen-linea desp-linea"><span>{[cliente.nif, tr('Solo documentos'), cliente.contacto?.email].filter(Boolean).join(' · ')}</span>
        {cliente.contacto?.pendiente && datos.abierto && <button type="button" className="enlace" onClick={reenviar}>{tr('Aún no ha entrado · Reenviar la invitación')}</button>}</p>
      {!datos.abierto && <p className="aviso-lectura" role="status"><span>{cliente.soloDocumentos ? tr('La suscripción del panel no está activa: este cliente no puede subir nada nuevo. Puedes ver y exportar lo que ya hay.') : tr('Ya lleva sus cuentas en Fisquo: estos son los documentos que envió antes.')}</span></p>}
    </header>

    <div className="desp-herramientas">
      <label className="desp-select">
        <span className="sr">{tr('Trimestre')}</span>
        <select value={`${anio}-${t}`} onChange={(e) => cambiarPeriodo(e.target.value)}>
          {periodos.map((p) => <option key={`${p.anio}-${p.t}`} value={`${p.anio}-${p.t}`}>{tr('{t}T {anio}', { t: p.t, anio: p.anio })}</option>)}
        </select>
      </label>
      <p className="desp-docs-cifras">{tr('{n} documentos · {g} gastos ({bg}) · {i} ventas ({bi})', { n: r.total || 0, g: r.gastos || 0, bg: eur(r.baseGastos || 0), i: r.ingresos || 0, bi: eur(r.baseIngresos || 0) })}</p>
    </div>

    <div className="chips desp-chips" role="group" aria-label={tr('Filtrar documentos')}>
      {FILTROS.map(([id, texto]) => {
        const n = id === 'todos' ? 0 : datos.documentos.filter((d) => enFiltro(d, id)).length;
        return <button key={id} type="button" aria-pressed={filtro === id} className={filtro === id ? 'activo' : ''} onClick={() => setFiltro(id)}>{tr(texto)}{n > 0 && ` · ${n}`}</button>;
      })}
      {datos.documentos.some((d) => d.estado === 'revisar' && !d.avisos?.length) && <button type="button" className="boton sec" onClick={revisarSinAvisos} disabled={ocupado}>{tr('Marcar revisados los que no tienen avisos')}</button>}
    </div>
    {msg && <p role="status" className="grupo-pie">{msg}</p>}

    {lista.length ? <ul className="grupo-lista desp-docs-lista">{lista.map((d) => {
      const x = d.datos;
      return <li key={d.id} className={abierto === d.id ? 'abierto' : ''}>
        <button type="button" className="fila desp-docs-fila" aria-expanded={abierto === d.id} onClick={() => abrir(d)}>
          <span className="txt">
            <strong>{x?.tercero || d.nombre}</strong>
            <small>{[x?.fecha ? fechaCorta(x.fecha) : fechaCorta(String(d.recibido).slice(0, 10)), d.tipo ? tr(TIPOS[d.tipo]) : null, x?.numero, x?.nif, d.origen === 'correo' ? tr('Por correo') : null].filter(Boolean).join(' · ')}</small>
            {d.avisos?.length > 0 && <small className="desp-docs-avisos">{d.avisos.map((a) => tr(AVISOS[a])).join(' · ')}</small>}
            {d.estado === 'error' && d.error && <small className="desp-docs-avisos">{d.error}</small>}
          </span>
          <span className="desp-num" data-t={tr('Base')}>{x?.base != null ? eur(x.base) : '—'}</span>
          <span className="desp-num" data-t={tr('Total')}>{x?.total != null ? eur(x.total) : '—'}</span>
          <span className="desp-col-estado"><span className={`desp-estado e-${d.estado === 'revisado' ? 'presentado' : d.estado === 'revisar' ? 'listo' : 'cambios'}`}>{tr(ESTADOS_TEXTO[d.estado])}</span></span>
        </button>
        {abierto === d.id && <div className="desp-docs-editor">
          {d.estado === 'cuarentena' ? <p>{tr('Llegó por correo de {de}, que no es un remitente conocido. No se ha leído.', { de: d.correo?.de || tr('alguien desconocido') })} <button type="button" className="boton" onClick={() => accion({ accion: 'permitir', id: d.id })} disabled={ocupado}>{tr('Leerlo y fiarme de este remitente')}</button></p>
            : d.estado === 'leyendo' ? <p>{tr('Leyendo con IA…')}</p>
            : <form className="formulario desp-docs-form" onSubmit={(e) => { e.preventDefault(); guardar(d); }}>
              <label>{tr('Tipo')}<select className="campo" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value, categoria: e.target.value === 'ingreso' ? '705' : '629' }))}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}</select></label>
              <label>{form.tipo === 'ingreso' ? tr('Cliente') : tr('Proveedor')}<input className="campo" value={form.tercero} onChange={cambia('tercero')} maxLength={80} /></label>
              <label>{tr('NIF')}<input className="campo" value={form.nif} onChange={cambia('nif')} maxLength={20} /></label>
              <label>{tr('Fecha')}<input className="campo" type="date" value={form.fecha} onChange={cambia('fecha')} /></label>
              <label>{tr('Número')}<input className="campo" value={form.numero} onChange={cambia('numero')} maxLength={40} /></label>
              <label className="dd-ancho">{tr('Concepto')}<input className="campo" value={form.concepto} onChange={cambia('concepto')} maxLength={140} /></label>
              <label>{tr('Base')}<input className="campo" inputMode="decimal" value={form.base ?? ''} onChange={cambia('base')} /></label>
              <label>{tr('Tipo de IVA')}<select className="campo" value={form.ivaPct} onChange={cambia('ivaPct')}>{IVA.map((v) => <option key={v} value={v}>{v} %</option>)}</select></label>
              <label>{tr('Cuota de IVA')}<input className="campo" inputMode="decimal" value={form.cuota ?? ''} onChange={cambia('cuota')} /></label>
              <label>{tr('Retención de IRPF')}<select className="campo" value={form.irpfPct} onChange={cambia('irpfPct')}>{IRPF.map((v) => <option key={v} value={v}>{v} %</option>)}</select></label>
              <label>{tr('Importe del IRPF')}<input className="campo" inputMode="decimal" value={form.irpf ?? ''} onChange={cambia('irpf')} /></label>
              <label>{tr('Total')}<input className="campo" inputMode="decimal" value={form.total ?? ''} onChange={cambia('total')} /></label>
              <label className="dd-ancho">{tr('Categoría')}<select className="campo" value={form.categoria} onChange={cambia('categoria')}>{categorias.map(([id, nombre]) => <option key={id} value={id}>{id} · {tr(nombre)}</option>)}</select></label>
              {x?.desglose?.length > 1 && <p className="dd-ancho desp-nota">{tr('Varios tipos de IVA leídos: {tipos}. Cambiar el tipo deja uno solo.', { tipos: x.desglose.map((l) => `${l.ivaPct} % · ${eur(l.base)}`).join(' · ') })}</p>}
              <div className="dd-ancho desp-acciones">
                <button type="button" className="boton" onClick={() => guardar(d, true)} disabled={ocupado}>{d.estado === 'revisado' ? tr('Guardar') : tr('Guardar y marcar revisado')}</button>
                {d.estado !== 'revisado' && <button type="submit" className="boton sec" disabled={ocupado}>{tr('Guardar sin revisar')}</button>}
                {d.estado === 'revisado' && <button type="button" className="boton sec" onClick={() => accion({ accion: 'pendiente', id: d.id })} disabled={ocupado}>{tr('Volver a por revisar')}</button>}
              </div>
            </form>}
          <p className="desp-acciones">
            {d.archivo && <a className="boton sec" href={`/api/despacho/documentos/archivo?empresa=${encodeURIComponent(cliente.id)}&id=${encodeURIComponent(d.id)}`} target="_blank" rel="noopener">{tr('Ver el original')}</a>}
            {['error', 'revisar'].includes(d.estado) && <button type="button" className="boton sec" onClick={() => accion({ accion: 'releer', id: d.id })} disabled={ocupado}>{tr('Volver a leer con IA')}</button>}
            <button type="button" className="boton sec peligro" onClick={() => window.confirm(tr('¿Quitar este documento? Se borra también el archivo.')) && accion({ accion: 'descartar', id: d.id })} disabled={ocupado}>{tr('Quitar')}</button>
          </p>
        </div>}
      </li>;
    })}</ul> : <Vacio compacto icono="gasto" titulo={datos.documentos.length ? tr('Ningún documento en esta lista') : tr('Ningún documento en este trimestre')} />}

    <section className="grupo" aria-labelledby="dd-exportar">
      <h2 id="dd-exportar" className="grupo-t">{tr('Exportar el trimestre')}</h2>
      <div className="formulario tarjeta desp-docs-exportar">
        <label>{tr('Programa')}<select className="campo" value={exp.formato} onChange={(e) => setExp({ ...exp, formato: e.target.value })}>{FORMATOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {exp.formato === 'a3' && <label>{tr('Código de empresa en A3')}<input className="campo" inputMode="numeric" value={exp.codigo} onChange={(e) => setExp({ ...exp, codigo: e.target.value.replace(/\D/g, '').slice(0, 5) })} /></label>}
        <label>{tr('Dígitos de las subcuentas')}<input className="campo" inputMode="numeric" value={exp.digitos} onChange={(e) => setExp({ ...exp, digitos: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></label>
        <div className="desp-acciones">
          <a className="boton" href={exportar} download>{tr('Descargar para {programa}', { programa: FORMATOS.find((f) => f[0] === exp.formato)[1].split(' ')[0] })}</a>
          <button type="button" className="boton sec" onClick={descargarZip} disabled={Boolean(zip) || !datos.documentos.some((d) => d.archivo)}>{zip ? tr('Preparando {h} de {t}…', zip) : tr('ZIP con los originales')}</button>
        </div>
      </div>
      <p className="grupo-pie">{tr('Solo entran los documentos revisados del trimestre.')}</p>
    </section>

    {cliente.soloDocumentos && <section className="grupo" aria-labelledby="dd-pedir">
      <h2 id="dd-pedir" className="grupo-t">{tr('Pedirle un documento')}</h2>
      {datos.abierto && <form className="formulario tarjeta" onSubmit={pedirDoc}>
        <label>{tr('Qué necesitas')}<input className="campo" value={pedir} onChange={(e) => setPedir(e.target.value)} maxLength={300} placeholder={tr('La factura de la gasolinera del 12 de marzo')} required minLength={3} /></label>
        <div className="desp-acciones"><button type="submit" className="boton">{tr('Pedírselo')}</button></div>
      </form>}
      {pendientes.length > 0 && <ul className="grupo-lista">{pendientes.map((p) => <li key={p.id} className="fila"><span className="txt"><strong>{p.texto}</strong><small>{tr('Pendiente desde el {fecha}', { fecha: fechaCorta(String(p.creada).slice(0, 10)) })}</small></span></li>)}</ul>}
    </section>}

    {titular && cliente.soloDocumentos && <section className="grupo" aria-labelledby="dd-completo">
      <h2 id="dd-completo" className="grupo-t">{tr('Pasar a Fisquo completo')}</h2>
      <div className="grupo-c"><div className="celda"><span className="txt">{tr('Si este cliente quiere llevar sus cuentas en Fisquo')}<small>{tr('Empieza su prueba de 30 días con todo, deja de contar para tu tramo y conserva lo que ha subido. Después puedes incluirlo en tu cuota con una licencia.')}</small></span></div>
        {completo ? <div className="celda desp-acciones"><button type="button" className="boton" onClick={pasarCompleto}>{tr('Sí, pasarlo a Fisquo completo')}</button><button type="button" className="boton sec" onClick={() => setCompleto(false)}>{tr('Cancelar')}</button></div>
          : <button type="button" className="celda ir desp-celda-boton" onClick={() => setCompleto(true)}><span className="txt">{tr('Pasar a Fisquo completo')}</span></button>}
      </div>
    </section>}
  </div>;
}
