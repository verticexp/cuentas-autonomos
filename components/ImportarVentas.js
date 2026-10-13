'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { eur, fechaTexto } from '@/lib/formato';

const NOMBRES = { shopify: 'Shopify', woocommerce: 'WooCommerce', sumup: 'SumUp', square: 'Square', generico: 'Excel o CSV' };

// Importar ventas de un TPV o de una tienda online: sube el archivo, revisa los días y guarda un cierre de caja por día.
export default function ImportarVentas({ actividades }) {
  const router = useRouter();
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
      if (!r.ok) throw new Error(d.error || 'No se pudo leer el archivo');
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
      if (!r.ok) throw new Error(d.error || 'Algo ha fallado');
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
      <p className="nota">Exporta las ventas o los pedidos desde Shopify, WooCommerce, SumUp o Square (o cualquier Excel con fecha, producto, cantidad e importe) y súbelo. Cada día se guarda como un cierre de caja; los productos se emparejan con tu catálogo por referencia (SKU), código de barras o nombre.</p>
      <label className="boton sec">{ocupado && !previa ? 'Leyendo…' : 'Elegir archivo (.csv o .xlsx)'}<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={subir} disabled={ocupado} /></label>
      {msg && <p className={msg.startsWith('✓') ? 'nota' : 'error'}>{msg}</p>}
      {previa && (
        <>
          <p className="rotulo">{NOMBRES[previa.formato] || previa.formato} · {previa.dias.length} {previa.dias.length === 1 ? 'día' : 'días'}</p>
          {actividades.length > 1 && <label>Actividad<select className="campo" value={actividad} onChange={(e) => setActividad(e.target.value)}>{actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>}
          <div className="caja-dias">
            {previa.dias.map((x) => (
              <label key={x.fecha} className={`tarjeta caja-dia${x.repetido ? ' repetido' : ''}`}>
                <span><input type="checkbox" checked={elegidos.has(x.fecha)} onChange={() => cambiar(x.fecha)} /> <strong>{fechaTexto(x.fecha)} {x.fecha.slice(0, 4)}</strong>
                  <small>{x.pedidos} {x.pedidos === 1 ? 'venta' : 'ventas'} · efectivo {eur(x.efectivo)} · tarjeta {eur(x.tarjeta)}{x.otros ? ` · otros ${eur(x.otros)}` : ''}</small>
                  <small>{x.porIva.map((t) => `${t.pct} %: ${eur(t.total)}`).join(' · ')}{x.unidades.length ? ` · ${x.unidades.reduce((s, y) => s + y.cantidad, 0)} uds. del catálogo` : ''}{x.repetido ? ' · ya importado' : ''}</small>
                </span>
                <b>{eur(x.total)}</b>
              </label>
            ))}
          </div>
          {previa.sinEmparejar?.length > 0 && <p className="caja-aviso">Sin emparejar con el catálogo (no restan stock): {previa.sinEmparejar.slice(0, 12).map((x) => `${x.descripcion || x.sku} (${x.cantidad})`).join(', ')}{previa.sinEmparejar.length > 12 ? '…' : ''}. Añade su referencia en el catálogo y vuelve a importar.</p>}
          {previa.avisos?.length > 0 && <ul className="caja-aviso">{previa.avisos.slice(0, 8).map((a, i) => <li key={i}>{a}</li>)}</ul>}
          <button type="button" className="boton" disabled={ocupado || !elegidos.size} onClick={guardar}>{ocupado ? 'Guardando…' : `Importar ${elegidos.size} ${elegidos.size === 1 ? 'día' : 'días'} (${eur(total)})`}</button>
        </>
      )}
    </section>
  );
}
