'use client';

import { fraseBanco } from '@/lib/textoBanco';
import { confirmar as confirmarAccion } from './Confirmar';
import Vacio from '@/components/Vacio';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CupoEscaneo from '@/components/CupoEscaneo';
import BancoReglas, { FormRegla } from '@/components/BancoReglas';
import GuiaExtracto from '@/components/GuiaExtracto';
import { eur, fechaCorta, fechaHora } from '@/lib/formato';
import { encaja, reglaDesde } from '@/lib/reglasBanco';

const iban = (s) => (s ? `•••• ${s.replace(/\s/g, '').slice(-4)}` : '');
const cuando = fechaHora;
const diasHasta = (iso) => Math.ceil((Date.parse(iso) - Date.now()) / 864e5);

async function llamar(url, opciones) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido completar la operación del banco. Revisa la conexión e inténtalo otra vez.');
  return d;
}

function Importe({ v }) {
  return <span className={`bco-imp ${v > 0 ? 'teso-in' : 'teso-out'}`}>{v > 0 ? '+' : '−'}{eur(Math.abs(v))}</span>;
}

function Paginas({ datos, estado }) {
  if (!datos?.total) return null;
  return (
    <nav className="bco-paginas" aria-label={`Páginas de movimientos ${estado}`}>
      <span role="status">Mostrando {datos.desde}–{datos.hasta} de {datos.total}</span>
      <div>
        {datos.anterior && <Link href={datos.anterior} className="boton pequeno sec" aria-label={`Movimientos ${estado}: página anterior`}>Anterior</Link>}
        {datos.paginas > 1 && <span>Página {datos.pagina} de {datos.paginas}</span>}
        {datos.siguiente && <Link href={datos.siguiente} className="boton pequeno sec" aria-label={`Movimientos ${estado}: página siguiente`}>Siguiente</Link>}
      </div>
    </nav>
  );
}

// Por qué una sugerencia no es segura (lib/banco.js sugerencias: motivo).
const MOTIVO = {
  parcial: 'El importe es menor que lo que falta: sería un cobro parcial.',
  'importe-distinto': 'Coincide el número de factura, pero no el importe.',
  conflicto: 'Otro movimiento apunta a lo mismo: elige cuál es.',
  alternativa: 'Otra opción encajaba mejor y ya está reservada para otro movimiento.',
};

const AYUDA = {
  gasto: 'Apúntalo con su factura: Fisquo lee la base y el IVA y lo deja emparejado.',
  comision: 'Se apunta como gasto bancario, sin IVA (no hace falta factura).',
  cuota: 'Se apunta como gasto de Seguridad Social del titular, sin IVA.',
  hacienda: 'Ya lo contabiliza Fisquo con cada liquidación: marca el trimestre como presentado en el Resumen.',
  seguridad: 'Ya lo contabiliza Fisquo con las nóminas.',
  nomina: 'Ya lo contabiliza Fisquo con las nóminas.',
  prestamo: 'Se apunta contra el préstamo: la devolución, a la deuda; los intereses, a gastos financieros.',
  socio: 'Se apunta en la cuenta corriente con los socios.',
  traspaso: 'No cambia nada en tus cuentas: se aparta.',
  ingreso: 'Si es el cobro de una factura que no está en Fisquo, mejor créala; si no, se apunta como otro ingreso.',
};

// Sin factura ni gasto: qué es (Fisquo propone una opción por el concepto) y apuntarlo con un toque.
function QueEs({ m, accion, regla, children }) {
  const [clase, setClase] = useState(m.clase);
  const [intereses, setIntereses] = useState('');
  return (
    <div className="bco-quees">
      {regla?.accion === 'gasto' && <p className="bco-nota bco-regla-nota">Tu regla «{regla.contiene}» dice que es un gasto de {regla.proveedor}, pero ahora no hay ninguno suyo que cuadre. Añádelo con su factura.</p>}
      <label className="bco-quees-t">Fisquo cree que es
        <select className="campo" value={clase} onChange={(e) => setClase(e.target.value)}>{m.clases.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
      </label>
      {clase === 'prestamo' && m.importe < 0 && <input className="campo" inputMode="decimal" aria-label="De esta cuota, intereses (opcional)" placeholder="De esta cuota, intereses (opcional)" value={intereses} onChange={(e) => setIntereses(e.target.value.replace(',', '.'))} />}
      <p className="bco-nota">{AYUDA[clase]}</p>
      <div className="bco-botones">
        {clase === 'gasto'
          ? <Link href={`/gastos?banco=${encodeURIComponent(m.id)}`} className="boton pequeno">Añadir con su factura</Link>
          : <button className="boton pequeno" onClick={() => accion({ accion: 'contabilizar', id: m.id, clase, intereses })}>{['hacienda', 'seguridad', 'nomina'].includes(clase) ? 'Entendido' : clase === 'traspaso' ? 'Apartar' : 'Apuntar'}</button>}
        {children}
      </div>
    </div>
  );
}

// Un movimiento por confirmar o sin pareja: confirmar la sugerencia, elegir otra, ignorarlo o crear una regla con él.
function Pendiente({ m, permisos, accion, contar, guardarRegla }) {
  const [eligiendo, setEligiendo] = useState(false);
  const [elegida, setElegida] = useState('');
  const [creando, setCreando] = useState(false);
  const elegir = useRef(null);
  useEffect(() => { if (eligiendo) elegir.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [eligiendo]);
  const elegidaValida = m.opciones.some((o) => o.id === elegida) ? elegida : '';
  const r = m.regla;
  // Lo que se propone al crear una regla desde este movimiento; el proveedor, con el mismo tipo frase que se lee en pantalla.
  const inicialRegla = { ...reglaDesde(m, m.clase), ...(m.importe < 0 && m.contraparte ? { proveedor: fraseBanco(m.contraparte, { nombre: true }) } : {}) };
  // Una regla de ignorar manda sobre una sugerencia dudosa, no sobre una segura (el servidor hace lo mismo: lib/bancoServidor.js).
  const ignora = r?.accion === 'ignorar' && !m.sugerencia?.segura ? r : null;
  const s = ignora ? null : m.sugerencia;
  const puedeAqui = m.importe > 0 ? permisos.facturar : permisos.gastar;
  const confirmar = (tipo, destino) => accion({ accion: 'emparejar', id: m.id, tipo, destino });
  return (
    <li className="bco-mov">
      <div className="bco-mov-fila">
        <span className="bco-fecha">{fechaCorta(m.fecha).slice(0, 5)}</span>
        <span className="bco-txt"><strong>{m.contraparte ? fraseBanco(m.contraparte, { nombre: true }) : fraseBanco(m.concepto)}</strong>{m.contraparte && <small>{fraseBanco(m.concepto)}</small>}
          {puedeAqui && !r && !creando && <button type="button" className="bco-regla-boton" onClick={() => setCreando(true)}>Crear regla con esto</button>}</span>
        <Importe v={m.importe} />
      </div>
      {s && (
        <div className={`bco-sug${s.segura ? ' segura' : ''}`}>
          <span className="bco-sug-t">{s.segura ? 'Es esta' : 'Puede ser'}</span>
          <Link href={s.url} prefetch={false} className="bco-sug-d">{s.texto}<small>{fechaCorta(s.fecha)} · {eur(s.importe)}{s.pendiente ? ' · sin pagar' : ''}{s.yaCobrada ? ' · ya cobrada por otra vía' : ''}</small></Link>
          {(s.motivo && MOTIVO[s.motivo]) && <small className="bco-sug-m">{MOTIVO[s.motivo]}</small>}
          {r?.accion === 'gasto' && <small className="bco-sug-m">Tu regla «{r.contiene}» dice que es un gasto de {r.proveedor}.</small>}
        </div>
      )}
      {ignora && (
        <div className="bco-sug segura">
          <span className="bco-sug-t">Regla</span>
          <span className="bco-sug-d">Ignorar este movimiento<small>{ignora.cuando} → {ignora.entonces}</small></span>
        </div>
      )}
      {puedeAqui && (eligiendo ? (
        <div className="bco-elegir" ref={elegir}>
          <select className="campo" value={elegidaValida} onChange={(e) => setElegida(e.target.value)} aria-label={m.importe > 0 ? 'Factura' : 'Gasto'}>
            <option value="">{m.importe > 0 ? 'Elige la factura…' : 'Elige el gasto…'}</option>
            {m.opciones.map((o) => <option key={o.id} value={o.id}>{o.texto} · {fechaCorta(o.fecha)} · {o.total !== undefined && o.saldo !== undefined && Math.abs(o.total - o.saldo) > 0.005 ? `${eur(o.total)}, faltan ${eur(o.saldo)}` : eur(o.importe)}</option>)}
          </select>
          <div className="bco-botones">
            <button className="boton pequeno" disabled={!elegidaValida} aria-describedby={!elegidaValida ? `bco-${m.id}-elegir` : undefined} onClick={() => { if (elegidaValida) confirmar(m.importe > 0 ? 'factura' : 'gasto', elegidaValida); }}>Emparejar</button>
            <button className="boton pequeno sec" onClick={() => setEligiendo(false)}>Cancelar</button>
          </div>
          {!elegidaValida && <p id={`bco-${m.id}-elegir`} className="bco-nota">Elige una factura o gasto para emparejar.</p>}
          {!m.opciones.length && <Vacio compacto tipo="resultados" icono={m.importe > 0 ? 'factura' : 'gasto'} titulo={m.importe > 0 ? 'Añade la factura de este cobro' : 'Apunta el gasto de este pago'} accion={{ href: m.importe > 0 ? '/facturas/nueva' : '/gastos#apuntar-gasto', texto: m.importe > 0 ? 'Nueva factura' : 'Añadir gasto' }} secundaria={<button type="button" className="boton sec" onClick={() => setEligiendo(false)}>Volver al movimiento</button>} />}
        </div>
      ) : !s && !ignora ? (
        <QueEs m={m} accion={accion} regla={r}>
          <button className="boton pequeno sec" onClick={() => setEligiendo(true)}>{m.importe > 0 ? 'Elegir factura' : 'Elegir gasto'}</button>
          <button className="boton pequeno sec" onClick={() => accion({ accion: 'ignorar', id: m.id })}>Ignorar</button>
        </QueEs>
      ) : (
        <div className="bco-botones">
          {s && <button className="boton pequeno" onClick={() => confirmar(s.tipo, s.id)}>{s.yaCobrada ? 'Vincular' : s.motivo === 'parcial' ? 'Cobro parcial' : 'Confirmar'}</button>}
          {ignora && <button className="boton pequeno" onClick={() => accion({ accion: 'ignorar', id: m.id, regla: ignora.id })}>Ignorar</button>}
          <button className="boton pequeno sec" onClick={() => setEligiendo(true)}>{s ? 'Otra' : m.importe > 0 ? 'Elegir factura' : 'Elegir gasto'}</button>
          {!ignora && <button className="boton pequeno sec" onClick={() => accion({ accion: 'ignorar', id: m.id })}>Ignorar</button>}
        </div>
      ))}
      {puedeAqui && !r && creando && <div className="bco-regla-fila"><FormRegla inicial={inicialRegla} importeMov={Math.abs(m.importe)} permisos={permisos} contar={contar} guardar={async (x) => { await guardarRegla(x); setCreando(false); }} cancelar={() => setCreando(false)} /></div>}
    </li>
  );
}

// Conectar un banco: se elige de la lista y el banco pide el permiso en su web o app.
function Conectar({ cerrar }) {
  const [bancos, setBancos] = useState(null);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('personal');
  const [msg, setMsg] = useState('');
  useEffect(() => { llamar('/api/banco/conectar').then((d) => setBancos(d.bancos)).catch((e) => setMsg(e.message)); }, []);
  const ir = async (banco) => {
    setMsg('');
    try { window.location.href = (await llamar('/api/banco/conectar', { method: 'POST', body: JSON.stringify({ banco, tipo }) })).url; } catch (e) { setMsg(e.message); }
  };
  const t = busca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const vistos = (bancos || []).filter((b) => b.tipos.includes(tipo) && b.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(t)).slice(0, 60);
  return (
    <section className="bco-conectar">
      <div className="bco-conectar-cab">
        <h2>Conectar un banco</h2>
        <button className="bco-x" onClick={cerrar} aria-label="Cancelar">×</button>
      </div>
      <p className="bco-nota">Tu banco te pedirá permiso para que Fisquo vea el saldo y los movimientos (solo lectura, hasta 180 días). Lo gestiona Enable Banking, entidad autorizada.</p>
      <div className="segmentado bco-tipo">
        <button type="button" className={tipo === 'personal' ? 'activo' : ''} onClick={() => setTipo('personal')}>Cuenta personal</button>
        <button type="button" className={tipo === 'business' ? 'activo' : ''} onClick={() => setTipo('business')}>Cuenta de empresa</button>
      </div>
      <input className="campo" aria-label="Busca tu banco" placeholder="Busca tu banco" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {msg && <p className="rojo bco-nota" role="alert">{msg}</p>}
      {bancos === null && !msg && <p className="bco-nota">Cargando bancos…</p>}
      <ul className="bco-bancos">
        {vistos.map((b) => <li key={b.nombre}><button onClick={() => ir(b.nombre)}>{b.nombre}</button></li>)}
      </ul>
    </section>
  );
}

export default function Banco({ cuentas, pendientes, emparejados, ignorados, automaticos = 0, aviso, listo, permisos, historial, cuentasFiltro = [], reglas = [] }) {
  const router = useRouter();
  const [msg, setMsg] = useState(aviso);
  // El aviso acompaña al desplazarse (banco.css): lo bueno se retira solo; los errores se quedan hasta la siguiente acción.
  useEffect(() => {
    if (!msg || msg.error) return undefined;
    const t = setTimeout(() => setMsg(null), 8000);
    return () => clearTimeout(t);
  }, [msg]);
  const [ocupado, setOcupado] = useState(false);
  const [conectando, setConectando] = useState(false);
  const fichero = useRef(null);
  const conectadas = cuentas.filter((c) => c.origen === 'enable');
  const total = cuentas.filter((c) => typeof c.saldo === 'number').reduce((s, c) => s + c.saldo, 0);
  const conSaldo = cuentas.some((c) => typeof c.saldo === 'number');
  // Con propuesta: una sugerencia de factura o gasto, o una regla de ignorar (el servidor aplica lo mismo en «seguras»).
  const porConfirmar = pendientes.filter((m) => m.sugerencia || m.regla?.accion === 'ignorar');
  const sinPareja = pendientes.filter((m) => !m.sugerencia && m.regla?.accion !== 'ignorar');
  const segurasIds = porConfirmar.filter((m) => (m.sugerencia?.segura || m.regla?.accion === 'ignorar') && (m.importe > 0 ? permisos.facturar : permisos.gastar)).map((m) => m.id);
  const seguras = segurasIds.length;
  const puedeSubir = permisos.facturar || permisos.gastar;
  const filtrado = Boolean(historial) && Object.values(historial.filtros).some(Boolean);
  const totalPendientes = historial?.grupos.pendientes.total ?? pendientes.length;

  const accion = async (cuerpo) => {
    setOcupado(true);
    try {
      const d = await llamar('/api/banco', { method: 'POST', body: JSON.stringify(cuerpo) });
      if (cuerpo.accion === 'seguras') setMsg(d.rechazados?.length ? { error: true, texto: `✓ ${d.hechos} confirmados · ${d.rechazados.length} no se han podido confirmar: ${d.rechazados[0].error}` } : { texto: `✓ ${d.hechos} confirmados` });
      router.refresh();
    } catch (e) { setMsg({ error: true, texto: e.message }); } finally { setOcupado(false); }
  };
  const actualizar = async (forzar) => {
    setOcupado(true);
    try { const d = await llamar('/api/banco/sincronizar', { method: 'POST', body: JSON.stringify({ forzar }) }); if (forzar) setMsg({ texto: d.nuevos ? `✓ ${d.nuevos} movimientos nuevos` : '✓ Al día' }); router.refresh(); } catch (e) { setMsg({ error: true, texto: e.message }); } finally { setOcupado(false); }
  };
  // Reglas del banco (lib/reglasBanco.js): cuántos movimientos por revisar encajan con una, y guardarla o borrarla.
  const contar = (regla) => pendientes.filter((m) => encaja(regla, m)).length;
  const guardarRegla = async (regla, id) => {
    await llamar('/api/banco/reglas', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(id ? { ...regla, id } : regla) });
    setMsg({ texto: id ? '✓ Regla guardada' : '✓ Regla creada. Se aplicará a los próximos movimientos; los de ahora que encajen salen en «Por revisar»' });
    router.refresh();
  };
  const quitarRegla = async (r) => {
    if (!(await confirmarAccion({ titulo: 'Borrar regla', texto: `¿Borrar la regla «${r.contiene}»? Lo que ya ha conciliado se queda como está.`, aceptar: 'Borrar regla', peligro: true }))) return;
    try { await llamar(`/api/banco/reglas?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' }); setMsg({ texto: '✓ Regla borrada' }); router.refresh(); } catch (e) { setMsg({ error: true, texto: e.message }); }
  };
  // Al abrir, si hay cuentas conectadas, se traen los últimos movimientos (el servidor no repite si hace menos de 6 horas).
  useEffect(() => { if (listo && conectadas.length && (permisos.facturar || permisos.gastar)) actualizar(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [encima, setEncima] = useState(false);
  // A qué cuenta va el extracto: '' = la que diga el archivo (IBAN) o la única que hay; 'nueva' = otra, con su nombre.
  const deExtracto = cuentas.filter((c) => c.origen !== 'enable');
  const [destino, setDestino] = useState('');
  const [nombreNueva, setNombreNueva] = useState('');
  const [enEspera, setEnEspera] = useState(null);
  const subir = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subirArchivo(f); };
  const soltar = (e) => { e.preventDefault(); setEncima(false); const f = e.dataTransfer.files?.[0]; if (f) subirArchivo(f); };
  const subirArchivo = async (f) => {
    if (destino === 'nueva' && !nombreNueva.trim()) { setEnEspera(f); setMsg({ error: true, texto: 'Pon un nombre a la cuenta nueva' }); return; }
    setOcupado(true); setMsg(null);
    const fd = new FormData();
    fd.set('archivo', f);
    if (destino) fd.set('cuenta', destino);
    if (destino === 'nueva') fd.set('nombre', nombreNueva.trim());
    try {
      const r = await fetch('/api/banco/importar', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (d.elegir) { setEnEspera(f); setMsg({ error: true, texto: `${d.error}: elígela en «Cuenta del extracto» y pulsa «Subir a esta cuenta».` }); document.getElementById('banco-cuentas')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
      if (!r.ok) throw new Error(d.error || 'No se ha podido leer el extracto. Comprueba el formato e inténtalo otra vez.');
      setEnEspera(null);
      if (destino === 'nueva') { setDestino(d.cuenta?.id || ''); setNombreNueva(''); }
      setMsg({ texto: `✓ ${d.nuevos === 1 ? '1 movimiento nuevo' : `${d.nuevos} movimientos nuevos`}${d.cuenta && deExtracto.length ? ` en ${d.cuenta.nombre}` : ''}${d.repetidos ? ` · ${d.repetidos} ya estaban` : ''}${d.auto ? ` · ${d.auto} conciliados solos` : ''}${d.errores ? ` · ${d.errores} filas sin leer` : ''}` });
      router.refresh();
    } catch (err) { setMsg({ error: true, texto: err.message }); } finally { setOcupado(false); window.dispatchEvent(new Event('fisquo:escaneos')); }
  };
  const quitar = async (c) => {
    if (!(await confirmarAccion({ titulo: 'Quitar cuenta bancaria', texto: c.origen === 'enable' ? `¿Desconectar ${c.nombre}? Se retira el permiso del banco; los movimientos se quedan.` : `¿Quitar ${c.nombre}? Deja de contar su saldo; los movimientos se quedan.`, aceptar: 'Quitar cuenta', peligro: true }))) return;
    try { await llamar(`/api/banco/conectar?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' }); router.refresh(); } catch (e) { setMsg({ error: true, texto: e.message }); }
  };

  return (
    <div className={`bco${ocupado ? ' ocupado' : ''}`}>
      {msg && <p className={`bco-aviso${msg.error ? ' error' : ''}`} role="status">{msg.texto}</p>}

      {/* Lo primero, lo pendiente; el saldo y la subida del extracto, a un toque. */}
      {cuentas.length > 0 && (
        <div className="bco-resumen">
          <a href="#banco-cuentas" className="bco-resumen-saldo" aria-label={`Saldo ${conSaldo ? eur(total) : 'sin saldo'}: ir a tus cuentas`}>
            <span>Saldo</span>
            <strong className={conSaldo && total < 0 ? 'teso-out' : undefined}>{conSaldo ? eur(total) : '—'}</strong>
          </a>
          {puedeSubir && <button className="boton pequeno sec" onClick={() => fichero.current?.click()}>Subir extracto</button>}
        </div>
      )}

      {historial && historial.total > 0 && <section className="grupo bco-historial" aria-label="Historial de movimientos">
        <details className="bco-buscar" open={filtrado || undefined}>
          <summary>Buscar y filtrar movimientos <span>· {filtrado ? 'con filtros' : `${historial.total} en total`}</span></summary>
          <form action="/banco" className="bco-filtros" key={JSON.stringify(historial.filtros)}>
            <label>Buscar movimiento<input className="campo" type="search" name="q" placeholder="Concepto, contraparte o referencia" defaultValue={historial.filtros.q} maxLength={200} /></label>
            <label>Cuenta<select className="campo" name="cuenta" defaultValue={historial.filtros.cuenta}>
              <option value="">Todas las cuentas</option>
              {!cuentasFiltro.some((c) => c.id === historial.filtros.cuenta) && historial.filtros.cuenta && <option value={historial.filtros.cuenta}>Cuenta no disponible</option>}
              {cuentasFiltro.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></label>
            <label>Desde<input className="campo" type="date" name="desde" defaultValue={historial.filtros.desde} /></label>
            <label>Hasta<input className="campo" type="date" name="hasta" defaultValue={historial.filtros.hasta} /></label>
            <div className="bco-botones"><button className="boton pequeno" type="submit">Filtrar movimientos</button>
              {filtrado && <Link href="/banco" className="boton pequeno sec">Quitar filtros</Link>}
            </div>
          </form>
        </details>
        {filtrado && <p className="bco-nota">{historial.encontrados} {historial.encontrados === 1 ? 'movimiento' : 'movimientos'} de {historial.total} con estos filtros.</p>}
        {historial.filtros.desde && historial.filtros.hasta && historial.filtros.desde > historial.filtros.hasta && <p className="bco-nota rojo">La fecha inicial es posterior a la final. Revisa el intervalo.</p>}
        {historial.encontrados === 0 && historial.total > 0 && <Vacio compacto tipo="resultados" icono="gasto" titulo="Ningún movimiento con estos filtros" accion={{ href: '/banco', texto: 'Quitar filtros' }} />}
      </section>}

      <div id="banco-pendientes">

      {(porConfirmar.length > 0 || sinPareja.length > 0) && (
        <section className="grupo bco-revisar">
          <div className="bco-cab">
            <h2 className="grupo-t">Por revisar <span>{totalPendientes}</span></h2>
            {seguras > 1 && <button className="boton pequeno" onClick={() => accion({ accion: 'seguras', ids: segurasIds.slice(0, 200) })}>Confirmar las {seguras} seguras</button>}
          </div>
          {porConfirmar.length > 0 && (
            <>
              <h3 className="bco-sub">Por confirmar <span>{porConfirmar.length}</span></h3>
              <ul className="bco-lista">{porConfirmar.map((m) => <Pendiente key={m.id} m={m} permisos={permisos} accion={accion} contar={contar} guardarRegla={guardarRegla} />)}</ul>
            </>
          )}
          {sinPareja.length > 0 && (
            <>
              <h3 className="bco-sub">Sin pareja <span>{sinPareja.length}</span></h3>
              <ul className="bco-lista">{sinPareja.map((m) => <Pendiente key={m.id} m={m} permisos={permisos} accion={accion} contar={contar} guardarRegla={guardarRegla} />)}</ul>
            </>
          )}
        </section>
      )}
      <Paginas datos={historial?.grupos.pendientes} estado="pendientes" />
      {historial && historial.total > 0 && historial.grupos.pendientes.total === 0 && !filtrado && <Vacio compacto icono="gasto" titulo="No tienes movimientos por revisar">Todos los movimientos de tus extractos ya están emparejados o ignorados. Los nuevos aparecerán aquí al subir el siguiente extracto.</Vacio>}
      </div>

      {!pendientes.length && !emparejados.length && !ignorados.length && cuentas.length > 0 && (!historial || historial.total === 0) && <Vacio icono="gasto" titulo="Aún no hay movimientos" accion={puedeSubir && <button type="button" className="boton" onClick={() => fichero.current?.click()}>Subir extracto</button>}>Sube un extracto de tu banco para empezar.</Vacio>}

      {emparejados.length > 0 && (
        <section className="grupo" id="banco-emparejados">
          <h2 className="grupo-t">Emparejados{automaticos > 0 && <span> · {automaticos} automáticos</span>}</h2>
          <ul className="bco-lista">
            {emparejados.map((m) => (
              <li key={m.id} className="bco-mov hecho">
                <div className="bco-mov-fila">
                  <span className="bco-fecha">{fechaCorta(m.fecha).slice(0, 5)}</span>
                  <span className="bco-txt"><strong>{m.contraparte ? fraseBanco(m.contraparte, { nombre: true }) : fraseBanco(m.concepto)}{(m.auto || m.regla) && <em className="bco-auto"> · {m.auto && m.regla ? 'automático por regla' : m.auto ? 'automático' : 'por regla'}</em>}</strong><small>{m.destino ? <Link href={m.destino.url} prefetch={false}>{m.destino.texto}</Link> : 'Ya no existe'}</small></span>
                  <Importe v={m.importe} />
                </div>
                {(m.importe > 0 ? permisos.facturar : permisos.gastar) && <button className="bco-deshacer" onClick={() => accion({ accion: 'deshacer', id: m.id })}>Deshacer</button>}
              </li>
            ))}
          </ul>
          <Paginas datos={historial?.grupos.emparejados} estado="emparejados" />
        </section>
      )}

      {ignorados.length > 0 && (
        <details className="grupo bco-ignorados" id="banco-ignorados" open={historial?.grupos.ignorados.pagina > 1 || undefined}>
          <summary className="grupo-t">Ignorados <span>{historial?.grupos.ignorados.total ?? ignorados.length}</span></summary>
          <ul className="bco-lista">
            {ignorados.map((m) => (
              <li key={m.id} className="bco-mov hecho">
                <div className="bco-mov-fila">
                  <span className="bco-fecha">{fechaCorta(m.fecha).slice(0, 5)}</span>
                  <span className="bco-txt"><strong>{m.contraparte ? fraseBanco(m.contraparte, { nombre: true }) : fraseBanco(m.concepto)}</strong>{m.regla && <small>{m.auto ? 'Apartado solo por una regla' : 'Apartado por una regla'}</small>}</span>
                  <Importe v={m.importe} />
                </div>
                {(m.importe > 0 ? permisos.facturar : permisos.gastar) && <button className="bco-deshacer" onClick={() => accion({ accion: 'deshacer', id: m.id })}>Recuperar</button>}
              </li>
            ))}
          </ul>
          <Paginas datos={historial?.grupos.ignorados} estado="ignorados" />
        </details>
      )}

      <section className="bco-cuentas" id="banco-cuentas">
        {cuentas.length > 0 && <div className="bco-total"><span>Saldo en tus cuentas</span><strong className={conSaldo && total < 0 ? 'teso-out' : undefined}>{conSaldo ? eur(total) : '—'}</strong>{conSaldo && total < 0 && <small className="nota">En descubierto. ¿No cuadra con tu banco? Sube el último extracto.</small>}</div>}
        {cuentas.map((c) => (
          <div key={c.id} className="bco-cuenta">
            <span className="bco-txt">
              <strong>{c.nombre}{c.iban ? <em> {iban(c.iban)}</em> : null}</strong>
              <small>
                {/* Quien no conecta bancos ve una cuenta conectada como cualquier otra: su saldo, sin hablar de la conexión. */}
                {c.origen === 'enable' && !listo ? (c.fechaSaldo ? `Saldo a ${fechaCorta(c.fechaSaldo)}` : 'Sin saldo')
                  : c.origen === 'enable'
                  ? (c.caducada || c.error ? <span className="rojo">{c.error || 'El permiso del banco ha caducado: vuelve a conectarlo'}</span>
                    : `${c.sincronizada ? `Actualizada ${cuando(c.sincronizada)}` : 'Conectada'}${c.valida && diasHasta(c.valida) <= 14 ? ` · el permiso caduca en ${Math.max(0, diasHasta(c.valida))} días` : ''}`)
                  : `Extracto${c.fechaSaldo ? ` · saldo a ${fechaCorta(c.fechaSaldo)}` : ' sin saldo'}`}
              </small>
            </span>
            <span className="bco-cuenta-v">{typeof c.saldo === 'number' ? eur(c.saldo) : ''}</span>
            {permisos.empresa && (c.origen !== 'enable' || listo) && <button className="bco-quitar" onClick={() => quitar(c)} aria-label={`Quitar ${c.nombre}`}>Quitar</button>}
          </div>
        ))}
        {!cuentas.length && (puedeSubir
          ? (
            <div className={`bco-vacio${encima ? ' encima' : ''}`} onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)} onDrop={soltar}>
              <span className="bco-vacio-ico" aria-hidden><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg></span>
              <strong>Sube tu primer extracto</strong>
              <p>Arrástralo aquí o elígelo con «Subir extracto». Fisquo empareja cada cobro con su factura y cada pago con su gasto.</p>
              <ol>
                <li><span><b>Descárgalo</b> de tu banca online en Norma 43, CSV, Excel o PDF.</span></li>
                <li><span><b>Súbelo</b> aquí. Si lo subes dos veces, no se duplica nada.</span></li>
                <li><span><b>Confirma</b> los emparejamientos: la factura queda cobrada con la fecha del banco.</span></li>
              </ol>
            </div>
          )
          : <Vacio compacto icono="gasto" titulo="Aún no hay ninguna cuenta">Cuando alguien con permiso suba un extracto, verás aquí el saldo real.</Vacio>)}
        <div className="bco-botones">
          {permisos.empresa && listo && <button className="boton pequeno" onClick={() => setConectando(true)}>Conectar banco</button>}
          {listo && conectadas.length > 0 && puedeSubir && <button className="boton pequeno sec" onClick={() => actualizar(true)}>Actualizar</button>}
          {puedeSubir && (deExtracto.length > 0 || enEspera) && (
            <label className="bco-destino">Cuenta del extracto
              <select className="campo" value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="">Según el archivo</option>
                {deExtracto.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.iban ? ` ${iban(c.iban)}` : ''}</option>)}
                <option value="nueva">Otra cuenta (nueva)…</option>
              </select>
            </label>
          )}
          {puedeSubir && destino === 'nueva' && <input className="campo bco-destino-nombre" placeholder="Nombre de la cuenta (p. ej. Sabadell)" maxLength={40} value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} aria-label="Nombre de la cuenta nueva" />}
          {puedeSubir && enEspera && <button className="boton pequeno" disabled={!destino || ocupado} aria-describedby={!destino ? "bco-destino-ayuda" : undefined} onClick={() => subirArchivo(enEspera)}>Subir a esta cuenta</button>}
          {puedeSubir && <button className="boton pequeno sec" onClick={() => fichero.current?.click()}>Subir extracto</button>}
          {puedeSubir && <input ref={fichero} type="file" hidden accept=".csv,.xlsx,.txt,.n43,.aeb,.q43,.pdf,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={subir} aria-label="Extracto del banco" />}
        </div>
        {enEspera && !destino && <p id="bco-destino-ayuda" className="bco-nota">Elige la cuenta a la que pertenece el extracto.</p>}
        {puedeSubir && <CupoEscaneo />}
        {puedeSubir && cuentas.length > 0 && <p className="bco-nota">Los PDF consumen una lectura IA por página de la bolsa de tu empresa (máximo 10 páginas y 3 MB por PDF). Norma 43, CSV y Excel no consumen páginas IA.</p>}
        {puedeSubir && cuentas.length > 0 && <p className="bco-nota">Extracto: descárgalo de tu banca online en Norma 43 (cuaderno 43), CSV, Excel (.xlsx) o PDF. Súbelo cada mes: lo que no case con tus facturas y gastos te sale para revisar.</p>}
      </section>

      {conectando && <Conectar cerrar={() => setConectando(false)} />}

      {puedeSubir && <GuiaExtracto />}

      <BancoReglas reglas={reglas} permisos={permisos} contar={contar} guardar={guardarRegla} quitar={quitarRegla} />
    </div>
  );
}
