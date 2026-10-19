'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { atras, volverA } from '@/lib/transicion';
import Deslizable from './Deslizable';
import { eur } from '@/lib/formato';
import { importes, nifUE, origenGasto } from '@/lib/calculos';
import { partirIva, pctDeducible } from '@/lib/ivaDeducible';
import { parseImporte } from '@/lib/importe';
import { CATEGORIAS, categoria, categoriaDe, pareceBien } from '@/lib/categorias';
import { LIMITE_LIBERTAD, TIPOS_BIEN, coeficiente } from '@/lib/amortizaciones';
import { emparejarLineas } from '@/lib/inventario';
import { leerFacturaElectronica } from '@/lib/facturae';
import { reducir } from '@/lib/reducirImagen';
import RafagaTickets from './RafagaTickets';
import CupoEscaneo from './CupoEscaneo';
import { preparar, subir } from '@/lib/justificanteCliente';
import '@/app/ticket.css';

// plegado: en la lista de gastos empieza como una tarjeta con «Escanear ticket»; el formulario se abre al escanear o al pedirlo.
export default function FormGasto({ hoy, gasto, actividades, alquiler = false, plegado = false, destacar = false, regimen = 'autonomo', cupoInicial = null, movimiento = null, productos = [], proyectos = [] }) {
  const router = useRouter();
  const camaraInput = useRef(null);
  const facturaInput = useRef(null);
  const vacio = { fecha: hoy, actividad: actividades[0].id, concepto: '', proveedor: '', base: '', ivaPct: 21 };
  // Desde un cargo del banco sin gasto: fecha, proveedor e importe del banco (base estimada al 21 %, hasta leer la factura).
  const delBanco = movimiento && { ...vacio, fecha: movimiento.fecha, concepto: movimiento.contraparte || movimiento.concepto, proveedor: movimiento.contraparte || '', base: String(Math.round((Math.abs(movimiento.importe) / 1.21) * 100) / 100).replace('.', ','), banco: movimiento.id };
  const [g, setG] = useState(gasto ? { ...gasto, base: String(gasto.base).replace('.', ',') } : delBanco || vacio);
  const [error, setError] = useState('');
  // IVA deducible en parte (lib/ivaDeducible.js): 100, 50 y 0 en el desplegable; cualquier otro, escrito a mano.
  const [pctOtro, setPctOtro] = useState(() => ![undefined, null, '', 100, 50, 0].includes(gasto?.deduciblePct));
  const [enviando, setEnviando] = useState(false);
  const [avisoDuplicados, setAvisoDuplicados] = useState(null);
  const poner = (k, v) => { setAvisoDuplicados(null); setG((x) => ({ ...x, [k]: v })); };
  const [leyendo, setLeyendo] = useState('');
  const [abierto, setAbierto] = useState(Boolean(gasto) || !plegado);
  const [hecho, setHecho] = useState(false);
  const [ultimoGuardado, setUltimoGuardado] = useState(null);
  const calculo = importes({ ...g, base: parseImporte(g.base) || 0 });
  // Justificante leído (foto reducida o PDF): se sube al guardar el gasto nuevo. En la ficha, se adjunta o sustituye aparte.
  const [adjunto, setAdjunto] = useState(null);
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
        base: String(t.base).replace('.', ','), ivaPct: t.ivaPct, fecha: t.fecha || x.fecha, numero: t.numero || '', ...([7, 15].includes(Number(t.irpfPct)) ? { irpfPct: Number(t.irpfPct) } : {}),
        ...(t.vencimiento && t.vencimiento > (t.fecha || '') ? { pendiente: true } : {}), efactura: t.formato, ...(!Number(t.ivaPct) && nifUE(t.proveedor?.nif) ? { origen: 'ue' } : {}) }));
      setLeyendo(`Factura electrónica ${t.numero || ''} leída${varios ? ': tiene varios tipos de IVA, revisa la base' : ''}. Revisa los datos antes de guardar.`);
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
      try { d = await llamar('/api/gastos/ticket', { method: 'POST', body: JSON.stringify({ imagen }) }); }
      finally { window.dispatchEvent(new Event('netto:escaneos')); }
      const t = d.gasto;
      // Con inventario: las líneas de la factura que son productos del catálogo entran al almacén.
      const stock = productos.length ? emparejarLineas(t.lineas, productos).map((l) => ({ ...l, cantidad: String(l.cantidad).replace('.', ','), coste: String(l.coste).replace('.', ',') })) : [];
      setG((x) => ({ ...x, ...(stock.length ? { stock } : {}), proveedor: t.proveedor || x.proveedor, proveedorNif: t.nif || x.proveedorNif, concepto: t.concepto || t.proveedor || x.concepto, base: t.base !== '' ? String(t.base).replace('.', ',') : x.base, ivaPct: t.ivaPct, irpfPct: t.irpfPct || 0, fecha: t.fecha, ...(!Number(t.ivaPct) && nifUE(t.nif) ? { origen: 'ue' } : {}) }));
      const avisos = Array.isArray(t.avisos) ? t.avisos : [];
      const detalle = t.varios ? `Tiene varios tipos de IVA: ver desglose. ${t.desglose.map((l) => `${l.ivaPct} %: base ${Number(l.base).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`).join('; ')}.` : '';
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
      if (gasto) {
        await llamar('/api/gastos', { method: 'PATCH', body: JSON.stringify(g) });
      } else {
        const datos = confirmacion || g;
        const r = await fetch('/api/gastos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...datos, ...(adjunto ? { huella: adjunto.huella } : {}), ...(confirmacion ? { duplicadoConfirmado: true } : {}) }) });
        const d = await r.json().catch(() => ({}));
        if (r.status === 423 && d.bloqueada) window.location.replace(`/bloqueo?a=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        if (r.status === 409 && Array.isArray(d.duplicados) && d.duplicados.length) {
          setAvisoDuplicados({ datos, duplicados: d.duplicados });
          return;
        }
        if (!r.ok) throw new Error(d.error || 'Algo ha fallado');
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
      setAvisoDuplicados(null);
      if (gasto || (movimiento && !fallo)) { volverA(router, '/gastos'); router.refresh(); return; }
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
      <div className={`gasto-rapido${destacar ? ' destacado' : ''}`}>
        <div className="gasto-rapido-txt">
          <strong>{hecho ? '✓ Gasto añadido' : 'Añadir un gasto'}</strong>
          <small>Haz una foto al ticket o sube la factura: Netto lee proveedor, base, IVA, IRPF y fecha.</small>
        </div>
        <CupoEscaneo inicial={cupoInicial} />
        {error && <p className="error">{error}</p>}
        {avisoAdjunto}
        <div className="gasto-rapido-botones">
          <button type="button" className="boton gasto-escanear" onClick={() => camaraInput.current?.click()}><svg viewBox="0 0 24 24" aria-hidden><path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M4 12h16" /></svg>Escanear ticket</button><input ref={camaraInput} type="file" accept="image/*" capture="environment" onChange={foto} hidden />
          {!gasto && !movimiento && <RafagaTickets hoy={hoy} actividades={actividades} />}
          <button type="button" className="boton sec" onClick={() => facturaInput.current?.click()}>Subir factura</button><input ref={facturaInput} type="file" accept="image/*,application/pdf,.xml,.xsig,text/xml,application/xml" onChange={foto} hidden />
          <button type="button" className="boton sec" onClick={() => { setAbierto(true); setHecho(false); }}>A mano</button>
        </div>
      </div>
    );
  }

  return (
    <form className="formulario tarjeta" onSubmit={enviar}>
      <fieldset disabled={enviando || procesando || Boolean(archivoPendiente)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, gap: 12 }}>
      <h3>{gasto ? 'Editar gasto' : movimiento ? 'Gasto del banco' : 'Añadir gasto deducible'}</h3>
      {movimiento && <p className="nota">Cargo del {movimiento.fecha.split('-').reverse().join('-')} por {Math.abs(movimiento.importe).toLocaleString('es-ES', { minimumFractionDigits: 2 })} € ({movimiento.concepto}). Sube la factura para que Netto lea la base y el IVA; al guardar queda emparejado con el banco.</p>}
      {actividades.length > 1 && <Deslizable className={`tipo ${actividades.length === 2 ? 'dos' : 'varias'}`}>
        {actividades.map(({ id, nombre }) => (
          <button type="button" key={id} className={g.actividad === id ? 'activo' : ''} onClick={() => poner('actividad', id)}>{nombre}</button>
        ))}
      </Deslizable>}
      {!gasto && <div className="ticket-ia">
        <p className="ticket-ia-t">Rellénalo con IA</p>
        <p className="ticket-ia-txt">Haz una foto del ticket o sube la factura que te han enviado (imagen o PDF de hasta 3 MB y 10 páginas). Netto lee también el IRPF. Cada página cuenta como una lectura; si la vuelves a enviar, cuenta otra vez, aunque no guardes el gasto.</p>
        <div className="ticket-ia-botones">
          <button type="button" className="boton sec ticket-foto" onClick={() => camaraInput.current?.click()}>Hacer foto</button><input ref={camaraInput} type="file" accept="image/*" capture="environment" onChange={foto} hidden />
          <button type="button" className="boton sec ticket-foto" onClick={() => facturaInput.current?.click()}>Subir factura</button><input ref={facturaInput} type="file" accept="image/*,application/pdf,.xml,.xsig,text/xml,application/xml" onChange={foto} hidden />
        </div>
        <CupoEscaneo inicial={cupoInicial} />
      </div>}
      {leyendo && <p className="nota ticket-nota" role="status">{leyendo}</p>}
      {adjunto && <div className="gasto-adjunto" role="status"><strong>{adjunto.blob.type === 'application/pdf' ? 'PDF adjunto' : 'Foto adjunta'}</strong><span>{adjunto.nombre}</span><small>Se guardará junto con este gasto al pulsar Añadir.</small></div>}
      {gasto && <Justificante gasto={gasto} />}
      <input className="campo" placeholder="Proveedor (opcional)" value={g.proveedor || ''} onChange={(e) => poner('proveedor', e.target.value)} />
      {g.proveedor && <input className="campo" placeholder="NIF del proveedor (opcional)" value={g.proveedorNif || ''} onChange={(e) => poner('proveedorNif', e.target.value)} />}
      <input className="campo" placeholder="Concepto" value={g.concepto} onChange={(e) => poner('concepto', e.target.value)} required />
      <div className="dos-col">
        <input className="campo" inputMode="decimal" placeholder="Base sin IVA" value={g.base} onChange={(e) => poner('base', e.target.value)} required />
        <select className="campo" value={g.ivaPct} onChange={(e) => poner('ivaPct', Number(e.target.value))}>
          {[21, 10, 4, 0].map((n) => <option key={n} value={n}>IVA {n}%</option>)}
        </select>
      </div>
      {(
        <select className="campo" value={g.irpfPct || 0} onChange={(e) => poner('irpfPct', Number(e.target.value))} aria-label="Retención de IRPF">
          <option value={0}>Sin retención</option>
          <option value={15}>Le retengo el 15 % (profesional)</option>
          <option value={7}>Le retengo el 7 % (profesional que empieza)</option>
        </select>
      )}
      {Number(g.irpfPct) > 0 && <p className="nota">Le pagas la factura menos la retención, y esa retención la ingresas tú en el 111.</p>}
      {(Number(g.ivaPct) > 0 || origenGasto(g)) && <>
        <select className="campo" value={pctOtro ? 'otro' : String(pctDeducible(g))} aria-label="IVA que te deduces"
          onChange={(e) => { const v = e.target.value; setPctOtro(v === 'otro'); poner('deduciblePct', v === 'otro' ? '' : v === '100' ? undefined : Number(v)); }}>
          <option value="100">Me deduzco todo el IVA</option>
          <option value="50">Me deduzco el 50 % (coche, uso mixto)</option>
          <option value="0">No me deduzco el IVA</option>
          <option value="otro">Me deduzco otro porcentaje…</option>
        </select>
        {pctOtro && <label>% del IVA que te deduces<input className="campo" inputMode="decimal" value={g.deduciblePct ?? ''} onChange={(e) => poner('deduciblePct', e.target.value)} placeholder="Ej.: 30" /></label>}
        {pctDeducible(g) === 100 && Number(g.ivaPct) > 0 && !g.proveedorNif && <p className="nota">¿Es un ticket sin tu NIF? Su IVA no se deduce (art. 97 de la Ley del IVA): pide factura con tu NIF o elige «No me deduzco el IVA».</p>}
        {pctDeducible(g) < 100 && <p className="nota">Solo se deduce el IVA de la parte que usas para tu actividad (un turismo se presume al 50 %). El IVA que no te deduces cuenta como gasto{g.inversion ? ' y se amortiza con el bien' : ''}.</p>}
      </>}
      {parseImporte(g.base) > 0 && <dl className="gasto-importes" aria-label="Importes del gasto">
        <div><dt>Base imponible</dt><dd>{eur(calculo.base)}</dd></div>
        <div><dt>IVA</dt><dd>{eur(calculo.iva)}</dd></div>
        {pctDeducible(g) < 100 && Number(g.ivaPct) > 0 && <div><dt>IVA que te deduces</dt><dd>{eur(partirIva(g, calculo.iva).deducible)}</dd></div>}
        <div><dt>Retención de IRPF</dt><dd>{calculo.irpf ? '−' : ''}{eur(calculo.irpf)}</dd></div>
        <div className="gasto-total"><dt>Total a pagar</dt><dd>{eur(calculo.total)}</dd></div>
      </dl>}
      {!Number(g.ivaPct) && (
        <select className="campo" value={g.origen || (nifUE(g.proveedorNif) ? 'ue' : 'es')} onChange={(e) => poner('origen', e.target.value)} aria-label="De dónde es el proveedor">
          <option value="es">Proveedor de España</option>
          <option value="ue">Proveedor de otro país de la UE</option>
          <option value="fuera">Proveedor de fuera de la UE</option>
        </select>
      )}
      {!Number(g.ivaPct) && ['ue', 'fuera'].includes(g.origen || (nifUE(g.proveedorNif) ? 'ue' : '')) && <p className="nota">El IVA (21 %) lo declaras tú en el 303 y te lo deduces a la vez: no pagas nada de más.{g.origen !== 'fuera' && !nifUE(g.proveedorNif) ? ' Pon su NIF-IVA (por ejemplo, IE6388047V): también va en el 349.' : ''}</p>}
      <input className="campo" type="date" value={g.fecha} onChange={(e) => poner('fecha', e.target.value)} required />
      <label>Proyecto, obra o local (opcional)<input className="campo" list="proyectos-gasto" value={g.proyecto || ''} onChange={(e) => poner('proyecto', e.target.value)} placeholder="Ej.: Obra Calle Mayor" maxLength={60} /></label>
      <datalist id="proyectos-gasto">{proyectos.map((p) => <option key={p} value={p} />)}</datalist>
      <label className="gasto-pendiente"><input type="checkbox" checked={Boolean(g.pendiente)} onChange={(e) => poner('pendiente', e.target.checked)} />Aún no lo he pagado</label>
      {(alquiler || g.alquiler) && <label className="gasto-pendiente"><input type="checkbox" checked={Boolean(g.alquiler)} onChange={(e) => poner('alquiler', e.target.checked)} />Es el alquiler del local (retención del 19 %)</label>}
      <label className="gasto-pendiente"><input type="checkbox" checked={Boolean(g.inversion)} onChange={(e) => poner('inversion', e.target.checked ? { tipo: 'otros' } : undefined)} />Es un bien de inversión (lo usarás varios años)</label>
      {g.inversion ? <>
        <select className="campo" value={g.inversion.tipo} onChange={(e) => poner('inversion', { tipo: e.target.value })} aria-label="Tipo de bien">
          {TIPOS_BIEN.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {t[regimen === 'sociedad' ? 'sociedad' : 'autonomo']} % al año</option>)}
        </select>
        <p className="nota">{parseImporte(g.base) > 0 && parseImporte(g.base) <= LIMITE_LIBERTAD
          ? 'Como no pasa de 300 €, se resta entero este año.'
          : `No se resta entero: se amortiza un ${coeficiente(g, regimen)} % al año desde la fecha de compra.`} {pctDeducible(g) < 100 ? 'La parte deducible del IVA' : 'El IVA'} sí la deduces entera en el 303 de este trimestre.</p>
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
              <input className="campo" inputMode="decimal" placeholder="Coste/ud" value={l.coste} onChange={(e) => poner('stock', g.stock.map((x, j) => (j === i ? { ...x, coste: e.target.value } : x)))} aria-label="Coste por unidad sin IVA" />
              <button type="button" className="linea-quitar" aria-label="Quitar" onClick={() => poner('stock', g.stock.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="boton sec pequeno" onClick={() => poner('stock', [...(g.stock || []), { producto: productos[0].id, cantidad: '1', coste: String(productos[0].coste || '').replace('.', ',') }])}>+ Producto</button>
        </div>
      )}
      {pareceBien({ ...g, base: parseImporte(g.base) }) && <p className="nota">¿Es un equipo que vas a usar varios años? Márcalo como bien de inversión: se resta repartido en varios años, como pide Hacienda.</p>}
      {error && <p className="error">{error}</p>}
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
        <button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : gasto ? 'Guardar cambios' : 'Añadir'}</button>
        {plegado && !gasto && <button type="button" className="boton sec" onClick={() => { setAbierto(false); setG(vacio); setLeyendo(''); setError(''); setAdjunto(null); }}>Cancelar</button>}
        {movimiento && <button type="button" className="boton sec" onClick={() => atras(router, '/gastos')}>Cancelar</button>}
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
    if (tiene && !confirm('¿Sustituir el justificante que ya tiene este gasto?')) return;
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
      <p className="mini-t">Justificante {tiene && <small>({gasto.archivo.tipo === 'application/pdf' ? 'PDF' : 'foto'} · {Math.max(1, Math.round(gasto.archivo.tamano / 1024)).toLocaleString('es-ES')} KB)</small>}</p>
      {!tiene && <p className="nota">Este gasto no tiene guardada la foto del ticket ni el PDF de la factura.</p>}
      <div className="gasto-guardar">
        {tiene && <a className="boton sec" href={url} target="_blank" rel="noopener">Ver justificante</a>}
        <button type="button" className="boton sec" onClick={() => archivoInput.current?.click()}>{tiene ? 'Sustituir' : 'Adjuntar justificante'}</button>
      </div>
      <input ref={archivoInput} type="file" accept="image/*,application/pdf" onChange={elegir} hidden />
      {estado && <p className="nota" role="status">{estado}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
