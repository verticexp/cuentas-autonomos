'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { eur, fechaCorta } from '@/lib/formato';

const iban = (s) => (s ? `•••• ${s.replace(/\s/g, '').slice(-4)}` : '');
const cuando = (iso) => { const d = new Date(iso); return `${fechaCorta(d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }))} ${d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}`; };
const diasHasta = (iso) => Math.ceil((Date.parse(iso) - Date.now()) / 864e5);

async function llamar(url, opciones) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Algo ha fallado');
  return d;
}

function Importe({ v }) {
  return <span className={`bco-imp ${v > 0 ? 'teso-in' : 'teso-out'}`}>{v > 0 ? '+' : '−'}{eur(Math.abs(v))}</span>;
}

// Por qué una sugerencia no es segura (lib/banco.js sugerencias: motivo).
const MOTIVO = {
  parcial: 'El importe es menor que lo que falta: sería un cobro parcial.',
  'importe-distinto': 'Coincide el número de factura, pero no el importe.',
  conflicto: 'Otro movimiento apunta a lo mismo: elige cuál es.',
  alternativa: 'Otra opción encajaba mejor y ya está reservada para otro movimiento.',
};

const AYUDA = {
  gasto: 'Apúntalo con su factura: Netto lee la base y el IVA y lo deja emparejado.',
  comision: 'Se apunta como gasto bancario, sin IVA (no hace falta factura).',
  cuota: 'Se apunta como gasto de Seguridad Social del titular, sin IVA.',
  hacienda: 'Ya lo contabiliza Netto con cada liquidación: marca el trimestre como presentado en el Resumen.',
  seguridad: 'Ya lo contabiliza Netto con las nóminas.',
  nomina: 'Ya lo contabiliza Netto con las nóminas.',
  prestamo: 'Se apunta contra el préstamo: la devolución, a la deuda; los intereses, a gastos financieros.',
  socio: 'Se apunta en la cuenta corriente con los socios.',
  traspaso: 'No cambia nada en tus cuentas: se aparta.',
  ingreso: 'Si es el cobro de una factura que no está en Netto, mejor créala; si no, se apunta como otro ingreso.',
};

// Sin factura ni gasto: qué es (Netto propone una opción por el concepto) y apuntarlo con un toque.
function QueEs({ m, accion }) {
  const [clase, setClase] = useState(m.clase);
  const [intereses, setIntereses] = useState('');
  return (
    <div className="bco-quees">
      <label className="bco-quees-t">Netto cree que es
        <select className="campo" value={clase} onChange={(e) => setClase(e.target.value)}>{m.clases.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
      </label>
      {clase === 'prestamo' && m.importe < 0 && <input className="campo" inputMode="decimal" placeholder="De esta cuota, intereses (opcional)" value={intereses} onChange={(e) => setIntereses(e.target.value.replace(',', '.'))} />}
      <p className="bco-nota">{AYUDA[clase]}</p>
      <div className="bco-botones">
        {clase === 'gasto'
          ? <Link href={`/gastos?banco=${encodeURIComponent(m.id)}`} className="boton pequeno">Añadir con su factura</Link>
          : <button className="boton pequeno" onClick={() => accion({ accion: 'contabilizar', id: m.id, clase, intereses })}>{['hacienda', 'seguridad', 'nomina'].includes(clase) ? 'Entendido' : clase === 'traspaso' ? 'Apartar' : 'Apuntar'}</button>}
      </div>
    </div>
  );
}

// Un movimiento por confirmar o sin pareja: confirmar la sugerencia, elegir otra o ignorarlo.
function Pendiente({ m, permisos, accion }) {
  const [eligiendo, setEligiendo] = useState(false);
  const [elegida, setElegida] = useState('');
  const s = m.sugerencia;
  const puedeAqui = m.importe > 0 ? permisos.facturar : permisos.gastar;
  const confirmar = (tipo, destino) => accion({ accion: 'emparejar', id: m.id, tipo, destino });
  return (
    <li className="bco-mov">
      <div className="bco-mov-fila">
        <span className="bco-fecha">{fechaCorta(m.fecha).slice(0, 5)}</span>
        <span className="bco-txt"><strong>{m.contraparte || m.concepto}</strong>{m.contraparte && <small>{m.concepto}</small>}</span>
        <Importe v={m.importe} />
      </div>
      {s && (
        <div className={`bco-sug${s.segura ? ' segura' : ''}`}>
          <span className="bco-sug-t">{s.segura ? 'Es esta' : 'Puede ser'}</span>
          <Link href={s.url} prefetch={false} className="bco-sug-d">{s.texto}<small>{fechaCorta(s.fecha)} · {eur(s.importe)}{s.pendiente ? ' · sin pagar' : ''}{s.yaCobrada ? ' · ya cobrada por otra vía' : ''}</small></Link>
          {(s.motivo && MOTIVO[s.motivo]) && <small className="bco-sug-m">{MOTIVO[s.motivo]}</small>}
        </div>
      )}
      {puedeAqui && !s && !eligiendo && <QueEs m={m} accion={accion} />}
      {puedeAqui && (eligiendo ? (
        <div className="bco-elegir">
          <select className="campo" value={elegida} onChange={(e) => setElegida(e.target.value)} aria-label={m.importe > 0 ? 'Factura' : 'Gasto'}>
            <option value="">{m.importe > 0 ? 'Elige la factura…' : 'Elige el gasto…'}</option>
            {m.opciones.map((o) => <option key={o.id} value={o.id}>{o.texto} · {fechaCorta(o.fecha)} · {o.total !== undefined && o.saldo !== undefined && Math.abs(o.total - o.saldo) > 0.005 ? `${eur(o.total)}, faltan ${eur(o.saldo)}` : eur(o.importe)}</option>)}
          </select>
          <div className="bco-botones">
            <button className="boton pequeno" disabled={!elegida} onClick={() => confirmar(m.importe > 0 ? 'factura' : 'gasto', elegida)}>Emparejar</button>
            <button className="boton pequeno sec" onClick={() => setEligiendo(false)}>Cancelar</button>
          </div>
          {!m.opciones.length && <p className="bco-nota">{m.importe > 0 ? 'No hay facturas sin cobrar.' : 'No hay gastos de esas fechas sin emparejar. Apúntalo en Gastos y vuelve.'}</p>}
        </div>
      ) : (
        <div className="bco-botones">
          {s && <button className="boton pequeno" onClick={() => confirmar(s.tipo, s.id)}>{s.yaCobrada ? 'Vincular' : s.motivo === 'parcial' ? 'Cobro parcial' : 'Confirmar'}</button>}
          <button className="boton pequeno sec" onClick={() => setEligiendo(true)}>{s ? 'Otra' : m.importe > 0 ? 'Elegir factura' : 'Elegir gasto'}</button>
          <button className="boton pequeno sec" onClick={() => accion({ accion: 'ignorar', id: m.id })}>Ignorar</button>
        </div>
      ))}
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
        <button className="bco-x" onClick={cerrar} aria-label="Cerrar">×</button>
      </div>
      <p className="bco-nota">Tu banco te pedirá permiso para que Netto vea el saldo y los movimientos (solo lectura, hasta 180 días). Lo gestiona Enable Banking, entidad autorizada.</p>
      <div className="segmentado bco-tipo">
        <button type="button" className={tipo === 'personal' ? 'activo' : ''} onClick={() => setTipo('personal')}>Cuenta personal</button>
        <button type="button" className={tipo === 'business' ? 'activo' : ''} onClick={() => setTipo('business')}>Cuenta de empresa</button>
      </div>
      <input className="campo" placeholder="Busca tu banco" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {msg && <p className="rojo bco-nota">{msg}</p>}
      {bancos === null && !msg && <p className="bco-nota">Cargando bancos…</p>}
      <ul className="bco-bancos">
        {vistos.map((b) => <li key={b.nombre}><button onClick={() => ir(b.nombre)}>{b.nombre}</button></li>)}
      </ul>
    </section>
  );
}

export default function Banco({ cuentas, pendientes, emparejados, ignorados, automaticos = 0, aviso, listo, permisos }) {
  const router = useRouter();
  const [msg, setMsg] = useState(aviso);
  const [ocupado, setOcupado] = useState(false);
  const [conectando, setConectando] = useState(false);
  const fichero = useRef(null);
  const conectadas = cuentas.filter((c) => c.origen === 'enable');
  const total = cuentas.filter((c) => typeof c.saldo === 'number').reduce((s, c) => s + c.saldo, 0);
  const conSaldo = cuentas.some((c) => typeof c.saldo === 'number');
  const porConfirmar = pendientes.filter((m) => m.sugerencia);
  const sinPareja = pendientes.filter((m) => !m.sugerencia);
  const segurasIds = porConfirmar.filter((m) => m.sugerencia.segura && (m.importe > 0 ? permisos.facturar : permisos.gastar)).map((m) => m.id);
  const seguras = segurasIds.length;

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
  // Al abrir, si hay cuentas conectadas, se traen los últimos movimientos (el servidor no repite si hace menos de 6 horas).
  useEffect(() => { if (conectadas.length && (permisos.facturar || permisos.gastar)) actualizar(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [encima, setEncima] = useState(false);
  const subir = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subirArchivo(f); };
  const soltar = (e) => { e.preventDefault(); setEncima(false); const f = e.dataTransfer.files?.[0]; if (f) subirArchivo(f); };
  const subirArchivo = async (f) => {
    setOcupado(true); setMsg(null);
    const fd = new FormData();
    fd.set('archivo', f);
    try {
      const r = await fetch('/api/banco/importar', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo leer el extracto');
      setMsg({ texto: `✓ ${d.nuevos === 1 ? '1 movimiento nuevo' : `${d.nuevos} movimientos nuevos`}${d.repetidos ? ` · ${d.repetidos} ya estaban` : ''}${d.errores ? ` · ${d.errores} filas sin leer` : ''}` });
      router.refresh();
    } catch (err) { setMsg({ error: true, texto: err.message }); } finally { setOcupado(false); }
  };
  const quitar = async (c) => {
    if (!confirm(c.origen === 'enable' ? `¿Desconectar ${c.nombre}? Se retira el permiso del banco; los movimientos se quedan.` : `¿Quitar ${c.nombre}? Deja de contar su saldo; los movimientos se quedan.`)) return;
    try { await llamar(`/api/banco/conectar?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' }); router.refresh(); } catch (e) { setMsg({ error: true, texto: e.message }); }
  };

  return (
    <div className={`bco${ocupado ? ' ocupado' : ''}`}>
      {msg && <p className={`bco-aviso${msg.error ? ' error' : ''}`} role="status">{msg.texto}</p>}

      <section className="bco-cuentas">
        {cuentas.length > 0 && <div className="bco-total"><span>Saldo en tus cuentas</span><strong>{conSaldo ? eur(total) : '—'}</strong></div>}
        {cuentas.map((c) => (
          <div key={c.id} className="bco-cuenta">
            <span className="bco-txt">
              <strong>{c.nombre}{c.iban ? <em> {iban(c.iban)}</em> : null}</strong>
              <small>
                {c.origen === 'enable'
                  ? (c.caducada || c.error ? <span className="rojo">{c.error || 'El permiso del banco ha caducado: vuelve a conectarlo'}</span>
                    : `${c.sincronizada ? `Actualizada ${cuando(c.sincronizada)}` : 'Conectada'}${c.valida && diasHasta(c.valida) <= 14 ? ` · el permiso caduca en ${Math.max(0, diasHasta(c.valida))} días` : ''}`)
                  : `Extracto${c.fechaSaldo ? ` · saldo a ${fechaCorta(c.fechaSaldo)}` : ' sin saldo'}`}
              </small>
            </span>
            <span className="bco-cuenta-v">{typeof c.saldo === 'number' ? eur(c.saldo) : ''}</span>
            {permisos.empresa && <button className="bco-quitar" onClick={() => quitar(c)} aria-label={`Quitar ${c.nombre}`}>Quitar</button>}
          </div>
        ))}
        {!cuentas.length && ((permisos.facturar || permisos.gastar)
          ? (
            <div className={`bco-vacio${encima ? ' encima' : ''}`} onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)} onDrop={soltar}>
              <span className="bco-vacio-ico" aria-hidden><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg></span>
              <strong>Sube tu primer extracto</strong>
              <p>Arrástralo aquí o elígelo con «Subir extracto». Netto empareja cada cobro con su factura y cada pago con su gasto.</p>
              <ol>
                <li><span><b>Descárgalo</b> de tu banca online en Norma 43, CSV, Excel o PDF.</span></li>
                <li><span><b>Súbelo</b> aquí. Si lo subes dos veces, no se duplica nada.</span></li>
                <li><span><b>Confirma</b> los emparejamientos: la factura queda cobrada con la fecha del banco.</span></li>
              </ol>
            </div>
          )
          : <p className="bco-nota">Aún no hay ninguna cuenta. Cuando alguien con permiso suba un extracto, verás aquí el saldo real.</p>)}
        <div className="bco-botones">
          {permisos.empresa && listo && <button className="boton pequeno" onClick={() => setConectando(true)}>Conectar banco</button>}
          {conectadas.length > 0 && (permisos.facturar || permisos.gastar) && <button className="boton pequeno sec" onClick={() => actualizar(true)}>Actualizar</button>}
          {(permisos.facturar || permisos.gastar) && <button className="boton pequeno sec" onClick={() => fichero.current?.click()}>Subir extracto</button>}
          {(permisos.facturar || permisos.gastar) && <input ref={fichero} type="file" hidden accept=".csv,.xlsx,.txt,.n43,.aeb,.q43,.pdf,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={subir} aria-label="Extracto del banco" />}
        </div>
        {(permisos.facturar || permisos.gastar) && cuentas.length > 0 && <p className="bco-nota">Extracto: descárgalo de tu banca online en Norma 43 (cuaderno 43), CSV, Excel (.xlsx) o PDF. Súbelo cada mes: lo que no case con tus facturas y gastos te sale para revisar.</p>}
      </section>

      {conectando && <Conectar cerrar={() => setConectando(false)} />}

      {porConfirmar.length > 0 && (
        <section className="grupo">
          <div className="bco-cab">
            <h2 className="grupo-t">Por confirmar <span>{porConfirmar.length}</span></h2>
            {seguras > 1 && <button className="boton pequeno" onClick={() => accion({ accion: 'seguras', ids: segurasIds.slice(0, 200) })}>Confirmar las {seguras} seguras</button>}
          </div>
          <ul className="bco-lista">{porConfirmar.map((m) => <Pendiente key={m.id} m={m} permisos={permisos} accion={accion} />)}</ul>
        </section>
      )}

      {sinPareja.length > 0 && (
        <section className="grupo">
          <h2 className="grupo-t">Sin pareja <span>{sinPareja.length}</span></h2>
          <ul className="bco-lista">{sinPareja.map((m) => <Pendiente key={m.id} m={m} permisos={permisos} accion={accion} />)}</ul>
        </section>
      )}

      {emparejados.length > 0 && (
        <section className="grupo">
          <h2 className="grupo-t">Emparejados{automaticos > 0 && <span> · {automaticos} automáticos</span>}</h2>
          <ul className="bco-lista">
            {emparejados.map((m) => (
              <li key={m.id} className="bco-mov hecho">
                <div className="bco-mov-fila">
                  <span className="bco-fecha">{fechaCorta(m.fecha).slice(0, 5)}</span>
                  <span className="bco-txt"><strong>{m.contraparte || m.concepto}{m.auto && <em className="bco-auto"> · automático</em>}</strong><small>{m.destino ? <Link href={m.destino.url} prefetch={false}>{m.destino.texto}</Link> : 'Ya no existe'}</small></span>
                  <Importe v={m.importe} />
                </div>
                {(m.importe > 0 ? permisos.facturar : permisos.gastar) && <button className="bco-deshacer" onClick={() => accion({ accion: 'deshacer', id: m.id })}>Deshacer</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ignorados.length > 0 && (
        <details className="grupo bco-ignorados">
          <summary className="grupo-t">Ignorados <span>{ignorados.length}</span></summary>
          <ul className="bco-lista">
            {ignorados.map((m) => (
              <li key={m.id} className="bco-mov hecho">
                <div className="bco-mov-fila">
                  <span className="bco-fecha">{fechaCorta(m.fecha).slice(0, 5)}</span>
                  <span className="bco-txt"><strong>{m.contraparte || m.concepto}</strong></span>
                  <Importe v={m.importe} />
                </div>
                {(m.importe > 0 ? permisos.facturar : permisos.gastar) && <button className="bco-deshacer" onClick={() => accion({ accion: 'deshacer', id: m.id })}>Recuperar</button>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!pendientes.length && !emparejados.length && cuentas.length > 0 && <div className="vacio"><p>Todo emparejado</p><p>Cuando lleguen movimientos nuevos te diremos con qué factura o gasto va cada uno.</p></div>}
    </div>
  );
}
