'use client';

import { TIPOS_IGIC } from '@/lib/igic';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { navegar } from '@/lib/transicion';
import { leerImporte, r2 } from '@/lib/calculos';
import { eur } from '@/lib/formato';
import '@/app/lineas.css';
import '@/app/filtros.css';

const aTexto = (n) => (n || n === 0 ? String(n).replace('.', ',') : '');
const num = (v) => leerImporte(v || 0) || 0;
const TIPOS = [21, 10, 4, 0];

// Cierre de caja: lo vendido en el día por tipo de IVA (con IVA, como lo da el TPV), cómo se cobró y, si se quiere,
// cuántas unidades de cada producto salieron (para el stock y el margen).
export default function FormCierre({ hoy, actividades, productos = [], cierre = null, ivaDefecto = 21, proyectos = [], igic = false }) {
  const router = useRouter();
  const ayudaId = useId();
  const inicial = () => {
    if (!cierre) return { fecha: hoy, actividad: actividades[0].id, porIva: [{ pct: igic && !TIPOS_IGIC.includes(Number(ivaDefecto)) ? 7 : ivaDefecto, total: '' }], efectivo: '', tarjeta: '', otros: '', desde: '', hasta: '', nota: '', unidades: [], proyecto: '' };
    return {
      fecha: cierre.fecha, actividad: cierre.actividad,
      porIva: cierre.lineas.map((l) => ({ pct: l.ivaPct, total: aTexto(r2(l.precio + r2((l.precio * l.ivaPct) / 100))) })),
      efectivo: aTexto(cierre.caja.efectivo), tarjeta: aTexto(cierre.caja.tarjeta), otros: aTexto(cierre.caja.otros),
      desde: cierre.resumen?.desde || '', hasta: cierre.resumen?.hasta || '', nota: cierre.nota || '', proyecto: cierre.proyecto || '',
      unidades: (cierre.unidades || []).map((x) => ({ producto: x.producto, cantidad: aTexto(x.cantidad), importe: aTexto(x.importe) })),
    };
  };
  const [x, setX] = useState(inicial);
  const [tarjetaAuto, setTarjetaAuto] = useState(!cierre);
  const [error, setError] = useState('');
  const [idem] = useState(() => crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const poner = (k, v) => setX((y) => ({ ...y, [k]: v }));
  const ponerIva = (i, k, v) => setX((y) => ({ ...y, porIva: y.porIva.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));
  const ponerUd = (i, k, v) => setX((y) => ({ ...y, unidades: y.unidades.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));

  const total = r2(x.porIva.reduce((s, t) => s + num(t.total), 0));
  const tarjeta = tarjetaAuto ? r2(total - num(x.efectivo) - num(x.otros)) : num(x.tarjeta);
  const cuadra = Math.abs(r2(num(x.efectivo) + tarjeta + num(x.otros)) - total) < 0.01;
  const libres = (igic ? TIPOS_IGIC : TIPOS).filter((t) => !x.porIva.some((y) => Number(y.pct) === t));
  const conStock = productos.filter((p) => !p.servicio);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      const d = await llamar('/api/caja', { method: 'POST', body: JSON.stringify({ ...x, tarjeta: tarjetaAuto ? undefined : x.tarjeta, id: cierre?.id, idem }) });
      navegar(router, `/facturas/${d.factura.id}`, 'fundido', undefined, true);
      router.refresh();
    } catch (err) { setError(err.message); setEnviando(false); }
  };

  return (
    <form className="formulario caja-form" onSubmit={enviar}>
      {/* Móvil, en el mostrador: el total del día siempre a la vista, con lo cobrado y si cuadra */}
      <div className="caja-total solo-movil">
        <div className="caja-total-v"><small>Total del día</small><strong>{eur(total)}</strong></div>
        <div className="caja-total-d">
          <span className={total ? (cuadra ? 'ok' : 'falta') : ''}>{!total ? 'Apunta lo vendido' : cuadra ? 'Cuadra ✓' : `Descuadra ${eur(Math.abs(r2(total - r2(num(x.efectivo) + tarjeta + num(x.otros)))))}`}</span>
          <small>Efectivo {eur(num(x.efectivo))} · Tarjeta {eur(tarjeta)}{num(x.otros) ? ` · Otros ${eur(num(x.otros))}` : ''}</small>
        </div>
      </div>
      <div className="dos-col">
        <label>Día<input className="campo" type="date" value={x.fecha} onChange={(e) => poner('fecha', e.target.value)} required /></label>
        {actividades.length > 1 && <label>Actividad<select className="campo" value={x.actividad} onChange={(e) => poner('actividad', e.target.value)}>{actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>}
      </div>

      <fieldset>
        <legend>Vendido (con {igic ? 'IGIC' : 'IVA'})</legend>
        {x.porIva.map((t, i) => (
          <div className="caja-iva" key={i}>
            <select className="campo" value={t.pct} onChange={(e) => ponerIva(i, 'pct', Number(e.target.value))} aria-label={`Tipo de ${igic ? 'IGIC' : 'IVA'}`}>
              {[Number(t.pct), ...libres].map((n) => <option key={n} value={n}>{igic ? 'IGIC' : 'IVA'} {n} %</option>)}
            </select>
            <input className="campo" inputMode="decimal" placeholder="0,00" value={t.total} onChange={(e) => ponerIva(i, 'total', e.target.value)} aria-label={`Total al ${t.pct} %`} required={i === 0} />
            {x.porIva.length > 1 && <button type="button" className="linea-quitar" aria-label="Quitar" onClick={() => poner('porIva', x.porIva.filter((_, j) => j !== i))}>×</button>}
          </div>
        ))}
        {libres.length > 0 && <button type="button" className="boton sec pequeno" onClick={() => poner('porIva', [...x.porIva, { pct: libres[0], total: '' }])}>+ Otro tipo de {igic ? 'IGIC' : 'IVA'}</button>}
        <p className="nota">Del informe Z o del cierre del TPV: el total de cada tipo de {igic ? 'IGIC' : 'IVA'}, impuestos incluidos.</p>
      </fieldset>

      <fieldset>
        <legend>Cobrado</legend>
        <div className="caja-cobro">
          <label>Efectivo<input className="campo" inputMode="decimal" placeholder="0,00" value={x.efectivo} onChange={(e) => poner('efectivo', e.target.value)} /></label>
          <label><span>Tarjeta{tarjetaAuto && <small className="caja-auto"> · lo que falta</small>}</span><input className="campo" inputMode="decimal" placeholder="0,00" value={tarjetaAuto ? (tarjeta ? aTexto(tarjeta) : "") : x.tarjeta} onChange={(e) => { setTarjetaAuto(false); poner('tarjeta', e.target.value); }} /></label>
          <label>Bizum y otros<input className="campo" inputMode="decimal" placeholder="0,00" value={x.otros} onChange={(e) => poner('otros', e.target.value)} /></label>
        </div>
        {!cuadra && <p className="error">El cobro suma {eur(r2(num(x.efectivo) + tarjeta + num(x.otros)))} y lo vendido {eur(total)}.</p>}
        {!tarjetaAuto && <button type="button" className="boton sec pequeno" onClick={() => setTarjetaAuto(true)}>Tarjeta: lo que falta</button>}
      </fieldset>

      <fieldset>
        <legend>Tiques del día (opcional)</legend>
        <div className="dos-col">
          <input className="campo" placeholder="Primer tique" value={x.desde} onChange={(e) => poner('desde', e.target.value)} aria-label="Primer tique" />
          <input className="campo" placeholder="Último tique" value={x.hasta} onChange={(e) => poner('hasta', e.target.value)} aria-label="Último tique" />
        </div>
        <p className="nota">Con el primer y el último número, el libro registro lo apunta como asiento resumen de los tiques del día.</p>
      </fieldset>

      {conStock.length > 0 && (
        <fieldset className="lineas">
          <legend>Unidades vendidas (opcional)</legend>
          {x.unidades.map((t, i) => (
            <div className="caja-ud" key={i}>
              <select className="campo" value={t.producto} onChange={(e) => ponerUd(i, 'producto', e.target.value)} aria-label="Producto">
                {conStock.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.sku ? ` (${p.sku})` : ''}</option>)}
              </select>
              <input className="campo" inputMode="decimal" placeholder="Uds." value={t.cantidad} onChange={(e) => ponerUd(i, 'cantidad', e.target.value)} aria-label="Unidades" />
              <button type="button" className="linea-quitar" aria-label="Quitar" onClick={() => poner('unidades', x.unidades.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="boton sec pequeno" onClick={() => poner('unidades', [...x.unidades, { producto: conStock[0].id, cantidad: '1' }])}>+ Producto vendido</button>
          <p className="nota">Restan del stock y cuentan en «Más vendidos» y en el margen (valoradas a su precio sin {igic ? 'IGIC' : 'IVA'}).</p>
        </fieldset>
      )}

      {(proyectos.length > 0 || x.proyecto) && <label>Local o centro (opcional)<input className="campo" list="proyectos-caja" value={x.proyecto} onChange={(e) => poner('proyecto', e.target.value)} maxLength={60} /></label>}
      <datalist id="proyectos-caja">{proyectos.map((p) => <option key={p} value={p} />)}</datalist>
      <label>Nota (opcional)<input className="campo" value={x.nota} onChange={(e) => poner('nota', e.target.value)} placeholder="Ej.: descuadre de 2 € en caja" /></label>

      <div className="totales solo-pc"><strong>Total del día {eur(total)}</strong></div>
      {error && <p className="error" role="alert">{error}</p>}
      {(!cuadra || !total) && <p id={ayudaId} className="nota">{!total ? 'Añade el importe vendido para guardar el cierre.' : 'Los cobros deben sumar el total vendido.'}</p>}
      <button className="boton" disabled={enviando || !cuadra || !total} aria-describedby={!cuadra || !total ? ayudaId : undefined}>{enviando ? 'Guardando…' : cierre ? 'Guardar cambios' : 'Apuntar el cierre'}</button>
    </form>
  );
}
