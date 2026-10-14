'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { navegar } from '@/lib/transicion';
import Deslizable from './Deslizable';
import { nifUE } from '@/lib/calculos';
import { parseImporte } from '@/lib/importe';
import { CATEGORIAS, categoria, categoriaDe, pareceBien } from '@/lib/categorias';
import { LIMITE_LIBERTAD, TIPOS_BIEN, coeficiente } from '@/lib/amortizaciones';
import { emparejarLineas } from '@/lib/inventario';
import { leerFacturaElectronica } from '@/lib/facturae';
import { reducir } from '@/lib/reducirImagen';
import RafagaTickets from './RafagaTickets';
import '@/app/ticket.css';

// plegado: en la lista de gastos empieza como una tarjeta con «Escanear ticket»; el formulario se abre al escanear o al pedirlo.
export default function FormGasto({ hoy, gasto, actividades, alquiler = false, retenciones = false, plegado = false, destacar = false, regimen = 'autonomo', movimiento = null, productos = [], proyectos = [] }) {
  const router = useRouter();
  const vacio = { fecha: hoy, actividad: actividades[0].id, concepto: '', proveedor: '', base: '', ivaPct: 21 };
  // Desde un cargo del banco sin gasto: fecha, proveedor e importe del banco (base estimada al 21 %, hasta leer la factura).
  const delBanco = movimiento && { ...vacio, fecha: movimiento.fecha, concepto: movimiento.contraparte || movimiento.concepto, proveedor: movimiento.contraparte || '', base: String(Math.round((Math.abs(movimiento.importe) / 1.21) * 100) / 100).replace('.', ','), banco: movimiento.id };
  const [g, setG] = useState(gasto ? { ...gasto, base: String(gasto.base).replace('.', ',') } : delBanco || vacio);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [avisoDuplicados, setAvisoDuplicados] = useState(null);
  const poner = (k, v) => { setAvisoDuplicados(null); setG((x) => ({ ...x, [k]: v })); };
  const [leyendo, setLeyendo] = useState('');
  const [abierto, setAbierto] = useState(Boolean(gasto) || !plegado);
  const [hecho, setHecho] = useState(false);
  const foto = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setAvisoDuplicados(null);
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
    setLeyendo(pdf ? 'Leyendo la factura…' : 'Leyendo el ticket…'); setError('');
    try {
      const imagen = pdf ? await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(archivo); }) : await reducir(archivo);
      const d = await llamar('/api/gastos/ticket', { method: 'POST', body: JSON.stringify({ imagen }) });
      const t = d.gasto;
      // Con inventario: las líneas de la factura que son productos del catálogo entran al almacén.
      const stock = productos.length ? emparejarLineas(t.lineas, productos).map((l) => ({ ...l, cantidad: String(l.cantidad).replace('.', ','), coste: String(l.coste).replace('.', ',') })) : [];
      setG((x) => ({ ...x, ...(stock.length ? { stock } : {}), proveedor: t.proveedor || x.proveedor, proveedorNif: t.nif || x.proveedorNif, concepto: t.concepto || t.proveedor || x.concepto, base: t.base !== '' ? String(t.base).replace('.', ',') : x.base, ivaPct: t.ivaPct, fecha: t.fecha, ...(!Number(t.ivaPct) && nifUE(t.nif) ? { origen: 'ue' } : {}) }));
      const avisos = Array.isArray(t.avisos) ? t.avisos : [];
      const detalle = t.varios ? `Tiene varios tipos de IVA: ver desglose. ${t.desglose.map((l) => `${l.ivaPct} %: base ${Number(l.base).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`).join('; ')}.` : '';
      setLeyendo(['Revisa los datos antes de guardar.', ...avisos, detalle].filter(Boolean).join(' '));
    } catch (err) { setLeyendo(''); setError(err.message); }
  };

  const enviar = async (e, confirmacion = null) => {
    e?.preventDefault();
    if (enviando || (avisoDuplicados && !confirmacion)) return;
    setEnviando(true); setError('');
    try {
      if (gasto) {
        await llamar('/api/gastos', { method: 'PATCH', body: JSON.stringify(g) });
      } else {
        const datos = confirmacion || g;
        const r = await fetch('/api/gastos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...datos, ...(confirmacion ? { duplicadoConfirmado: true } : {}) }) });
        const d = await r.json().catch(() => ({}));
        if (r.status === 423 && d.bloqueada) window.location.assign(`/bloqueo?a=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        if (r.status === 409 && Array.isArray(d.duplicados) && d.duplicados.length) {
          setAvisoDuplicados({ datos, duplicados: d.duplicados });
          return;
        }
        if (!r.ok) throw new Error(d.error || 'Algo ha fallado');
      }
      setAvisoDuplicados(null);
      if (gasto || movimiento) { navegar(router, '/gastos', 'atras'); router.refresh(); return; }
      setG(vacio);
      setLeyendo('');
      if (plegado) { setAbierto(false); setHecho(true); }
      router.refresh();
    } catch (err) { setError(err.message); }
    finally { setEnviando(false); }
  };

  if (!abierto) {
    return (
      <div className={`gasto-rapido${destacar ? ' destacado' : ''}`}>
        <div className="gasto-rapido-txt">
          <strong>{hecho ? '✓ Gasto añadido' : 'Añadir un gasto'}</strong>
          <small>Haz una foto al ticket o sube la factura: Netto lee proveedor, base, IVA y fecha.</small>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="gasto-rapido-botones">
          <label className="boton gasto-escanear"><svg viewBox="0 0 24 24" aria-hidden><path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M4 12h16" /></svg>Escanear ticket<input type="file" accept="image/*" capture="environment" onChange={foto} hidden /></label>
          {!gasto && !movimiento && <RafagaTickets hoy={hoy} actividades={actividades} />}
          <label className="boton sec">Subir factura<input type="file" accept="image/*,application/pdf,.xml,.xsig,text/xml,application/xml" onChange={foto} hidden /></label>
          <button type="button" className="boton sec" onClick={() => { setAbierto(true); setHecho(false); }}>A mano</button>
        </div>
      </div>
    );
  }

  return (
    <form className="formulario tarjeta" onSubmit={enviar}>
      <h3>{gasto ? 'Editar gasto' : movimiento ? 'Gasto del banco' : 'Añadir gasto deducible'}</h3>
      {movimiento && <p className="nota">Cargo del {movimiento.fecha.split('-').reverse().join('-')} por {Math.abs(movimiento.importe).toLocaleString('es-ES', { minimumFractionDigits: 2 })} € ({movimiento.concepto}). Sube la factura para que Netto lea la base y el IVA; al guardar queda emparejado con el banco.</p>}
      {actividades.length > 1 && <Deslizable className={`tipo ${actividades.length === 2 ? 'dos' : 'varias'}`}>
        {actividades.map(({ id, nombre }) => (
          <button type="button" key={id} className={g.actividad === id ? 'activo' : ''} onClick={() => poner('actividad', id)}>{nombre}</button>
        ))}
      </Deslizable>}
      {!gasto && <div className="ticket-ia">
        <p className="ticket-ia-t">Rellénalo con IA</p>
        <p className="ticket-ia-txt">Haz una foto del ticket o sube la factura que te han enviado (imagen o PDF). Netto lee el proveedor, el NIF, la base, el IVA y la fecha; tú solo revisas y guardas.</p>
        <div className="ticket-ia-botones">
          <label className="boton sec ticket-foto">Hacer foto<input type="file" accept="image/*" capture="environment" onChange={foto} hidden /></label>
          <label className="boton sec ticket-foto">Subir factura<input type="file" accept="image/*,application/pdf,.xml,.xsig,text/xml,application/xml" onChange={foto} hidden /></label>
        </div>
      </div>}
      {leyendo && <p className="nota ticket-nota" role="status">{leyendo}</p>}
      <input className="campo" placeholder="Proveedor (opcional)" value={g.proveedor || ''} onChange={(e) => poner('proveedor', e.target.value)} />
      {g.proveedor && <input className="campo" placeholder="NIF del proveedor (opcional)" value={g.proveedorNif || ''} onChange={(e) => poner('proveedorNif', e.target.value)} />}
      <input className="campo" placeholder="Concepto" value={g.concepto} onChange={(e) => poner('concepto', e.target.value)} required />
      <div className="dos-col">
        <input className="campo" inputMode="decimal" placeholder="Base sin IVA" value={g.base} onChange={(e) => poner('base', e.target.value)} required />
        <select className="campo" value={g.ivaPct} onChange={(e) => poner('ivaPct', Number(e.target.value))}>
          {[21, 10, 4, 0].map((n) => <option key={n} value={n}>IVA {n}%</option>)}
        </select>
      </div>
      {(retenciones || Number(g.irpfPct) > 0) && (
        <select className="campo" value={g.irpfPct || 0} onChange={(e) => poner('irpfPct', Number(e.target.value))} aria-label="Retención">
          <option value={0}>Sin retención</option>
          <option value={15}>Le retengo el 15 % (profesional)</option>
          <option value={7}>Le retengo el 7 % (profesional que empieza)</option>
        </select>
      )}
      {Number(g.irpfPct) > 0 && <p className="nota">Le pagas la factura menos la retención, y esa retención la ingresas tú en el 111.</p>}
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
          : `No se resta entero: se amortiza un ${coeficiente(g, regimen)} % al año desde la fecha de compra.`} El IVA sí lo deduces entero en el 303 de este trimestre.</p>
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
        {plegado && !gasto && <button type="button" className="boton sec" onClick={() => { setAbierto(false); setG(vacio); setLeyendo(''); setError(''); }}>Cancelar</button>}
        {movimiento && <button type="button" className="boton sec" onClick={() => navegar(router, '/gastos', 'atras')}>Cancelar</button>}
      </div>}
    </form>
  );
}
