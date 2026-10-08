// Previsión de tesorería: lo que se va a cobrar, pagar y liquidar a Hacienda en los próximos meses, con el saldo previsto.
// Sin dependencias de servidor, para poder probarlo.
import { importes, minoracion130, r2, resumenAnual, vencimiento } from './calculos.js';
import { usa130, usa303 } from './empresa.js';
import { modelo115, modelo202, retencionesProfesionales } from './modelos.js';
import { modelo111 } from './nominas.js';
import { claveProveedor, totalDe } from './proveedores.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const masMeses = (mes, n) => { const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const ultimoDia = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
const diaDelMes = (mes, dia) => `${mes}-${String(Math.min(Number(dia), Number(ultimoDia(mes).slice(8)))).padStart(2, '0')}`;
export const nombreMesT = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

// Gastos que se repiten: mismo proveedor (o mismo concepto sin números ni meses) en cada uno de los 3 meses anteriores.
const claveConcepto = (c) => String(c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(new RegExp(`\\b(${MESES.join('|')})\\b`, 'g'), '').replace(/[0-9]/g, '').replace(/[^a-z]+/g, ' ').trim();
const claveGasto = (g) => (g.proveedor ? `p:${claveProveedor(g)}` : `c:${claveConcepto(g.concepto)}`);

export function gastosHabituales(gastos, hoy) {
  const mes = hoy.slice(0, 7);
  const previos = [3, 2, 1].map((i) => masMeses(mes, -i));
  const m = new Map();
  for (const g of gastos) {
    const k = claveGasto(g);
    if (!k.slice(2)) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(g);
  }
  const out = [];
  for (const [k, lista] of m) {
    const porMes = previos.map((p) => lista.filter((g) => g.fecha.startsWith(p)));
    if (porMes.some((l) => !l.length)) continue;
    const ultimo = porMes[2].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const importe = r2(porMes.reduce((s, l) => s + l.reduce((t, g) => t + totalDe(g), 0), 0) / 3);
    out.push({ clave: k, concepto: ultimo.proveedor || ultimo.concepto.replace(/\s*[·-]?\s*\d{4}-\d{2}$/, ''), dia: Number(ultimo.fecha.slice(8)), importe,
      yaEsteMes: lista.some((g) => g.fecha.startsWith(mes)) });
  }
  return out.filter((x) => x.importe > 0);
}

// Plazos de Hacienda (303, 130, 115 y 111) entre dos fechas: 1T→20 abr, 2T→20 jul, 3T→20 oct, 4T→30 ene (111 y 115, 20 ene).
function plazos(desde, hasta) {
  const out = [];
  for (let y = Number(desde.slice(0, 4)) - 1; y <= Number(hasta.slice(0, 4)); y++) {
    for (const [t, fecha] of [[1, `${y}-04-20`], [2, `${y}-07-20`], [3, `${y}-10-20`], [4, `${y + 1}-01-30`]]) if (fecha >= desde && fecha <= hasta) out.push({ t, anio: y, fecha });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
const finTrimestre = (anio, t) => ultimoDia(`${anio}-${String(t * 3).padStart(2, '0')}`);

export function prevision({ facturas = [], gastos = [], recurrentes = [], nominas = [], fiscal = {}, pagos130 = {}, pagos202 = {}, rend130 = {}, cuotaIS = {}, plazo = 0, saldo = null, actividades, hoy, meses = 3 }) {
  const mesHoy = hoy.slice(0, 7);
  const hasta = ultimoDia(masMeses(mesHoy, meses));
  const mov = [];
  const add = (m) => { if (m.importe && m.fecha <= hasta) mov.push({ ...m, importe: r2(m.importe) }); };

  // Cobros: facturas sin cobrar (las vencidas, hoy) y las recurrentes que se crearán, cada una a su vencimiento.
  for (const f of facturas) {
    const total = importes(f).total;
    if (f.cobrada || total <= 0) continue;
    const v = vencimiento(f, plazo);
    add({ fecha: v < hoy ? hoy : v, tipo: 'cobro', concepto: f.cliente?.nombre || 'Cliente', detalle: f.concepto, importe: total, url: `/facturas/${encodeURIComponent(f.id)}`, ...(v < hoy ? { vencida: true } : {}) });
  }
  for (const r of recurrentes.filter((x) => x.activa)) {
    const total = importes(r.plantilla).total;
    if (total <= 0) continue;
    for (let i = 0; i <= meses; i++) {
      const m = masMeses(mesHoy, i);
      if ((r.ultima || '') >= m) continue;
      const emitida = diaDelMes(m, r.dia) < hoy ? hoy : diaDelMes(m, r.dia);
      add({ fecha: vencimiento({ fecha: emitida }, plazo), tipo: 'cobro', concepto: r.plantilla.cliente?.nombre || 'Cliente', detalle: `Recurrente · ${r.plantilla.concepto || ''}`.trim(), importe: total, recurrente: true });
    }
  }

  // Pagos: gastos pendientes de pagar y los gastos que se repiten cada mes.
  for (const g of gastos.filter((x) => x.pendiente)) {
    add({ fecha: g.fecha < hoy ? hoy : g.fecha, tipo: 'pago', concepto: g.proveedor || g.concepto, detalle: g.proveedor ? g.concepto : 'Pendiente de pagar', importe: -totalDe(g), url: `/gastos/${encodeURIComponent(g.id)}` });
  }
  for (const h of gastosHabituales(gastos, hoy)) {
    for (let i = 0; i <= meses; i++) {
      const m = masMeses(mesHoy, i);
      const fecha = diaDelMes(m, h.dia);
      if (i === 0 && (h.yaEsteMes || fecha < hoy)) continue;
      add({ fecha, tipo: 'pago', concepto: h.concepto, detalle: 'Cada mes (media de los 3 últimos)', importe: -h.importe, habitual: true });
    }
  }

  // Hacienda: los modelos de cada trimestre aún no marcado como presentado. Los trimestres que siguen abiertos se estiman
  // con lo apuntado hasta hoy. Los 130 previstos cuentan como pagados para el siguiente (si no, se contarían dos veces).
  const c303 = usa303(fiscal);
  const c130 = usa130(fiscal);
  const pagosPrevistos = {};
  for (const p of plazos(hoy, hasta)) {
    const pagos = { ...(pagos130[p.anio] || {}), ...(pagosPrevistos[p.anio] || {}) };
    if ((pagos130[p.anio] || {})[p.t] !== undefined && (pagos130[p.anio] || {})[p.t] !== null) continue;
    const q = resumenAnual(facturas, gastos, p.anio, pagos, actividades, { ivaCoste: !c303, minoracion: c130 ? minoracion130(rend130[p.anio - 1]) : 0 }).trimestres[p.t - 1];
    const estimado = hoy <= finTrimestre(p.anio, p.t);
    const base = { fecha: p.fecha, tipo: 'hacienda', detalle: estimado ? 'Estimado con lo apuntado hasta hoy' : `${p.t}T ${p.anio}`, ...(estimado ? { estimado: true } : {}) };
    if (c303 && q.m303 > 0) add({ ...base, concepto: `IVA (303) del ${p.t}T`, importe: -q.m303 });
    if (c130) {
      add({ ...base, concepto: `IRPF (130) del ${p.t}T`, importe: -q.m130 });
      pagosPrevistos[p.anio] = { ...(pagosPrevistos[p.anio] || {}), [p.t]: q.m130 };
    }
    // 111 y 115 del 4T: hasta el 20 de enero (no el 30). Si ese día ya pasó, se deja en el plazo general.
    const enero20 = `${p.anio + 1}-01-20`;
    const ret = { ...base, fecha: p.t === 4 && enero20 >= hoy ? enero20 : p.fecha };
    const m115 = modelo115(gastos, p.anio, p.t).retenciones;
    if (m115 > 0) add({ ...ret, concepto: `Alquiler (115) del ${p.t}T`, importe: -m115 });
    const m111 = r2(modelo111(nominas, p.anio, p.t).retenciones + retencionesProfesionales(gastos, p.anio, p.t).retenciones);
    if (m111 > 0) add({ ...ret, concepto: `Retenciones (111) del ${p.t}T`, importe: -m111 });
  }

  // 202 de las sociedades (abril, octubre y diciembre), con la cuota del Impuesto sobre Sociedades guardada.
  if (fiscal.tipo === 'sociedad') {
    for (let y = Number(hoy.slice(0, 4)); y <= Number(hasta.slice(0, 4)); y++) {
      for (const x of modelo202(cuotaIS, y)) if (x.pago > 0 && x.fecha >= hoy && pagos202[y]?.[x.p] === undefined) add({ fecha: x.fecha, tipo: 'hacienda', concepto: `Impuesto sobre Sociedades (202) de ${x.mes}`, detalle: `18 % de la cuota de ${x.de}`, importe: -x.pago });
    }
  }

  const orden = { cobro: 0, pago: 1, hacienda: 2 };
  mov.sort((a, b) => a.fecha.localeCompare(b.fecha) || orden[a.tipo] - orden[b.tipo] || b.importe - a.importe);
  const inicial = r2(Number(saldo?.importe) || 0);
  let s = inicial;
  for (const m of mov) { s = r2(s + m.importe); m.saldo = s; }

  const lista = Array.from({ length: meses + 1 }, (_, i) => masMeses(mesHoy, i));
  let corre = inicial;
  const porMes = lista.map((mes) => {
    const l = mov.filter((m) => m.fecha.startsWith(mes));
    const suma = (f) => r2(l.filter(f).reduce((t, m) => t + m.importe, 0));
    const x = { mes, nombre: nombreMesT(mes), entra: suma((m) => m.tipo === 'cobro'), sale: -suma((m) => m.tipo === 'pago'), hacienda: -suma((m) => m.tipo === 'hacienda'), movimientos: l };
    corre = r2(corre + x.entra - x.sale - x.hacienda);
    return { ...x, saldo: corre };
  });
  const minimo = mov.reduce((a, m) => (m.saldo < a.saldo ? { saldo: m.saldo, fecha: m.fecha } : a), { saldo: inicial, fecha: hoy });
  const tot = (k) => r2(porMes.reduce((t, m) => t + m[k], 0));
  return { desde: hoy, hasta, inicial, conSaldo: Boolean(saldo), movimientos: mov, meses: porMes, entra: tot('entra'), sale: tot('sale'), hacienda: tot('hacienda'), final: corre, minimo };
}
