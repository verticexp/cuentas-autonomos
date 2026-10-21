// Previsión de tesorería: lo que se va a cobrar, pagar y liquidar a Hacienda en los próximos meses, con el saldo previsto.
// Sin dependencias de servidor, para poder probarlo.
import { importes, limiteTrimestre, minoracion130, pendienteDe, r2, resumenAnual, trimestre, vencimiento } from './calculos.js';
import { hecho130, hecho303, usa130, usa303 } from './empresa.js';
import { modelo115, modelo202, retencionesProfesionales } from './modelos.js';
import { modelo111, calculoNomina } from './nominas.js';
import { claveProveedor } from './proveedores.js';

// La retención se ingresa a Hacienda; no se transfiere también al proveedor.
const pagoProveedor = (g) => importes(g).total;

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
  for (const g of gastos.filter((g) => !g.nomina && !g.inversion)) {
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
    const importe = r2(porMes.reduce((s, l) => s + l.reduce((t, g) => t + pagoProveedor(g), 0), 0) / 3);
    const retenido = (alquiler) => r2(porMes.reduce((s, l) => s + l.filter((g) => Boolean(g.alquiler) === alquiler).reduce((v, g) => v + importes(g).irpf, 0), 0) / 3);
    out.push({ clave: k, concepto: ultimo.proveedor || ultimo.concepto.replace(/\s*[·-]?\s*\d{4}-\d{2}$/, ''), dia: Number(ultimo.fecha.slice(8)), importe,
      yaEsteMes: lista.some((g) => g.fecha.startsWith(mes)), mesesRegistrados: [...new Set(lista.map((g) => g.fecha.slice(0, 7)))], retAlquiler: retenido(true), retProfesional: retenido(false) });
  }
  return out.filter((x) => x.importe > 0);
}

// Plazos de Hacienda (303, 130, 115 y 111) de cada trimestre entre dos fechas: 1T→20 abr, 2T→20 jul, 3T→20 oct, 4T→30 ene
// (111 y 115, 20 ene), en día hábil como en Impuestos (lib/calculos.js limiteTrimestre): antes un plazo en domingo se
// preveía el domingo. Entra el trimestre si cae dentro cualquiera de sus plazos; modelos: si cae el del 303 y el 130 (el del
// 4T puede pasar al 1 de febrero y quedar fuera aunque el 111 y el 115 del 20 de enero entren).
function plazos(desde, hasta) {
  const out = [];
  const dentro = (f) => f >= desde && f <= hasta;
  for (let y = Number(desde.slice(0, 4)) - 1; y <= Number(hasta.slice(0, 4)); y++) {
    for (const t of [1, 2, 3, 4]) {
      const fecha = limiteTrimestre(t, y);
      if (dentro(fecha) || dentro(limiteTrimestre(t, y, 20))) out.push({ t, anio: y, fecha, modelos: dentro(fecha) });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
const finTrimestre = (anio, t) => ultimoDia(`${anio}-${String(t * 3).padStart(2, '0')}`);

export function prevision({ facturas = [], gastos = [], recurrentes = [], nominas = [], empleados = [], fiscal = {}, pagos130 = {}, pres303 = {}, prorrata = {}, pagos202 = {}, rend130 = {}, cuotaIS = {}, pagadosHacienda = {}, plazo = 0, saldo = null, actividades, hoy, meses = 3 }) {
  const mesHoy = hoy.slice(0, 7);
  const hasta = ultimoDia(masMeses(mesHoy, meses));
  const mov = [];
  const retencionesHabituales = [];
  const add = (m) => { if (m.importe && m.fecha <= hasta) mov.push({ ...m, importe: r2(m.importe) }); };
  const N = [...nominas];
  for (const e of empleados) for (let i = 0; i <= meses; i++) {
    const mes = masMeses(mesHoy, i);
    if (e.alta?.slice(0, 7) > mes || (e.baja && e.baja.slice(0, 7) < mes) || N.some((n) => n.empleado === e.id && n.mes === mes)) continue;
    N.push({ id: `prevista-${e.id}-${mes}`, empleado: e.id, empleadoNombre: e.nombre, mes, bruto: e.bruto, irpfPct: e.irpfPct, ssTrabajadorPct: e.ssTrabajadorPct, ssEmpresaPct: e.ssEmpresaPct, pagada: false, estimada: true });
  }

  // Cobros: facturas sin cobrar (las vencidas, hoy) y las recurrentes que se crearán, cada una a su vencimiento.
  for (const f of facturas) {
    const total = pendienteDe(f); // con signo: una rectificativa pendiente es un reembolso
    if (f.cobrada || !total) continue;
    const v = vencimiento(f, plazo);
    add({ fecha: v < hoy ? hoy : v, tipo: total < 0 ? 'pago' : 'cobro', concepto: f.cliente?.nombre || 'Cliente', detalle: f.concepto, importe: total, url: `/facturas/${encodeURIComponent(f.id)}`, ...(v < hoy ? { vencida: true } : {}) });
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
  for (const g of gastos.filter((x) => x.pendiente && !x.nomina)) {
    add({ fecha: g.fecha < hoy ? hoy : g.fecha, tipo: 'pago', concepto: g.proveedor || g.concepto, detalle: g.proveedor ? g.concepto : 'Pendiente de pagar', importe: -pagoProveedor(g), url: `/gastos/${encodeURIComponent(g.id)}` });
  }

  // Nóminas ya generadas: neto a final de mes y seguros a final del siguiente.
  // Las históricas sin estado explícito se consideran pagadas en su fecha, como en contabilidad.
  for (const n of N) {
    const c = calculoNomina(n);
    const fecha = n.pagado || ultimoDia(n.mes);
    if (n.pagada === false || (n.pagada !== true && fecha >= hoy)) add({ fecha: fecha < hoy ? hoy : fecha, tipo: 'pago', concepto: `Nómina ${n.empleadoNombre || ''}`.trim(), detalle: n.estimada ? `${n.mes} · estimada con el sueldo del empleado` : n.mes, importe: -c.neto, ...(n.estimada ? { estimado: true } : { url: `/nominas/${encodeURIComponent(n.id)}` }) });
    const seguros = ultimoDia(masMeses(n.mes, 1));
    if (seguros >= hoy) add({ fecha: seguros, tipo: 'pago', concepto: `Seguridad Social ${n.empleadoNombre || ''}`.trim(), detalle: n.mes, importe: -c.seguros });
  }
  for (const h of gastosHabituales(gastos, hoy)) {
    for (let i = 0; i <= meses; i++) {
      const m = masMeses(mesHoy, i);
      const fecha = diaDelMes(m, h.dia);
      if (h.mesesRegistrados.includes(m) || (i === 0 && fecha < hoy)) continue;
      add({ fecha, tipo: 'pago', concepto: h.concepto, detalle: 'Cada mes (media de los 3 últimos)', importe: -h.importe, habitual: true });
      retencionesHabituales.push({ fecha, alquiler: h.retAlquiler, profesional: h.retProfesional });
    }
  }

  // Hacienda: los modelos de cada trimestre aún no marcado como presentado. Los trimestres que siguen abiertos se estiman
  // con lo apuntado hasta hoy. Los 130 previstos cuentan como pagados para el siguiente (si no, se contarían dos veces).
  const c303 = usa303(fiscal);
  const c130 = usa130(fiscal);
  const nominasPrevistas = N.map((n) => n.pagada === false ? { ...n, pagada: true, pagado: (n.pagado || ultimoDia(n.mes)) < hoy ? hoy : (n.pagado || ultimoDia(n.mes)) } : n);
  const gastosPrevistos = gastos.map((g) => g.pendiente ? { ...g, pendiente: false, pagado: g.fecha < hoy ? hoy : g.fecha } : g);
  const pagosPrevistos = {};
  for (const p of plazos(hoy, hasta)) {
    const pagos = { ...(pagos130[p.anio] || {}), ...(pagosPrevistos[p.anio] || {}) };
    // Cada modelo por su cuenta: lo ya presentado no se vuelve a prever (111 y 115, cuando ya están los dos).
    const presentado303 = !c303 || hecho303(pres303, pagos130, p.anio, p.t);
    const presentado130 = !c130 || hecho130(pagos130, p.anio, p.t);
    if ((c303 || c130) ? presentado303 && presentado130 : hecho130(pagos130, p.anio, p.t)) continue;
    const pend303 = p.modelos && !presentado303;
    const pend130 = p.modelos && !presentado130;
    const q = resumenAnual(facturas, gastos, p.anio, pagos, actividades, { ivaCoste: !c303, regimen: fiscal.tipo, minoracion: c130 ? minoracion130(rend130[p.anio - 1]) : 0, iva: { pres303, prorrata } }).trimestres[p.t - 1];
    const estimado = hoy <= finTrimestre(p.anio, p.t);
    const base = { fecha: p.fecha, tipo: 'hacienda', detalle: estimado ? 'Estimado con lo apuntado hasta hoy' : `${p.t}T ${p.anio}`, ...(estimado ? { estimado: true } : {}) };
    if (pend303 && q.ivaIngresar > 0) add({ ...base, concepto: `IVA (303) del ${p.t}T`, importe: -q.ivaIngresar });
    if (pend130) {
      add({ ...base, concepto: `IRPF (130) del ${p.t}T`, importe: -q.m130 });
      pagosPrevistos[p.anio] = { ...(pagosPrevistos[p.anio] || {}), [p.t]: q.m130 };
    }
    // 111 y 115 del 4T: hasta el 20 de enero (no el 30). Si ese día ya pasó, se deja en el plazo general. Se dan por
    // presentados con el 303 o el 130 del trimestre (se suelen presentar juntos y Fisquo no los marca aparte).
    const enero20 = limiteTrimestre(4, p.anio, 20);
    const ret = { ...base, fecha: p.t === 4 && enero20 >= hoy ? enero20 : p.fecha };
    const habituales = retencionesHabituales.filter((r) => r.fecha.startsWith(`${p.anio}-`) && trimestre(r.fecha) === p.t);
    const m115 = r2(modelo115(gastosPrevistos, p.anio, p.t).retenciones + habituales.reduce((s, r) => s + r.alquiler, 0));
    if (m115 > 0) add({ ...ret, concepto: `Alquiler (115) del ${p.t}T`, importe: -m115 });
    const m111 = r2(modelo111(nominasPrevistas, p.anio, p.t).retenciones + retencionesProfesionales(gastosPrevistos, p.anio, p.t).retenciones + habituales.reduce((s, r) => s + r.profesional, 0));
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
  // Los modelos marcados como pagados después de la fecha del saldo aún no salen en él: se restan hasta que llegue el extracto.
  const descontado = saldo ? pagadosSinExtracto({ facturas, gastos, fiscal, pagos130, pres303, prorrata, rend130, pagadosHacienda, saldo, actividades }) : [];
  const inicial = r2((Number(saldo?.importe) || 0) - descontado.reduce((t, d) => t + d.importe, 0));
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
  return { desde: hoy, hasta, inicial, descontado, conSaldo: Boolean(saldo), movimientos: mov, meses: porMes, entra: tot('entra'), sale: tot('sale'), hacienda: tot('hacienda'), final: corre, minimo };
}

// Pagos de 303 y 130 marcados (clave «año-t-modelo» → { fecha, en }) posteriores al saldo: el 130 por lo anotado, el 303 por lo calculado.
export function pagadosSinExtracto({ facturas = [], gastos = [], fiscal = {}, pagos130 = {}, pres303 = {}, prorrata = {}, rend130 = {}, pagadosHacienda = {}, saldo, actividades }) {
  const out = [];
  for (const [k, p] of Object.entries(pagadosHacienda || {})) {
    const [anio, t, modelo] = k.split('-');
    const y = Number(anio), q = Number(t);
    if (!p?.fecha || !saldo?.fecha) continue;
    const despues = p.fecha > saldo.fecha || (p.fecha === saldo.fecha && saldo.en && p.en > saldo.en);
    if (!despues) continue;
    let importe = 0;
    if (modelo === '130') importe = Number(pagos130?.[y]?.[q]) || 0;
    else if (modelo === '303') importe = Math.max(0, resumenAnual(facturas, gastos, y, pagos130[y] || {}, actividades, { regimen: fiscal.tipo, minoracion: usa130(fiscal) ? minoracion130(rend130[y - 1]) : 0, iva: { pres303, prorrata } }).trimestres[q - 1]?.ivaIngresar || 0);
    if (importe > 0) out.push({ modelo, anio: y, t: q, fecha: p.fecha, importe: r2(importe) });
  }
  return out;
}
