'use client';

import Link from '@/components/web/EnlacePublico';
import { useEffect, useRef, useState } from 'react';
import Icono from '@/components/web/Icono';

// Recorrido de la página /demo: cinco pantallas que imitan la app (listas agrupadas, pastillas y colores de
// app/diseno.css) con datos ficticios. Nada se guarda ni se envía: todo vive en el estado de cada pantalla, que se
// reinicia al cambiar de paso. Cada pantalla lleva la marca «Ejemplo».

const eur = (n) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })} €`;
const con = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${eur(Math.abs(n))}`;

function Telefono({ titulo, children }) {
  return (
    <div className="dmo-tel" role="group" aria-label={`Pantalla de ejemplo: ${titulo}`}>
      <div className="dmo-tel-barra" aria-hidden><span>9:41</span><span className="dmo-ejemplo">Ejemplo</span></div>
      <div className="dmo-tel-cuerpo">
        <h3 className="dmo-titulo">{titulo}</h3>
        {children}
      </div>
      <div className="dmo-tabbar" aria-hidden>
        {[['tesoreria', 'Resumen'], ['factura', 'Facturas'], ['gasto', 'Gastos'], ['impuestos', 'Impuestos'], ['banco', 'Banco']].map(([i, t]) => <span key={t}><Icono n={i} />{t}</span>)}
      </div>
    </div>
  );
}

const Celda = ({ t, s, v, chip, tipo }) => (
  <li className="dmo-celda">
    <span className="dmo-txt-c"><b>{t}</b>{s && <small>{s}</small>}</span>
    {v && <span className="dmo-v">{v}</span>}
    {chip && <span className={`dmo-chip${tipo ? ` ${tipo}` : ''}`}>{chip}</span>}
  </li>
);

// 1 · Factura: elegir el IVA recalcula el total, y «Emitir» enseña el resultado con su huella de Verifactu.
function PantallaFactura() {
  const [iva, setIva] = useState(21);
  const [emitida, setEmitida] = useState(false);
  const base = 1200, cuota = Math.round(base * iva) / 100, irpf = 180, total = base + cuota - irpf;
  return (
    <Telefono titulo="Nueva factura">
      <ul className="dmo-grupo">
        <Celda t="Estudio Norte SL" s="Cliente · NIF B12345678" />
        <Celda t="Diseño de identidad · septiembre" s="1 × 1.200,00 €" v={eur(base)} />
      </ul>
      <div className="dmo-campo">
        <span id="dmo-iva-t">Tipo de IVA</span>
        <div className="dmo-seg" role="group" aria-labelledby="dmo-iva-t">
          {[21, 10, 4].map((p) => <button key={p} type="button" aria-pressed={iva === p} className={iva === p ? 'on' : undefined} onClick={() => { setIva(p); setEmitida(false); }}>{p} %</button>)}
        </div>
      </div>
      <ul className="dmo-grupo" aria-live="polite">
        <Celda t="Base imponible" v={eur(base)} />
        <Celda t={`IVA ${iva} %`} v={con(cuota)} />
        <Celda t="IRPF −15 %" s="Retención de tu actividad" v={con(-irpf)} />
        <li className="dmo-celda dmo-total"><b>Total</b><b className="dmo-v">{eur(total)}</b></li>
      </ul>
      {emitida ? (
        <div className="dmo-ok" role="status">
          <i className="dmo-qr" aria-hidden />
          <span><b>Factura 2026-014 emitida</b><small>Con su huella encadenada y su código QR de Verifactu.</small></span>
          <button type="button" className="dmo-enlace" onClick={() => setEmitida(false)}>Volver a empezar</button>
        </div>
      ) : (
        <button type="button" className="dmo-boton" onClick={() => setEmitida(true)}>Emitir factura</button>
      )}
    </Telefono>
  );
}

// 2 · Gasto: un ticket de ejemplo que «se lee» al pulsar; los datos se revisan antes de guardar.
function PantallaGasto() {
  const [estado, setEstado] = useState('espera'); // espera → leyendo → leido → guardado
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const leer = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setEstado('leido'); return; }
    setEstado('leyendo');
    t.current = setTimeout(() => setEstado('leido'), 1100);
  };
  const lleno = estado === 'leido' || estado === 'guardado';
  const campos = [['Proveedor', 'Papelería Central SL'], ['Fecha', '12/09/2026'], ['Base', eur(41.32)], ['IVA 21 %', eur(8.68)], ['Total', eur(50)], ['Categoría', 'Material de oficina']];
  return (
    <Telefono titulo="Nuevo gasto">
      <div className={`dmo-ticket${estado === 'leyendo' ? ' leyendo' : ''}`} aria-hidden>
        <span /><span /><span /><span /><span className="corta" /><i />
      </div>
      <ul className="dmo-grupo" aria-live="polite" aria-busy={estado === 'leyendo'}>
        {campos.map(([k, v]) => <li key={k} className="dmo-celda"><span className="dmo-txt-c"><b>{k}</b></span><span className={`dmo-v${lleno ? '' : ' vacio'}`}>{lleno ? v : estado === 'leyendo' ? 'Leyendo…' : '—'}</span></li>)}
      </ul>
      {estado === 'espera' && <button type="button" className="dmo-boton" onClick={leer}>Leer el ticket con IA</button>}
      {estado === 'leyendo' && <p className="dmo-pie" role="status">La IA está leyendo el ticket…</p>}
      {estado === 'leido' && (
        <>
          <p className="dmo-pie" role="status"><span className="dmo-chip">Leído con IA</span> Revisa los datos antes de guardar: puedes corregir cualquier campo.</p>
          <button type="button" className="dmo-boton" onClick={() => setEstado('guardado')}>Guardar gasto</button>
        </>
      )}
      {estado === 'guardado' && (
        <div className="dmo-ok" role="status">
          <span className="dmo-visto" aria-hidden><Icono n="tic" /></span>
          <span><b>Gasto guardado</b><small>Ya cuenta en el IVA soportado del 3.er trimestre.</small></span>
          <button type="button" className="dmo-enlace" onClick={() => setEstado('espera')}>Volver a empezar</button>
        </div>
      )}
    </Telefono>
  );
}

// 3 · Impuestos: 303 y 130 con el desglose de sus casillas y lo que hay que apartar.
const MODELOS = [
  { id: '303', titulo: 'Modelo 303 · IVA', filas: [['IVA repercutido', 'Casilla 27', 2520], ['IVA soportado deducible', 'Casilla 45', -840]], resultado: ['A ingresar', 'Casilla 46', 1680] },
  { id: '130', titulo: 'Modelo 130 · IRPF', filas: [['20 % del rendimiento neto acumulado', 'Rendimiento de 11.400,00 €', 2280], ['Retenciones y pagos anteriores', 'Lo ya adelantado este año', -2100]], resultado: ['A ingresar', 'Pago fraccionado del trimestre', 180] },
];
function PantallaImpuestos() {
  const [m, setM] = useState('303');
  const d = MODELOS.find((x) => x.id === m);
  return (
    <Telefono titulo="3.er trimestre">
      <div className="dmo-campo">
        <span id="dmo-mod-t">Modelo</span>
        <div className="dmo-seg" role="group" aria-labelledby="dmo-mod-t">
          {MODELOS.map((x) => <button key={x.id} type="button" aria-pressed={m === x.id} className={m === x.id ? 'on' : undefined} onClick={() => setM(x.id)}>{x.id}</button>)}
        </div>
      </div>
      <p className="dmo-grupo-t">{d.titulo}</p>
      <ul className="dmo-grupo" aria-live="polite">
        {d.filas.map(([t, s, v]) => <Celda key={t} t={t} s={s} v={con(v)} />)}
        <li className="dmo-celda dmo-total"><span className="dmo-txt-c"><b>{d.resultado[0]}</b><small>{d.resultado[1]}</small></span><b className="dmo-v">{eur(d.resultado[2])}</b></li>
      </ul>
      <div className="dmo-aparta"><span>Aparta este trimestre<small>303 + 130</small></span><b>{eur(1680 + 180)}</b></div>
      <p className="dmo-pie">Presentar antes del 20 de octubre (domiciliado, hasta el 15). Fisquo calcula las casillas; tú o tu gestoría presentáis en la sede de la AEAT.</p>
    </Telefono>
  );
}

// 4 · Banco: cada movimiento propone su pareja; se confirma uno a uno o todos los seguros a la vez.
const MOVIMIENTOS = [
  { id: 'a', t: 'Transferencia Estudio Norte', s: 'Factura 2026-014', v: 1272, fecha: '08/10' },
  { id: 'b', t: 'Pago Papelería Central', s: 'Gasto del 12/09', v: -50, fecha: '09/10' },
  { id: 'c', t: 'Cuota de autónomos', s: 'Se apunta como gasto de Seguridad Social', v: -294, fecha: '30/09' },
  { id: 'd', t: 'Compra tarjeta Amazon', s: 'Sin factura: queda para revisar', v: -86.9, fecha: '02/10', revisar: true },
];
function PantallaBanco() {
  const [ok, setOk] = useState([]);
  const [rev, setRev] = useState(false);
  const seguros = MOVIMIENTOS.filter((x) => !x.revisar);
  const hechos = ok.length;
  return (
    <Telefono titulo="Banco">
      <p className="dmo-pie arriba" role="status">{hechos} de {MOVIMIENTOS.length} emparejados{rev ? ' · 1 en revisión' : ''}</p>
      <ul className="dmo-grupo">
        {MOVIMIENTOS.map((x) => {
          const hecho = ok.includes(x.id);
          return (
            <li key={x.id} className={`dmo-celda dmo-mov${hecho ? ' hecho' : ''}`}>
              <span className="dmo-txt-c"><b>{x.t}</b><small>{x.fecha} · {hecho ? 'Emparejado' : '→'} {x.s}</small></span>
              <span className={`dmo-v${x.v > 0 ? ' mas' : ''}`}>{con(x.v)}</span>
              {x.revisar
                ? <button type="button" className="dmo-mini" disabled={rev} onClick={() => setRev(true)} aria-label={rev ? `En revisión: ${x.t}` : `Mandar a revisar: ${x.t}`}>{rev ? 'En revisión' : 'Revisar'}</button>
                : <button type="button" className="dmo-mini" disabled={hecho} onClick={() => setOk([...ok, x.id])} aria-label={hecho ? `Emparejado: ${x.t}` : `Confirmar el emparejamiento de ${x.t}`}>{hecho ? '✓' : 'Confirmar'}</button>}
            </li>
          );
        })}
      </ul>
      {hechos < seguros.length
        ? <button type="button" className="dmo-boton" onClick={() => setOk(seguros.map((x) => x.id))}>Confirmar los {seguros.length} seguros</button>
        : <button type="button" className="dmo-boton sec" onClick={() => { setOk([]); setRev(false); }}>Volver a empezar</button>}
    </Telefono>
  );
}

// 5 · Gestoría: acceso de solo vista y paquete del trimestre.
function PantallaGestoria() {
  const [listo, setListo] = useState(false);
  return (
    <Telefono titulo="Tu gestoría">
      <ul className="dmo-grupo">
        <Celda t="Gestoría Pons" s="gestoria@ejemplo.es" chip="Solo vista" tipo="aviso" />
      </ul>
      <p className="dmo-grupo-t">Lo que puede hacer</p>
      <ul className="dmo-grupo">
        <li className="dmo-celda"><span className="dmo-txt-c"><b>Ver facturas, gastos e impuestos</b></span><span className="dmo-si" aria-label="Sí">✓</span></li>
        <li className="dmo-celda"><span className="dmo-txt-c"><b>Descargar el paquete del trimestre</b></span><span className="dmo-si" aria-label="Sí">✓</span></li>
        <li className="dmo-celda"><span className="dmo-txt-c"><b>Marcar cobros o crear facturas</b></span><span className="dmo-no" aria-label="No">—</span></li>
      </ul>
      {listo ? (
        <>
          <p className="dmo-grupo-t">Paquete del 3.er trimestre</p>
          <ul className="dmo-grupo" aria-live="polite">
            <Celda t="Facturas emitidas" s="38 documentos" chip="✓" />
            <Celda t="Gastos" s="61 documentos" chip="✓" />
            <Celda t="Modelos 303 y 130" s="Casillas calculadas" chip="✓" />
          </ul>
          <p className="dmo-pie" role="status">Listo en Excel y en PDF. Tu gestoría revisa y presenta como siempre, sin perseguir papeles.</p>
          <button type="button" className="dmo-boton sec" onClick={() => setListo(false)}>Volver a empezar</button>
        </>
      ) : (
        <button type="button" className="dmo-boton" onClick={() => setListo(true)}>Preparar el paquete del trimestre</button>
      )}
    </Telefono>
  );
}

const PASOS = [
  { id: 'factura', icono: 'factura', t: 'Factura', titulo: 'Haces una factura en segundos', d: 'Eliges cliente y concepto. Fisquo calcula el IVA y el IRPF, numera la factura y le pone su huella y su código QR de Verifactu.', puntos: ['Prueba a cambiar el tipo de IVA: el total se recalcula al momento.', 'Numeración correlativa, sin saltos.'], href: '/funciones/facturacion', Pantalla: PantallaFactura },
  { id: 'gasto', icono: 'gasto', t: 'Gasto con IA', titulo: 'Una foto al ticket y el gasto está apuntado', d: 'La IA lee el proveedor, la fecha, la base y el IVA. Tú revisas lo que ha leído antes de guardarlo.', puntos: ['Funciona con foto o PDF.', 'Nada se guarda sin que lo veas.'], href: '/funciones/gastos', Pantalla: PantallaGasto },
  { id: 'impuestos', icono: 'impuestos', t: 'Impuestos', titulo: 'Sabes cuánto apartar para Hacienda', d: 'Con las facturas y los gastos del trimestre, Fisquo calcula las casillas de tus modelos y te dice cuánto reservar.', puntos: ['Cambia entre el 303 y el 130 para ver el desglose.', 'Fisquo calcula; presentas tú o tu gestoría.'], href: '/funciones/impuestos', Pantalla: PantallaImpuestos },
  { id: 'banco', icono: 'banco', t: 'Banco', titulo: 'El extracto se cuadra casi solo', d: 'Subes el extracto de tu banco y Fisquo empareja cada cobro con su factura y cada pago con su gasto. Lo que no cuadra, a revisar.', puntos: ['Confirma uno a uno o todos los seguros de golpe.', 'Un cargo sin factura queda en revisión.'], href: '/funciones/banco', Pantalla: PantallaBanco },
  { id: 'gestoria', icono: 'equipo', t: 'Gestoría', titulo: 'Tu gestoría ve lo suyo, sin perseguirte', d: 'La invitas con perfil de solo vista, o le mandas el paquete del trimestre en Excel y PDF. Ella revisa y presenta.', puntos: ['Entra con su propio acceso, que no consume usuarios.', 'Ve tus facturas, gastos e impuestos, sin poder tocarlos.'], href: '/funciones/impuestos', Pantalla: PantallaGestoria },
];

export default function Recorrido() {
  const [i, setI] = useState(0);
  const botones = useRef([]);
  const p = PASOS[i];
  const ir = (n) => setI(Math.min(PASOS.length - 1, Math.max(0, n)));
  function teclas(e, k) {
    let n;
    if (['ArrowRight', 'ArrowDown'].includes(e.key)) n = (k + 1) % PASOS.length;
    else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) n = (k + PASOS.length - 1) % PASOS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = PASOS.length - 1;
    else return;
    e.preventDefault(); setI(n); botones.current[n]?.focus();
  }
  const ultimo = i === PASOS.length - 1;
  return (
    <div className="dmo">
      <div className="dmo-pasos" role="tablist" aria-label="Pasos de la demo">
        {PASOS.map((x, k) => (
          <button key={x.id} id={`dmo-tab-${x.id}`} type="button" role="tab" aria-selected={k === i} aria-controls="dmo-panel" tabIndex={k === i ? 0 : -1} ref={(el) => { botones.current[k] = el; }} className={k === i ? 'on' : k < i ? 'hecho' : undefined} onKeyDown={(e) => teclas(e, k)} onClick={() => setI(k)}>
            <span className="dmo-pasos-n" aria-hidden>{k + 1}</span><span className="dmo-pasos-t">{x.t}</span>
          </button>
        ))}
      </div>

      <div id="dmo-panel" role="tabpanel" aria-labelledby={`dmo-tab-${p.id}`} className="dmo-escena">
        <div className="dmo-explica">
          <p className="web-kicker">Paso {i + 1} de {PASOS.length}</p>
          <h2>{p.titulo}</h2>
          <p className="dmo-d">{p.d}</p>
          <ul className="web-lista">{p.puntos.map((x) => <li key={x}><Icono n="tic" /><span>{x}</span></li>)}</ul>
          <Link href={p.href} className="web-enlace">Saber más sobre {p.t.toLowerCase()}<Icono n="flecha" className="ico web-flecha" /></Link>
        </div>
        <div className="dmo-vis">
          <p.Pantalla key={p.id} />
          <p className="dmo-aviso">Datos ficticios de ejemplo. No se guarda nada.</p>
        </div>
      </div>

      <div className="dmo-nav">
        <button type="button" className="web-btn web-btn-oscuro" onClick={() => ir(i - 1)} disabled={i === 0} aria-label={i === 0 ? 'Paso anterior' : `Paso anterior: ${PASOS[i - 1].t}`}>Anterior</button>
        <p className="dmo-estado" role="status" aria-live="polite">Paso {i + 1} de {PASOS.length}: {p.t}</p>
        {ultimo
          ? <Link href="/registro" className="web-btn">Empieza gratis<Icono n="flecha" className="ico web-flecha" /></Link>
          : <button type="button" className="web-btn" onClick={() => ir(i + 1)} aria-label={`Siguiente paso: ${PASOS[i + 1].t}`}>Siguiente<Icono n="flecha" className="ico web-flecha" /></button>}
      </div>
    </div>
  );
}
