'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from '@/components/Acciones';
import { eur, fechaCorta } from '@/lib/formato';
import { formatoIban } from '@/lib/sepa';

function Cuenta({ grupo, cuenta, cobros, hoy, bloqueado, ejecutar }) {
  const [abierto, abrir] = useState(false);
  const guardar = async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget));
    await ejecutar(async () => {
      await llamar('/api/remesas', { method: 'POST', body: JSON.stringify({ ...datos,
        accion: cobros ? 'domiciliacion' : 'cuentaProveedor', ...(cobros ? { cliente: grupo.id } : { clave: grupo.id, nombre: grupo.nombre }) }) });
      abrir(false);
    });
  };
  return (
    <div className="rem-cuenta">
      {cuenta && <p className="grupo-pie">{formatoIban(cuenta.iban)}{cobros && ` · Mandato ${cuenta.mandato.referencia} · ${cuenta.usado ? 'Recurrente' : 'Primer cobro'}`}</p>}
      {!abierto ? <button type="button" className="boton sec" disabled={bloqueado} onClick={() => abrir(true)}>{cuenta ? 'Editar cuenta' : cobros ? 'Añadir domiciliación' : 'Añadir IBAN'}</button> : (
        <form className="formulario" onSubmit={guardar}>
          <fieldset disabled={bloqueado}>
            <legend>{cobros ? 'Cuenta y mandato firmado' : 'Cuenta del proveedor'}</legend>
            <label>IBAN<input className="campo" name="iban" defaultValue={cuenta?.iban || ''} required autoComplete="off" maxLength={42} spellCheck={false} /></label>
            <label>BIC (opcional)<input className="campo" name="bic" defaultValue={cuenta?.bic || ''} maxLength={11} autoComplete="off" spellCheck={false} /></label>
            {cobros && <>
              <label>Referencia del mandato (opcional)<input className="campo" name="referencia" defaultValue={cuenta?.mandato.referencia || ''} maxLength={35} aria-describedby={`ref-${grupo.id}`} /></label>
              <p id={`ref-${grupo.id}`} className="grupo-pie">Si la dejas vacía, se genera con el NIF o el nombre y la fecha de firma.</p>
              <label>Fecha de firma del mandato<input className="campo" type="date" name="fecha" defaultValue={cuenta?.mandato.fecha || ''} max={hoy} required /></label>
            </>}
            <div className="rem-acciones"><button className="boton" type="submit">Guardar {cobros ? 'domiciliación' : 'cuenta'}</button><button className="boton sec" type="button" onClick={() => abrir(false)}>Cancelar</button></div>
          </fieldset>
        </form>
      )}
    </div>
  );
}

function Lote({ tipo, documentos, cuentas, fechaInicial, hoy, emisorListo, bloqueado, ejecutar, resumen }) {
  const cobros = tipo === 'cobros';
  const [seleccion, seleccionar] = useState([]);
  const [fecha, ponerFecha] = useState(fechaInicial);
  const [marcar, ponerMarcar] = useState(false);
  const porCuenta = new Map(cuentas.map((c) => [c.id, c]));
  const grupos = new Map();
  for (const d of documentos) {
    if (!grupos.has(d.grupo)) grupos.set(d.grupo, { id: d.grupo, nombre: d.nombre, docs: [] });
    grupos.get(d.grupo).docs.push(d);
  }
  const apto = (d) => Boolean(d.grupo && porCuenta.has(d.grupo) && Number.isFinite(d.importe) && d.importe > 0);
  const elegibles = documentos.filter(apto);
  const elegidos = elegibles.filter((d) => seleccion.includes(d.id));
  const cambiar = (id, activo) => seleccionar((s) => activo ? [...new Set([...s, id])] : s.filter((x) => x !== id));
  const descargar = (e) => {
    e.preventDefault();
    if (!elegidos.length) return;
    ejecutar(async () => {
      const r = await fetch('/api/remesas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        accion: tipo, [cobros ? 'facturas' : 'gastos']: elegidos.map((d) => d.id), fecha, marcar,
      }) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'No se ha podido generar la remesa');
      }
      const datos = JSON.parse(decodeURIComponent(r.headers.get('X-Remesa')));
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `remesa-${tipo}-${fecha}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resumen({ ...datos, tipo });
      seleccionar([]);
    });
  };
  return (
    <>
      {!documentos.length ? <div className="vacio"><p>{cobros ? 'No hay facturas por cobrar' : 'No hay gastos pendientes'}</p></div> : <>
        <label className="rem-check rem-todos"><input type="checkbox" disabled={bloqueado || !elegibles.length} checked={elegibles.length > 0 && elegidos.length === elegibles.length}
          onChange={(e) => seleccionar(e.target.checked ? elegibles.map((d) => d.id) : [])} />Seleccionar todos los disponibles</label>
        {[...grupos.values()].map((grupo) => <section className="grupo" key={grupo.id}>
          <h2 className="grupo-t">{grupo.nombre}</h2>
          {grupo.id ? <Cuenta grupo={grupo} cuenta={porCuenta.get(grupo.id)} cobros={cobros} hoy={hoy} bloqueado={bloqueado} ejecutar={ejecutar} />
            : <p className="nota">Añade {cobros ? 'el cliente a la factura' : 'el proveedor al gasto'} para incluirlo en una remesa.</p>}
          <ul className="grupo-lista">
            {grupo.docs.map((d) => <li key={d.id}><label className="fila rem-documento">
              <input type="checkbox" disabled={bloqueado || !apto(d)} checked={apto(d) && seleccion.includes(d.id)} onChange={(e) => cambiar(d.id, e.target.checked)} />
              <span className="txt"><strong>{d.concepto}</strong><small>{d.fecha ? fechaCorta(d.fecha) : ''}{!Number.isFinite(d.importe) || d.importe <= 0 ? ' · Importe no válido para SEPA' : !porCuenta.has(d.grupo) ? ' · Falta la cuenta bancaria' : ''}</small></span>
              <span className="imp">{eur(d.importe)}</span>
            </label></li>)}
          </ul>
        </section>)}
        <form className="tarjeta formulario rem-descarga" onSubmit={descargar}>
          <fieldset disabled={bloqueado}>
            <legend>Preparar {cobros ? 'cobros' : 'pagos'}</legend>
            <p className="rem-total">{elegidos.length} {cobros ? 'recibos' : 'pagos'} seleccionados · <strong>{eur(elegidos.reduce((s, d) => s + d.importe, 0))}</strong></p>
            <label>Fecha de {cobros ? 'cobro' : 'ejecución'}<input className="campo" type="date" value={fecha} min={hoy} required onChange={(e) => ponerFecha(e.target.value)} /></label>
            <label className="check rem-check"><input type="checkbox" checked={marcar} onChange={(e) => ponerMarcar(e.target.checked)} />Marcar como {cobros ? 'cobradas' : 'pagados'}</label>
            <p className="grupo-pie">{marcar ? 'Se marcarán al generar el archivo. Activa esta opción solo si tu banco ya ha confirmado los cobros o pagos.' : 'Los documentos seguirán pendientes después de descargar el archivo. Confirma los cobros o pagos cuando tu banco los ejecute.'}</p>
            {!emisorListo && <p className="nota">Completa tus datos de facturación en Ajustes para descargar.</p>}
            <button className="boton" disabled={!elegidos.length || !emisorListo || bloqueado}>{bloqueado ? 'Preparando…' : 'Descargar remesa (XML)'}</button>
          </fieldset>
        </form>
      </>}
    </>
  );
}

export default function Remesas({ puedeCobrar, puedePagar, facturas, gastos, domiciliaciones, cuentasProv, historial, hoy, fechaCobro, emisorCobros, emisorPagos }) {
  const router = useRouter();
  const [tab, ponerTab] = useState(puedeCobrar ? 'cobros' : 'pagos');
  const [ocupado, ponerOcupado] = useState(false);
  const enCurso = useRef(false);
  const [error, ponerError] = useState('');
  const [resultado, ponerResultado] = useState(null);
  const ejecutar = async (tarea) => {
    if (enCurso.current) return;
    enCurso.current = true;
    ponerOcupado(true);
    ponerError('');
    try { await tarea(); } catch (e) { ponerError(e.message || 'No se ha podido completar la operación'); }
    finally { router.refresh(); enCurso.current = false; ponerOcupado(false); }
  };
  const tabs = [...(puedeCobrar ? [['cobros', 'Cobrar a clientes']] : []), ...(puedePagar ? [['pagos', 'Pagar a proveedores']] : []), ['historial', 'Historial']];
  return (
    <>
      <nav className="segmentado" aria-label="Tipo de remesa">{tabs.map(([id, texto]) => <button key={id} type="button" className={tab === id ? 'activo' : ''} aria-pressed={tab === id} disabled={ocupado} onClick={() => ponerTab(id)}>{texto}</button>)}</nav>
      {error && <p className="error" role="alert">{error}</p>}
      {resultado && <div className="tarjeta rem-resultado" role="status">
        <p>Archivo descargado: {resultado.numero} {resultado.tipo === 'cobros' ? 'recibos' : 'pagos'} · <strong>{eur(resultado.total)}</strong></p>
        {resultado.errores?.length > 0 && <><p>Documentos excluidos:</p><ul>{resultado.errores.map((e, i) => <li key={i}>{e.id}: {e.error}</li>)}</ul></>}
      </div>}
      {tab === 'historial' ? <>
        <p className="grupo-pie">Últimas 50 remesas generadas. Comprueba su ejecución en tu banco.</p>
        {historial.length ? <ul className="grupo-lista">{historial.map((r) => <li key={r.id} className="fila">
          <span className="txt"><strong>{r.tipo === 'cobros' ? 'Cobros' : 'Pagos'} · {fechaCorta(r.fecha)}</strong><small>{r.numero} operaciones · Creada el {fechaCorta(r.creada.slice(0, 10))}</small></span><span className="imp">{eur(r.total)}</span>
        </li>)}</ul> : <div className="vacio"><p>Aún no hay remesas</p><p>Las descargas que generes aparecerán aquí.</p></div>}
      </> : <Lote key={tab} tipo={tab} documentos={tab === 'cobros' ? facturas : gastos} cuentas={tab === 'cobros' ? domiciliaciones : cuentasProv}
        fechaInicial={tab === 'cobros' ? fechaCobro : hoy} hoy={hoy} emisorListo={tab === 'cobros' ? emisorCobros : emisorPagos} bloqueado={ocupado} ejecutar={ejecutar} resumen={ponerResultado} />}
    </>
  );
}
