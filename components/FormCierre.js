'use client';

import { conHuecos } from '@/lib/huecos';
import { useT } from '@/components/Idioma';

import { TIPOS_IGIC } from '@/lib/igic';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from './Acciones';
import { navegar } from '@/lib/transicion';
import { leerImporte, r2 } from '@/lib/calculos';
import { eur, pctCorto } from '@/lib/formato';
import { reducir } from '@/lib/reducirImagen';
import { SALIDAS_CAJA } from '@/lib/caja';
import '@/app/lineas.css';
import '@/app/filtros.css';

const aTexto = (n) => (n || n === 0 ? String(n).replace('.', ',') : '');
const num = (v) => leerImporte(v || 0) || 0;
const TIPOS = [21, 10, 4, 0];

// Cierre de caja: lo vendido en el día por tipo de IVA (con IVA, como lo da el TPV), cómo se cobró y, si se quiere,
// cuántas unidades de cada producto salieron (para el stock y el margen). Se puede rellenar con una foto del informe Z
// (app/api/caja/z) y, si se quiere, hacer el arqueo: fondo, salidas del cajón y efectivo contado.
export default function FormCierre({ hoy, fecha = hoy, fondo = null, actividades, productos = [], cierre = null, ivaDefecto = 21, proyectos = [], igic = false }) {
  const tr = useT();
  const router = useRouter();
  const ayudaId = useId();
  const inicial = () => {
    if (!cierre) return { fecha, actividad: actividades[0].id, porIva: [{ pct: igic && !TIPOS_IGIC.includes(Number(ivaDefecto)) ? 7 : ivaDefecto, total: '' }], efectivo: '', tarjeta: '', otros: '', desde: '', hasta: '', nota: '', unidades: [], proyecto: '', arqueo: { activo: false, fondo: aTexto(fondo), contado: '', salidas: [] } };
    return {
      fecha: cierre.fecha, actividad: cierre.actividad,
      porIva: cierre.lineas.map((l) => ({ pct: l.ivaPct, total: aTexto(r2(l.precio + r2((l.precio * l.ivaPct) / 100))) })),
      efectivo: aTexto(cierre.caja.efectivo), tarjeta: aTexto(cierre.caja.tarjeta), otros: aTexto(cierre.caja.otros),
      desde: cierre.resumen?.desde || '', hasta: cierre.resumen?.hasta || '', nota: cierre.nota || '', proyecto: cierre.proyecto || '',
      unidades: (cierre.unidades || []).map((x) => ({ producto: x.producto, cantidad: aTexto(x.cantidad), importe: aTexto(x.importe) })),
      arqueo: cierre.caja.arqueo
        ? { activo: true, fondo: aTexto(cierre.caja.arqueo.fondo), contado: aTexto(cierre.caja.arqueo.contado), salidas: (cierre.caja.arqueo.salidas || []).map((y) => ({ ...y, importe: aTexto(y.importe), concepto: y.concepto || '' })) }
        : { activo: false, fondo: aTexto(fondo), contado: '', salidas: [] },
    };
  };
  const [x, setX] = useState(inicial);
  const [tarjetaAuto, setTarjetaAuto] = useState(!cierre);
  const [error, setError] = useState('');
  const [idem] = useState(() => crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [avisosZ, setAvisosZ] = useState([]);
  const fotoRef = useRef(null);
  const poner = (k, v) => setX((y) => ({ ...y, [k]: v }));
  const ponerIva = (i, k, v) => setX((y) => ({ ...y, porIva: y.porIva.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));
  const ponerArq = (k, v) => setX((y) => ({ ...y, arqueo: { ...y.arqueo, [k]: v } }));
  const ponerSal = (i, k, v) => setX((y) => ({ ...y, arqueo: { ...y.arqueo, salidas: y.arqueo.salidas.map((t, j) => (j === i ? { ...t, [k]: v } : t)) } }));
  const ponerUd = (i, k, v) => setX((y) => ({ ...y, unidades: y.unidades.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));

  const total = r2(x.porIva.reduce((s, t) => s + num(t.total), 0));
  const tarjeta = tarjetaAuto ? r2(total - num(x.efectivo) - num(x.otros)) : num(x.tarjeta);
  const cuadra = Math.abs(r2(num(x.efectivo) + tarjeta + num(x.otros)) - total) < 0.01;
  const libres = (igic ? TIPOS_IGIC : TIPOS).filter((t) => !x.porIva.some((y) => Number(y.pct) === t));
  const conStock = productos.filter((p) => !p.servicio);
  // Arqueo: lo que debería haber en el cajón = fondo + efectivo cobrado − salidas; lo contado dice si sobra o falta.
  const A = x.arqueo;
  const salidas = r2(A.salidas.reduce((s, t) => s + num(t.importe), 0));
  const esperado = r2(num(A.fondo) + num(x.efectivo) - salidas);
  const descuadre = A.contado === '' ? null : r2(num(A.contado) - esperado);

  // Foto del informe Z: la IA lo lee y rellena lo vendido, el cobro y los tiques. No guarda nada: se revisa antes.
  const leerZ = async (archivo) => {
    if (!archivo) return;
    setLeyendo(true); setError(''); setAvisosZ([]);
    try {
      const pdf = archivo.type === 'application/pdf';
      const imagen = pdf ? await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(archivo); }) : await reducir(archivo);
      const { z } = await llamar('/api/caja/z', { method: 'POST', body: JSON.stringify({ imagen }) });
      setX((y) => ({ ...y, fecha: z.fecha || y.fecha,
        porIva: z.porIva.length ? z.porIva.map((t) => ({ pct: t.pct, total: aTexto(t.total) })) : y.porIva,
        efectivo: z.efectivo !== null ? aTexto(z.efectivo) : y.efectivo, otros: z.otros !== null ? aTexto(z.otros) : y.otros,
        tarjeta: z.tarjeta !== null ? aTexto(z.tarjeta) : y.tarjeta, desde: z.desde || y.desde, hasta: z.hasta || y.hasta }));
      // Con la tarjeta leída se respeta; sin ella, lo que falta hasta el total.
      setTarjetaAuto(z.tarjeta === null);
      setAvisosZ(z.avisos || []);
    } catch (err) { setError(err.message); }
    setLeyendo(false);
    if (fotoRef.current) fotoRef.current.value = '';
  };

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true); setError('');
    try {
      const d = await llamar('/api/caja', { method: 'POST', body: JSON.stringify({ ...x, tarjeta: tarjetaAuto ? undefined : x.tarjeta, arqueo: A.activo ? { fondo: A.fondo, contado: A.contado, salidas: A.salidas } : null, id: cierre?.id, idem }) });
      navegar(router, `/facturas/${d.factura.id}`, 'fundido', undefined, true);
      router.refresh();
    } catch (err) { setError(err.message); setEnviando(false); }
  };

  return (
    <form className="formulario caja-form" onSubmit={enviar}>
      {/* Móvil, en el mostrador: el total del día siempre a la vista, con lo cobrado y si cuadra */}
      <div className="caja-total solo-movil">
        <div className="caja-total-v"><small>{tr('Total del día')}</small><strong>{eur(total)}</strong></div>
        <div className="caja-total-d">
          <span className={total ? (cuadra ? 'ok' : 'falta') : ''}>{(!total ? tr('Apunta lo vendido') : (cuadra ? tr('Cuadra ✓') : tr('Descuadra {diferencia}', { diferencia: eur(Math.abs(r2(total - r2(num(x.efectivo) + tarjeta + num(x.otros))))) })))}</span>
          <small>{(num(x.otros) ? tr('Efectivo {efectivo} · Tarjeta {tarjeta} · Otros {otros}', { efectivo: eur(num(x.efectivo)), tarjeta: eur(tarjeta), otros: eur(num(x.otros)) }) : tr('Efectivo {efectivo} · Tarjeta {tarjeta}', { efectivo: eur(num(x.efectivo)), tarjeta: eur(tarjeta) }))}</small>
        </div>
      </div>
      <div className="caja-z">
        <button type="button" className="boton sec" onClick={() => fotoRef.current?.click()} disabled={leyendo}>{(leyendo ? tr('Leyendo el informe Z…') : tr('Foto del informe Z'))}</button>
        <input ref={fotoRef} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => leerZ(e.target.files?.[0])} />
        <small className="nota">{tr('La IA lee lo vendido y el cobro del tique de cierre de tu TPV o caja registradora. Revísalo antes de apuntarlo.')}</small>
      </div>
      {avisosZ.length > 0 && <ul className="caja-z-avisos" role="status">{avisosZ.map((a) => <li key={a}>{tr(a)}</li>)}</ul>}
      <div className="dos-col">
        <label>{tr('Día')}<input className="campo" type="date" value={x.fecha} onChange={(e) => poner('fecha', e.target.value)} required /></label>
        {actividades.length > 1 && <label>{tr('Actividad')}<select className="campo" value={x.actividad} onChange={(e) => poner('actividad', e.target.value)}>{actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>}
      </div>

      <fieldset>
        <legend>{tr('Vendido (con {impuesto})', { impuesto: igic ? 'IGIC' : tr('IVA') })}</legend>
        {x.porIva.map((t, i) => (
          <div className="caja-iva" key={i}>
            <select className="campo" value={t.pct} onChange={(e) => ponerIva(i, 'pct', Number(e.target.value))} aria-label={tr('Tipo de {impuesto}', { impuesto: (igic ? 'IGIC' : tr('IVA')) })}>
              {[Number(t.pct), ...libres].map((n) => <option key={n} value={n}>{(igic ? 'IGIC' : tr('IVA'))} {n} %</option>)}
            </select>
            <input className="campo" inputMode="decimal" placeholder={"0,00"} value={t.total} onChange={(e) => ponerIva(i, 'total', e.target.value)} aria-label={tr('Total al {porcentaje}', { porcentaje: pctCorto(t.pct) })} required={i === 0} />
            {x.porIva.length > 1 && <button type="button" className="linea-quitar" aria-label={tr('Quitar')} onClick={() => poner('porIva', x.porIva.filter((_, j) => j !== i))}>×</button>}
          </div>
        ))}
        {libres.length > 0 && <button type="button" className="boton sec pequeno" onClick={() => poner('porIva', [...x.porIva, { pct: libres[0], total: '' }])}>{(igic ? tr('+ Otro tipo de IGIC') : tr('+ Otro tipo de IVA'))}</button>}
        <p className="nota">{tr('Del informe Z o del cierre del TPV: el total de cada tipo de {impuesto}, impuestos incluidos.', { impuesto: igic ? 'IGIC' : tr('IVA') })}</p>
      </fieldset>

      <fieldset>
        <legend>{tr('Cobrado')}</legend>
        <div className="caja-cobro">
          <label>{tr('Efectivo')}<input className="campo" inputMode="decimal" placeholder={"0,00"} value={x.efectivo} onChange={(e) => poner('efectivo', e.target.value)} /></label>
          <label><span>{tarjetaAuto ? conHuecos(tr('{tarjeta} · lo que falta'), { tarjeta: tr('Tarjeta') }).map((parte, i) => i === 1 ? parte : <small key={i} className="caja-auto">{parte}</small>) : tr('Tarjeta')}</span><input className="campo" inputMode="decimal" placeholder={"0,00"} value={tarjetaAuto ? (tarjeta ? aTexto(tarjeta) : "") : x.tarjeta} onChange={(e) => { setTarjetaAuto(false); poner('tarjeta', e.target.value); }} /></label>
          <label>{tr('Bizum y otros')}<input className="campo" inputMode="decimal" placeholder={"0,00"} value={x.otros} onChange={(e) => poner('otros', e.target.value)} /></label>
        </div>
        {!cuadra && <p className="error">{tr('El cobro suma {cobrado} y lo vendido {total}.', { cobrado: eur(r2(num(x.efectivo) + tarjeta + num(x.otros))), total: eur(total) })}</p>}
        {!tarjetaAuto && <button type="button" className="boton sec pequeno" onClick={() => setTarjetaAuto(true)}>{tr('Tarjeta: lo que falta')}</button>}
      </fieldset>

      <fieldset>
        <legend>{tr('Arqueo de caja (opcional)')}</legend>
        <label className="check"><input type="checkbox" checked={A.activo} onChange={(e) => ponerArq('activo', e.target.checked)} />{(" " + tr('Contar el efectivo del cajón'))}</label>
        {A.activo && (
          <>
            <div className="dos-col">
              <label>{tr('Fondo al abrir')}<input className="campo" inputMode="decimal" placeholder={"0,00"} value={A.fondo} onChange={(e) => ponerArq('fondo', e.target.value)} /></label>
              <label>{tr('Efectivo contado al cerrar')}<input className="campo" inputMode="decimal" placeholder={"0,00"} value={A.contado} onChange={(e) => ponerArq('contado', e.target.value)} /></label>
            </div>
            {A.salidas.map((t, i) => (
              <div className="caja-salida" key={i}>
                <select className="campo" value={t.tipo} onChange={(e) => ponerSal(i, 'tipo', e.target.value)} aria-label={tr('Tipo de salida')}>
                  {Object.entries(SALIDAS_CAJA).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}
                </select>
                <input className="campo caja-salida-c" placeholder={tr('Concepto (opcional)')} value={t.concepto} onChange={(e) => ponerSal(i, 'concepto', e.target.value)} aria-label={tr('Concepto')} maxLength={80} />
                <input className="campo" inputMode="decimal" placeholder={"0,00"} value={t.importe} onChange={(e) => ponerSal(i, 'importe', e.target.value)} aria-label={tr('Importe')} />
                <button type="button" className="linea-quitar" aria-label={tr('Quitar')} onClick={() => ponerArq('salidas', A.salidas.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button type="button" className="boton sec pequeno" onClick={() => ponerArq('salidas', [...A.salidas, { tipo: 'banco', importe: '', concepto: '' }])}>{tr('+ Dinero que salió del cajón')}</button>
            <div className="caja-arqueo-res" aria-live="polite">
              <span>{conHuecos(tr('Debería haber {esperado} {calculo}'), { esperado: eur(esperado), calculo: <small className="nota">{salidas ? tr('(fondo {fondo} + efectivo {efectivo} − salidas {salidas})', { fondo: eur(num(A.fondo)), efectivo: eur(num(x.efectivo)), salidas: eur(salidas) }) : tr('(fondo {fondo} + efectivo {efectivo})', { fondo: eur(num(A.fondo)), efectivo: eur(num(x.efectivo)) })}</small> })}</span>
              {esperado < 0 && <span className="falta">{tr('Sale más efectivo del que había: revisa el fondo y las salidas')}</span>}
              {descuadre !== null && esperado >= 0 && <span className={descuadre ? 'falta' : 'ok'}>{(!descuadre ? tr('La caja cuadra ✓') : (descuadre > 0 ? tr('Sobran {importe}', { importe: eur(descuadre) }) : tr('Faltan {importe}', { importe: eur(-descuadre) })))}</span>}
            </div>
            <p className="nota">{tr('Un pago en efectivo apúntalo también como gasto. El descuadre va a la contabilidad como gasto o ingreso excepcional.')}</p>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>{tr('Tiques del día (opcional)')}</legend>
        <div className="dos-col">
          <input className="campo" placeholder={tr('Primer tique')} value={x.desde} onChange={(e) => poner('desde', e.target.value)} aria-label={tr('Primer tique')} />
          <input className="campo" placeholder={tr('Último tique')} value={x.hasta} onChange={(e) => poner('hasta', e.target.value)} aria-label={tr('Último tique')} />
        </div>
        <p className="nota">{tr('Con el primer y el último número, el libro registro lo apunta como asiento resumen de los tiques del día.')}</p>
      </fieldset>

      {conStock.length > 0 && (
        <fieldset className="lineas">
          <legend>{tr('Unidades vendidas (opcional)')}</legend>
          {x.unidades.map((t, i) => (
            <div className="caja-ud" key={i}>
              <select className="campo" value={t.producto} onChange={(e) => ponerUd(i, 'producto', e.target.value)} aria-label={tr('Producto')}>
                {conStock.map((p) => <option key={p.id} value={p.id}>{p.nombre}{(p.sku ? ` (${p.sku})` : "")}</option>)}
              </select>
              <input className="campo" inputMode="decimal" placeholder={tr('Uds.')} value={t.cantidad} onChange={(e) => ponerUd(i, 'cantidad', e.target.value)} aria-label={tr('Unidades')} />
              <button type="button" className="linea-quitar" aria-label={tr('Quitar')} onClick={() => poner('unidades', x.unidades.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="boton sec pequeno" onClick={() => poner('unidades', [...x.unidades, { producto: conStock[0].id, cantidad: '1' }])}>{tr('+ Producto vendido')}</button>
          <p className="nota">{tr('Restan del stock y cuentan en «Más vendidos» y en el margen (valoradas a su precio sin {impuesto}).', { impuesto: igic ? 'IGIC' : tr('IVA') })}</p>
        </fieldset>
      )}

      {(proyectos.length > 0 || x.proyecto) && <label>{tr('Local o centro (opcional)')}<input className="campo" list="proyectos-caja" value={x.proyecto} onChange={(e) => poner('proyecto', e.target.value)} maxLength={60} /></label>}
      <datalist id="proyectos-caja">{proyectos.map((p) => <option key={p} value={p} />)}</datalist>
      <label>{tr('Nota (opcional)')}<input className="campo" value={x.nota} onChange={(e) => poner('nota', e.target.value)} placeholder={tr('Ej.: devolución de un cliente')} /></label>

      <div className="totales solo-pc"><strong>{tr('Total del día {total}', { total: eur(total) })}</strong></div>
      {error && <p className="error" role="alert">{tr(error)}</p>}
      {(!cuadra || !total) && <p id={ayudaId} className="nota">{(!total ? tr('Añade el importe vendido para guardar el cierre.') : tr('Los cobros deben sumar el total vendido.'))}</p>}
      <button className="boton" disabled={enviando || !cuadra || !total || (A.activo && esperado < 0)} aria-describedby={!cuadra || !total ? ayudaId : undefined}>{(enviando ? tr('Guardando…') : (cierre ? tr('Guardar cambios') : tr('Apuntar el cierre')))}</button>
    </form>
  );
}
