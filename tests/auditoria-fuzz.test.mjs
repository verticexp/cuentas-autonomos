// Auditoría por simulación (octubre 2026): 1.000 empresas ficticias generadas con una semilla fija y, para cada una,
// las cuentas recalculadas por otro camino (en céntimos enteros) y comparadas con lib/. Si algo falla, el mensaje dice la
// semilla de la empresa para reproducirla.
import test from 'node:test';
import assert from 'node:assert/strict';
import { importes, desglose, casillas303, liquidaciones303, resumenAnual, pagosDe, saldoDe, siguienteNumero, numeroFactura, limiteTrimestre, ivaGasto, trimestre } from '../lib/calculos.js';
import { modelo347, modelo390, modelo349, modelo115, cuotaEscala, borradorRenta, borradorSociedades, LIMITE_347 } from '../lib/modelos.js';
import { generarAsientos, balanceContable, pygContable } from '../lib/asientos.js';
import { acumulada, valorBien } from '../lib/amortizaciones.js';
import { calculoNomina } from '../lib/nominas.js';
import { parseImporte } from '../lib/importe.js';
import { categoriaDe } from '../lib/categorias.js';

const EMPRESAS = 1000;
const ANIO = 2026;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const c = (x) => Math.round(x * 100); // a céntimos
const eur = (x) => Math.round(x) / 100;
// Redondeo de céntimos de referencia (mitad lejos del cero) sobre milésimas de céntimo enteras.
const rc = (milicent) => Math.sign(milicent) * Math.round(Math.abs(milicent) / 1000);

function empresa(seed) {
  const R = rng(seed);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const fecha = (anio = ANIO) => `${anio}-${String(1 + Math.floor(R() * 12)).padStart(2, '0')}-${String(1 + Math.floor(R() * 28)).padStart(2, '0')}`;
  const importe = (max) => Math.round(R() * max * 100) / 100 || 0.01;
  const clientes = Array.from({ length: 1 + Math.floor(R() * 6) }, (_, i) => ({ nombre: `Cliente ${seed}-${i}`, nif: pick(['B12345674', '12345678Z', 'DE123456789', 'FR12345678901', '', 'US123']) }));
  const facturas = [];
  const nF = Math.floor(R() * 40);
  for (let i = 0; i < nF; i++) {
    const anio = R() < 0.15 ? ANIO - 1 : ANIO;
    const cliente = pick(clientes);
    const f = { id: `f${i}`, fecha: fecha(anio), anio, serie: '', numero: i + 1, actividad: pick(['dj', 'vertice']), cliente, irpfPct: pick([0, 0, 7, 15]) };
    if (R() < 0.5) {
      f.lineas = Array.from({ length: 1 + Math.floor(R() * 4) }, () => ({ concepto: 'x', cantidad: pick([1, 2, 3, 0.5, 1.25]), precio: importe(900), dto: pick([0, 0, 10, 15.5]), ivaPct: pick([21, 21, 10, 4, 0]) }));
      f.base = eur(f.lineas.reduce((s, l) => s + c(Math.round(l.cantidad * l.precio * (1 - l.dto / 100) * 100 + 1e-9) / 100), 0));
      f.ivaPct = f.lineas[0].ivaPct;
    } else {
      f.base = importe(3000);
      f.ivaPct = pick([21, 21, 10, 4, 0]);
    }
    if (R() < 0.08) { f.rectifica = 'x'; f.serie = 'R'; f.base = -f.base; if (f.lineas) f.lineas = f.lineas.map((l) => ({ ...l, precio: -l.precio })); }
    if (R() < 0.12) f.recargo = true;
    if (R() < 0.4) f.cobrada = true;
    else if (R() < 0.3) f.pagos = [{ fecha: f.fecha, importe: importe(500) }];
    facturas.push(f);
  }
  const gastos = [];
  const nG = Math.floor(R() * 40);
  for (let i = 0; i < nG; i++) {
    const g = { id: `g${i}`, fecha: fecha(R() < 0.15 ? ANIO - 1 : ANIO), actividad: pick(['dj', 'vertice']), concepto: pick(['Material', 'Gestoría', 'Luz', 'Alquiler oficina', 'Software', 'Ordenador']), proveedor: pick(['Prov A', 'Prov B', 'Prov C', '']), proveedorNif: pick(['B76543213', 'A58818501', 'IE6388047V', '']), base: importe(2500), ivaPct: pick([21, 21, 10, 4, 0]) };
    if (R() < 0.1) g.deduciblePct = pick([50, 0, 30]);
    if (R() < 0.08) g.alquiler = true;
    if (R() < 0.08 && !g.alquiler) g.irpfPct = 15;
    if (R() < 0.1) { g.inversion = { tipo: pick(['informatica', 'mobiliario', 'transporte', 'maquinaria']) }; g.base = importe(8000); }
    if (R() < 0.1) g.pendiente = true;
    if (!g.ivaPct && R() < 0.5) g.origen = pick(['ue', 'fuera']);
    gastos.push(g);
  }
  return { facturas, gastos };
}

// ---------- Referencias independientes ----------
function refImportes(x) {
  const porTipo = new Map();
  if (x.lineas?.length) for (const l of x.lineas) {
    const b = Math.sign(l.cantidad * l.precio) * Math.round(Math.abs(l.cantidad * l.precio * (1 - l.dto / 100)) * 100 + 1e-6);
    porTipo.set(l.ivaPct, (porTipo.get(l.ivaPct) || 0) + b);
  } else porTipo.set(x.ivaPct, c(x.base));
  let iva = 0, recargo = 0;
  const RE = { 21: 52, 10: 14, 4: 5 }; // décimas de punto
  for (const [pct, b] of porTipo) { iva += rc(b * pct * 10); if (x.recargo && RE[pct]) recargo += rc(b * RE[pct]); }
  const base = c(x.base);
  const irpf = rc(base * (x.alquiler ? 19 : x.irpfPct || 0) * 10);
  return { base, iva, recargo, irpf, total: base + iva + recargo - irpf };
}

const delT = (l, t, anio = ANIO) => l.filter((x) => x.fecha.startsWith(`${anio}-`) && trimestre(x.fecha) === t);
function ref303(facturas, gastos, t) {
  let devengado = 0, deducible = 0;
  for (const f of delT(facturas, t)) { const r = refImportes(f); devengado += r.iva + r.recargo; }
  for (const g of delT(gastos, t)) {
    const iva = refImportes(g).iva;
    const auto = (!g.ivaPct && (g.origen === 'ue' || g.origen === 'fuera' || (!g.origen && /^IE/.test(g.proveedorNif)))) ? rc(c(g.base) * 210) : 0;
    devengado += auto;
    const p = g.deduciblePct ?? 100;
    deducible += p === 100 ? iva + auto : rc((iva + auto) * p * 10);
  }
  return devengado - deducible;
}

const fallos = [];
const comprobar = (cond, msg) => { if (!cond) fallos.push(msg); };
let comprobaciones = 0;
const ok = (cond, msg) => { comprobaciones++; comprobar(cond, msg); };

test(`simulación: ${EMPRESAS} empresas ficticias contra cálculos de referencia`, () => {
  for (let seed = 1; seed <= EMPRESAS; seed++) {
    const { facturas, gastos } = empresa(seed);
    const E = `empresa ${seed}`;

    // 1. Importes de cada documento: base + IVA − retención, IVA por tipo sobre la suma de bases del tipo.
    for (const x of [...facturas, ...gastos]) {
      const i = importes(x), r = refImportes(x);
      ok(c(i.iva) === r.iva && c(i.recargo || 0) === r.recargo && c(i.irpf) === r.irpf && c(i.total) === r.total, `${E} ${x.id}: importes ${JSON.stringify(i)} ≠ ref ${JSON.stringify(r)}`);
      ok(c(desglose(x).reduce((s, d) => s + d.base, 0)) === c(x.base), `${E} ${x.id}: el desglose no suma la base`);
      // Espejo: la rectificativa total de un documento es su negativo exacto.
      const espejo = x.lineas ? { ...x, base: -x.base, lineas: x.lineas.map((l) => ({ ...l, precio: -l.precio })) } : { ...x, base: -x.base };
      ok(c(importes(espejo).total) === -c(i.total), `${E} ${x.id}: la rectificativa no es el espejo exacto`);
    }

    // 2. Cobros: lo pagado más el saldo es el total (si no se cobró de más) y el saldo nunca es negativo.
    for (const f of facturas) {
      const t = importes(f).total, pagado = pagosDe(f).reduce((s, p) => s + p.importe, 0);
      ok(saldoDe(f) >= 0, `${E} ${f.id}: saldo negativo`);
      if (t > 0 && pagado <= t) ok(c(pagado) + c(saldoDe(f)) === c(t), `${E} ${f.id}: pagado ${pagado} + saldo ${saldoDe(f)} ≠ total ${t}`);
    }

    // 3. 303 de cada trimestre: casilla 46 = devengado − deducible, y 27 − 45 = 46.
    let suma46 = 0;
    for (const t of [1, 2, 3, 4]) {
      const k = casillas303(facturas, gastos, ANIO, t);
      ok(c(k['27']) - c(k['45']) === c(k['46']), `${E} T${t}: 27 − 45 ≠ 46`);
      ok(c(k['46']) === ref303(facturas, gastos, t), `${E} T${t}: casilla 46 ${k['46']} ≠ ref ${eur(ref303(facturas, gastos, t))}`);
      for (const cas of ['01', '03', '04', '06', '07', '09']) ok(k[cas] >= 0, `${E} T${t}: casilla ${cas} negativa (${k[cas]})`);
      suma46 += c(k['46']);
    }
    // 390 = suma de los cuatro 303.
    ok(c(modelo390(facturas, gastos, ANIO).resultado) === suma46, `${E}: el 390 no es la suma de los 303`);

    // 4. Compensación del 303: nunca se ingresa negativo y lo ingresado menos lo pendiente es la suma de los brutos.
    const L = liquidaciones303(facturas, gastos, ANIO);
    for (const q of L) ok(q.ingresar >= 0 && q.compensado <= q.anterior + 0.001, `${E} T${q.t}: compensación imposible ${JSON.stringify(q)}`);
    const L0 = liquidaciones303(facturas, gastos, ANIO - 1);
    const pendIni = c(L0.at(-1).pendiente);
    const ingresado = L.reduce((s, q) => s + c(q.ingresar), 0), brutos = L.reduce((s, q) => s + c(q.bruto), 0);
    ok(ingresado - c(L.at(-1).pendiente) === brutos - pendIni, `${E}: la compensación del 303 pierde o crea dinero`);

    // 5. 130 recalculado: presentado cada trimestre con lo que sale, el acumulado pagado más las retenciones cubre el 20 %.
    const pagos = {};
    let res;
    for (const t of [1, 2, 3, 4]) { res = resumenAnual(facturas, gastos, ANIO, pagos); pagos[t] = res.trimestres[t - 1].m130; }
    const q4 = resumenAnual(facturas, gastos, ANIO, pagos).trimestres[3];
    const totalPagado = Object.values(pagos).reduce((s, v) => s + c(v), 0);
    const debido = Math.max(0, rc(c(Math.max(0, q4.rendAcum)) * 200) - c(q4.retAcum));
    ok(totalPagado >= debido - 1, `${E}: 130 pagado ${eur(totalPagado)} < 20 % del rendimiento menos retenciones ${eur(debido)}`);
    // Ingresos del 130 = bases de las facturas del año.
    ok(c(q4.ingAcum) === facturas.filter((f) => f.fecha.startsWith(`${ANIO}-`)).reduce((s, f) => s + c(f.base), 0), `${E}: ingresos del 130 ≠ suma de bases`);
    ok(q4.difJust <= 2000 && q4.difJust >= 0, `${E}: difícil justificación fuera de rango`);

    // 6. Renta y Sociedades: cuotas coherentes.
    const renta = borradorRenta(facturas, gastos, ANIO, pagos);
    ok(renta.cuota >= 0 && renta.cuota <= renta.rendimiento * 0.47 + 0.01, `${E}: cuota de la renta fuera de rango`);
    const is = borradorSociedades(facturas, gastos, ANIO);
    ok(c(is.cuota) === is.tramos.reduce((s, x) => s + c(x.cuota), 0), `${E}: cuota del IS ≠ suma de tramos`);

    // 7. 347: solo se declara quien pasa de 3.005,06 € y el total es la suma de sus trimestres.
    const m347 = modelo347(facturas, gastos, ANIO);
    for (const o of [...m347.ventas, ...m347.compras]) {
      ok(Math.abs(o.total) > LIMITE_347, `${E}: 347 declara a ${o.nombre} por ${o.total}`);
      ok(c(o.total) === o.trimestres.reduce((s, x) => s + c(x), 0), `${E}: 347 de ${o.nombre} no suma sus trimestres`);
    }

    // 8. 349 de las ventas = casilla 59 del 303. Lo que un abono deja en negativo no va en el 349 (no admite bases
    // negativas): queda aparte, en negativos.
    for (const t of [1, 2, 3, 4]) {
      const m349 = modelo349(facturas, ANIO, t);
      const v349 = [...m349.operadores, ...m349.negativos].filter((o) => o.clave !== 'A' && o.clave !== 'I').reduce((s, o) => s + c(o.base), 0);
      ok(v349 === c(casillas303(facturas, gastos, ANIO, t)['59']), `${E} T${t}: 349 ≠ casilla 59`);
    }

    // 9. 115: 19 % de los alquileres pagados.
    for (const t of [1, 2, 3, 4]) {
      const m = modelo115(gastos, ANIO, t);
      ok(m.retenciones >= 0 && Math.abs(m.retenciones - m.base * 0.19) <= 0.01 * (m.perceptores + gastos.length), `${E} T${t}: 115 ≠ 19 % de la base`);
    }

    // 10. Contabilidad: cada asiento cuadra y el balance también, para autónomo y sociedad.
    for (const fiscal of [{ tipo: 'autonomo', iva: 'general' }, { tipo: 'sociedad', iva: 'general' }, { tipo: 'autonomo', iva: 'exento' }]) {
      const A = generarAsientos({ facturas, gastos, fiscal }, `${ANIO}-12-31`);
      for (const a of A) {
        const d = a.lineas.reduce((s, l) => s + c(l.debe), 0), h = a.lineas.reduce((s, l) => s + c(l.haber), 0);
        ok(d === h, `${E} ${fiscal.tipo}/${fiscal.iva}: asiento «${a.concepto}» del ${a.fecha} no cuadra (${eur(d)} / ${eur(h)})`);
      }
      const B = balanceContable(A, `${ANIO}-12-31`, { sociedad: fiscal.tipo === 'sociedad' });
      ok(c(B.total) === c(B.totalPasivo), `${E} ${fiscal.tipo}/${fiscal.iva}: el balance no cuadra (${B.total} / ${B.totalPasivo})`);
      // Cifra de negocios = suma de bases de las facturas del año.
      const P = pygContable(A, { desde: `${ANIO}-01-01`, hasta: `${ANIO}-12-31` });
      const cifra = P.partidas.find((p) => p.id === 'cifra').importe;
      ok(c(cifra) === facturas.filter((f) => f.fecha.startsWith(`${ANIO}-`)).reduce((s, f) => s + c(f.base), 0), `${E} ${fiscal.tipo}: cifra de negocios ${cifra} ≠ suma de bases`);
    }

    // 11. Amortización: nunca pasa del valor del bien y se completa con los años.
    for (const g of gastos.filter((x) => x.inversion)) {
      const v = valorBien(g);
      ok(acumulada(g, `${ANIO}-12-31`) <= v, `${E} ${g.id}: amortizado más que el valor`);
      ok(acumulada(g, `${ANIO + 40}-12-31`) === v, `${E} ${g.id}: no se amortiza entero`);
    }

    // 12. Numeración correlativa sin huecos ni duplicados.
    const nums = facturas.filter((f) => f.anio === ANIO && !f.serie).map(numeroFactura);
    ok(new Set(nums).size === nums.length, `${E}: números de factura duplicados`);
    ok(siguienteNumero(facturas, ANIO) === Math.max(0, ...facturas.filter((f) => f.anio === ANIO && !f.serie).map((f) => f.numero)) + 1, `${E}: siguiente número mal`);

    // 13. IVA de cada gasto: deducible + no deducible = soportado.
    for (const g of gastos) { const v = ivaGasto(g); ok(c(v.deducible) + c(v.noDeducible) === c(v.soportado), `${E} ${g.id}: el IVA del gasto no se reparte entero`); }
  }

  // 14. Escala del IRPF: continua, creciente y con el tipo marginal correcto en cada tramo.
  let prev = -1;
  for (let b = 0; b <= 400000; b += 137) { const q = cuotaEscala(b); ok(q >= prev, `escala decrece en ${b}`); prev = q; }
  ok(cuotaEscala(12450) === 2365.5 && cuotaEscala(20200) === 4225.5 && cuotaEscala(35200) === 8725.5 && cuotaEscala(60000) === 17901.5, 'escala: cuotas en los saltos');

  // 15. Plazos: el límite nunca cae en fin de semana y siempre después del trimestre.
  for (let y = 2020; y <= 2035; y++) for (const t of [1, 2, 3, 4]) {
    const l = limiteTrimestre(t, y);
    const d = new Date(`${l}T12:00:00Z`).getUTCDay();
    ok(d !== 0 && d !== 6, `plazo ${t}T ${y} en fin de semana (${l})`);
    ok(l > `${y}-${['03-31', '06-30', '09-30', '12-31'][t - 1]}`, `plazo ${t}T ${y} antes del cierre`);
  }

  // 16. Nóminas: bruto = neto + IRPF + Seguridad Social del trabajador.
  const R = rng(7);
  for (let i = 0; i < 500; i++) {
    const n = { bruto: Math.round(R() * 600000) / 100, irpfPct: Math.round(R() * 30), ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 };
    const x = calculoNomina(n);
    ok(c(x.neto) + c(x.irpf) + c(x.ssTrabajador) === c(x.bruto), `nómina ${n.bruto}: no cuadra`);
  }

  // 17. Importes escritos a mano en formato español e inglés.
  for (const [txt, v] of [['1.234,56', 1234.56], ['1,234.56', 1234.56], ['1234,5', 1234.5], ['12.000', 12000], ['0,99 €', 0.99], ['€ 1.000.000,00', 1e6], ['1 234,56', 1234.56], ['100', 100], ['3,5', 3.5]]) ok(parseImporte(txt) === v, `parseImporte(${txt}) = ${parseImporte(txt)} ≠ ${v}`);

  // 18. Categorías propuestas: palabras sueltas, no trozos de otras.
  for (const [concepto, no] of [['Soporte técnico web', '624'], ['Diseño digital del logo', '628'], ['Grupos de WhatsApp Business', '624'], ['Tarjeta de visita', '642'], ['Secretaria virtual', '642'], ['Importe pendiente proveedor', '624'], ['Tasación del vehículo', '631']]) ok(categoriaDe({ concepto }) !== no, `categoría: «${concepto}» propone ${categoriaDe({ concepto })}`);

  if (fallos.length) {
    const resumen = [...new Set(fallos.map((m) => m.replace(/empresa \d+/, 'empresa N').replace(/[gf]\d+/, 'x').replace(/[\d.,-]+/g, '#')))];
    console.log(`\n${fallos.length} fallos en ${comprobaciones} comprobaciones. Tipos:\n${resumen.slice(0, 40).join('\n')}\nEjemplos:\n${fallos.slice(0, 15).join('\n')}`);
  } else console.log(`\n${comprobaciones} comprobaciones, 0 fallos`);
  assert.equal(fallos.length, 0);
});
