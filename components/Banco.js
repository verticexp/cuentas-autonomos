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
          <Link href={s.url} prefetch={false} className="bco-sug-d">{s.texto}<small>{fechaCorta(s.fecha)} · {eur(s.importe)}{s.pendiente ? ' · sin pagar' : ''}</small></Link>
        </div>
      )}
      {puedeAqui && (eligiendo ? (
        <div className="bco-elegir">
          <select className="campo" value={elegida} onChange={(e) => setElegida(e.target.value)} aria-label={m.importe > 0 ? 'Factura' : 'Gasto'}>
            <option value="">{m.importe > 0 ? 'Elige la factura…' : 'Elige el gasto…'}</option>
            {m.opciones.map((o) => <option key={o.id} value={o.id}>{o.texto} · {fechaCorta(o.fecha)} · {eur(o.importe)}</option>)}
          </select>
          <div className="bco-botones">
            <button className="boton pequeno" disabled={!elegida} onClick={() => confirmar(m.importe > 0 ? 'factura' : 'gasto', elegida)}>Emparejar</button>
            <button className="boton pequeno sec" onClick={() => setEligiendo(false)}>Cancelar</button>
          </div>
          {!m.opciones.length && <p className="bco-nota">{m.importe > 0 ? 'No hay facturas sin cobrar.' : 'No hay gastos de esas fechas sin emparejar. Apúntalo en Gastos y vuelve.'}</p>}
        </div>
      ) : (
        <div className="bco-botones">
          {s && <button className="boton pequeno" onClick={() => confirmar(s.tipo, s.id)}>Confirmar</button>}
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

export default function Banco({ cuentas, pendientes, emparejados, ignorados, aviso, listo, permisos }) {
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
  const seguras = porConfirmar.filter((m) => m.sugerencia.segura && (m.importe > 0 ? permisos.facturar : permisos.gastar)).length;

  const accion = async (cuerpo) => {
    setOcupado(true);
    try { await llamar('/api/banco', { method: 'POST', body: JSON.stringify(cuerpo) }); router.refresh(); } catch (e) { setMsg({ error: true, texto: e.message }); } finally { setOcupado(false); }
  };
  const actualizar = async (forzar) => {
    setOcupado(true);
    try { const d = await llamar('/api/banco/sincronizar', { method: 'POST', body: JSON.stringify({ forzar }) }); if (forzar) setMsg({ texto: d.nuevos ? `✓ ${d.nuevos} movimientos nuevos` : '✓ Al día' }); router.refresh(); } catch (e) { setMsg({ error: true, texto: e.message }); } finally { setOcupado(false); }
  };
  // Al abrir, si hay cuentas conectadas, se traen los últimos movimientos (el servidor no repite si hace menos de 6 horas).
  useEffect(() => { if (conectadas.length && (permisos.facturar || permisos.gastar)) actualizar(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const subir = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
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
        <div className="bco-total"><span>Saldo en tus cuentas</span><strong>{conSaldo ? eur(total) : '—'}</strong></div>
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
        {!cuentas.length && <p className="bco-nota">Conecta tu banco o sube un extracto para ver tu saldo real y emparejar cobros y pagos solos.</p>}
        <div className="bco-botones">
          {permisos.empresa && listo && <button className="boton pequeno" onClick={() => setConectando(true)}>Conectar banco</button>}
          {conectadas.length > 0 && (permisos.facturar || permisos.gastar) && <button className="boton pequeno sec" onClick={() => actualizar(true)}>Actualizar</button>}
          {(permisos.facturar || permisos.gastar) && <button className="boton pequeno sec" onClick={() => fichero.current?.click()}>Subir extracto</button>}
          {(permisos.facturar || permisos.gastar) && <input ref={fichero} type="file" hidden accept=".csv,.xlsx,.txt,.n43,.aeb,.q43,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={subir} aria-label="Extracto del banco" />}
        </div>
        {(permisos.facturar || permisos.gastar) && <p className="bco-nota">Extracto: descárgalo de tu banca online en formato Norma 43 (cuaderno 43), CSV o Excel (.xlsx).</p>}
      </section>

      {conectando && <Conectar cerrar={() => setConectando(false)} />}

      {porConfirmar.length > 0 && (
        <section className="grupo">
          <div className="bco-cab">
            <h2 className="grupo-t">Por confirmar <span>{porConfirmar.length}</span></h2>
            {seguras > 1 && <button className="boton pequeno" onClick={() => accion({ accion: 'seguras' })}>Confirmar las {seguras} seguras</button>}
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
          <h2 className="grupo-t">Emparejados</h2>
          <ul className="bco-lista">
            {emparejados.map((m) => (
              <li key={m.id} className="bco-mov hecho">
                <div className="bco-mov-fila">
                  <span className="bco-fecha">{fechaCorta(m.fecha).slice(0, 5)}</span>
                  <span className="bco-txt"><strong>{m.contraparte || m.concepto}</strong><small>{m.destino ? <Link href={m.destino.url} prefetch={false}>{m.destino.texto}</Link> : 'Ya no existe'}</small></span>
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
