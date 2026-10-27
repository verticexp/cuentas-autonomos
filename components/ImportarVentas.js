'use client';

import { useT } from '@/components/Idioma';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { eur, fechaTexto, pctCorto } from '@/lib/formato';

const NOMBRES = { shopify: 'Shopify', woocommerce: 'WooCommerce', sumup: 'SumUp', square: 'Square', generico: 'Excel o CSV' };

// El estado conserva el mensaje en castellano; al pintarlo se elige la frase completa de su variante.
function resultadoImportacion(msg, tr) {
  const m = /^✓ (\d+) (día importado|días importados)(?: · (\d+) ya estaban)?(?: · con errores: (.*))?$/.exec(msg);
  if (!m) return tr(msg);
  const [, cantidad, forma, omitidos, errores] = m;
  const texto = forma === 'día importado'
    ? (omitidos
      ? (errores ? '✓ {cantidad} día importado · {omitidos} ya estaban · con errores: {errores}' : '✓ {cantidad} día importado · {omitidos} ya estaban')
      : (errores ? '✓ {cantidad} día importado · con errores: {errores}' : '✓ {cantidad} día importado'))
    : (omitidos
      ? (errores ? '✓ {cantidad} días importados · {omitidos} ya estaban · con errores: {errores}' : '✓ {cantidad} días importados · {omitidos} ya estaban')
      : (errores ? '✓ {cantidad} días importados · con errores: {errores}' : '✓ {cantidad} días importados'));
  return tr(texto, { cantidad, omitidos, errores: tr(errores) });
}

// Importar ventas de un TPV o de una tienda online: sube el archivo, revisa los días y guarda un cierre de caja por día.
export default function ImportarVentas({ actividades }) {
  const tr = useT();
  const router = useRouter();
  const ayudaId = useId();
  const [previa, setPrevia] = useState(null);
  const [elegidos, setElegidos] = useState(new Set());
  const [actividad, setActividad] = useState(actividades[0].id);
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const subir = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setOcupado(true); setMsg(''); setPrevia(null);
    const fd = new FormData();
    fd.append('archivo', archivo);
    try {
      const r = await fetch('/api/caja/importar', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido leer el archivo. Comprueba el formato e inténtalo otra vez.');
      setPrevia(d);
      setElegidos(new Set(d.dias.filter((x) => !x.repetido).map((x) => x.fecha)));
    } catch (err) { setMsg(err.message); }
    setOcupado(false);
    e.target.value = '';
  };

  const guardar = async () => {
    setOcupado(true); setMsg('');
    try {
      const r = await fetch('/api/caja/importar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ formato: previa.formato, actividad, dias: previa.dias.filter((x) => elegidos.has(x.fecha)) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido importar las ventas. Revisa la conexión e inténtalo otra vez.');
      setMsg(`✓ ${d.guardados} ${d.guardados === 1 ? 'día importado' : 'días importados'}${d.saltados ? ` · ${d.saltados} ya estaban` : ''}${d.errores.length ? ` · con errores: ${d.errores.join('; ')}` : ''}`);
      setPrevia(null);
      router.refresh();
    } catch (err) { setMsg(err.message); }
    setOcupado(false);
  };

  const cambiar = (f) => setElegidos((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; });
  const total = previa ? previa.dias.filter((x) => elegidos.has(x.fecha)).reduce((s, x) => s + x.total, 0) : 0;

  return (
    <section className="bloque">
      <p className="nota">{tr('Exporta las ventas o los pedidos desde Shopify, WooCommerce, SumUp o Square (o cualquier Excel con fecha, producto, cantidad e importe) y súbelo. Cada día se guarda como un cierre de caja; los productos se emparejan con tu catálogo por referencia (SKU), código de barras o nombre.')}</p>
      <label className="boton sec">{(ocupado && !previa ? tr('Leyendo…') : tr('Elegir archivo (.csv o .xlsx)'))}<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={subir} disabled={ocupado} /></label>
      {msg && <p className={msg.startsWith('✓') ? 'nota' : 'error'} role={msg.startsWith('✓') ? 'status' : 'alert'}>{resultadoImportacion(msg, tr)}</p>}
      {previa && (
        <>
          <p className="rotulo">{(previa.dias.length === 1 ? tr('{origen} · {cantidad} día', { origen: tr(NOMBRES[previa.formato] || previa.formato), cantidad: previa.dias.length }) : tr('{origen} · {cantidad} días', { origen: tr(NOMBRES[previa.formato] || previa.formato), cantidad: previa.dias.length }))}</p>
          {actividades.length > 1 && <label>{tr('Actividad')}<select className="campo" value={actividad} onChange={(e) => setActividad(e.target.value)}>{actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>}
          <div className="caja-dias">
            {previa.dias.map((x) => (
              <label key={x.fecha} className={`tarjeta caja-dia${x.repetido ? ' repetido' : ''}`}>
                <span><input type="checkbox" checked={elegidos.has(x.fecha)} onChange={() => cambiar(x.fecha)} /> <strong>{fechaTexto(x.fecha)} {x.fecha.slice(0, 4)}</strong>
                  <small>{(x.pedidos === 1 ? (x.otros ? tr('{cantidad} venta · efectivo {efectivo} · tarjeta {tarjeta} · otros {otros}', { cantidad: x.pedidos, efectivo: eur(x.efectivo), tarjeta: eur(x.tarjeta), otros: eur(x.otros) }) : tr('{cantidad} venta · efectivo {efectivo} · tarjeta {tarjeta}', { cantidad: x.pedidos, efectivo: eur(x.efectivo), tarjeta: eur(x.tarjeta) })) : (x.otros ? tr('{cantidad} ventas · efectivo {efectivo} · tarjeta {tarjeta} · otros {otros}', { cantidad: x.pedidos, efectivo: eur(x.efectivo), tarjeta: eur(x.tarjeta), otros: eur(x.otros) }) : tr('{cantidad} ventas · efectivo {efectivo} · tarjeta {tarjeta}', { cantidad: x.pedidos, efectivo: eur(x.efectivo), tarjeta: eur(x.tarjeta) })))}</small>
                  <small>{(x.unidades.length ? (x.repetido ? tr('{desglose} · {cantidad} uds. del catálogo · ya importado', { desglose: x.porIva.map((t) => `${pctCorto(t.pct)}: ${eur(t.total)}`).join(' · '), cantidad: x.unidades.reduce((s, y) => s + y.cantidad, 0) }) : tr('{desglose} · {cantidad} uds. del catálogo', { desglose: x.porIva.map((t) => `${pctCorto(t.pct)}: ${eur(t.total)}`).join(' · '), cantidad: x.unidades.reduce((s, y) => s + y.cantidad, 0) })) : (x.repetido ? tr('{desglose} · ya importado', { desglose: x.porIva.map((t) => `${pctCorto(t.pct)}: ${eur(t.total)}`).join(' · ') }) : x.porIva.map((t) => `${pctCorto(t.pct)}: ${eur(t.total)}`).join(' · ')))}</small>
                </span>
                <b>{eur(x.total)}</b>
              </label>
            ))}
          </div>
          {previa.sinEmparejar?.length > 0 && <p className="caja-aviso">{(previa.sinEmparejar.length > 12 ? tr('Sin emparejar con el catálogo (no restan stock): {productos}…. Añade su referencia en el catálogo y vuelve a importar.', { productos: previa.sinEmparejar.slice(0, 12).map((x) => `${x.descripcion || x.sku} (${x.cantidad})`).join(', ') }) : tr('Sin emparejar con el catálogo (no restan stock): {productos}. Añade su referencia en el catálogo y vuelve a importar.', { productos: previa.sinEmparejar.slice(0, 12).map((x) => `${x.descripcion || x.sku} (${x.cantidad})`).join(', ') }))}</p>}
          {previa.avisos?.length > 0 && <ul className="caja-aviso">{previa.avisos.slice(0, 8).map((a, i) => <li key={i}>{tr(a)}</li>)}</ul>}
          {!elegidos.size && <p id={ayudaId} className="nota">{tr('Selecciona al menos un día para importarlo.')}</p>}
          <button type="button" className="boton" disabled={ocupado || !elegidos.size} aria-describedby={!elegidos.size ? ayudaId : undefined} onClick={guardar}>{(ocupado ? tr('Guardando…') : (elegidos.size === 1 ? tr('Importar {n} día ({importe})', { n: elegidos.size, importe: eur(total) }) : tr('Importar {n} días ({importe})', { n: elegidos.size, importe: eur(total) })))}</button>
        </>
      )}
    </section>
  );
}
