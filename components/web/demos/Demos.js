'use client';

import { useEffect, useRef, useState } from 'react';
import { N } from '@/components/Logo';
import Icono from '@/components/web/Icono';

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
  return (
    <div className="dm-desliza">
      <label htmlFor={id}><span>{label}</span><input type="number" min="0" max={max} step={paso} value={valor} onChange={(e) => set(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} aria-label={label} /></label>
      <input id={id} type="range" min="0" max={max} step={paso} value={valor} onChange={(e) => set(Number(e.target.value))} style={{ '--p': `${(valor / max) * 100}%` }} />
    </div>
  );
}

export function Calculadora() {
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
        <p className="dm-titulo"><Icono n="impuestos" />Tu trimestre</p>
        <Deslizador id="c-ing" label="Facturado (sin IVA)" valor={ing} set={setIng} max={60000} />
        <Deslizador id="c-gas" label="Gastos deducibles (sin IVA)" valor={gas} set={setGas} max={40000} />
        <label className="dm-check"><input type="checkbox" checked={ret} onChange={(e) => setRet(e.target.checked)} /><span className="dm-switch" aria-hidden><i /></span>Mis clientes me retienen el 15 % de IRPF</label>
      </div>
      <div className="dm-calc-res" aria-live="polite">
        <div className="dm-calc-fila"><span>Modelo 303 · IVA</span><b>{iva < 0 ? `${eur(-iva)} a compensar` : eur(iva)}</b></div>
        <div className="dm-calc-fila"><span>Modelo 130 · IRPF</span><b>{eur(m130)}</b></div>
        <div className="dm-calc-total"><span>Aparta este trimestre</span><b key={Math.round(apartar)}>{eur(apartar)}</b></div>
        <div className="dm-reparto" aria-hidden>
          <i className="r-gas" style={{ width: parte(gas) }} />
          <i className="r-imp" style={{ width: parte(m130 + retenciones) }} />
          <i className="r-ok" style={{ width: parte(queda) }} />
        </div>
        <div className="dm-leyenda"><span><i className="r-gas" />Gastos</span><span><i className="r-imp" />IRPF</span><span><i className="r-ok" />Te queda {eur(queda, 0)}</span></div>
        <p className="dm-nota">Estimación orientativa de un trimestre en estimación directa, con IVA general del 21 %. Netto lo calcula con tus facturas reales, actividades y pagos anteriores.</p>
      </div>
    </div>
  );
}

/* ───────── Factura en vivo ───────── */
export function FacturaDemo() {
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
        <p className="dm-titulo"><Icono n="factura" />Prueba a hacer una factura</p>
        <label>Cliente<input value={cliente} onChange={(e) => setCliente(e.target.value)} maxLength={40} /></label>
        <label>Concepto<input value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={48} /></label>
        <label>Importe (sin IVA)<input type="number" min="0" step="10" value={importe} onChange={(e) => setImporte(Math.max(0, Number(e.target.value) || 0))} /></label>
        <div className="dm-dos">
          <label>IVA<select value={ivaP} onChange={(e) => setIvaP(Number(e.target.value))}>{[21, 10, 4, 0].map((x) => <option key={x} value={x}>{x} %</option>)}</select></label>
          <label>IRPF<select value={irpfP} onChange={(e) => setIrpfP(Number(e.target.value))}>{[15, 7, 0].map((x) => <option key={x} value={x}>{x ? `−${x} %` : 'Sin retención'}</option>)}</select></label>
        </div>
      </form>
      <div className="dm-papel" aria-live="polite">
        <div className="dm-papel-cab"><N className="dm-papel-n" /><div><b>Factura F-0143</b><small>Hoy · vence en 30 días</small></div></div>
        <div className="dm-papel-para"><small>Para</small><b>{cliente || 'Tu cliente'}</b></div>
        <div className="dm-papel-linea"><span>{concepto || 'Concepto'}</span><b>{eur(importe)}</b></div>
        <div className="dm-papel-tot">
          <span>Base<b>{eur(importe)}</b></span>
          <span>IVA {ivaP} %<b>{eur(iva)}</b></span>
          {irpfP > 0 && <span>IRPF −{irpfP} %<b>−{eur(irpf)}</b></span>}
          <span className="dm-papel-total">Total<b key={total}>{eur(total)}</b></span>
        </div>
        <div className="dm-papel-pie"><i className="mk-qr" /><small>Verifactu · huella encadenada y QR</small></div>
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
        <p className="dm-titulo"><Icono n="asistente" />{fase === 'leyendo' ? 'Leyendo el ticket…' : fase === 'listo' ? 'Listo para guardar' : 'Escaneo con IA'}</p>
        {CAMPOS.map(([k, l], i) => (
          <div key={k} className={`dm-campo${i < hechos ? ' lleno' : ''}`}><small>{l}</small><b>{i < hechos ? t[k] : ''}</b></div>
        ))}
        <button className="web-btn web-btn-peq" onClick={() => escanear((n + 1) % TICKETS.length)} disabled={fase === 'leyendo'}>Escanear otro ticket</button>
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
        <div><p className="dm-titulo"><Icono n="banco" />extracto_octubre.n43</p><small>{hechos.length} de {MOVS.length} conciliados</small></div>
        {seguros.length ? <button className="web-btn web-btn-peq" onClick={confirmar}>Confirmar los seguros ({seguros.length})</button> : <button className="web-btn web-btn-peq web-btn-claro-oscuro" onClick={() => setHechos([])}>Deshacer</button>}
      </div>
      <div className="dm-conc-barra"><i style={{ width: `${(hechos.length / MOVS.length) * 100}%` }} /></div>
      <ul>
        {MOVS.map((m) => {
          const ok = hechos.includes(m.id);
          return (
            <li key={m.id} className={ok ? 'ok' : m.seguro ? 'sugerido' : 'duda'}>
              <span className="dm-conc-check" aria-hidden><Icono n="tic" /></span>
              <div><b>{m.t}</b><small>{ok ? `${m.con} · ${m.c.startsWith('+') ? 'cobrada' : 'pagado'} con fecha del banco` : m.con}</small></div>
              <em className={m.c.startsWith('+') ? 'mas' : undefined}>{m.c}</em>
              {!ok && m.seguro && <button className="dm-conc-uno" onClick={() => setHechos((h) => [...h, m.id])}>Confirmar</button>}
              {!m.seguro && <span className="mk-chip pend">Revisar</span>}
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
        <div><p className="dm-titulo"><Icono n="tesoreria" />Previsión de caja</p><small>Desde tu saldo real: {eur(18420, 0)}</small></div>
        <div className="dm-seg" role="tablist" style={{ '--i': [3, 6, 12].indexOf(meses) }}>
          <span className="dm-seg-ind" aria-hidden />
          {[3, 6, 12].map((x) => <button key={x} role="tab" aria-selected={meses === x} className={meses === x ? 'on' : undefined} onClick={() => { setMeses(x); setFoco(null); }}>{x} meses</button>)}
        </div>
      </div>
      <div className="dm-prev-dato" aria-live="polite">
        <b key={`${f.m}${meses}`}>{eur(f.saldo, 0)}</b><span>a final de {f.m}</span>
        <div className="dm-prev-desglose"><span className="mas">+{eur(f.cobros, 0)} cobros</span><span>−{eur(f.pagos, 0)} pagos</span>{f.imp > 0 && <span className="imp">−{eur(f.imp, 0)} impuestos</span>}</div>
      </div>
      <div className="dm-prev-graf" onMouseLeave={() => setFoco(null)} style={{ '--n': meses }}>
        {datos.map((d, i) => (
          <button key={`${meses}${d.m}`} className={`${foco === i || (foco === null && i === datos.length - 1) ? 'on' : ''}${d.imp ? ' con-imp' : ''}`} style={{ '--h': `${(d.saldo / max) * 100}%`, '--i': i }} onMouseEnter={() => setFoco(i)} onFocus={() => setFoco(i)} aria-label={`${d.m}: ${eur(d.saldo, 0)}`}>
            <i /><small>{d.m}</small>
          </button>
        ))}
      </div>
      <p className="dm-nota">Los meses marcados incluyen el pago trimestral de impuestos. Datos de ejemplo.</p>
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
  const [rol, setRol] = useState('Gestoría');
  const nombres = Object.keys(ROLES);
  return (
    <div className="dm dm-perm">
      <div className="dm-seg dm-seg-ancho" role="tablist" style={{ '--i': nombres.indexOf(rol), '--n': nombres.length }}>
        <span className="dm-seg-ind" aria-hidden />
        {nombres.map((r) => <button key={r} role="tab" aria-selected={rol === r} className={rol === r ? 'on' : undefined} onClick={() => setRol(r)}>{r}</button>)}
      </div>
      <p className="dm-perm-d" key={rol}>{ROLES[rol].d}</p>
      <ul>
        {AREAS.map((a, i) => (
          <li key={a}><span>{a}</span><i className={`dm-toggle${ROLES[rol].p[i] ? ' on' : ''}`} style={{ '--i': i }} aria-label={ROLES[rol].p[i] ? 'Permitido' : 'Sin acceso'} /></li>
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
      const pal = r.split(' ');
      pal.forEach((_, i) => timers.current.push(setTimeout(() => setChat((c) => [...c.slice(0, -1), { yo: false, t: pal.slice(0, i + 1).join(' ') }]), quieto() ? 0 : i * 45)));
    }, quieto() ? 0 : 900));
  };
  return (
    <div className="dm dm-chat">
      <div className="dm-chat-cab"><span className="dm-chat-ava"><Icono n="asistente" /></span><div><b>Asistente de Netto</b><small>Responde con tus cifras</small></div></div>
      <div className="dm-chat-msgs" ref={fin}>
        {chat.map((m, i) => <p key={i} className={m.yo ? 'yo' : undefined}>{m.t}</p>)}
        {escribiendo && <p className="dm-chat-esc" aria-label="Escribiendo"><i /><i /><i /></p>}
      </div>
      <div className="dm-chat-sug">{PREGUNTAS.map((p) => <button key={p[0]} onClick={() => preguntar(p)} disabled={escribiendo}>{p[0]}</button>)}</div>
    </div>
  );
}

const DEMOS = { calculadora: Calculadora, factura: FacturaDemo, ticket: TicketDemo, conciliacion: ConciliacionDemo, prevision: PrevisionDemo, permisos: PermisosDemo, asistente: AsistenteDemo };

export default function Demo({ tipo }) {
  const D = DEMOS[tipo];
  return D ? <D /> : null;
}
