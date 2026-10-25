'use client';

import Termino from '@/components/Termino';

import { confirmar as confirmarAccion } from './Confirmar';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { anterior, atras, volverA } from '@/lib/transicion';
import Deslizable from './Deslizable';
import { eur, fechaCorta } from '@/lib/formato';
import { TIPOS_IGIC } from '@/lib/igic';
import { importes, nifUE, origenGasto } from '@/lib/calculos';
import { conIva, costeAfecto, partirIva, pctAfecto, pctDeducible, tipoAutoliquidado } from '@/lib/ivaDeducible';
import { parseImporte } from '@/lib/importe';
import { CATEGORIAS, categoria, categoriaDe, pareceBien } from '@/lib/categorias';
import { SUBCLAVES_190, clave190De } from '@/lib/modelos';
import { LIMITE_LIBERTAD, TIPOS_BIEN, coeficiente } from '@/lib/amortizaciones';
import { emparejarLineas } from '@/lib/inventario';
import { leerFacturaElectronica } from '@/lib/facturae';
import { reducir } from '@/lib/reducirImagen';
import RafagaTickets from './RafagaTickets';
import CupoEscaneo from './CupoEscaneo';
import { preparar, subir } from '@/lib/justificanteCliente';
import { escanearNativo } from '@/lib/escanerNativo';
import { NO_IA, permisoIA } from '@/lib/permisoIA';
import { ACEPTA, subirVarias } from '@/lib/bandejaCliente';
import useCambiosSinGuardar, { salirSinGuardar } from './useCambiosSinGuardar';
import Link from 'next/link';
import '@/app/ticket.css';

// «Cancelar» el gasto a medio apuntar (en la lista de gastos, el formulario se pliega): no es salir, es descartarlo.
const DESCARTAR = { titulo: '¿Descartar el gasto?', texto: 'Se perderá lo que has rellenado.', aceptar: 'Descartar' };

// Varios tipos de IVA en la misma factura (lib/calculos.js porTipo): en el formulario, cada base como se escribe.
const aFormulario = (l) => (l?.length > 1 ? l.map((t) => ({ ivaPct: Number(t.ivaPct ?? t.pct), base: String(t.base).replace('.', ',') })) : undefined);
const porTipoNum = (g) => (g.porTipo?.length ? g.porTipo.map((t) => ({ ivaPct: Number(t.ivaPct), base: parseImporte(t.base) || 0 })) : undefined);
const sumaBases = (l) => Math.round(l.reduce((s, t) => s + t.base, 0) * 100) / 100;
// El gasto con números, para calcular: con varios tipos, la base es su suma y el tipo, el de más base.
const numerico = (g) => {
  const l = porTipoNum(g);
  if (!l) return { ...g, base: parseImporte(g.base) || 0, porTipo: undefined };
  return { ...g, base: sumaBases(l), ivaPct: [...l].sort((a, b) => Math.abs(b.base) - Math.abs(a.base))[0].ivaPct, porTipo: l };
};
// Lo que se manda al servidor: lo mismo, con la base como se escribe.
const paraEnviar = (g) => {
  const n = numerico(g);
  return { ...g, ...(n.porTipo ? { base: String(n.base).replace('.', ','), ivaPct: n.ivaPct, porTipo: n.porTipo } : { porTipo: undefined }) };
};

// Lo que la bandeja propone (lib/bandeja.js) en el formato del formulario: los importes como se escriben.
const desdePropuesta = (p, vacio) => {
  const { cuadra, avisos, fechaDudosa, desglose, ...resto } = p || {};
  return { ...vacio, ...resto, base: resto.base > 0 ? String(resto.base).replace('.', ',') : '', irpfPct: resto.irpfPct || 0, actividad: resto.actividad || vacio.actividad, porTipo: aFormulario(desglose) };
};

// Lo habitual del proveedor (lib/proveedorHabitual.js) en lo que aún no se ha tocado.
const CAMPOS_HABITUALES = ['categoria', 'deduciblePct', 'afectoPct', 'actividad', 'proyecto', 'alquiler', 'recc', 'clave190'];

// plegado: en la lista de gastos empieza como una tarjeta con «Escanear ticket», «Subir facturas» y «Apuntar a mano»; el
// formulario se abre al escanear o al pedirlo. Las facturas subidas van a «Por revisar» (lib/bandeja.js), en la misma
// pantalla; correo: { listo, direccion } de la dirección para reenviárselas (lib/buzon.js).
// documento: una factura de la bandeja (lib/bandeja.js) para revisar y aprobar; siguiente: la que va después.
export default function FormGasto({ hoy, gasto, actividades, alquiler = false, plegado = false, destacar = false, regimen = 'autonomo', cupoInicial = null, movimiento = null, productos = [], proyectos = [], igic = false, especial = false, documento = null, siguiente = null , correo = null }) {
  const impuesto = igic ? 'IGIC' : 'IVA';
  const router = useRouter();
  const prefijo = useId();
  const camaraInput = useRef(null);
  const facturaInput = useRef(null);
  const vacio = { fecha: hoy, actividad: actividades[0].id, concepto: '', proveedor: '', base: '', ivaPct: igic ? 7 : 21 };
  // Desde un cargo del banco sin gasto: fecha, proveedor e importe del banco (base estimada al 21 %, hasta leer la factura).
  const delBanco = movimiento && { ...vacio, fecha: movimiento.fecha, concepto: movimiento.contraparte || movimiento.concepto, proveedor: movimiento.contraparte || '', base: String(Math.round((Math.abs(movimiento.importe) / (igic ? 1.07 : 1.21)) * 100) / 100).replace('.', ','), banco: movimiento.id };
  const [g, setG] = useState(gasto ? { ...gasto, base: String(gasto.base).replace('.', ','), porTipo: aFormulario(gasto.porTipo) } : documento ? desdePropuesta(documento.propuesta, vacio) : delBanco || vacio);
  // Factura de la bandeja que casa con un cargo del banco: se empareja al aprobarla, salvo que se quite.
  const [conBanco, setConBanco] = useState(Boolean(documento?.banco));
  const [habitualAplicado, setHabitualAplicado] = useState(documento?.habitual || null);
  const [error, setError] = useState('');
  // IVA deducible en parte (lib/ivaDeducible.js): 100, 50 y 0 en el desplegable; cualquier otro, escrito a mano.
  const [pctOtro, setPctOtro] = useState(() => ![undefined, null, '', 100, 50, 0].includes(gasto ? gasto.deduciblePct : documento?.propuesta?.deduciblePct));
  // Parte que cuenta en el IRPF (afectoPct, lib/ivaDeducible.js), aparte de la del IVA: solo para autónomos.
  const [verAfecto, setVerAfecto] = useState(() => [gasto?.afectoPct, documento?.propuesta?.afectoPct].some((v) => v !== undefined && v !== null));
  const [afectoOtro, setAfectoOtro] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [avisoDuplicados, setAvisoDuplicados] = useState(null);
  const poner = (k, v) => { setAvisoDuplicados(null); setG((x) => ({ ...x, [k]: v })); };
  const [leyendo, setLeyendo] = useState('');
  const [abierto, setAbierto] = useState(Boolean(gasto) || !plegado);
  const [hecho, setHecho] = useState(false);
  // Subir facturas a «Por revisar» desde la tarjeta (una o varias, también arrastrándolas).
  const facturasInput = useRef(null);
  const [subida, setSubida] = useState(null); // { hechos, total } mientras sube; { texto, errores } al acabar
  const [encima, setEncima] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const subirFacturas = async (lista) => {
    if (!lista.length || subida?.total) return;
    setSubida({ hechos: 0, total: lista.length });
    const r = await subirVarias(lista, { progreso: (hechos, total) => setSubida({ hechos, total }) });
    // Una sola: se abre para revisarla en cuanto se lea. Varias: se leen en «Por revisar», aquí debajo.
    if (lista.length === 1 && r.ids.length === 1) { router.push(`/gastos/bandeja/${encodeURIComponent(r.ids[0])}`); return; }
    // Varias: a la pestaña «Por revisar», donde se ven leerse. Si alguna falló, se queda aquí con el porqué.
    if (r.ids.length && !r.errores.length) { router.push('/gastos?ver=revisar'); router.refresh(); return; }
    setSubida({ texto: r.ids.length ? `${r.ids.length === 1 ? '1 factura subida' : `${r.ids.length} facturas subidas`}: se están leyendo en «Por revisar».` : '', errores: r.errores });
    router.refresh();
  };
  useEffect(() => {
    const abrirManual = () => {
      if (window.location.hash === '#apuntar-gasto') { setAbierto(true); setHecho(false); }
    };
    abrirManual();
    window.addEventListener('hashchange', abrirManual);
    return () => window.removeEventListener('hashchange', abrirManual);
  }, []);
  useEffect(() => {
    if (abierto && window.location.hash === '#apuntar-gasto') document.getElementById('apuntar-gasto')?.focus();
  }, [abierto]);
  const [ultimoGuardado, setUltimoGuardado] = useState(null);
  const gn = numerico(g);
  const calculo = importes(gn);
  const tiposImpuesto = igic ? TIPOS_IGIC : [21, 10, 4, 0];
  // Justificante leído (foto reducida o PDF): se sube al guardar el gasto nuevo. En la ficha, se adjunta o sustituye aparte.
  const [adjunto, setAdjunto] = useState(null);
  // «¿Salir sin guardar?» con lo escrito, el justificante leído o el emparejamiento con el banco cambiados.
  const sinGuardar = useCambiosSinGuardar({ g, adjunto: Boolean(adjunto), conBanco });
  const [avisoArchivo, setAvisoArchivo] = useState('');
  const [archivoPendiente, setArchivoPendiente] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const reintentarArchivo = async () => {
    setEnviando(true);
    const fallo = await subir(archivoPendiente.id, archivoPendiente.blob);
    setAvisoArchivo(fallo ? `Gasto guardado sin el justificante: ${fallo}. Reintenta guardar el archivo.` : 'Justificante guardado.');
    if (!fallo) { setUltimoGuardado({ id: archivoPendiente.id, archivo: true }); setArchivoPendiente(null); router.refresh(); }
    setEnviando(false);
  };
  const avisoAdjunto = <>
    {avisoArchivo && <p className="nota" role="alert">{avisoArchivo}</p>}
    {ultimoGuardado && !archivoPendiente && <p className="gasto-confirmacion" role="status">{ultimoGuardado.archivo ? 'Gasto y justificante guardados.' : 'Gasto guardado.'} <a href={`/gastos/${encodeURIComponent(ultimoGuardado.id)}`}>{ultimoGuardado.archivo ? 'Ver gasto y justificante' : 'Ver gasto'}</a></p>}
    {archivoPendiente && <div className="gasto-guardar"><button type="button" className="boton sec" disabled={enviando} onClick={reintentarArchivo}>Reintentar guardar justificante</button><a className="boton sec" href={`/gastos/${encodeURIComponent(archivoPendiente.id)}`}>Ver gasto guardado</a></div>}
  </>;
  // En la app de iOS, el escáner de documentos nativo (lib/escanerNativo.js); si no lo hay, la cámara del <input>.
  const abrirCamara = async () => {
    const escaneo = await escanearNativo();
    if (escaneo === undefined) { camaraInput.current?.click(); return; }
    if (escaneo[0]) foto({ target: { files: [escaneo[0]], value: '' } });
  };
  const foto = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setAvisoDuplicados(null); setAdjunto(null); setAvisoArchivo(''); setUltimoGuardado(null);
    setAbierto(true); setHecho(false);
    // Factura electrónica (Facturae, UBL o CII): se lee aquí mismo, sin IA, con todos sus datos exactos.
    if (/xml/.test(archivo.type) || /\.(xml|xsig)$/i.test(archivo.name)) {
      setError('');
      const t = archivo.size > 5e6 ? { error: 'El archivo es demasiado grande (máx. 5 MB)' } : leerFacturaElectronica(await archivo.text());
      if (t.error) { setLeyendo(''); setError(t.error); return; }
      const stock = productos.length ? emparejarLineas(t.lineas || [], productos).map((l) => ({ ...l, cantidad: String(l.cantidad).replace('.', ','), coste: String(l.coste).replace('.', ',') })) : [];
      const varios = (t.desglose || []).filter((d) => d.base).length > 1;
      setG((x) => ({ ...x, ...(stock.length ? { stock } : {}), proveedor: t.proveedor?.nombre || x.proveedor, proveedorNif: t.proveedor?.nif || x.proveedorNif, concepto: t.concepto || t.proveedor?.nombre || x.concepto,
        base: String(t.base).replace('.', ','), ivaPct: t.ivaPct, fecha: t.fecha || x.fecha, numero: t.numero || '', ...([1, 2, 7, 15].includes(Number(t.irpfPct)) ? { irpfPct: Number(t.irpfPct) } : {}),
        ...(t.vencimiento && t.vencimiento >= (t.fecha || '') ? { vence: t.vencimiento, ...(t.vencimiento >= hoy ? { pendiente: true } : {}) } : {}), efactura: t.formato, ...(!Number(t.ivaPct) && nifUE(t.proveedor?.nif) ? { origen: 'ue' } : {}),
        porTipo: varios ? aFormulario(t.desglose.filter((d) => d.base)) : undefined }));
      setLeyendo(`Factura electrónica ${t.numero || ''} leída${varios ? `, con varios tipos de ${impuesto} por separado` : ''}. Revisa los datos antes de guardar.`);
      return;
    }
    const pdf = archivo.type === 'application/pdf';
    if (pdf && archivo.size > 5e6) { setError('El PDF es demasiado grande (máx. 5 MB)'); return; }
    setProcesando(true);
    setLeyendo(pdf ? 'Leyendo la factura…' : 'Leyendo el ticket…'); setError('');
    try {
      const imagen = pdf ? await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(archivo); }) : await reducir(archivo);
      const j = await preparar(archivo, pdf ? null : imagen);
      if (j.error) throw new Error(j.error);
      setAdjunto({ ...j, nombre: archivo.name });
      let d;
      if (!permisoIA()) throw new Error(NO_IA);
      try { d = await llamar('/api/gastos/ticket', { method: 'POST', body: JSON.stringify({ imagen }) }); }
      finally { window.dispatchEvent(new Event('fisquo:escaneos')); }
      const t = d.gasto;
      // Con inventario: las líneas de la factura que son productos del catálogo entran al almacén.
      const stock = productos.length ? emparejarLineas(t.lineas, productos).map((l) => ({ ...l, cantidad: String(l.cantidad).replace('.', ','), coste: String(l.coste).replace('.', ',') })) : [];
      setG((x) => ({ ...x, ...(stock.length ? { stock } : {}), proveedor: t.proveedor || x.proveedor, proveedorNif: t.nif || x.proveedorNif, ...(t.numero ? { numero: t.numero } : {}), ...(t.vence ? { vence: t.vence, ...(t.vence >= hoy ? { pendiente: true } : {}) } : {}), concepto: t.concepto || t.proveedor || x.concepto, base: t.base !== '' ? String(t.base).replace('.', ',') : x.base, ivaPct: t.ivaPct, irpfPct: t.irpfPct || 0, fecha: t.fecha, ...(!Number(t.ivaPct) && nifUE(t.nif) ? { origen: 'ue' } : {}),
        porTipo: t.varios ? aFormulario(t.desglose) : undefined,
        // Lo que se eligió en el último gasto de este proveedor, en lo que aún no se ha tocado.
        ...Object.fromEntries(CAMPOS_HABITUALES.filter((c) => d.habitual?.[c] !== undefined && (x[c] === undefined || x[c] === '' || (c === 'actividad' && x[c] === vacio.actividad))).map((c) => [c, d.habitual[c]])),
        ...(d.habitual?.concepto ? { concepto: d.habitual.concepto } : {}),
        ...(d.habitual?.irpfPct && t.irpfPct == null ? { irpfPct: d.habitual.irpfPct } : {}) }));
      if (d.habitual?.afectoPct !== undefined) setVerAfecto(true);
      if (d.habitual?.deduciblePct !== undefined && ![100, 50, 0].includes(d.habitual.deduciblePct)) setPctOtro(true);
      setHabitualAplicado(d.habitual || null);
      const avisos = Array.isArray(t.avisos) ? t.avisos : [];
      const detalle = t.varios ? `Tiene varios tipos de ${impuesto}: están por separado, con la base de cada uno.` : '';
      setLeyendo(['Revisa los datos antes de guardar.', ...avisos, detalle].filter(Boolean).join(' '));
    } catch (err) { setLeyendo('Revisa o rellena los datos antes de guardar.'); setError(err.message); }
    finally { setProcesando(false); }
  };

  const enviar = async (e, confirmacion = null) => {
    e?.preventDefault();
    if (enviando || procesando || archivoPendiente || (avisoDuplicados && !confirmacion)) return;
    setEnviando(true); setError(''); setAvisoArchivo('');
    let fallo = '';
    try {
      if (documento) {
        const datos = confirmacion || paraEnviar(g);
        const r = await fetch('/api/bandeja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'aprobar', id: documento.id, datos: { ...datos, ...(conBanco && documento.banco ? { banco: documento.banco.id } : {}) }, ...(confirmacion ? { duplicadoConfirmado: true } : {}) }) });
        const d = await r.json().catch(() => ({}));
        if (r.status === 423 && d.bloqueada) window.location.replace(`/bloqueo?a=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        if (r.status === 409 && Array.isArray(d.duplicados) && d.duplicados.length) { setAvisoDuplicados({ datos, duplicados: d.duplicados }); return; }
        if (!r.ok) throw new Error(d.error || 'No se ha podido aprobar la factura. Revisa la conexión e inténtalo otra vez.');
        await sinGuardar.guardado();
        // A la siguiente por revisar en lugar de esta, o de vuelta a la lista: así «atrás» no pasa por las ya aprobadas.
        // Con el aviso si el banco no ha casado.
        if (siguiente) {
          router.replace(`/gastos/bandeja/${encodeURIComponent(siguiente)}${d.aviso ? '?aviso=banco' : ''}`);
          router.refresh();
          return;
        }
        if (d.aviso && anterior()) addEventListener('popstate', () => router.replace('/gastos?ver=revisar&aviso=banco'), { once: true });
        volverA(router, `/gastos?ver=revisar${d.aviso ? '&aviso=banco' : ''}`, 'atras', true);
        return;
      } else if (gasto) {
        await llamar('/api/gastos', { method: 'PATCH', body: JSON.stringify(paraEnviar(g)) });
      } else {
        const datos = confirmacion || paraEnviar(g);
        const r = await fetch('/api/gastos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...datos, ...(adjunto ? { huella: adjunto.huella } : {}), ...(confirmacion ? { duplicadoConfirmado: true } : {}) }) });
        const d = await r.json().catch(() => ({}));
        if (r.status === 423 && d.bloqueada) window.location.replace(`/bloqueo?a=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        if (r.status === 409 && Array.isArray(d.duplicados) && d.duplicados.length) {
          setAvisoDuplicados({ datos, duplicados: d.duplicados });
          return;
        }
        if (!r.ok) throw new Error(d.error || 'No se ha podido guardar el gasto. Revisa la conexión e inténtalo otra vez.');
        if (!d.gasto?.id) throw new Error('No se ha podido confirmar el gasto. Revisa la lista antes de volver a guardarlo.');
        // El gasto ya está guardado: si el archivo no sube, se avisa y se puede adjuntar después desde su ficha.
        if (adjunto) fallo = await subir(d.gasto.id, adjunto.blob);
        setUltimoGuardado(fallo ? null : { id: d.gasto.id, archivo: Boolean(adjunto) });
        setAdjunto(null);
        if (fallo) {
          setArchivoPendiente({ id: d.gasto.id, blob: adjunto.blob });
          fallo = `Gasto guardado sin el justificante: ${fallo}. Reintenta guardar el archivo sin volver a crear el gasto.`;
        }
      }
      // Guardado: se vuelve a la lista o el formulario se vacía para el siguiente.
      await sinGuardar.soltar();
      setAvisoDuplicados(null);
      if (gasto || (movimiento && !fallo)) { volverA(router, '/gastos', 'atras', true); return; }
      setAvisoArchivo(fallo);
      setG(vacio);
      setLeyendo('');
      if (plegado && !fallo) { setAbierto(false); setHecho(true); }
      router.refresh();
    } catch (err) { setError(err.message); }
    finally { setEnviando(false); }
  };

  if (!abierto) {
    return (
      <div className={`gasto-rapido${destacar ? ' destacado' : ''}${encima ? ' encima' : ''}`}
        onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setEncima(true); } }} onDragLeave={() => setEncima(false)}
        onDrop={(e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); setEncima(false); subirFacturas([...e.dataTransfer.files]); }}>
        <div className="gasto-rapido-txt">
          <strong>{hecho ? '✓ Gasto añadido' : encima ? 'Suelta aquí tus facturas' : 'Añadir gastos'}</strong>
          <small>Haz una foto al ticket o sube tus facturas, una o varias<span className="solo-pc"> (también arrastrándolas aquí)</span>. Fisquo las lee por ti.</small>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {avisoAdjunto}
        {subida?.texto && <p className="gasto-confirmacion" role="status">{subida.texto} <Link href="/gastos?ver=revisar">Ver ›</Link></p>}
        {subida?.errores?.length > 0 && <div className="nota" role="alert"><strong>No se han podido subir:</strong><ul>{subida.errores.map((x) => <li key={x}>{x}</li>)}</ul></div>}
        <div className="gasto-rapido-botones">
          <button type="button" id="escanear-ticket" className="boton gasto-escanear" onClick={abrirCamara}><svg viewBox="0 0 24 24" aria-hidden><path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M4 12h16" /></svg>Escanear ticket</button><input ref={camaraInput} type="file" accept="image/*" capture="environment" onChange={foto} hidden />
          {!gasto && !movimiento && <RafagaTickets igic={igic} hoy={hoy} actividades={actividades} />}
          <button type="button" className="boton sec" disabled={Boolean(subida?.total)} onClick={() => facturasInput.current?.click()}>{subida?.total ? `Subiendo ${subida.hechos} de ${subida.total}…` : 'Subir facturas'}</button><input ref={facturasInput} type="file" multiple accept={ACEPTA} onChange={(e) => { const l = [...e.target.files]; e.target.value = ''; subirFacturas(l); }} hidden />
          <button id="apuntar-gasto" type="button" className="boton sec" onClick={() => { setAbierto(true); setHecho(false); }}>Apuntar a mano</button>
        </div>
        {correo?.direccion && (
          <p className="gasto-correo">
            <span>O reenvíalas por correo a</span> <code>{correo.direccion}</code>
            <button type="button" className="enlace" onClick={async () => { try { await navigator.clipboard.writeText(correo.direccion); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* se ve en pantalla */ } }}>{copiado ? 'Copiada' : 'Copiar'}</button>
            <Link href="/gastos?ver=revisar#correo">Que lleguen solas ›</Link>
          </p>
        )}
        {correo?.listo && !correo.direccion && <p className="gasto-correo"><Link href="/gastos?ver=revisar#correo">Recíbelas también por correo, sin descargarlas ›</Link></p>}
        <CupoEscaneo inicial={cupoInicial} />
      </div>
    );
  }

  return (
    <form id="apuntar-gasto" tabIndex={-1} className="formulario tarjeta" onSubmit={enviar}>
      <fieldset disabled={enviando || procesando || Boolean(archivoPendiente)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, gap: 12 }}>
      <h3>{gasto ? 'Editar gasto' : documento ? 'Revisar factura' : movimiento ? 'Gasto del banco' : 'Añadir gasto deducible'}</h3>
      {movimiento && <p className="nota">Cargo del {fechaCorta(movimiento.fecha)} por {eur(Math.abs(movimiento.importe))} ({movimiento.concepto}). Sube la factura para que Fisquo lea la base y el {impuesto}; al guardar queda emparejado con el banco.</p>}
      {actividades.length > 1 && <Deslizable className={`tipo ${actividades.length === 2 ? 'dos' : 'varias'}`}>
        {actividades.map(({ id, nombre }) => (
          <button type="button" key={id} className={g.actividad === id ? 'activo' : ''} onClick={() => poner('actividad', id)}>{nombre}</button>
        ))}
      </Deslizable>}
      {!gasto && !documento && <div className="ticket-ia">
        <p className="ticket-ia-t">Rellénalo con IA</p>
        <p className="ticket-ia-txt">Haz una foto del ticket o sube la factura que te han enviado (imagen o PDF de hasta 3 MB y 10 páginas). Fisquo lee también el IRPF.</p>
        <div className="ticket-ia-botones">
          <button id="escanear-ticket" type="button" className="boton sec ticket-foto" onClick={abrirCamara}>Escanear ticket</button><input ref={camaraInput} type="file" accept="image/*" capture="environment" onChange={foto} hidden />
          <button type="button" className="boton sec ticket-foto" onClick={() => facturaInput.current?.click()}>Subir factura</button><input ref={facturaInput} type="file" accept="image/*,application/pdf,.xml,.xsig,text/xml,application/xml" onChange={foto} hidden />
        </div>
        <CupoEscaneo inicial={cupoInicial} />
      </div>}
      {leyendo && <p className="nota ticket-nota" role="status">{leyendo}</p>}
      {documento?.propuesta?.avisos?.length > 0 && <p className="nota ticket-nota" role="status">{documento.propuesta.avisos.join(' ')}</p>}
      {habitualAplicado?.proveedor && <p className="nota" role="status">Categoría, {impuesto} deducible y actividad como en el último gasto de {habitualAplicado.proveedor}{habitualAplicado.fecha ? ` (${fechaCorta(habitualAplicado.fecha)})` : ''}. Cámbialos si esta vez es distinto.</p>}
      {adjunto && <div className="gasto-adjunto" role="status"><strong>{adjunto.blob.type === 'application/pdf' ? 'PDF adjunto' : 'Foto adjunta'}</strong><span>{adjunto.nombre}</span><small>Se guardará junto con este gasto al pulsar Añadir.</small></div>}
      {gasto && <Justificante gasto={gasto} />}
      <label>Proveedor (opcional)<input className="campo" placeholder="Proveedor (opcional)" value={g.proveedor || ''} onChange={(e) => poner('proveedor', e.target.value)} /></label>
      {g.proveedor && <label>NIF del proveedor (opcional)<input spellCheck={false} autoCorrect="off" autoCapitalize="characters" className="campo" placeholder="NIF del proveedor (opcional)" value={g.proveedorNif || ''} onChange={(e) => poner('proveedorNif', e.target.value)} /></label>}
      {(g.proveedor || g.numero) && <label>Nº de factura (opcional)<input spellCheck={false} autoCorrect="off" className="campo" placeholder="Nº de factura (opcional)" value={g.numero || ''} onChange={(e) => poner('numero', e.target.value)} maxLength={40} /></label>}
      <label>Concepto<input className="campo" placeholder="Concepto" value={g.concepto} onChange={(e) => poner('concepto', e.target.value)} required /></label>
      {g.porTipo ? (
        // Una factura con varios tipos (comida al 10 % y bebida al 21 %): la base de cada tipo; la del gasto es su suma.
        <div className="gasto-tipos">
          <p className="mini-t">Base de cada tipo de {impuesto} <small>(en total {eur(gn.base)})</small></p>
          {g.porTipo.map((t, i) => (
            <div key={i} className="gasto-tipo">
              <label>Base sin {impuesto}<input className="campo" inputMode="decimal" placeholder={`Base sin ${impuesto}`} value={t.base} onChange={(e) => poner('porTipo', g.porTipo.map((x, j) => (j === i ? { ...x, base: e.target.value } : x)))} required /></label>
              <label>{impuesto}<select className="campo" value={t.ivaPct} onChange={(e) => poner('porTipo', g.porTipo.map((x, j) => (j === i ? { ...x, ivaPct: Number(e.target.value) } : x)))}>
                {[...new Set([...tiposImpuesto, t.ivaPct])].map((n) => <option key={n} value={n}>{impuesto} {String(n).replace('.', ',')}%</option>)}
              </select></label>
              {g.porTipo.length > 2 && <button type="button" className="linea-quitar" aria-label="Quitar este tipo" onClick={() => poner('porTipo', g.porTipo.filter((_, j) => j !== i))}>×</button>}
            </div>
          ))}
          <div className="gasto-tipos-botones">
            {g.porTipo.length < 6 && tiposImpuesto.some((n) => !g.porTipo.some((t) => t.ivaPct === n)) && <button type="button" className="boton sec pequeno" onClick={() => poner('porTipo', [...g.porTipo, { ivaPct: tiposImpuesto.find((n) => !g.porTipo.some((t) => t.ivaPct === n)), base: '' }])}>+ Otro tipo</button>}
            <button type="button" className="enlace" onClick={() => setG((x) => { const n = numerico(x); return { ...x, porTipo: undefined, base: String(n.base || '').replace('.', ','), ivaPct: n.ivaPct }; })}>Un solo tipo de {impuesto}</button>
          </div>
        </div>
      ) : <>
        <div className="dos-col">
          <label>Base sin {impuesto}<input className="campo" inputMode="decimal" placeholder={`Base sin ${impuesto}`} value={g.base} onChange={(e) => poner('base', e.target.value)} required /></label>
          <label>{impuesto}<select className="campo" value={g.ivaPct} onChange={(e) => poner('ivaPct', Number(e.target.value))}>
            {tiposImpuesto.map((n) => <option key={n} value={n}>{impuesto} {n}%</option>)}
          </select></label>
        </div>
        {!g.inversion && !g.isp && !g.importacion && !g.compensacion && !['ue', 'fuera'].includes(g.origen) && !gasto?.pedidoProv && (
          <button type="button" className="enlace" onClick={() => poner('porTipo', [{ ivaPct: Number(g.ivaPct), base: g.base }, { ivaPct: tiposImpuesto.find((n) => n !== Number(g.ivaPct)), base: '' }])}>La factura lleva varios tipos de {impuesto}</button>
        )}
      </>}
      {(
        <select className="campo" value={g.irpfPct || 0} onChange={(e) => poner('irpfPct', Number(e.target.value))} aria-label="Retención de IRPF">
          <option value={0}>Sin retención</option>
          <option value={15}>Le retengo el 15 % (profesional)</option>
          <option value={7}>Le retengo el 7 % (profesional que empieza)</option>
          <option value={2}>Le retengo el 2 % (agricultor o ganadero)</option>
          <option value={1}>Le retengo el 1 % (empresario en módulos)</option>
        </select>
      )}
      {Number(g.irpfPct) > 0 && <p className="nota">Le pagas la factura menos la retención, y esa retención la ingresas tú en el 111.</p>}
      {Number(g.irpfPct) > 0 && !g.alquiler && (() => {
        // Subclave del 190 (lib/modelos.js): solo si a ese % le corresponde más de una.
        const opciones = Object.entries(SUBCLAVES_190).filter(([, s]) => s.pct === Number(g.irpfPct));
        return opciones.length > 1 && (
          <select className="campo" value={clave190De(g)} onChange={(e) => poner('clave190', e.target.value)} aria-label="Qué es, para el modelo 190">
            {opciones.map(([k, s]) => <option key={k} value={k}>{s.nombre} · 190 {k}</option>)}
          </select>
        );
      })()}
      {(conIva(gn) || origenGasto(gn)) && <>
        <select className="campo" value={pctOtro ? 'otro' : String(pctDeducible(g))} aria-label={`${impuesto} que te deduces`}
          onChange={(e) => {
            const v = e.target.value; setPctOtro(v === 'otro'); poner('deduciblePct', v === 'otro' ? '' : v === '100' ? undefined : Number(v));
            // Un turismo de uso mixto deduce el 50 % del IVA, pero en el IRPF, para la AEAT, nada: así sale por defecto.
            if (regimen !== 'sociedad' && !gasto && v === '50') { poner('afectoPct', 0); setVerAfecto(true); setAfectoOtro(false); }
          }}>
          <option value="100">Me deduzco todo el {impuesto}</option>
          <option value="50">Me deduzco el 50 % (coche, uso mixto)</option>
          <option value="0">No me deduzco el {impuesto}</option>
          <option value="otro">Me deduzco otro porcentaje…</option>
        </select>
        {pctOtro && <label>% del {impuesto} que te deduces<input className="campo" inputMode="decimal" value={g.deduciblePct ?? ''} onChange={(e) => poner('deduciblePct', e.target.value)} placeholder="Ej.: 30" /></label>}
        {pctDeducible(g) === 100 && Number(g.ivaPct) > 0 && !g.proveedorNif && <p className="nota">¿Es un ticket sin tu NIF? Su {impuesto} no se deduce sin factura con tu NIF: pide factura con tu NIF o elige «No me deduzco el {impuesto}».</p>}
        {pctDeducible(g) < 100 && <p className="nota">Solo se deduce el {impuesto} de la parte que usas para tu actividad (un turismo se presume al 50 %). El {impuesto} que no te deduces cuenta como gasto{g.inversion ? ' y se amortiza con el bien' : ''} en la parte que uses para la actividad.</p>}
      </>}
      {regimen !== 'sociedad' && (verAfecto || pctDeducible(g) < 100 ? (() => {
        const p = pctDeducible(g), a = g.afectoPct === undefined || g.afectoPct === null || g.afectoPct === '' ? null : pctAfecto(g);
        const vivienda = Math.round(p * 30) / 100;
        const valor = afectoOtro ? 'otro' : a === null ? '100' : a === 0 ? '0' : p < 100 && a === p ? 'iva' : p < 100 && a === vivienda ? 'vivienda' : a === 100 ? '100' : 'otro';
        return <>
          <select className="campo" value={valor} aria-label="Parte que cuenta como gasto en el IRPF"
            onChange={(e) => { const v = e.target.value; setAfectoOtro(v === 'otro'); poner('afectoPct', v === '100' ? undefined : v === 'iva' ? p : v === 'vivienda' ? vivienda : v === 'otro' ? (a ?? '') : Number(v)); }}>
            <option value="100">En el IRPF cuenta entero (solo lo uso para la actividad)</option>
            {p < 100 && <option value="iva">En el IRPF, la misma parte que en el {impuesto} ({String(p).replace('.', ',')} %)</option>}
            {p < 100 && <option value="vivienda">Suministros de casa con despacho: el 30 % de esa parte ({String(vivienda).replace('.', ',')} %)</option>}
            <option value="0">En el IRPF no cuenta (turismo sin uso exclusivo, gasto personal)</option>
            <option value="otro">En el IRPF cuenta otro porcentaje…</option>
          </select>
          {valor === 'otro' && <label>% que cuenta en el IRPF<input className="campo" inputMode="decimal" value={g.afectoPct ?? ''} onChange={(e) => poner('afectoPct', e.target.value)} placeholder="Ej.: 30" /></label>}
          <p className="nota">El 130 y la renta solo restan la parte del gasto que es de tu actividad. Un coche que también usas para lo tuyo, para Hacienda no cuenta en el IRPF aunque te deduzcas la mitad del {impuesto}; los suministros de casa con despacho, el 30 % de la parte del despacho.{gn.base > 0 ? ` En el IRPF restas ${eur(costeAfecto(gn))}.` : ''}</p>
        </>;
      })() : <button type="button" className="enlace" onClick={() => setVerAfecto(true)}>¿Lo usas también para lo tuyo? Indica la parte que es de tu actividad</button>)}
      {gn.base > 0 && <dl className="gasto-importes" aria-label="Importes del gasto">
        <div><dt>Base imponible</dt><dd>{eur(calculo.base)}</dd></div>
        <div><dt>{impuesto}</dt><dd>{eur(calculo.iva)}</dd></div>
        {pctDeducible(g) < 100 && conIva(gn) && <div><dt>{impuesto} que te deduces</dt><dd>{eur(partirIva(g, calculo.iva).deducible)}</dd></div>}
        <div><dt>Retención de IRPF</dt><dd>{calculo.irpf ? '−' : ''}{eur(calculo.irpf)}</dd></div>
        <div className="gasto-total"><dt>Total a pagar</dt><dd>{eur(calculo.total)}</dd></div>
      </dl>}
      {igic && <>
        <label className="gasto-pendiente"><input type="checkbox" checked={Boolean(g.isp)} onChange={(e) => poner('isp', e.target.checked)} />Inversión del sujeto pasivo (lo autoliquido)</label>
        <label className="gasto-pendiente"><input type="checkbox" checked={Boolean(g.importacion)} onChange={(e) => poner('importacion', e.target.checked)} />Importación (IGIC pagado en aduana, con el DUA)</label>
      </>}
      {!igic && !Number(g.ivaPct) && !g.porTipo && (
        <select className="campo" value={g.origen || (nifUE(g.proveedorNif) ? 'ue' : 'es')} onChange={(e) => poner('origen', e.target.value)} aria-label="De dónde es el proveedor">
          <option value="es">Proveedor de España</option>
          <option value="ue">Proveedor de otro país de la UE</option>
          <option value="fuera">Proveedor de fuera de la UE</option>
        </select>
      )}
      {!igic && origenGasto(gn) && <>
        <label>IVA que declaras por esta compra<select className="campo" value={tipoAutoliquidado(g)} onChange={(e) => poner('ivaAuto', Number(e.target.value))}>
          <option value={21}>21 % (general)</option>
          <option value={10}>10 % (alimentos, productos sanitarios…)</option>
          <option value={4}>4 % (libros, pan, leche…)</option>
        </select></label>
        <p className="nota">Ese IVA lo declaras tú en el 303 y te lo deduces a la vez: no cambia lo que pagas, pero tiene que salir en las dos partes.{g.origen !== 'fuera' && !nifUE(g.proveedorNif) ? ' Pon su NIF-IVA (por ejemplo, IE6388047V): también va en el 349.' : ''}</p>
      </>}
      <label>Fecha<input className="campo" type="date" value={g.fecha} onChange={(e) => poner('fecha', e.target.value)} required /></label>
      <label>Proyecto, obra o local (opcional)<input className="campo" list="proyectos-gasto" value={g.proyecto || ''} onChange={(e) => poner('proyecto', e.target.value)} placeholder="Ej.: Obra Calle Mayor" maxLength={60} /></label>
      <datalist id="proyectos-gasto">{proyectos.map((p) => <option key={p} value={p} />)}</datalist>
      {documento?.banco && <label className="gasto-pendiente"><input type="checkbox" checked={conBanco} onChange={(e) => setConBanco(e.target.checked)} />Es el cargo del banco del {fechaCorta(documento.banco.fecha)} por {eur(Math.abs(documento.banco.importe))}{documento.banco.concepto ? ` (${documento.banco.concepto})` : ''}: emparejarlo</label>}
      {!(documento?.banco && conBanco) && <label className="gasto-pendiente"><input type="checkbox" checked={Boolean(g.pendiente)} onChange={(e) => poner('pendiente', e.target.checked)} />Aún no lo he pagado</label>}
      {g.pendiente && !(documento?.banco && conBanco) && <>
        <label>Vence el<input className="campo" type="date" value={g.vence || ''} min={g.fecha} onChange={(e) => poner('vence', e.target.value)} /></label>
        {!g.vence && <p className="nota">Si no lo pones, vence en el plazo de pago de la ficha del proveedor o, sin él, a los 30 días (el plazo legal).</p>}
      </>}
      {(alquiler || g.alquiler) && <label className="gasto-pendiente"><input type="checkbox" checked={Boolean(g.alquiler)} onChange={(e) => poner('alquiler', e.target.checked)} />Es el alquiler del local (retención del 19 %)</label>}
      {!igic && (conIva(gn) || g.recc) && <label className="gasto-pendiente"><input type="checkbox" checked={Boolean(g.recc)} onChange={(e) => poner('recc', e.target.checked)} />Su factura dice «Régimen especial del criterio de caja» (el IVA se deduce al pagarla)</label>}
      {!igic && (conIva(gn) || g.importacion) && <label className="gasto-pendiente"><input type="checkbox" checked={Boolean(g.importacion)} onChange={(e) => poner('importacion', e.target.checked)} />Importación de fuera de la UE: el IVA lo he pagado en la aduana (DUA)</label>}
      {!igic && (especial || g.usoProrrata) && conIva(gn) && <label>Uso en la prorrata especial<select className="campo" value={g.usoProrrata || ''} onChange={(e) => poner('usoProrrata', e.target.value || undefined)}>
        <option value="">Común a operaciones con IVA y exentas (con el porcentaje)</option>
        <option value="gravadas">Solo para operaciones con IVA (se deduce entero)</option>
        <option value="exentas">Solo para operaciones exentas (no se deduce)</option>
      </select></label>}
      {!igic && ((Number(g.ivaPct) === 0 && !g.porTipo) || g.compensacion) && (
        <label className="gasto-pendiente">Compra a un agricultor, ganadero o pescador del régimen especial (REAGP)
          <select className="campo" value={g.compensacion || ''} onChange={(e) => poner('compensacion', Number(e.target.value) || undefined)}>
            <option value="">No</option>
            <option value="12">Sí, con compensación del 12 % (agricultura o forestal)</option>
            <option value="10.5">Sí, con compensación del 10,5 % (ganadería o pesca)</option>
          </select>
        </label>
      )}
      {!g.porTipo && <div className="gasto-pendiente termino-check"><input id={`${prefijo}-inversion`} aria-labelledby={`${prefijo}-inversion-etiqueta`} type="checkbox" checked={Boolean(g.inversion)} onChange={(e) => poner('inversion', e.target.checked ? { tipo: 'otros' } : undefined)} /><span id={`${prefijo}-inversion-etiqueta`}><label htmlFor={`${prefijo}-inversion`}>Es un </label><Termino id="bienInversion">bien de inversión</Termino><label htmlFor={`${prefijo}-inversion`}> (lo usarás varios años)</label></span></div>}
      {g.inversion ? <>
        <select className="campo" value={g.inversion.tipo} onChange={(e) => poner('inversion', { tipo: e.target.value })} aria-label="Tipo de bien">
          {TIPOS_BIEN.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {t[regimen === 'sociedad' ? 'sociedad' : 'autonomo']} % al año</option>)}
        </select>
        <p className="nota">{parseImporte(g.base) > 0 && parseImporte(g.base) <= LIMITE_LIBERTAD
          ? 'Como no pasa de 300 €, se resta entero este año.'
          : `No se resta entero: se amortiza un ${coeficiente(g, regimen)} % al año desde la fecha de compra.`} {pctDeducible(g) < 100 ? `La parte deducible del ${impuesto}` : `El ${impuesto}`} sí la deduces entera en el {igic ? '420' : '303'} de este trimestre.</p>
      </> : (
        <select className="campo" value={g.categoria || ''} onChange={(e) => poner('categoria', e.target.value || undefined)} aria-label="Categoría">
          <option value="">{categoria(categoriaDe({ ...g, categoria: undefined })).nombre} (automática)</option>
          {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.nombre}</option>)}
        </select>
      )}
      {gasto?.pedidoProv && g.stock?.length > 0 && (
        <p className="nota">Viene de recibir un pedido: sus unidades y costes se corrigen en el pedido (borra este gasto y vuelve a recibirlo).</p>
      )}
      {productos.length > 0 && !g.inversion && !gasto?.pedidoProv && (
        <div className="gasto-stock">
          <p className="mini-t">Productos que entran al almacén <small>(opcional)</small></p>
          {(g.stock || []).map((l, i) => (
            <div key={i} className="gasto-stock-linea">
              <select className="campo" value={l.producto} onChange={(e) => poner('stock', g.stock.map((x, j) => (j === i ? { ...x, producto: e.target.value, coste: x.coste || String(productos.find((p) => p.id === e.target.value)?.coste || '').replace('.', ',') } : x)))} aria-label="Producto">
                {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.sku ? ` · ${p.sku}` : ''}</option>)}
              </select>
              <input className="campo" inputMode="decimal" placeholder="Unidades" value={l.cantidad} onChange={(e) => poner('stock', g.stock.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} aria-label="Unidades" />
              <input className="campo" inputMode="decimal" placeholder="Coste/ud" value={l.coste} onChange={(e) => poner('stock', g.stock.map((x, j) => (j === i ? { ...x, coste: e.target.value } : x)))} aria-label={`Coste por unidad sin ${impuesto}`} />
              <button type="button" className="linea-quitar" aria-label="Quitar" onClick={() => poner('stock', g.stock.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="boton sec pequeno" onClick={() => poner('stock', [...(g.stock || []), { producto: productos[0].id, cantidad: '1', coste: String(productos[0].coste || '').replace('.', ',') }])}>+ Producto</button>
        </div>
      )}
      {!g.porTipo && pareceBien(gn) && <p className="nota">¿Es un equipo que vas a usar varios años? Márcalo como bien de inversión: se resta repartido en varios años, como pide Hacienda.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {avisoDuplicados && <div className="nota" role="alert">
        <strong>Puede que este gasto ya esté apuntado</strong>
        <p>Revisa los gastos coincidentes antes de guardarlo de nuevo.</p>
        <ul>{avisoDuplicados.duplicados.map((d) => <li key={d.id}><a href={`/gastos/${encodeURIComponent(d.id)}`} target="_blank" rel="noopener noreferrer">{d.motivo}</a></li>)}</ul>
        <div className="gasto-guardar">
          <button type="button" className="boton" disabled={enviando} onClick={() => enviar(null, avisoDuplicados.datos)}>{enviando ? 'Guardando…' : 'Es otro gasto: guardarlo'}</button>
          <button type="button" className="boton sec" disabled={enviando} onClick={() => { setAvisoDuplicados(null); setError(''); }}>Cancelar</button>
        </div>
      </div>}
      {!avisoDuplicados && <div className="gasto-guardar">
        <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : gasto ? 'Guardar cambios' : documento ? 'Aprobar y guardar el gasto' : 'Añadir'}</button>
        {plegado && !gasto && <button type="button" className="boton sec" onClick={() => salirSinGuardar(() => { setAbierto(false); setG(vacio); setLeyendo(''); setError(''); setAdjunto(null); }, DESCARTAR)}>Cancelar</button>}
        {movimiento && <button type="button" className="boton sec" onClick={() => salirSinGuardar(() => atras(router, '/gastos'))}>Cancelar</button>}
      </div>}
      </fieldset>
      {avisoAdjunto}
    </form>
  );
}

// En la ficha del gasto: ver el justificante guardado, o adjuntarlo o sustituirlo a mano (foto o PDF, máx. 5 MB).
function Justificante({ gasto }) {
  const router = useRouter();
  const archivoInput = useRef(null);
  const [estado, setEstado] = useState('');
  const [error, setError] = useState('');
  const tiene = Boolean(gasto.archivo?.clave);
  const url = `/api/gastos/justificante?id=${encodeURIComponent(gasto.id)}`;
  const elegir = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!/^image\//.test(archivo.type) && archivo.type !== 'application/pdf') { setError('Sube una foto (JPG, PNG o WebP) o un PDF'); return; }
    if (tiene && !(await confirmarAccion({ titulo: 'Sustituir justificante', texto: '¿Sustituir el justificante que ya tiene este gasto?', aceptar: 'Sustituir', peligro: true }))) return;
    setError(''); setEstado('Guardando el justificante…');
    try {
      const j = await preparar(archivo);
      if (j.error) throw new Error(j.error);
      const fallo = await subir(gasto.id, j.blob);
      if (fallo) throw new Error(fallo);
      setEstado(tiene ? 'Justificante sustituido.' : 'Justificante guardado.');
      router.refresh();
    } catch (err) { setEstado(''); setError(err.message || 'No se ha podido guardar el justificante'); }
  };
  return (
    <div className="gasto-justificante">
      <p className="mini-t">Justificante {tiene && <small>({gasto.archivo.tipo === 'application/pdf' ? 'PDF' : gasto.archivo.tipo === 'application/xml' ? 'factura electrónica' : 'foto'} · {Math.max(1, Math.round(gasto.archivo.tamano / 1024)).toLocaleString('es-ES')} KB)</small>}</p>
      {!tiene && <p className="nota">Este gasto no tiene guardada la foto del ticket ni el PDF de la factura.</p>}
      <div className="gasto-guardar">
        {tiene && <a className="boton sec" href={url} target="_blank" rel="noopener">{gasto.archivo.tipo === 'application/xml' ? 'Descargar el XML' : 'Ver justificante'}</a>}
        <button type="button" className="boton sec" onClick={() => archivoInput.current?.click()}>{tiene ? 'Sustituir' : 'Adjuntar justificante'}</button>
      </div>
      <input ref={archivoInput} type="file" accept="image/*,application/pdf" onChange={elegir} hidden />
      {estado && <p className="nota" role="status">{estado}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
