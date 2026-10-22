'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { confirmar } from './Confirmar';
import { eur, fechaCorta } from '@/lib/formato';
import { reducir } from '@/lib/reducirImagen';
import { deDataUrl, MAX_BYTES } from '@/lib/justificanteCliente';
import { leerCompartidos } from '@/lib/compartidoCliente';
import '@/app/bandeja.css';

// Bandeja de facturas (lib/bandeja.js): subir muchas a la vez, ver cómo se leen y aprobar las que cuadran.
// Se sube de dos en dos (la lectura va después, en el servidor); mientras quede alguna leyéndose, la lista se pide otra
// vez cada pocos segundos.
const ACEPTA = 'image/*,application/pdf,.pdf,.xml,.xsig,text/xml,application/xml';
const esXml = (f) => /xml/.test(f.type) || /\.(xml|xsig)$/i.test(f.name);
const esPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const GRUPOS = [
  ['revisar', 'Por revisar'],
  ['error', 'No se han podido leer'],
  ['cuarentena', 'De remitentes que no conoces'],
  ['leyendo', 'Leyendo…'],
  ['aprobado', 'Aprobadas solas (proveedores de confianza)'],
];

// Archivo elegido → lo que se sube: las fotos, reducidas como en el escáner; PDF y XML, tal cual.
async function preparar(f) {
  if (esXml(f) || esPdf(f)) return f.size > MAX_BYTES ? { error: 'pasa de 5 MB' } : { blob: f, tipo: esXml(f) ? 'application/xml' : 'application/pdf' };
  if (!/^image\//.test(f.type)) return { error: 'no es una foto, un PDF ni una factura electrónica' };
  try {
    const blob = deDataUrl(await reducir(f));
    return blob.size > MAX_BYTES ? { error: 'pasa de 5 MB' } : { blob, tipo: blob.type };
  } catch { return { error: 'no se ha podido abrir la foto' }; }
}

export async function subirABandeja(f, origen) {
  const p = await preparar(f);
  if (p.error) return `${f.name}: ${p.error}`;
  try {
    const r = await fetch(`/api/bandeja?nombre=${encodeURIComponent(f.name)}${origen ? `&origen=${origen}` : ''}`, { method: 'PUT', headers: { 'Content-Type': p.tipo }, body: p.blob });
    const d = await r.json().catch(() => ({}));
    if (r.status === 423 && d.bloqueada) window.location.replace(`/bloqueo?a=${encodeURIComponent(window.location.pathname)}`);
    return r.ok ? '' : `${f.name}: ${d.error || 'no se ha podido subir'}`;
  } catch { return `${f.name}: sin conexión`; }
}

export default function Bandeja({ inicial, resumenInicial, puedeGastar }) {
  const router = useRouter();
  const input = useRef(null);
  const [docs, setDocs] = useState(inicial);
  const [resumen, setResumen] = useState(resumenInicial);
  const [subiendo, setSubiendo] = useState(null); // { hechos, total }
  const [errores, setErrores] = useState([]);
  const [aviso, setAviso] = useState('');
  const [encima, setEncima] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const recargar = useCallback(async () => {
    try {
      const r = await fetch('/api/bandeja', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setDocs(d.documentos); setResumen(d.resumen);
    } catch { /* sin conexión: se reintenta en la siguiente vuelta */ }
  }, []);

  // Mientras se lea algo, la lista se actualiza sola.
  useEffect(() => {
    if (!resumen.leyendo && !subiendo) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') recargar(); }, 4000);
    return () => clearInterval(t);
  }, [resumen.leyendo, subiendo, recargar]);

  const subir = async (lista, origen) => {
    const archivos = [...lista].slice(0, 100);
    if (!archivos.length) return;
    setErrores([]); setAviso(''); setSubiendo({ hechos: 0, total: archivos.length });
    const fallos = [];
    let i = 0;
    const hilo = async () => {
      while (i < archivos.length) {
        const f = archivos[i++];
        const e = await subirABandeja(f, origen);
        if (e) fallos.push(e);
        setSubiendo((s) => ({ ...s, hechos: s.hechos + 1 }));
      }
    };
    await Promise.all([hilo(), hilo()]);
    setErrores(fallos);
    setSubiendo(null);
    await recargar();
    router.refresh();
  };

  // Lo compartido desde el móvil (app/sw lo deja en la caché y vuelve aquí con ?compartido=N): se sube una vez.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('compartido');
    if (q === null) return;
    window.history.replaceState(null, '', '/gastos/bandeja');
    if (q === 'sinsw') { setAviso('Fisquo aún se estaba preparando en este móvil: vuelve a compartir la factura.'); return; }
    leerCompartidos().then((l) => (l.length ? subir(l, 'compartido') : setAviso('No ha llegado ningún archivo que se pueda leer (PDF, foto o XML de hasta 5 MB).')));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const aprobarCuadran = async () => {
    const ids = docs.filter((d) => d.cuadra).map((d) => d.id);
    if (!ids.length) return;
    if (!(await confirmar({ titulo: 'Aprobar facturas', texto: ids.length === 1 ? 'Se guardará como gasto la factura que cuadra, con los datos leídos.' : `Se guardarán como gastos las ${ids.length} facturas que cuadran, con los datos leídos.`, aceptar: 'Aprobar' }))) return;
    setOcupado(true); setAviso('');
    try {
      const r = await fetch('/api/bandeja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'aprobarVarias', ids }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se han podido aprobar');
      setAviso(`${d.hechas.length === 1 ? '1 gasto guardado' : `${d.hechas.length} gastos guardados`}${d.fallidas.length ? `; ${d.fallidas.length} se han quedado para revisar` : ''}.`);
    } catch (e) { setAviso(e.message); }
    setOcupado(false);
    await recargar();
    router.refresh();
  };

  const accion = async (id, que) => {
    if (que === 'descartar' && !(await confirmar({ titulo: 'Descartar factura', texto: 'Se quita de la bandeja y se borra su archivo.', aceptar: 'Descartar', peligro: true }))) return;
    setOcupado(true);
    try {
      const r = await fetch('/api/bandeja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: que, id }) });
      if (!r.ok) setAviso((await r.json().catch(() => ({}))).error || 'No se ha podido hacer');
    } finally { setOcupado(false); }
    await recargar();
  };

  return (
    <div className="bandeja">
      {puedeGastar && (
        <div className={`bandeja-subir${encima ? ' encima' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)}
          onDrop={(e) => { e.preventDefault(); setEncima(false); subir(e.dataTransfer.files); }}>
          <div>
            <strong>Sube tus facturas de gasto</strong>
            <small>Elige o arrastra aquí los PDF, las fotos o las facturas electrónicas (XML), todos los que quieras a la vez. Fisquo los lee y te los deja listos para revisar.</small>
          </div>
          <button type="button" className="boton" disabled={Boolean(subiendo)} onClick={() => input.current?.click()}>{subiendo ? `Subiendo ${subiendo.hechos} de ${subiendo.total}…` : 'Elegir archivos'}</button>
          <input ref={input} type="file" multiple accept={ACEPTA} hidden onChange={(e) => { const l = [...e.target.files]; e.target.value = ''; subir(l); }} />
        </div>
      )}
      {errores.length > 0 && <div className="nota" role="alert"><strong>No se han podido subir:</strong><ul>{errores.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      {aviso && <p className="nota" role="status">{aviso}</p>}

      {puedeGastar && resumen.cuadran > 0 && (
        <div className="bandeja-cuadran">
          <span><strong>{resumen.cuadran === 1 ? '1 factura cuadra' : `${resumen.cuadran} facturas cuadran`}</strong>: base, IVA y total coinciden, con fecha clara y sin posibles duplicados.</span>
          <button type="button" className="boton" disabled={ocupado} onClick={aprobarCuadran}>{resumen.cuadran === 1 ? 'Aprobarla' : `Aprobar las ${resumen.cuadran}`}</button>
        </div>
      )}

      {GRUPOS.map(([estado, titulo]) => {
        const lista = docs.filter((d) => d.estado === estado);
        if (!lista.length) return null;
        return (
          <section key={estado} className="grupo-mes">
            <h2><span>{titulo}</span><small>{lista.length}</small></h2>
            <ul className="grupo-lista">
              {lista.map((d) => <Fila key={d.id} d={d} puedeGastar={puedeGastar} ocupado={ocupado} accion={accion} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Fila({ d, puedeGastar, ocupado, accion }) {
  const p = d.propuesta;
  const titulo = p?.proveedor || p?.concepto || d.correo?.asunto || d.nombre;
  const detalle = [
    p?.fecha && fechaCorta(p.fecha),
    d.correo ? `de ${d.correo.deNombre || d.correo.de}` : d.origen === 'compartido' ? 'compartida desde el móvil' : null,
    d.tipo === 'application/xml' ? 'factura electrónica' : null,
  ].filter(Boolean).join(' · ');
  const contenido = <>
    <span className="txt">
      <strong>{titulo}</strong>
      <small>{detalle || d.nombre}</small>
      {d.error && <small className="bandeja-error">{d.error}</small>}
      <span className="bandeja-chips">
        {d.cuadra && <span className="chip-ok">Cuadra</span>}
        {d.duplicados?.length > 0 && <span className="chip-aviso">¿Ya apuntada?</span>}
        {d.banco && <span className="chip-info">Casa con el banco</span>}
        {d.habitual && <span className="chip-info">Como la anterior</span>}
        {p?.desglose && <span className="chip-info">Varios tipos de IVA</span>}
        {p?.avisos?.length > 0 && !d.cuadra && <span className="chip-aviso">Revisar importes</span>}
      </span>
    </span>
    <span className="imp-col">
      {d.total > 0 && <span className="imp">{eur(d.total)}</span>}
      {d.estado === 'leyendo' && <span className="estado-txt">Leyendo…</span>}
    </span>
  </>;
  if (d.estado === 'leyendo') return <li><div className="fila">{contenido}</div></li>;
  return (
    <li className="bandeja-fila">
      <Link href={`/gastos/bandeja/${d.id}`} className="fila">{contenido}</Link>
      {puedeGastar && d.estado === 'cuarentena' && <div className="bandeja-acciones">
        <button type="button" className="boton sec pequeno" disabled={ocupado} onClick={() => accion(d.id, 'releer')}>Leerla</button>
        {d.correo && <button type="button" className="boton sec pequeno" disabled={ocupado} onClick={() => accion(d.id, 'permitir')}>Permitir siempre a {d.correo.de}</button>}
        <button type="button" className="boton sec pequeno" disabled={ocupado} onClick={() => accion(d.id, 'descartar')}>Descartar</button>
      </div>}
      {puedeGastar && d.estado === 'error' && <div className="bandeja-acciones">
        <button type="button" className="boton sec pequeno" disabled={ocupado} onClick={() => accion(d.id, 'releer')}>Leer otra vez</button>
      </div>}
    </li>
  );
}
