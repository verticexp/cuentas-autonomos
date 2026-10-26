'use client';

import Link from '@/components/web/EnlacePublico';
import { useEffect, useRef, useState } from 'react';
import Icono from '@/components/web/Icono';

// Recorrido de la página /demo: cinco pantallas que copian las de la app (components/TabBar.js, app/diseno.css, app/v2.css,
// app/banco.css, app/modelos.css y las pantallas de Facturas, Gastos, Impuestos, Banco y Tu gestoría) con datos ficticios,
// para un autónomo y para una sociedad. Nada se guarda ni se envía: todo vive en el estado de cada pantalla, que se
// reinicia al cambiar de paso o de perfil. Cada pantalla lleva la marca «Ejemplo».

const r2 = (n) => Math.round(n * 100) / 100;
const eur = (n) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })} €`;
const con = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${eur(Math.abs(n))}`;

// Iconos de la barra de pestañas y de los botones, los mismos trazos que components/TabBar.js.
const TRAZOS = {
  resumen: <path d="M5 20V11M10 20V5M15 20v-7M20 20V9" />,
  facturas: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />,
  gastos: <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M4 10h16" /></>,
  mas: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" /></>,
  mas1: <path d="M12 5v14M5 12h14" />,
  ticket: <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M4 12h16" />,
  derecha: <path d="M9 6l6 6-6 6" />,
  abajo: <path d="M6 9l6 6 6-6" />,
  tic: <path d="M5 12.5l4.5 4.5L19 7" />,
};
const Ico = ({ n, className = 'dmo-i' }) => <svg viewBox="0 0 24 24" className={className} aria-hidden>{TRAZOS[n]}</svg>;

const PESTANAS = [['resumen', 'Resumen'], ['facturas', 'Facturas'], ['gastos', 'Gastos'], ['mas', 'Más']];

// El marco: la pantalla de un iPhone (≈ 9:19,5) con la barra de estado, el contenido que se desplaza dentro y la barra de
// pestañas flotante con el «+» de la app. El tamaño de todo sale del ancho del marco (web.css), así que cabe en cualquier
// ventana. `activa`: pestaña marcada (sin ella, la pantalla es un formulario y no lleva barra, como en la app); `pie`: la
// barra de abajo de los formularios.
function Movil({ titulo, activa, pie, children }) {
  return (
    <div className="dmo-marco">
      <div className="dmo-tel" role="group" aria-label={`Pantalla de ejemplo: ${titulo}`}>
        <div className="dmo-estado-barra" aria-hidden><span>9:41</span><span className="dmo-ejemplo">Ejemplo</span></div>
        <div className={`dmo-cuerpo${pie ? ' con-pie' : ''}`}>{children}</div>
        {pie && <div className="dmo-pie-f">{pie}</div>}
        {activa && (
          <div className="dmo-barra" aria-hidden>
            <div className="dmo-tabs">
              {PESTANAS.map(([id, t]) => <span key={id} className={id === activa ? 'activo' : undefined}><Ico n={id} />{t}</span>)}
            </div>
            <span className="dmo-fab"><Ico n="mas1" /></span>
          </div>
        )}
      </div>
    </div>
  );
}

const Volver = ({ children }) => <span className="dmo-volver" aria-hidden>‹ {children}</span>;
const Pastilla = ({ tipo, children }) => <span className={`dmo-pastilla ${tipo}`}>{children}</span>;
// Una celda de lista como la de la app: lo principal, su detalle y el importe a la derecha.
const Fila = ({ t, s, v, mas, children }) => (
  <li className="dmo-fila">
    <span className="dmo-txt-c"><b>{t}</b>{s && <small>{s}</small>}</span>
    {children}
    {v && <span className={`dmo-v${mas ? ' mas' : ''}`}>{v}</span>}
  </li>
);

// ───────────────────────── Datos de ejemplo de cada perfil ─────────────────────────
// Todas las sumas cuadran: factura (base + IVA − IRPF), gasto (base + IVA), 303, 130 / 111 / 202 y el banco, que empareja
// con la factura y el gasto de los pasos 1 y 2.
const PERFILES = {
  aut: {
    nombre: 'Autónomo',
    corto: 'autónomo',
    quien: 'Estudio de diseño de ejemplo',
    factura: { num: '14-2026', fecha: '12/09/2026', emitida: '12 de septiembre', cliente: 'Estudio Norte S.L.', nif: 'B12345674', ciudad: '08001 Barcelona', concepto: 'Diseño de identidad · septiembre', base: 1200, irpf: 15 },
    gasto: { proveedor: 'Papelería Central SL', concepto: 'Material de oficina', fecha: '12/09/2026', base: 41.32 },
    proximos: [
      ['IVA (303) del 4T', 'Hasta el 1 de febrero de 2027 · previsión del trimestre · domiciliado, hasta el 27 de enero', 840],
      ['Pago a cuenta del IRPF (130) del 4T', 'Hasta el 1 de febrero de 2027 · previsión del trimestre · domiciliado, hasta el 27 de enero', 180],
    ],
    modelos: [
      { id: '303', t: 'IVA trimestral', s: '4T · en curso · hasta el 1 de febrero de 2027', v: 840, nota: 'apuntado hasta hoy', casillas: [['07', 'Base al 21 %', 6000], ['09', 'Cuota al 21 %', 1260], ['27', 'Total cuota devengada', 1260], ['45', 'Total a deducir (IVA soportado)', 420]], resultado: ['46', 'Resultado: a ingresar', 840] },
      { id: '130', t: 'Pago a cuenta del IRPF', s: '4T · en curso · hasta el 1 de febrero de 2027', v: 180, nota: 'apuntado hasta hoy', casillas: [['01', 'Ingresos', 18000], ['02', 'Gastos (incluye el 5 %)', 6600], ['03', 'Rendimiento neto', 11400], ['04', '20 % de la 03', 2280], ['05', 'Pagos de los 130 anteriores del año', 1500], ['06', 'Retenciones', 600]], resultado: ['19', 'Resultado: a ingresar', 180] },
    ],
    aparta: 1020,
    banco: {
      saldo: 6842.1,
      confirmables: [
        { id: 'a', fecha: '08/10', t: 'Transferencia Estudio Norte', s: 'Cobro de la factura 14‑2026', v: 1272, es: ['Es esta', 'Estudio Norte S.L.', '12/09/2026 · 1.272,00 €'] },
        { id: 'b', fecha: '09/10', t: 'Papelería Central SL', s: 'Pago con tarjeta', v: -50, es: ['Es esta', 'Papelería Central SL', '12/09/2026 · 50,00 €'] },
      ],
      sinPareja: [
        { id: 'c', fecha: '30/09', t: 'Cuota de autónomos', s: 'Recibo Seguridad Social', v: -294, clase: 'Cuota de autónomos', ayuda: 'Se apunta como gasto de Seguridad Social del titular, sin IVA.', accion: 'Apuntar', hecho: 'Apuntado' },
        { id: 'd', fecha: '02/10', t: 'Compra tarjeta Amazon', s: 'Sin factura todavía', v: -86.9, clase: 'Un gasto: falta su factura', ayuda: 'Apúntalo con su factura: Fisquo lee la base y el IVA y lo deja emparejado.', accion: 'Añadir con su factura', hecho: 'Se añade con su factura' },
      ],
    },
    gestoria: { facturas: 38, gastos: 61, nominas: 0, modelos: 'Modelos 303 y 130', modelosS: 'Casillas calculadas del trimestre', acceso: 'Entra con su propio usuario y ve facturas, gastos e impuestos. Una gestoría no cuenta como usuario de tu plan.' },
  },
  soc: {
    nombre: 'Sociedad (pyme)',
    corto: 'sociedad',
    quien: 'Sociedad de ejemplo',
    factura: { num: '27-2026', fecha: '12/09/2026', emitida: '12 de septiembre', cliente: 'Hotel Mirador del Port S.A.', nif: 'A12345674', ciudad: '08005 Barcelona', concepto: 'Sonido e iluminación · evento de empresa', base: 2500, irpf: 0 },
    gasto: { proveedor: 'Suministros Escénicos SL', concepto: 'Cableado y conectores', fecha: '12/09/2026', base: 330.58 },
    proximos: [
      ['Impuesto sobre Sociedades (202) de diciembre', 'Hasta el 21 de diciembre · domiciliado, hasta el 16 de diciembre', 1764],
      ['IVA (303) del 4T', 'Hasta el 1 de febrero de 2027 · previsión del trimestre · domiciliado, hasta el 27 de enero', 2100],
      ['Retenciones (111) del 4T', 'Hasta el 20 de enero de 2027 · previsión del trimestre · domiciliado, hasta el 15 de enero', 1530],
    ],
    modelos: [
      { id: '303', t: 'IVA trimestral', s: '4T · en curso · hasta el 1 de febrero de 2027', v: 2100, nota: 'apuntado hasta hoy', casillas: [['07', 'Base al 21 %', 15000], ['09', 'Cuota al 21 %', 3150], ['27', 'Total cuota devengada', 3150], ['45', 'Total a deducir (IVA soportado)', 1050]], resultado: ['46', 'Resultado: a ingresar', 2100] },
      { id: '111', t: 'Retenciones de nóminas y profesionales', s: '4T · en curso · hasta el 20 de enero de 2027', v: 1530, nota: 'apuntado hasta hoy', casillas: [['01', 'Trabajadores', 3, 'n'], ['02', 'Sueldos', 9000], ['03', 'Retenciones', 1350], ['07', 'Profesionales', 1, 'n'], ['08', 'Facturas de profesionales', 1200], ['09', 'Retenciones', 180]], resultado: ['28', 'Resultado: a ingresar', 1530] },
      { id: '202', t: 'Pagos a cuenta de Sociedades', s: '3P · hasta el 21 de diciembre', v: 1764, nota: 'estimado', casillas: [['', 'Cuota del ejercicio anterior (menos retenciones)', 9800], ['', '18 % de esa cuota', 1764]], resultado: ['', 'Resultado: a ingresar', 1764] },
    ],
    aparta: 3630,
    banco: {
      saldo: 38560.4,
      confirmables: [
        { id: 'a', fecha: '08/10', t: 'Transferencia Hotel Mirador del Port', s: 'Cobro de la factura 27‑2026', v: 3025, es: ['Es esta', 'Hotel Mirador del Port S.A.', '12/09/2026 · 3.025,00 €'] },
        { id: 'b', fecha: '09/10', t: 'Suministros Escénicos SL', s: 'Pago con tarjeta', v: -400, es: ['Es esta', 'Suministros Escénicos SL', '12/09/2026 · 400,00 €'] },
      ],
      sinPareja: [
        { id: 'c', fecha: '30/09', t: 'Nóminas de septiembre', s: 'Transferencias a 3 empleados', v: -7078.5, clase: 'Pago de nóminas', ayuda: 'Ya lo contabiliza Fisquo con las nóminas.', accion: 'Entendido', hecho: 'Contabilizado con las nóminas' },
        { id: 'e', fecha: '30/09', t: 'Seguros sociales (TGSS)', s: 'Recibo de la Seguridad Social', v: -2866.5, clase: 'Seguridad Social de las nóminas', ayuda: 'Ya lo contabiliza Fisquo con las nóminas.', accion: 'Entendido', hecho: 'Contabilizado con las nóminas' },
        { id: 'd', fecha: '02/10', t: 'Compra tarjeta Amazon', s: 'Sin factura todavía', v: -86.9, clase: 'Un gasto: falta su factura', ayuda: 'Apúntalo con su factura: Fisquo lee la base y el IVA y lo deja emparejado.', accion: 'Añadir con su factura', hecho: 'Se añade con su factura' },
      ],
    },
    gestoria: { facturas: 42, gastos: 73, nominas: 3, modelos: 'Modelos 303 y 111', modelosS: 'Casillas calculadas del trimestre', acceso: 'Entra con su propio usuario y ve facturas, gastos, nóminas e impuestos (también el 202) y la contabilidad. Una gestoría no cuenta como usuario de tu plan.' },
  },
};

// ───────────────────────── 1 · Factura ─────────────────────────
// Nueva factura (como app/facturas/nueva): elegir el IVA recalcula el total. «Crear factura» lleva a la ficha de la factura.
function PantallaFactura({ d }) {
  const f = d.factura;
  const [iva, setIva] = useState(21);
  const [hecha, setHecha] = useState(false);
  const [cobrada, setCobrada] = useState(false);
  const cuota = r2((f.base * iva) / 100);
  const irpf = r2((f.base * f.irpf) / 100);
  const total = r2(f.base + cuota - irpf);

  if (hecha) {
    return (
      <Movil titulo={`Factura ${f.num}`} activa="facturas">
        <p className="oculto" role="status">Factura {f.num} creada y registrada</p>
        <Volver>Facturas</Volver>
        <div className="dmo-tarjeta dmo-ficha">
          <small>Factura {f.num}</small>
          <b className="dmo-ficha-cli">{f.cliente}</b>
          <p className="dmo-ficha-imp">{eur(total)}</p>
          <dl className="dmo-desglose">
            <div><dt>Base</dt><dd>{eur(f.base)}</dd></div>
            <div><dt>IVA {iva} %</dt><dd>{eur(cuota)}</dd></div>
            {f.irpf > 0 && <div><dt>IRPF {f.irpf} %</dt><dd>{con(-irpf)}</dd></div>}
          </dl>
          <div className="dmo-ficha-estado">
            {cobrada ? <Pastilla tipo="ok">Cobrada</Pastilla> : <Pastilla tipo="aviso">Pendiente</Pastilla>}
            <span>Emitida el {f.emitida}</span>
          </div>
          {!cobrada && <button type="button" className="dmo-boton suave verde" onClick={() => setCobrada(true)}>✓ Marcar como cobrada</button>}
        </div>
        <p className="dmo-registrada"><Ico n="tic" />Numerada sin saltos y registrada</p>
        <span className="dmo-boton" aria-hidden>Enviar al cliente por email</span>
        <span className="dmo-boton suave" aria-hidden>Ver / descargar PDF</span>
        <button type="button" className="dmo-enlace" onClick={() => { setHecha(false); setCobrada(false); }}>Hacer otra factura</button>
      </Movil>
    );
  }
  return (
    <Movil titulo="Nueva factura" pie={
      <>
        <div className="dmo-totales" aria-live="polite"><b>Total {eur(total)}</b><small>Base {eur(f.base)} · IVA {eur(cuota)}</small></div>
        <button type="button" className="dmo-boton" onClick={() => setHecha(true)}>Crear factura</button>
      </>
    }>
      <Volver>Atrás</Volver>
      <h3 className="dmo-h1">Nueva factura</h3>
      <p className="dmo-rotulo">Se numerará como {f.num}</p>
      <div className="dmo-eti"><span>Fecha</span><div className="dmo-campo">{f.fecha}</div></div>
      <div className="dmo-eti"><span>Cliente</span>
        <div className="dmo-cli"><span className="dmo-txt-c"><b>{f.cliente}</b><small>{f.nif} · {f.ciudad}</small></span><span className="dmo-cambiar">Cambiar</span></div>
      </div>
      <div className="dmo-eti"><span>Conceptos</span>
        <div className="dmo-linea">
          <div className="dmo-campo blanco">{f.concepto}</div>
          <div className="dmo-nums">
            <div className="dmo-eti"><span>Cantidad</span><div className="dmo-campo blanco">1</div></div>
            <div className="dmo-eti"><span>Precio</span><div className="dmo-campo blanco">{f.base.toLocaleString('es-ES', { minimumFractionDigits: 2, useGrouping: 'always' })}</div></div>
            <label className="dmo-eti"><span>IVA</span>
              <select className="dmo-campo blanco" value={iva} onChange={(e) => setIva(Number(e.target.value))}>{[21, 10, 4].map((p) => <option key={p} value={p}>{p}%</option>)}</select>
            </label>
          </div>
          <p className="dmo-linea-total">{eur(f.base)}</p>
        </div>
      </div>
      {f.irpf > 0 && <div className="dmo-eti"><span>Retención de IRPF</span><div className="dmo-campo">{f.irpf}%</div></div>}
    </Movil>
  );
}

// ───────────────────────── 2 · Gasto ─────────────────────────
// Gastos (como app/gastos): «Escanear ticket» lee un ticket de ejemplo y rellena el gasto, que se revisa antes de guardar.
function PantallaGasto({ d }) {
  const g = d.gasto;
  const iva = r2(g.base * 0.21);
  const total = r2(g.base + iva);
  const [estado, setEstado] = useState('espera'); // espera → leyendo → leido → guardado
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const leer = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setEstado('leido'); return; }
    setEstado('leyendo');
    t.current = setTimeout(() => setEstado('leido'), 1100);
  };
  const Pestanas = () => (
    <div className="dmo-pestanas" aria-hidden><span className="activa">Gastos</span><span>Por revisar</span><span>Por pagar</span></div>
  );
  if (estado === 'leido') {
    return (
      <Movil titulo="Nuevo gasto" activa="gastos">
        <p className="oculto" role="status">Fisquo ha leído el ticket. Revisa los datos antes de guardar.</p>
        <h3 className="dmo-h1">Gastos</h3>
        <Pestanas />
        <div className="dmo-tarjeta">
          <h4 className="dmo-h2">Añadir gasto deducible</h4>
          <div className="dmo-ia"><b>Leído con IA</b><small>Revisa los datos antes de guardar: puedes corregir cualquier campo.</small></div>
          <div className="dmo-eti"><span>Proveedor</span><div className="dmo-campo">{g.proveedor}</div></div>
          <div className="dmo-eti"><span>Concepto</span><div className="dmo-campo">{g.concepto}</div></div>
          <div className="dmo-dos">
            <div className="dmo-eti"><span>Base sin IVA</span><div className="dmo-campo">{eur(g.base)}</div></div>
            <div className="dmo-eti"><span>IVA</span><div className="dmo-campo">IVA 21%</div></div>
          </div>
          <p className="dmo-suma">Total con IVA <b>{eur(total)}</b></p>
          <button type="button" className="dmo-boton" onClick={() => setEstado('guardado')}>Guardar gasto</button>
        </div>
      </Movil>
    );
  }
  if (estado === 'guardado') {
    return (
      <Movil titulo="Gastos" activa="gastos">
        <p className="oculto" role="status">Gasto guardado</p>
        <h3 className="dmo-h1">Gastos</h3>
        <Pestanas />
        <p className="dmo-resumen-l">Con este gasto recuperas <b>{eur(iva)}</b> de IVA</p>
        <div className="dmo-mes"><h4 className="dmo-h2">Septiembre</h4><small>Base {eur(g.base)}</small></div>
        <ul className="dmo-lista">
          <Fila t={g.proveedor} s={`${g.fecha} · ${g.concepto}`} v={eur(total)} />
        </ul>
        <p className="dmo-pie-t">Ya cuenta en el IVA soportado del trimestre y en el rendimiento.</p>
        <button type="button" className="dmo-enlace" onClick={() => setEstado('espera')}>Volver a empezar</button>
      </Movil>
    );
  }
  return (
    <Movil titulo="Gastos" activa="gastos">
      <h3 className="dmo-h1">Gastos</h3>
      <Pestanas />
      <div className="dmo-tarjeta" aria-busy={estado === 'leyendo'}>
        <h4 className="dmo-h2">Añadir gastos</h4>
        <p className="dmo-p">Haz una foto al ticket o sube tus facturas, una o varias. Fisquo las lee por ti.</p>
        {estado === 'leyendo' && <p className="oculto" role="status">La IA está leyendo el ticket…</p>}
        <div className={`dmo-ticket${estado === 'leyendo' ? ' leyendo' : ''}`} aria-hidden>
          <b>{g.proveedor}</b><span /><span /><span /><span className="corta" /><i />
        </div>
        <button type="button" className="dmo-boton" onClick={leer} disabled={estado === 'leyendo'}><Ico n="ticket" className="dmo-i b" />{estado === 'leyendo' ? 'Leyendo el ticket…' : 'Escanear ticket'}</button>
        <span className="dmo-boton suave" aria-hidden>Varios tickets</span>
        <div className="dmo-dos"><span className="dmo-boton suave" aria-hidden>Subir facturas</span><span className="dmo-boton suave" aria-hidden>Apuntar a mano</span></div>
      </div>
    </Movil>
  );
}

// ───────────────────────── 3 · Impuestos ─────────────────────────
// Impuestos (como app/modelos): lo próximo y los modelos del trimestre, que se abren para ver sus casillas.
function PantallaImpuestos({ d }) {
  const [abierto, setAbierto] = useState(null);
  return (
    <Movil titulo="Impuestos" activa="mas">
      <Volver>Resumen</Volver>
      <div className="dmo-cab"><h3 className="dmo-h1">Impuestos</h3><span className="dmo-anios" aria-hidden><i>‹</i><b>2026</b><i className="off">›</i></span></div>
      <p className="dmo-pie-t arriba">Calculados con lo que hay en Fisquo. Son orientativos: revísalos con tu gestor antes de presentarlos.</p>
      <h4 className="dmo-h2">Lo próximo</h4>
      <ul className="dmo-lista">
        {d.proximos.map(([t, s, v]) => <Fila key={t} t={t} s={s} v={eur(v)} />)}
      </ul>
      {d.modelos.map((m) => {
        const on = abierto === m.id;
        return (
          <div key={m.id} className={`dmo-modelo${on ? ' abierto' : ''}`}>
            <button type="button" className="dmo-modelo-b" aria-expanded={on} aria-controls={`dmo-m-${m.id}`} onClick={() => setAbierto(on ? null : m.id)}>
              <span className="dmo-num">{m.id}</span>
              <span className="dmo-txt-c"><b>{m.t}</b><small>{m.s}</small></span>
              <span className="dmo-m-imp"><b>{eur(m.v)}</b><small>{m.nota}</small></span>
              <Ico n="abajo" className="dmo-i flecha" />
            </button>
            <div id={`dmo-m-${m.id}`} role="region" aria-label={`Casillas del modelo ${m.id}`} hidden={!on}>
              <ul className="dmo-cas">
                {m.casillas.map(([c, t, v, tipo]) => <li key={`${c}${t}`}><span>{c && <i>{c}</i>}{t}</span><b>{tipo === 'n' ? v : eur(v)}</b></li>)}
                <li className="res"><span>{m.resultado[0] && <i>{m.resultado[0]}</i>}{m.resultado[1]}</span><b>{eur(m.resultado[2])}</b></li>
              </ul>
            </div>
          </div>
        );
      })}
      <p className="dmo-pie-t">Para apartar este trimestre: <b>{eur(d.aparta)}</b> ({d.modelos.filter((m) => m.id !== '202').map((m) => m.id).join(' + ')}).</p>
    </Movil>
  );
}

// ───────────────────────── 4 · Banco ─────────────────────────
// Banco (como app/banco): cada movimiento propone su pareja («Es esta»); se confirma uno a uno o todos los seguros.
function PantallaBanco({ d }) {
  const b = d.banco;
  const [hechos, setHechos] = useState({}); // id → texto de lo que se ha hecho
  const marca = (id, txt) => setHechos((h) => ({ ...h, [id]: txt }));
  const todos = [...b.confirmables, ...b.sinPareja];
  const pend = todos.filter((m) => !hechos[m.id]).length;
  const seguras = b.confirmables.filter((m) => !hechos[m.id]);
  const Importe = ({ v }) => <span className={`dmo-bimp${v > 0 ? ' mas' : ' menos'}`}>{con(v)}</span>;
  const Cabecera = ({ m }) => (
    <div className="dmo-mov-fila">
      <span className="dmo-fecha">{m.fecha}</span>
      <span className="dmo-txt-c"><b>{m.t}</b><small>{m.s}</small></span>
      <Importe v={m.v} />
    </div>
  );
  const Hecho = ({ txt }) => <p className="dmo-hecho"><Ico n="tic" />{txt}</p>;
  return (
    <Movil titulo="Banco" activa="mas">
      <Volver>Tesorería</Volver>
      <h3 className="dmo-h1">Banco</h3>
      <div className="dmo-saldo"><span className="dmo-txt-c"><small>Saldo</small><b>{eur(b.saldo)}</b></span><span className="dmo-boton suave peque" aria-hidden>Subir extracto</span></div>
      <div className="dmo-cab2">
        <h4 className="dmo-h2" aria-live="polite">Por revisar <span>{pend}</span></h4>
        {seguras.length > 0 && <button type="button" className="dmo-boton peque" onClick={() => setHechos((h) => ({ ...h, ...Object.fromEntries(seguras.map((m) => [m.id, 'Emparejado'])) }))}>Confirmar las {seguras.length} seguras</button>}
      </div>
      <h5 className="dmo-sub">Por confirmar <span>{b.confirmables.length}</span></h5>
      <ul className="dmo-blista">
        {b.confirmables.map((m) => (
          <li key={m.id} className="dmo-mov">
            <Cabecera m={m} />
            {hechos[m.id] ? <Hecho txt={hechos[m.id]} /> : (
              <>
                <div className="dmo-sug segura"><span className="dmo-sug-t">{m.es[0]}</span><span className="dmo-sug-d">{m.es[1]}<small>{m.es[2]}</small></span></div>
                <div className="dmo-botones">
                  <button type="button" className="dmo-boton peque" onClick={() => marca(m.id, 'Emparejado')} aria-label={`Confirmar el emparejamiento de ${m.t}`}>Confirmar</button>
                  <button type="button" className="dmo-boton suave peque" onClick={() => marca(m.id, 'Ignorado')} aria-label={`Ignorar ${m.t}`}>Ignorar</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <h5 className="dmo-sub">Sin pareja <span>{b.sinPareja.length}</span></h5>
      <ul className="dmo-blista">
        {b.sinPareja.map((m) => (
          <li key={m.id} className="dmo-mov">
            <Cabecera m={m} />
            {hechos[m.id] ? <Hecho txt={hechos[m.id]} /> : (
              <div className="dmo-quees">
                <div className="dmo-eti"><span>Fisquo cree que es</span><div className="dmo-campo sel">{m.clase}</div></div>
                <p className="dmo-nota">{m.ayuda}</p>
                <div className="dmo-botones">
                  <button type="button" className="dmo-boton peque" onClick={() => marca(m.id, m.hecho)} aria-label={`${m.accion}: ${m.t}`}>{m.accion}</button>
                  <button type="button" className="dmo-boton suave peque" onClick={() => marca(m.id, 'Ignorado')} aria-label={`Ignorar ${m.t}`}>Ignorar</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {pend === 0 && <button type="button" className="dmo-enlace" onClick={() => setHechos({})}>Volver a empezar</button>}
    </Movil>
  );
}

// ───────────────────────── 5 · Gestoría ─────────────────────────
// Ajustes › Tu gestoría (como components/Gestoria.js): sus datos, mandar el paquete del trimestre y darle acceso a Fisquo.
function PantallaGestoria({ d }) {
  const g = d.gestoria;
  const [enviado, setEnviado] = useState(false);
  return (
    <Movil titulo="Tu gestoría" activa="mas">
      <Volver>Ajustes</Volver>
      <h3 className="dmo-h1">Tu gestoría</h3>
      <div className="dmo-tarjeta">
        <h4 className="dmo-h2 med">Datos de tu gestoría</h4>
        <div className="dmo-eti"><span>Nombre</span><div className="dmo-campo gris">Gestoría Pons</div></div>
        <div className="dmo-eti"><span>Email</span><div className="dmo-campo gris">gestoria@ejemplo.es</div></div>
      </div>
      <h4 className="dmo-h2">Mandar el paquete ahora</h4>
      <div className="dmo-tarjeta">
        <div className="dmo-eti"><span>Trimestre</span><div className="dmo-campo gris sel">3T 2026</div></div>
        {enviado ? <span className="dmo-boton gris" aria-hidden>Mandar a la gestoría</span> : <button type="button" className="dmo-boton" onClick={() => setEnviado(true)}>Mandar a la gestoría</button>}
        <span className="dmo-boton suave" aria-hidden>Descargar</span>
        {enviado && <p className="dmo-nota ok" role="status">✓ Enviado a gestoria@ejemplo.es</p>}
      </div>
      {enviado ? (
        <>
          <h4 className="dmo-h2">Lo que lleva el paquete</h4>
          <ul className="dmo-lista" aria-live="polite">
            <Fila t="Facturas emitidas" s={`${g.facturas} documentos`}><Pastilla tipo="ok sin">✓</Pastilla></Fila>
            <Fila t="Gastos con sus justificantes" s={`${g.gastos} documentos`}><Pastilla tipo="ok sin">✓</Pastilla></Fila>
            {g.nominas > 0 && <Fila t="Nóminas" s={`${g.nominas} empleados`}><Pastilla tipo="ok sin">✓</Pastilla></Fila>}
            <Fila t={g.modelos} s={g.modelosS}><Pastilla tipo="ok sin">✓</Pastilla></Fila>
          </ul>
          <p className="dmo-pie-t">En Excel y en PDF. Tu gestoría revisa y presenta como siempre, sin perseguirte por los papeles.</p>
          <button type="button" className="dmo-enlace" onClick={() => setEnviado(false)}>Volver a empezar</button>
        </>
      ) : (
        <>
          <h4 className="dmo-h2">Acceso a Fisquo</h4>
          <ul className="dmo-lista">
            <Fila t="Invitar a tu gestoría" s={g.acceso}><Ico n="derecha" className="dmo-i chev" /></Fila>
          </ul>
        </>
      )}
    </Movil>
  );
}

// ───────────────────────── Pasos ─────────────────────────
const pasos = (perfil) => {
  const soc = perfil === 'soc';
  return [
    { id: 'factura', t: 'Factura', sobre: 'facturación', titulo: 'Haces una factura en segundos',
      d: soc ? 'Eliges cliente y concepto. Fisquo calcula el IVA, numera la factura y la deja registrada. Una sociedad no suele llevar retención de IRPF en sus facturas a empresas, así que aquí solo ves el IVA.'
        : 'Eliges cliente y concepto. Fisquo calcula el IVA y el IRPF, numera la factura y la deja registrada.',
      puntos: ['Prueba a cambiar el tipo de IVA: el total se recalcula al momento.', 'Numeración correlativa, sin saltos.'], href: '/funciones/facturacion', Pantalla: PantallaFactura },
    { id: 'gasto', t: 'Gasto con IA', sobre: 'gastos con IA', titulo: 'Una foto al ticket y el gasto está apuntado',
      d: 'La IA lee el proveedor, la fecha, la base y el IVA. Tú revisas lo que ha leído antes de guardarlo.',
      puntos: ['Funciona con foto o PDF.', 'Nada se guarda sin que lo veas.'], href: '/funciones/gastos', Pantalla: PantallaGasto },
    { id: 'impuestos', t: 'Impuestos', sobre: 'impuestos', titulo: 'Sabes cuánto apartar para Hacienda',
      d: soc ? 'Con las facturas, los gastos y las nóminas del trimestre, Fisquo calcula el 303, el 111 y el pago fraccionado del Impuesto sobre Sociedades (202), y te dice cuánto reservar.'
        : 'Con las facturas y los gastos del trimestre, Fisquo calcula las casillas del 303 y del 130 y te dice cuánto reservar.',
      puntos: ['Abre cada modelo para ver su desglose.', 'Son cálculos orientativos: revísalos con tu gestor antes de presentarlos.'], href: '/funciones/impuestos', Pantalla: PantallaImpuestos },
    { id: 'banco', t: 'Banco', sobre: 'el banco', titulo: 'El extracto se cuadra casi solo',
      d: soc ? 'Subes el extracto de tu banco y Fisquo propone la pareja de cada cobro y de cada pago. Las nóminas y los seguros sociales ya los contabiliza con las nóminas; lo que no cuadra, a revisar.'
        : 'Subes el extracto de tu banco y Fisquo propone la pareja de cada cobro y de cada pago. Lo que no cuadra, a revisar.',
      puntos: ['Confirma uno a uno o todos los seguros de golpe.', 'Un cargo sin factura queda sin pareja, a la espera de su gasto.'], href: '/funciones/banco', Pantalla: PantallaBanco },
    { id: 'gestoria', t: 'Gestoría', sobre: 'la gestoría', titulo: 'Tu gestoría ve lo suyo, sin perseguirte',
      d: 'Le mandas el paquete del trimestre en Excel y PDF, o la invitas a Fisquo con su propio acceso. Ella revisa y presenta.',
      puntos: soc ? ['Con su propio acceso ve facturas, gastos, nóminas, impuestos y contabilidad.', 'Su acceso no consume usuarios de tu plan.']
        : ['Con su propio acceso ve facturas, gastos e impuestos.', 'Su acceso no consume usuarios de tu plan.'], href: '/funciones/impuestos', Pantalla: PantallaGestoria },
  ];
};

export default function Recorrido() {
  const [perfil, setPerfil] = useState('aut');
  const [i, setI] = useState(0);
  const botones = useRef([]);
  const PASOS = pasos(perfil);
  const p = PASOS[i];
  const d = PERFILES[perfil];
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
      <div className="dmo-perfil">
        <span id="dmo-perfil-t">Mira el ejemplo de</span>
        <div className="dmo-perfil-b" role="group" aria-labelledby="dmo-perfil-t">
          {Object.entries(PERFILES).map(([k, x]) => <button key={k} type="button" aria-pressed={perfil === k} className={perfil === k ? 'on' : undefined} onClick={() => setPerfil(k)}>{x.nombre}</button>)}
        </div>
      </div>

      <div className="dmo-pasos" role="tablist" aria-label="Pasos de la demo">
        {PASOS.map((x, k) => (
          <button key={x.id} id={`dmo-tab-${x.id}`} type="button" role="tab" aria-selected={k === i} aria-controls="dmo-panel" tabIndex={k === i ? 0 : -1} ref={(el) => { botones.current[k] = el; }} className={k === i ? 'on' : k < i ? 'hecho' : undefined} onKeyDown={(e) => teclas(e, k)} onClick={() => setI(k)}>
            <span className="dmo-pasos-n" aria-hidden>{k + 1}</span><span className="dmo-pasos-t">{x.t}</span>
          </button>
        ))}
      </div>

      <div id="dmo-panel" role="tabpanel" aria-labelledby={`dmo-tab-${p.id}`} className="dmo-escena">
        <div className="dmo-explica">
          <div className="dmo-explica-a">
            <p className="web-kicker">Paso {i + 1} de {PASOS.length}</p>
            <h2>{p.titulo}</h2>
            <p className="dmo-d">{p.d}</p>
          </div>
          <div className="dmo-explica-b">
            <ul className="web-lista">{p.puntos.map((x) => <li key={x}><Icono n="tic" /><span>{x}</span></li>)}</ul>
            <Link href={p.href} className="web-enlace">Saber más sobre {p.sobre}<Icono n="flecha" className="ico web-flecha" /></Link>
          </div>
        </div>
        <div className="dmo-vis">
          <p.Pantalla key={`${perfil}-${p.id}`} d={d} />
          <p className="dmo-aviso">Datos ficticios de ejemplo ({d.corto}). No se guarda nada.</p>
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
