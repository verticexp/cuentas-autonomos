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
import { conHuecos } from '@/lib/huecos';
import { useT } from '@/components/Idioma';

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
  const tr = useT();
  if (!datos?.total) return null;
  return (
    <nav className="bco-paginas" aria-label={tr('Páginas de movimientos {estado}', { estado: tr(estado) })}>
      <span role="status">{tr('Mostrando {desde}–{hasta} de {total}', { desde: datos.desde, hasta: datos.hasta, total: datos.total })}</span>
      <div>
        {datos.anterior && <Link href={datos.anterior} className="boton pequeno sec" aria-label={tr('Movimientos {estado}: página anterior', { estado: tr(estado) })}>{tr('Anterior')}</Link>}
        {datos.paginas > 1 && <span>{tr('Página {pagina} de {paginas}', { pagina: datos.pagina, paginas: datos.paginas })}</span>}
        {datos.siguiente && <Link href={datos.siguiente} className="boton pequeno sec" aria-label={tr('Movimientos {estado}: página siguiente', { estado: tr(estado) })}>{tr('Siguiente')}</Link>}
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
  const tr = useT();
  const [clase, setClase] = useState(m.clase);
  const [intereses, setIntereses] = useState('');
  return (
    <div className="bco-quees">
      {regla?.accion === 'gasto' && <p className="bco-nota bco-regla-nota">{tr('Tu regla «{contiene}» dice que es un gasto de {proveedor}, pero ahora no hay ninguno suyo que cuadre. Añádelo con su factura.', { contiene: regla.contiene, proveedor: regla.proveedor })}</p>}
      <label className="bco-quees-t">{tr('Fisquo cree que es')}
        <select className="campo" value={clase} onChange={(e) => setClase(e.target.value)}>{m.clases.map(([k, t]) => <option key={k} value={k}>{tr(t)}</option>)}</select>
      </label>
      {clase === 'prestamo' && m.importe < 0 && <input className="campo" inputMode="decimal" aria-label={tr('De esta cuota, intereses (opcional)')} placeholder={tr('De esta cuota, intereses (opcional)')} value={intereses} onChange={(e) => setIntereses(e.target.value.replace(',', '.'))} />}
      <p className="bco-nota">{tr(AYUDA[clase])}</p>
      <div className="bco-botones">
        {clase === 'gasto'
          ? <Link href={`/gastos?banco=${encodeURIComponent(m.id)}`} className="boton pequeno">{tr('Añadir con su factura')}</Link>
          : <button className="boton pequeno" onClick={() => accion({ accion: 'contabilizar', id: m.id, clase, intereses })}>{tr(['hacienda', 'seguridad', 'nomina'].includes(clase) ? 'Entendido' : clase === 'traspaso' ? 'Apartar' : 'Apuntar')}</button>}
        {children}
      </div>
    </div>
  );
}

// Un movimiento por confirmar o sin pareja: confirmar la sugerencia, elegir otra, ignorarlo o crear una regla con él.
function Pendiente({ m, permisos, accion, contar, guardarRegla }) {
  const tr = useT();
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
          {/* Con una pareja segura basta con confirmar: la regla se ofrece en lo dudoso y en lo que no tiene pareja */}
          {puedeAqui && !r && !creando && !s?.segura && <button type="button" className="bco-regla-boton" onClick={() => setCreando(true)}>{tr('Crear regla con esto')}</button>}</span>
        <Importe v={m.importe} />
      </div>
      {s && (
        <div className={`bco-sug${s.segura ? ' segura' : ''}`}>
          <span className="bco-sug-t">{tr(s.segura ? 'Es esta' : 'Puede ser')}</span>
          <Link href={s.url} prefetch={false} className="bco-sug-d">{s.texto}<small>{fechaCorta(s.fecha)} · {eur(s.importe)}{s.pendiente ? ` · ${tr('sin pagar')}` : ''}{s.yaCobrada ? ` · ${tr('ya cobrada por otra vía')}` : ''}</small></Link>
          {(s.motivo && MOTIVO[s.motivo]) && <small className="bco-sug-m">{tr(MOTIVO[s.motivo])}</small>}
          {r?.accion === 'gasto' && <small className="bco-sug-m">{tr('Tu regla «{contiene}» dice que es un gasto de {proveedor}.', { contiene: r.contiene, proveedor: r.proveedor })}</small>}
        </div>
      )}
      {ignora && (
        <div className="bco-sug segura">
          <span className="bco-sug-t">{tr('Regla')}</span>
          <span className="bco-sug-d">{tr('Ignorar este movimiento')}<small>{ignora.cuando} → {ignora.entonces}</small></span>
        </div>
      )}
      {puedeAqui && (eligiendo ? (
        <div className="bco-elegir" ref={elegir}>
          <select className="campo" value={elegidaValida} onChange={(e) => setElegida(e.target.value)} aria-label={tr(m.importe > 0 ? 'Factura' : 'Gasto')}>
            <option value="">{tr(m.importe > 0 ? 'Elige la factura…' : 'Elige el gasto…')}</option>
            {m.opciones.map((o) => <option key={o.id} value={o.id}>{o.texto.endsWith(' · sin pagar') ? `${o.texto.slice(0, -' · sin pagar'.length)} · ${tr('sin pagar')}` : o.texto} · {fechaCorta(o.fecha)} · {o.total !== undefined && o.saldo !== undefined && Math.abs(o.total - o.saldo) > 0.005 ? tr('{total}, faltan {saldo}', { total: eur(o.total), saldo: eur(o.saldo) }) : eur(o.importe)}</option>)}
          </select>
          <div className="bco-botones">
            <button className="boton pequeno" disabled={!elegidaValida} aria-describedby={!elegidaValida ? `bco-${m.id}-elegir` : undefined} onClick={() => { if (elegidaValida) confirmar(m.importe > 0 ? 'factura' : 'gasto', elegidaValida); }}>{tr('Emparejar')}</button>
            <button className="boton pequeno sec" onClick={() => setEligiendo(false)}>{tr('Cancelar')}</button>
          </div>
          {!elegidaValida && <p id={`bco-${m.id}-elegir`} className="bco-nota">{tr('Elige una factura o gasto para emparejar.')}</p>}
          {!m.opciones.length && <Vacio compacto tipo="resultados" icono={m.importe > 0 ? 'factura' : 'gasto'} titulo={tr(m.importe > 0 ? 'Añade la factura de este cobro' : 'Apunta el gasto de este pago')} accion={{ href: m.importe > 0 ? '/facturas/nueva' : '/gastos#apuntar-gasto', texto: tr(m.importe > 0 ? 'Nueva factura' : 'Añadir gasto') }} secundaria={<button type="button" className="boton sec" onClick={() => setEligiendo(false)}>{tr('Volver al movimiento')}</button>} />}
        </div>
      ) : !s && !ignora ? (
        <QueEs m={m} accion={accion} regla={r}>
          <button className="boton pequeno sec" onClick={() => setEligiendo(true)}>{tr(m.importe > 0 ? 'Elegir factura' : 'Elegir gasto')}</button>
          <button className="boton pequeno sec" onClick={() => accion({ accion: 'ignorar', id: m.id })}>{tr('Ignorar')}</button>
        </QueEs>
      ) : (
        <div className="bco-botones">
          {s && <button className="boton pequeno" onClick={() => confirmar(s.tipo, s.id)}>{tr(s.yaCobrada ? 'Vincular' : s.motivo === 'parcial' ? 'Cobro parcial' : 'Confirmar')}</button>}
          {ignora && <button className="boton pequeno" onClick={() => accion({ accion: 'ignorar', id: m.id, regla: ignora.id })}>{tr('Ignorar')}</button>}
          <button className="boton pequeno sec" onClick={() => setEligiendo(true)}>{tr(s ? 'Otra' : m.importe > 0 ? 'Elegir factura' : 'Elegir gasto')}</button>
          {!ignora && <button className="boton pequeno sec" onClick={() => accion({ accion: 'ignorar', id: m.id })}>{tr('Ignorar')}</button>}
        </div>
      ))}
      {puedeAqui && !r && creando && <div className="bco-regla-fila"><FormRegla inicial={inicialRegla} importeMov={Math.abs(m.importe)} permisos={permisos} contar={contar} guardar={async (x) => { await guardarRegla(x); setCreando(false); }} cancelar={() => setCreando(false)} /></div>}
    </li>
  );
}

// Conectar un banco: se elige de la lista y el banco pide el permiso en su web o app.
function Conectar({ cerrar }) {
  const tr = useT();
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
        <h2>{tr('Conectar un banco')}</h2>
        <button className="bco-x" onClick={cerrar} aria-label={tr('Cancelar')}>×</button>
      </div>
      <p className="bco-nota">{tr('Tu banco te pedirá permiso para que Fisquo vea el saldo y los movimientos (solo lectura, hasta 180 días). Lo gestiona Enable Banking, entidad autorizada.')}</p>
      <div className="segmentado bco-tipo">
        <button type="button" className={tipo === 'personal' ? 'activo' : ''} onClick={() => setTipo('personal')}>{tr('Cuenta personal')}</button>
        <button type="button" className={tipo === 'business' ? 'activo' : ''} onClick={() => setTipo('business')}>{tr('Cuenta de empresa')}</button>
      </div>
      <input className="campo" aria-label={tr('Busca tu banco')} placeholder={tr('Busca tu banco')} value={busca} onChange={(e) => setBusca(e.target.value)} />
      {msg && <p className="rojo bco-nota" role="alert">{tr(msg)}</p>}
      {bancos === null && !msg && <p className="bco-nota">{tr('Cargando bancos…')}</p>}
      <ul className="bco-bancos">
        {vistos.map((b) => <li key={b.nombre}><button onClick={() => ir(b.nombre)}>{b.nombre}</button></li>)}
      </ul>
    </section>
  );
}

export default function Banco({ cuentas, pendientes, emparejados, ignorados, automaticos = 0, aviso, listo, permisos, historial, cuentasFiltro = [], reglas = [] }) {
  const router = useRouter();
  const tr = useT();
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
      if (cuerpo.accion === 'seguras') setMsg(d.rechazados?.length ? { error: true, texto: tr('✓ {hechos} confirmados · {fallidos} no se han podido confirmar: {error}', { hechos: d.hechos, fallidos: d.rechazados.length, error: tr(d.rechazados[0].error) }) } : { texto: tr('✓ {hechos} confirmados', { hechos: d.hechos }) });
      router.refresh();
    } catch (e) { setMsg({ error: true, texto: e.message }); } finally { setOcupado(false); }
  };
  const actualizar = async (forzar) => {
    setOcupado(true);
    try { const d = await llamar('/api/banco/sincronizar', { method: 'POST', body: JSON.stringify({ forzar }) }); if (forzar) setMsg({ texto: d.nuevos ? tr('✓ {n} movimientos nuevos', { n: d.nuevos }) : tr('✓ Al día') }); router.refresh(); } catch (e) { setMsg({ error: true, texto: e.message }); } finally { setOcupado(false); }
  };
  // Reglas del banco (lib/reglasBanco.js): cuántos movimientos por revisar encajan con una, y guardarla o borrarla.
  const contar = (regla) => pendientes.filter((m) => encaja(regla, m)).length;
  const guardarRegla = async (regla, id) => {
    await llamar('/api/banco/reglas', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(id ? { ...regla, id } : regla) });
    setMsg({ texto: id ? tr('✓ Regla guardada') : tr('✓ Regla creada. Se aplicará a los próximos movimientos; los de ahora que encajen salen en «Por revisar»') });
    router.refresh();
  };
  const quitarRegla = async (r) => {
    if (!(await confirmarAccion({ titulo: tr('Borrar regla'), texto: tr('¿Borrar la regla «{contiene}»? Lo que ya ha conciliado se queda como está.', { contiene: r.contiene }), aceptar: tr('Borrar regla'), peligro: true }))) return;
    try { await llamar(`/api/banco/reglas?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' }); setMsg({ texto: tr('✓ Regla borrada') }); router.refresh(); } catch (e) { setMsg({ error: true, texto: e.message }); }
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
    if (destino === 'nueva' && !nombreNueva.trim()) { setEnEspera(f); setMsg({ error: true, texto: tr('Pon un nombre a la cuenta nueva') }); return; }
    setOcupado(true); setMsg(null);
    const fd = new FormData();
    fd.set('archivo', f);
    if (destino) fd.set('cuenta', destino);
    if (destino === 'nueva') fd.set('nombre', nombreNueva.trim());
    try {
      const r = await fetch('/api/banco/importar', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (d.elegir) { setEnEspera(f); setMsg({ error: true, texto: tr('{error}: elígela en «Cuenta del extracto» y pulsa «Subir a esta cuenta».', { error: tr(d.error) }) }); document.getElementById('banco-cuentas')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
      if (!r.ok) throw new Error(d.error || 'No se ha podido leer el extracto. Comprueba el formato e inténtalo otra vez.');
      setEnEspera(null);
      if (destino === 'nueva') { setDestino(d.cuenta?.id || ''); setNombreNueva(''); }
      setMsg({ texto: `✓ ${d.nuevos === 1 ? tr('1 movimiento nuevo') : tr('{n} movimientos nuevos', { n: d.nuevos })}${d.cuenta && deExtracto.length ? ` ${tr('en {cuenta}', { cuenta: d.cuenta.nombre })}` : ''}${d.repetidos ? ` · ${tr('{n} ya estaban', { n: d.repetidos })}` : ''}${d.auto ? ` · ${tr('{n} conciliados solos', { n: d.auto })}` : ''}${d.errores ? ` · ${tr('{n} filas sin leer', { n: d.errores })}` : ''}` });
      router.refresh();
    } catch (err) { setMsg({ error: true, texto: err.message }); } finally { setOcupado(false); window.dispatchEvent(new Event('fisquo:escaneos')); }
  };
  const quitar = async (c) => {
    if (!(await confirmarAccion({ titulo: tr('Quitar cuenta bancaria'), texto: c.origen === 'enable' ? tr('¿Desconectar {cuenta}? Se retira el permiso del banco; los movimientos se quedan.', { cuenta: c.nombre }) : tr('¿Quitar {cuenta}? Deja de contar su saldo; los movimientos se quedan.', { cuenta: c.nombre }), aceptar: tr('Quitar cuenta'), peligro: true }))) return;
    try { await llamar(`/api/banco/conectar?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' }); router.refresh(); } catch (e) { setMsg({ error: true, texto: e.message }); }
  };

  return (
    <div className={`bco${ocupado ? ' ocupado' : ''}`}>
      {msg && <p className={`bco-aviso${msg.error ? ' error' : ''}`} role="status">{tr(msg.texto)}</p>}

      {/* Lo primero, lo pendiente; el saldo y la subida del extracto, a un toque. */}
      {cuentas.length > 0 && (
        <div className="bco-resumen">
          <a href="#banco-cuentas" className="bco-resumen-saldo" aria-label={tr('Saldo {saldo}: ir a tus cuentas', { saldo: conSaldo ? eur(total) : tr('sin saldo') })}>
            <span>{tr('Saldo')}</span>
            <strong className={conSaldo && total < 0 ? 'teso-out' : undefined}>{conSaldo ? eur(total) : '—'}</strong>
          </a>
          {puedeSubir && <button className="boton pequeno sec" onClick={() => fichero.current?.click()}>{tr('Subir extracto')}</button>}
        </div>
      )}

      {historial && historial.total > 0 && <section className="grupo bco-historial" aria-label={tr('Historial de movimientos')}>
        <details className="bco-buscar" open={filtrado || undefined}>
          <summary>{tr('Buscar y filtrar movimientos')} <span>· {filtrado ? tr('con filtros') : tr('{n} en total', { n: historial.total })}</span></summary>
          <form action="/banco" className="bco-filtros" key={JSON.stringify(historial.filtros)}>
            <label>{tr('Buscar movimiento')}<input className="campo" type="search" name="q" placeholder={tr('Concepto, contraparte o referencia')} defaultValue={historial.filtros.q} maxLength={200} /></label>
            <label>{tr('Cuenta')}<select className="campo" name="cuenta" defaultValue={historial.filtros.cuenta}>
              <option value="">{tr('Todas las cuentas')}</option>
              {!cuentasFiltro.some((c) => c.id === historial.filtros.cuenta) && historial.filtros.cuenta && <option value={historial.filtros.cuenta}>{tr('Cuenta no disponible')}</option>}
              {cuentasFiltro.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></label>
            <label>{tr('Desde')}<input className="campo" type="date" name="desde" defaultValue={historial.filtros.desde} /></label>
            <label>{tr('Hasta')}<input className="campo" type="date" name="hasta" defaultValue={historial.filtros.hasta} /></label>
            <div className="bco-botones"><button className="boton pequeno" type="submit">{tr('Filtrar movimientos')}</button>
              {filtrado && <Link href="/banco" className="boton pequeno sec">{tr('Quitar filtros')}</Link>}
            </div>
          </form>
        </details>
        {filtrado && <p className="bco-nota">{tr(historial.encontrados === 1 ? '{n} movimiento de {total} con estos filtros.' : '{n} movimientos de {total} con estos filtros.', { n: historial.encontrados, total: historial.total })}</p>}
        {historial.filtros.desde && historial.filtros.hasta && historial.filtros.desde > historial.filtros.hasta && <p className="bco-nota rojo">{tr('La fecha inicial es posterior a la final. Revisa el intervalo.')}</p>}
        {historial.encontrados === 0 && historial.total > 0 && <Vacio compacto tipo="resultados" icono="gasto" titulo={tr('Ningún movimiento con estos filtros')} accion={{ href: '/banco', texto: tr('Quitar filtros') }} />}
      </section>}

      <div id="banco-pendientes">

      {(porConfirmar.length > 0 || sinPareja.length > 0) && (
        <section className="grupo bco-revisar">
          <div className="bco-cab">
            <h2 className="grupo-t">{tr('Por revisar')} <span>{totalPendientes}</span></h2>
            {seguras > 1 && <button className="boton pequeno" onClick={() => accion({ accion: 'seguras', ids: segurasIds.slice(0, 200) })}>{tr('Confirmar las {n} seguras', { n: seguras })}</button>}
          </div>
          {porConfirmar.length > 0 && (
            <>
              <h3 className="bco-sub">{tr('Por confirmar')} <span>{porConfirmar.length}</span></h3>
              <ul className="bco-lista">{porConfirmar.map((m) => <Pendiente key={m.id} m={m} permisos={permisos} accion={accion} contar={contar} guardarRegla={guardarRegla} />)}</ul>
            </>
          )}
          {sinPareja.length > 0 && (
            <>
              <h3 className="bco-sub">{tr('Sin pareja')} <span>{sinPareja.length}</span></h3>
              <ul className="bco-lista">{sinPareja.map((m) => <Pendiente key={m.id} m={m} permisos={permisos} accion={accion} contar={contar} guardarRegla={guardarRegla} />)}</ul>
            </>
          )}
        </section>
      )}
      <Paginas datos={historial?.grupos.pendientes} estado="pendientes" />
      {historial && historial.total > 0 && historial.grupos.pendientes.total === 0 && !filtrado && <Vacio compacto icono="gasto" titulo={tr('No tienes movimientos por revisar')}>{tr('Todos los movimientos de tus extractos ya están emparejados o ignorados. Los nuevos aparecerán aquí al subir el siguiente extracto.')}</Vacio>}
      </div>

      {!pendientes.length && !emparejados.length && !ignorados.length && cuentas.length > 0 && (!historial || historial.total === 0) && <Vacio icono="gasto" titulo={tr('Aún no hay movimientos')} accion={puedeSubir && <button type="button" className="boton" onClick={() => fichero.current?.click()}>{tr('Subir extracto')}</button>}>{tr('Sube un extracto de tu banco para empezar.')}</Vacio>}

      {emparejados.length > 0 && (
        <section className="grupo" id="banco-emparejados">
          <h2 className="grupo-t">{tr('Emparejados')}{automaticos > 0 && <span> · {tr('{n} automáticos', { n: automaticos })}</span>}</h2>
          <ul className="bco-lista">
            {emparejados.map((m) => (
              <li key={m.id} className="bco-mov hecho">
                <div className="bco-mov-fila">
                  <span className="bco-fecha">{fechaCorta(m.fecha).slice(0, 5)}</span>
                  <span className="bco-txt"><strong>{m.contraparte ? fraseBanco(m.contraparte, { nombre: true }) : fraseBanco(m.concepto)}{(m.auto || m.regla) && <em className="bco-auto"> · {tr(m.auto && m.regla ? 'automático por regla' : m.auto ? 'automático' : 'por regla')}</em>}</strong><small>{m.destino ? <Link href={m.destino.url} prefetch={false}>{m.destino.texto}</Link> : tr('Ya no existe')}</small></span>
                  <Importe v={m.importe} />
                </div>
                {(m.importe > 0 ? permisos.facturar : permisos.gastar) && <button className="bco-deshacer" onClick={() => accion({ accion: 'deshacer', id: m.id })}>{tr('Deshacer')}</button>}
              </li>
            ))}
          </ul>
          <Paginas datos={historial?.grupos.emparejados} estado="emparejados" />
        </section>
      )}

      {ignorados.length > 0 && (
        <details className="grupo bco-ignorados" id="banco-ignorados" open={historial?.grupos.ignorados.pagina > 1 || undefined}>
          <summary className="grupo-t">{tr('Ignorados')} <span>{historial?.grupos.ignorados.total ?? ignorados.length}</span></summary>
          <ul className="bco-lista">
            {ignorados.map((m) => (
              <li key={m.id} className="bco-mov hecho">
                <div className="bco-mov-fila">
                  <span className="bco-fecha">{fechaCorta(m.fecha).slice(0, 5)}</span>
                  <span className="bco-txt"><strong>{m.contraparte ? fraseBanco(m.contraparte, { nombre: true }) : fraseBanco(m.concepto)}</strong>{m.regla && <small>{tr(m.auto ? 'Apartado solo por una regla' : 'Apartado por una regla')}</small>}</span>
                  <Importe v={m.importe} />
                </div>
                {(m.importe > 0 ? permisos.facturar : permisos.gastar) && <button className="bco-deshacer" onClick={() => accion({ accion: 'deshacer', id: m.id })}>{tr('Recuperar')}</button>}
              </li>
            ))}
          </ul>
          <Paginas datos={historial?.grupos.ignorados} estado="ignorados" />
        </details>
      )}

      <section className="bco-cuentas" id="banco-cuentas">
        {/* Con una sola cuenta, el total es su saldo (y el de arriba): solo se repite si está en descubierto, por el aviso. */}
        {(cuentas.length > 1 || (cuentas.length === 1 && conSaldo && total < 0)) && <div className="bco-total"><span>{tr('Saldo en tus cuentas')}</span><strong className={conSaldo && total < 0 ? 'teso-out' : undefined}>{conSaldo ? eur(total) : '—'}</strong>{conSaldo && total < 0 && <small className="nota">{tr('En descubierto. ¿No cuadra con tu banco? Sube el último extracto.')}</small>}</div>}
        {cuentas.map((c) => (
          <div key={c.id} className="bco-cuenta">
            <span className="bco-txt">
              <strong>{c.nombre}{c.iban ? <em> {iban(c.iban)}</em> : null}</strong>
              <small>
                {/* Quien no conecta bancos ve una cuenta conectada como cualquier otra: su saldo, sin hablar de la conexión. */}
                {c.origen === 'enable' && !listo ? (c.fechaSaldo ? tr('Saldo a {fecha}', { fecha: fechaCorta(c.fechaSaldo) }) : tr('Sin saldo'))
                  : c.origen === 'enable'
                  ? (c.caducada || c.error ? <span className="rojo">{tr(c.error || 'El permiso del banco ha caducado: vuelve a conectarlo')}</span>
                    : `${c.sincronizada ? tr('Actualizada {cuando}', { cuando: cuando(c.sincronizada) }) : tr('Conectada')}${c.valida && diasHasta(c.valida) <= 14 ? ` · ${tr('el permiso caduca en {n} días', { n: Math.max(0, diasHasta(c.valida)) })}` : ''}`)
                  : c.fechaSaldo ? tr('Extracto · saldo a {fecha}', { fecha: fechaCorta(c.fechaSaldo) }) : tr('Extracto sin saldo')}
              </small>
            </span>
            <span className="bco-cuenta-v">{typeof c.saldo === 'number' ? eur(c.saldo) : ''}</span>
            {permisos.empresa && (c.origen !== 'enable' || listo) && <button className="bco-quitar" onClick={() => quitar(c)} aria-label={tr('Quitar {cuenta}', { cuenta: c.nombre })}>{tr('Quitar')}</button>}
          </div>
        ))}
        {!cuentas.length && (puedeSubir
          ? (
            <div className={`bco-vacio${encima ? ' encima' : ''}`} onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)} onDrop={soltar}>
              <span className="bco-vacio-ico" aria-hidden><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg></span>
              <strong>{tr('Sube tu primer extracto')}</strong>
              <p>{tr('Arrástralo aquí o elígelo con «Subir extracto». Fisquo empareja cada cobro con su factura y cada pago con su gasto.')}</p>
              <ol>
                <li><span>{conHuecos(tr('{descarga} de tu banca online en Norma 43, CSV, Excel o PDF.'), { descarga: <b>{tr('Descárgalo')}</b> })}</span></li>
                <li><span>{conHuecos(tr('{sube} aquí. Si lo subes dos veces, no se duplica nada.'), { sube: <b>{tr('Súbelo')}</b> })}</span></li>
                <li><span>{conHuecos(tr('{confirma} los emparejamientos: la factura queda cobrada con la fecha del banco.'), { confirma: <b>{tr('Confirma')}</b> })}</span></li>
              </ol>
            </div>
          )
          : <Vacio compacto icono="gasto" titulo={tr('Aún no hay ninguna cuenta')}>{tr('Cuando alguien con permiso suba un extracto, verás aquí el saldo real.')}</Vacio>)}
        <div className="bco-botones">
          {permisos.empresa && listo && <button className="boton pequeno" onClick={() => setConectando(true)}>{tr('Conectar banco')}</button>}
          {listo && conectadas.length > 0 && puedeSubir && <button className="boton pequeno sec" onClick={() => actualizar(true)}>{tr('Actualizar')}</button>}
          {puedeSubir && (deExtracto.length > 0 || enEspera) && (
            <label className="bco-destino">{tr('Cuenta del extracto')}
              <select className="campo" value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="">{tr('Según el archivo')}</option>
                {deExtracto.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.iban ? ` ${iban(c.iban)}` : ''}</option>)}
                <option value="nueva">{tr('Otra cuenta (nueva)…')}</option>
              </select>
            </label>
          )}
          {puedeSubir && destino === 'nueva' && <input className="campo bco-destino-nombre" placeholder={tr('Nombre de la cuenta (p. ej. Sabadell)')} maxLength={40} value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} aria-label={tr('Nombre de la cuenta nueva')} />}
          {puedeSubir && enEspera && <button className="boton pequeno" disabled={!destino || ocupado} aria-describedby={!destino ? "bco-destino-ayuda" : undefined} onClick={() => subirArchivo(enEspera)}>{tr('Subir a esta cuenta')}</button>}
          {puedeSubir && <button className="boton pequeno sec" onClick={() => fichero.current?.click()}>{tr('Subir extracto')}</button>}
          {puedeSubir && <input ref={fichero} type="file" hidden accept=".csv,.xlsx,.txt,.n43,.aeb,.q43,.pdf,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={subir} aria-label={tr('Extracto del banco')} />}
        </div>
        {enEspera && !destino && <p id="bco-destino-ayuda" className="bco-nota">{tr('Elige la cuenta a la que pertenece el extracto.')}</p>}
        {puedeSubir && <CupoEscaneo />}
        {puedeSubir && cuentas.length > 0 && <p className="bco-nota">{tr('Los PDF consumen una lectura IA por página de la bolsa de tu empresa (máximo 10 páginas y 3 MB por PDF). Norma 43, CSV y Excel no consumen páginas IA.')}</p>}
        {puedeSubir && cuentas.length > 0 && <p className="bco-nota">{tr('Extracto: descárgalo de tu banca online en Norma 43 (cuaderno 43), CSV, Excel (.xlsx) o PDF. Súbelo cada mes: lo que no case con tus facturas y gastos te sale para revisar.')}</p>}
      </section>

      {conectando && <Conectar cerrar={() => setConectando(false)} />}

      {puedeSubir && <GuiaExtracto />}

      <BancoReglas reglas={reglas} permisos={permisos} contar={contar} guardar={guardarRegla} quitar={quitarRegla} />
    </div>
  );
}
