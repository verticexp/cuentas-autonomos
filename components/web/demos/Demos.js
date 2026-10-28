'use client';

import { useEffect, useRef, useState } from 'react';
import { N } from '@/components/Logo';
import Icono from '@/components/web/Icono';
import { useT } from '@/components/Idioma';

// Demos interactivas de la web pública. Todo funciona en el navegador con datos de ejemplo.

const eur = (n, dec = 2) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always' }).format(n)} €`;
const quieto = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Se activa una sola vez, cuando la demo entra en pantalla.
function useAlVer(cb) {
  const ref = useRef(null);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { cb(); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

/* ───────── Calculadora de impuestos (trimestre de un autónomo) ───────── */
function Deslizador({ id, label, valor, set, max, paso = 100 }) {
  const tr = useT();
  return (
    <div className="dm-desliza">
      <label htmlFor={id}><span>{tr(label)}</span><input type="number" min="0" max={max} step={paso} value={valor} onChange={(e) => set(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} aria-label={tr(label)} /></label>
      <input id={id} type="range" min="0" max={max} step={paso} value={valor} onChange={(e) => set(Number(e.target.value))} style={{ '--p': `${(valor / max) * 100}%` }} />
    </div>
  );
}

export function Calculadora() {
  const tr = useT();
  const [ing, setIng] = useState(15000);
  const [gas, setGas] = useState(4000);
  const [ret, setRet] = useState(true);
  const rend = Math.max(0, ing - gas);
  const iva = (ing - gas) * 0.21;
  const retenciones = ret ? ing * 0.15 : 0;
  const m130 = Math.max(0, rend * 0.2 - retenciones);
  const apartar = Math.max(0, iva) + m130;
  const queda = Math.max(0, rend - m130 - retenciones);
  const parte = (x) => `${ing ? Math.max(0, (x / ing) * 100) : 0}%`;

  return (
    <div className="dm dm-calc">
      <div className="dm-calc-datos">
        <p className="dm-titulo"><Icono n="impuestos" />{tr('Tu trimestre')}</p>
        <Deslizador id="c-ing" label="Facturado (sin IVA)" valor={ing} set={setIng} max={60000} />
        <Deslizador id="c-gas" label="Gastos deducibles (sin IVA)" valor={gas} set={setGas} max={40000} />
        <label className="dm-check"><input type="checkbox" checked={ret} onChange={(e) => setRet(e.target.checked)} /><span className="dm-switch" aria-hidden><i /></span>{tr('Mis clientes me retienen el 15 % de IRPF')}</label>
      </div>
      <div className="dm-calc-res" aria-live="polite">
        <div className="dm-calc-fila"><span>{tr('Modelo 303 · IVA')}</span><b>{iva < 0 ? tr('{importe} a compensar', { importe: eur(-iva) }) : eur(iva)}</b></div>
        <div className="dm-calc-fila"><span>{tr('Modelo 130 · IRPF')}</span><b>{eur(m130)}</b></div>
        <div className="dm-calc-total"><span>{tr('Aparta este trimestre')}</span><b key={Math.round(apartar)}>{eur(apartar)}</b></div>
        <div className="dm-reparto" aria-hidden>
          <i className="r-gas" style={{ width: parte(gas) }} />
          <i className="r-imp" style={{ width: parte(m130 + retenciones) }} />
          <i className="r-ok" style={{ width: parte(queda) }} />
        </div>
        <div className="dm-leyenda"><span><i className="r-gas" />{tr('Gastos')}</span><span><i className="r-imp" />IRPF</span><span><i className="r-ok" />{tr('Te queda {importe}', { importe: eur(queda, 0) })}</span></div>
        <p className="dm-nota">{tr('Estimación orientativa de un trimestre en estimación directa, con IVA general del 21 %. Fisquo lo calcula con tus facturas reales, actividades y pagos anteriores.')}</p>
      </div>
    </div>
  );
}

/* ───────── Factura en vivo ───────── */
export function FacturaDemo() {
  const tr = useT();
  const [cliente, setCliente] = useState('Altamira Consultores SL');
  const [concepto, setConcepto] = useState('Consultoría · octubre');
  const [importe, setImporte] = useState(900);
  const [ivaP, setIvaP] = useState(21);
  const [irpfP, setIrpfP] = useState(15);
  const iva = (importe * ivaP) / 100;
  const irpf = (importe * irpfP) / 100;
  const total = importe + iva - irpf;
  return (
    <div className="dm dm-factura">
      <form className="dm-form" onSubmit={(e) => e.preventDefault()}>
        <p className="dm-titulo"><Icono n="factura" />{tr('Prueba a hacer una factura')}</p>
        <label>{tr('Cliente')}<input value={cliente} onChange={(e) => setCliente(e.target.value)} maxLength={40} /></label>
        <label>{tr('Concepto')}<input value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={48} /></label>
        <label>{tr('Importe (sin IVA)')}<input type="number" min="0" step="10" value={importe} onChange={(e) => setImporte(Math.max(0, Number(e.target.value) || 0))} /></label>
        <div className="dm-dos">
          <label>{tr('IVA')}<select value={ivaP} onChange={(e) => setIvaP(Number(e.target.value))}>{[21, 10, 4, 0].map((x) => <option key={x} value={x}>{x} %</option>)}</select></label>
          <label>IRPF<select value={irpfP} onChange={(e) => setIrpfP(Number(e.target.value))}>{[15, 7, 0].map((x) => <option key={x} value={x}>{x ? `−${x} %` : tr('Sin retención')}</option>)}</select></label>
        </div>
      </form>
      <div className="dm-papel" aria-live="polite">
        <div className="dm-papel-cab"><N className="dm-papel-n" /><div><b>{tr('Factura F-0143')}</b><small>{tr('Hoy · vence en 30 días')}</small></div></div>
        <div className="dm-papel-para"><small>{tr('Para')}</small><b>{cliente || tr('Tu cliente')}</b></div>
        <div className="dm-papel-linea"><span>{concepto || tr('Concepto')}</span><b>{eur(importe)}</b></div>
        <div className="dm-papel-tot">
          <span>{tr('Base')}<b>{eur(importe)}</b></span>
          <span>{tr('IVA {pct} %', { pct: ivaP })}<b>{eur(iva)}</b></span>
          {irpfP > 0 && <span>{tr('IRPF −{pct} %', { pct: irpfP })}<b>−{eur(irpf)}</b></span>}
          <span className="dm-papel-total">{tr('Total')}<b key={total}>{eur(total)}</b></span>
        </div>
        <div className="dm-papel-pie"><i className="mk-qr" /><small>{tr('Verifactu · huella encadenada y QR')}</small></div>
      </div>
    </div>
  );
}

/* ───────── Ticket leído con IA ───────── */
const TICKETS = [
  { prov: 'Suministros Vega SL', fecha: '10/10/2026', base: '314,05 €', iva: '65,95 €', cat: 'Material de oficina' },
  { prov: 'Gasolinera Repsol', fecha: '08/10/2026', base: '49,59 €', iva: '10,41 €', cat: 'Combustible' },
  { prov: 'MediaMarkt', fecha: '02/10/2026', base: '165,29 €', iva: '34,71 €', cat: 'Material y equipos' },
];
const CAMPOS = [['prov', 'Proveedor'], ['fecha', 'Fecha'], ['base', 'Base'], ['iva', 'IVA 21 %'], ['cat', 'Categoría']];

export function TicketDemo() {
  const tr = useT();
  const [n, setN] = useState(0);
  const [fase, setFase] = useState('espera'); // espera → leyendo → listo
  const [hechos, setHechos] = useState(0);
  const timers = useRef([]);
  const escanear = (k = n) => {
    timers.current.forEach(clearTimeout);
    setN(k); setHechos(0); setFase('leyendo');
    const r = quieto() ? 0 : 1;
    timers.current = [setTimeout(() => setFase('listo'), 1500 * r), ...CAMPOS.map((_, i) => setTimeout(() => setHechos(i + 1), (1500 + i * 260) * r))];
  };
  const ref = useAlVer(() => escanear(0));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const t = TICKETS[n];
  return (
    <div className="dm dm-ticket" ref={ref}>
      <div className={`dm-ticket-foto ${fase}`}>
        <div className="dm-ticket-papel"><b>{t.prov}</b><span /><span /><span /><span className="corta" /><b className="dm-ticket-total">TOTAL</b></div>
        <i className="dm-ticket-laser" />
      </div>
      <div className="dm-ticket-campos">
        <p className="dm-titulo"><Icono n="asistente" />{tr(fase === 'leyendo' ? 'Leyendo el ticket…' : fase === 'listo' ? 'Listo para guardar' : 'Escaneo con IA')}</p>
        {CAMPOS.map(([k, l], i) => (
          <div key={k} className={`dm-campo${i < hechos ? ' lleno' : ''}`}><small>{tr(l)}</small><b>{i < hechos ? (k === 'cat' ? tr(t[k]) : t[k]) : ''}</b></div>
        ))}
        <button className="web-btn web-btn-peq" onClick={() => escanear((n + 1) % TICKETS.length)} disabled={fase === 'leyendo'}>{tr('Escanear otro ticket')}</button>
      </div>
    </div>
  );
}

/* ───────── Conciliación de un extracto ───────── */
const MOVS = [
  { id: 1, t: 'Transferencia Altamira', c: '+1.210,00 €', con: 'Factura F-0142', seguro: true },
  { id: 2, t: 'Pago Suministros Vega SL', c: '−380,00 €', con: 'Gasto 10/10', seguro: true },
  { id: 3, t: 'Bizum Estudio Norte', c: '+640,00 €', con: 'Factura F-0145', seguro: true },
  { id: 4, t: 'Transferencia M. Gómez', c: '+300,00 €', con: '¿Factura F-0139 o F-0144?', seguro: false },
  { id: 5, t: 'Comisión mantenimiento', c: '−6,00 €', con: 'Sin emparejar', seguro: false },
];

export function ConciliacionDemo() {
  const tr = useT();
  const [hechos, setHechos] = useState([]);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const seguros = MOVS.filter((m) => m.seguro && !hechos.includes(m.id));
  const confirmar = () => {
    seguros.forEach((m, i) => timers.current.push(setTimeout(() => setHechos((h) => [...h, m.id]), quieto() ? 0 : i * 280)));
  };
  return (
    <div className="dm dm-conc">
      <div className="dm-conc-cab">
        <div><p className="dm-titulo"><Icono n="banco" />extracto_octubre.n43</p><small>{tr('{hechos} de {total} conciliados', { hechos: hechos.length, total: MOVS.length })}</small></div>
        {seguros.length ? <button className="web-btn web-btn-peq" onClick={confirmar}>{tr('Confirmar los seguros ({n})', { n: seguros.length })}</button> : <button className="web-btn web-btn-peq web-btn-claro-oscuro" onClick={() => setHechos([])}>{tr('Deshacer')}</button>}
      </div>
      <div className="dm-conc-barra"><i style={{ width: `${(hechos.length / MOVS.length) * 100}%` }} /></div>
      <ul>
        {MOVS.map((m) => {
          const ok = hechos.includes(m.id);
          return (
            <li key={m.id} className={ok ? 'ok' : m.seguro ? 'sugerido' : 'duda'}>
              <span className="dm-conc-check" aria-hidden><Icono n="tic" /></span>
              <div><b>{m.t}</b><small>{ok ? tr(m.c.startsWith('+') ? '{con} · cobrada con fecha del banco' : '{con} · pagado con fecha del banco', { con: tr(m.con) }) : tr(m.con)}</small></div>
              <em className={m.c.startsWith('+') ? 'mas' : undefined}>{m.c}</em>
              {!ok && m.seguro && <button className="dm-conc-uno" onClick={() => setHechos((h) => [...h, m.id])}>{tr('Confirmar')}</button>}
              {!m.seguro && <span className="mk-chip pend">{tr('Revisar')}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───────── Previsión de caja ───────── */
const MESES = ['Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct'];
const COBROS = [9800, 12400, 7600, 8900, 10200, 11800, 12600, 13900, 14800, 7200, 9900, 12100];
const PAGOS = [5200, 6900, 5400, 5100, 5600, 5900, 6100, 6400, 6800, 4300, 5500, 6200];
const IMPUESTOS = [0, 0, 3350, 0, 0, 3810, 0, 0, 4290, 0, 0, 3920];

export function PrevisionDemo() {
  const tr = useT();
  const [meses, setMeses] = useState(6);
  const [foco, setFoco] = useState(null);
  let saldo = 18420;
  const datos = MESES.slice(0, meses).map((m, i) => {
    saldo += COBROS[i] - PAGOS[i] - IMPUESTOS[i];
    return { m, saldo, cobros: COBROS[i], pagos: PAGOS[i], imp: IMPUESTOS[i] };
  });
  const max = Math.max(...datos.map((d) => d.saldo)) * 1.08;
  const f = datos[foco ?? datos.length - 1];
  return (
    <div className="dm dm-prev">
      <div className="dm-prev-cab">
        <div><p className="dm-titulo"><Icono n="tesoreria" />{tr('Previsión de caja')}</p><small>{tr('Desde tu saldo real: {importe}', { importe: eur(18420, 0) })}</small></div>
        <div className="dm-seg" role="tablist" style={{ '--i': [3, 6, 12].indexOf(meses) }}>
          <span className="dm-seg-ind" aria-hidden />
          {[3, 6, 12].map((x) => <button key={x} role="tab" aria-selected={meses === x} className={meses === x ? 'on' : undefined} onClick={() => { setMeses(x); setFoco(null); }}>{tr('{n} meses', { n: x })}</button>)}
        </div>
      </div>
      <div className="dm-prev-dato" aria-live="polite">
        <b key={`${f.m}${meses}`}>{eur(f.saldo, 0)}</b><span>{tr('a final de {mes}', { mes: tr(f.m) })}</span>
        <div className="dm-prev-desglose"><span className="mas">{tr('+{importe} cobros', { importe: eur(f.cobros, 0) })}</span><span>{tr('−{importe} pagos', { importe: eur(f.pagos, 0) })}</span>{f.imp > 0 && <span className="imp">{tr('−{importe} impuestos', { importe: eur(f.imp, 0) })}</span>}</div>
      </div>
      <div className="dm-prev-graf" onMouseLeave={() => setFoco(null)} style={{ '--n': meses }}>
        {datos.map((d, i) => (
          <button key={`${meses}${d.m}`} className={`${foco === i || (foco === null && i === datos.length - 1) ? 'on' : ''}${d.imp ? ' con-imp' : ''}`} style={{ '--h': `${(d.saldo / max) * 100}%`, '--i': i }} onMouseEnter={() => setFoco(i)} onFocus={() => setFoco(i)} aria-label={`${tr(d.m)}: ${eur(d.saldo, 0)}`}>
            <i /><small>{tr(d.m)}</small>
          </button>
        ))}
      </div>
      <p className="dm-nota">{tr('Los meses marcados incluyen el pago trimestral de impuestos. Datos de ejemplo.')}</p>
    </div>
  );
}

/* ───────── Roles y permisos ───────── */
const AREAS = ['Resumen', 'Facturar', 'Gastos', 'Marcar cobros', 'Nóminas', 'Usuarios'];
const ROLES = {
  Administrador: { d: 'Lo ve y lo puede todo.', p: [1, 1, 1, 1, 1, 1] },
  Gestoría: { d: 'Ve facturas, gastos e impuestos. No toca cobros.', p: [1, 1, 1, 0, 1, 0] },
  Comercial: { d: 'Hace presupuestos y facturas. Nada más.', p: [0, 1, 0, 0, 0, 0] },
};

export function PermisosDemo() {
  const tr = useT();
  const [rol, setRol] = useState('Gestoría');
  const nombres = Object.keys(ROLES);
  return (
    <div className="dm dm-perm">
      <div className="dm-seg dm-seg-ancho" role="tablist" style={{ '--i': nombres.indexOf(rol), '--n': nombres.length }}>
        <span className="dm-seg-ind" aria-hidden />
        {nombres.map((r) => <button key={r} role="tab" aria-selected={rol === r} className={rol === r ? 'on' : undefined} onClick={() => setRol(r)}>{tr(r)}</button>)}
      </div>
      <p className="dm-perm-d" key={rol}>{tr(ROLES[rol].d)}</p>
      <ul>
        {AREAS.map((a, i) => (
          <li key={a}><span>{tr(a)}</span><i className={`dm-toggle${ROLES[rol].p[i] ? ' on' : ''}`} style={{ '--i': i }} aria-label={tr(ROLES[rol].p[i] ? 'Permitido' : 'Sin acceso')} /></li>
        ))}
      </ul>
    </div>
  );
}

/* ───────── Asistente ───────── */
const PREGUNTAS = [
  ['¿Cuánto IVA pagaré este trimestre?', 'Con lo facturado y gastado hasta hoy, tu modelo 303 del tercer trimestre sale a 1.842,30 €. Te quedan 6 días para presentarlo.'],
  ['¿Quién me debe más dinero?', 'Altamira Consultores: 2 facturas pendientes por 2.270 €. La F-0137 venció hace 9 días; ¿quieres que te la deje preparada para reenviar?'],
  ['¿Cómo voy respecto al año pasado?', 'Llevas 48.920 € facturados, un 18 % más que a estas alturas de 2025. Tu beneficio sube un 27 % porque los gastos han bajado.'],
];

export function AsistenteDemo() {
  const tr = useT();
  const [chat, setChat] = useState([{ yo: false, t: 'Hola, Marta. Pregúntame lo que quieras sobre tus cuentas.' }]);
  const [escribiendo, setEscribiendo] = useState(false);
  const fin = useRef(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { fin.current?.scrollTo({ top: fin.current.scrollHeight, behavior: 'smooth' }); }, [chat, escribiendo]);
  const preguntar = ([q, r]) => {
    if (escribiendo) return;
    setChat((c) => [...c, { yo: true, t: q }]);
    setEscribiendo(true);
    timers.current.push(setTimeout(() => {
      setEscribiendo(false);
      setChat((c) => [...c, { yo: false, t: '' }]);
      const pal = tr(r).split(' ');
      pal.forEach((_, i) => timers.current.push(setTimeout(() => setChat((c) => [...c.slice(0, -1), { yo: false, t: pal.slice(0, i + 1).join(' ') }]), quieto() ? 0 : i * 45)));
    }, quieto() ? 0 : 900));
  };
  return (
    <div className="dm dm-chat">
      <div className="dm-chat-cab"><span className="dm-chat-ava"><Icono n="asistente" /></span><div><b>{tr('Asistente de Fisquo')}</b><small>{tr('Responde con tus cifras')}</small></div></div>
      <div className="dm-chat-msgs" ref={fin}>
        {chat.map((m, i) => <p key={i} className={m.yo ? 'yo' : undefined}>{tr(m.t)}</p>)}
        {escribiendo && <p className="dm-chat-esc" aria-label={tr('Escribiendo')}><i /><i /><i /></p>}
      </div>
      <div className="dm-chat-sug">{PREGUNTAS.map((p) => <button key={p[0]} onClick={() => preguntar(p)} disabled={escribiendo}>{tr(p[0])}</button>)}</div>
    </div>
  );
}

/* ───────── Contabilidad ───────── */
const VISTAS_CONT = {
  Resultados: { pie: 'Sale solo del libro diario. Toca otra pestaña.', filas: [
    ['1. Cifra de negocios', 148300], ['4. Aprovisionamientos', -9120], ['6. Gastos de personal', -61800], ['7. Otros gastos de explotación', -22950], ['8. Amortización del inmovilizado', -8800],
    ['A) Resultado de explotación', 45630, 1], ['14. Gastos financieros', -1140], ['C) Resultado antes de impuestos', 44490, 1], ['18. Impuesto sobre beneficios', -9340], ['D) Resultado del ejercicio', 35150, 1]] },
  Balance: { pie: 'Activo = patrimonio neto + pasivo: siempre cuadra.', filas: [
    ['A) Activo no corriente', 48540], ['B) Activo corriente', 36590], ['Total activo', 85130, 1], ['A) Patrimonio neto', 51560], ['B) Pasivo no corriente', 14400], ['C) Pasivo corriente', 19170], ['Total patrimonio neto y pasivo', 85130, 1]] },
  Diario: { pie: 'Cada factura, gasto, cobro, nómina e impuesto, con su asiento.', asientos: [
    ['Factura F-0142 · Altamira', [['430 Clientes', 1210, 0], ['705 Prestaciones de servicios', 0, 1000], ['477 IVA repercutido', 0, 210]]],
    ['Cobro de la factura F-0142', [['572 Bancos', 1210, 0], ['430 Clientes', 0, 1210]]],
    ['Amortización del 3T', [['681 Amortización', 1960, 0], ['281 Amortización acumulada', 0, 1960]]]] },
};

export function ContabilidadDemo() {
  const tr = useT();
  const [vista, setVista] = useState('Resultados');
  const nombres = Object.keys(VISTAS_CONT);
  const v = VISTAS_CONT[vista];
  return (
    <div className="dm dm-perm dm-cont">
      <p className="dm-titulo"><Icono n="contabilidad" />{tr('Sonora Eventos S.L. · 2025')}</p>
      <div className="dm-seg dm-seg-ancho" role="tablist" style={{ '--i': nombres.indexOf(vista), '--n': nombres.length }}>
        <span className="dm-seg-ind" aria-hidden />
        {nombres.map((r) => <button key={r} role="tab" aria-selected={vista === r} className={vista === r ? 'on' : undefined} onClick={() => setVista(r)}>{tr(r)}</button>)}
      </div>
      <div key={vista} className="dm-cont-cuerpo">
        {v.filas && <ul>{v.filas.map(([t, n, fuerte], i) => <li key={t} className={fuerte ? 'fuerte' : undefined} style={{ '--i': i }}><span>{tr(t)}</span><b className={n < 0 ? 'menos' : undefined}>{eur(n, 0)}</b></li>)}</ul>}
        {v.asientos && v.asientos.map(([t, ls], i) => (
          <div key={t} className="dm-cont-asiento" style={{ '--i': i }}>
            <p><span>{i + 1}</span>{tr(t)}</p>
            {ls.map(([c, d, h]) => <div key={c} className={h ? 'haber' : undefined}><span>{tr(c)}</span><b>{d ? eur(d, 0) : ''}</b><b>{h ? eur(h, 0) : ''}</b></div>)}
          </div>
        ))}
      </div>
      <p className="dm-nota">{tr(v.pie)} {tr('Datos de ejemplo.')}</p>
    </div>
  );
}

/* ───────── Inventario ───────── */
const STOCK = [
  { id: 1, n: 'Cable XLR 10 m', s: 24, min: 20, p: 24 },
  { id: 2, n: 'Lámpara LED PAR 64', s: 9, min: 6, p: 89 },
  { id: 3, n: 'Micrófono inalámbrico', s: 3, min: 2, p: 210 },
];

export function InventarioDemo() {
  const tr = useT();
  const [stock, setStock] = useState(STOCK);
  const vender = (id) => setStock((l) => l.map((x) => (x.id === id && x.s > 0 ? { ...x, s: x.s - (x.min > 10 ? 4 : 1) < 0 ? 0 : x.s - (x.min > 10 ? 4 : 1) } : x)));
  const bajos = stock.filter((x) => x.s <= x.min);
  return (
    <div className="dm dm-perm dm-inv">
      <p className="dm-titulo"><Icono n="inventario" />{tr('Inventario')}</p>
      <ul>
        {stock.map((x) => (
          <li key={x.id}>
            <div><b>{tr(x.n)}</b><small>{tr('{n} ud. · mínimo {min}', { n: x.s, min: x.min })}</small><span className="dm-inv-barra"><i className={x.s <= x.min ? 'bajo' : ''} style={{ width: `${Math.min(100, (x.s / (x.min * 2)) * 100)}%` }} /></span></div>
            <button className="dm-conc-uno" onClick={() => vender(x.id)} disabled={!x.s}>{tr('Facturar {n}', { n: x.min > 10 ? 4 : 1 })}</button>
          </li>
        ))}
      </ul>
      <p className="dm-perm-d" key={bajos.length}>{bajos.length ? tr('Qué pedir: {lista}.', { lista: bajos.map((x) => `${x.min * 2 - x.s} × ${tr(x.n)}`).join(', ') }) : tr('Todo por encima del mínimo. Factura algo para ver cómo baja.')}</p>
      <button className="web-btn web-btn-peq web-btn-claro-oscuro" onClick={() => setStock(STOCK)}>{tr('Volver a empezar')}</button>
      <p className="dm-nota">{tr('Cada factura resta del stock; cada compra lo suma.')} {tr('Datos de ejemplo.')}</p>
    </div>
  );
}

const DEMOS = { inventario: InventarioDemo, contabilidad: ContabilidadDemo, calculadora: Calculadora, factura: FacturaDemo, ticket: TicketDemo, conciliacion: ConciliacionDemo, prevision: PrevisionDemo, permisos: PermisosDemo, asistente: AsistenteDemo };

export default function Demo({ tipo }) {
  const D = DEMOS[tipo];
  return D ? <D /> : null;
}
