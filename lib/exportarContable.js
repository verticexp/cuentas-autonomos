import { CUENTAS, diario } from './asientos.js';
import { COMPENSACION, baseLinea, bienInversionIva, compraDeBienes, desglose, fechaDevengo, gastoEnCaja, importes, ivaGasto, nifUE, numeroFactura, operacionesCaja, origenGasto } from './calculos.js';
import { conIva, partirIva, pctDeducible, tipoAutoliquidado } from './ivaDeducible.js';
import { operacionDe } from './operaciones.js';
import { NIF_ES } from './verifactuXml.js';
import { controla } from './inventario.js';
import { reccDe, usa303 } from './empresa.js';
import { r2 } from './redondeo.js';
import { zip } from './zip.js';

// SUENLACE formato 4. Posiciones desde 1, longitud y relleno: textos/cuentas a la izquierda con espacios; empresa con
// ceros a la izquierda; importe con signo, 10 enteros (ceros), punto y 2 decimales; porcentajes «xx.xx». Reserva en blanco.
// Registro 0: apunte sin IVA. Registros 1 (factura) o 2 (rectificativa) + 9 (uno por tipo de IVA): la factura con su
// registro de IVA, del que A3 genera el asiento. Registro 4: la factura que rectifica una rectificativa.
// Manual: https://media.a3software.com/a3responde/files/5081-Enlace_contable_descripcion_registros_WEB.pdf
const comunA3 = { formato: [1, 1], empresa: [2, 5], fecha: [7, 8], tipo: [15, 1], generado: [254, 1] };
const A3 = {
  longitud: 254,
  campos: { ...comunA3, cuenta: [16, 12], nombre: [28, 30], lado: [58, 1], documento: [59, 10], linea: [69, 1], concepto: [70, 30], importe: [100, 14], reserva: [114, 138], analitica: [252, 1], moneda: [253, 1] },
};
const A3_CABECERA = {
  longitud: 254,
  campos: { ...comunA3, cuenta: [16, 12], nombre: [28, 30], tipoFactura: [58, 1], documento: [59, 10], linea: [69, 1], concepto: [70, 30], importe: [100, 14], nif: [176, 14], tercero: [190, 40], cp: [230, 5], fechaOperacion: [237, 8], fechaFactura: [245, 8], moneda: [253, 1] },
};
const A3_IVA = {
  longitud: 254,
  campos: { ...comunA3, cuenta: [16, 12], nombre: [28, 30], lado: [58, 1], documento: [59, 10], linea: [69, 1], concepto: [70, 30], subtipo: [100, 2], base: [102, 14], pctIva: [116, 5], cuota: [121, 14], pctRecargo: [135, 5], recargo: [140, 14], pctRetencion: [154, 5], retencion: [159, 14], impreso: [173, 2], sujeta: [175, 1], m415: [176, 1], caja: [177, 1], cuentaIva: [192, 12], cuentaRecargo: [204, 12], cuentaRetencion: [216, 12], cuentaIva2: [228, 12], cuentaRecargo2: [240, 12], analitica: [252, 1], moneda: [253, 1] },
};
const A3_AMPLIACION = { longitud: 254, campos: { ...comunA3, fechaRectificada: [59, 8], numeroRectificada: [67, 10] } };

// XDiario clásico: posiciones desde 1 y longitudes. C = texto a la izquierda,
// espacios a la derecha; N = número a la derecha, espacios a la izquierda;
// F = AAAAMMDD; L = F/T. Decimales con punto, sin separador de miles.
// Campos 1-31 del protocolo: https://grupo.sage.es/ayuda/documentacion/productos/contaplus/Manual_protocolos_ContaPlus.pdf
// Las posiciones coinciden con las del importador de Sage 50 («formato NominaPlus», 255 o más caracteres), que también
// lo lee. Las versiones posteriores de ContaPlus añaden campos al final, que son opcionales.
const CONTAPLUS = {
  longitud: 287,
  campos: {
    asien: [1, 6, 'N'], fecha: [7, 8, 'F'], subcta: [15, 12], contra: [27, 12],
    ptadebe: [39, 16, 'N'], concepto: [55, 25], ptahaber: [80, 16, 'N'], factura: [96, 8, 'N'],
    baseimpo: [104, 16, 'N'], iva: [120, 5, 'N'], recequiv: [125, 5, 'N'], documento: [130, 10],
    departa: [140, 3], clave: [143, 6], estado: [149, 1], ncasado: [150, 6, 'N'], tcasado: [156, 1, 'N'],
    trans: [157, 6, 'N'], cambio: [163, 16, 'N'], debeme: [179, 16, 'N'], haberme: [195, 16, 'N'],
    auxiliar: [211, 1], serie: [212, 1], sucursal: [213, 4], coddivisa: [217, 5], impauxme: [222, 16, 'N'],
    monedauso: [238, 1], eurodebe: [239, 16, 'N'], eurohaber: [255, 16, 'N'], baseeuro: [271, 16, 'N'], noconv: [287, 1, 'L'],
  },
};

// Los programas solo aceptan subcuentas con los mismos dígitos que la empresa de destino (A3, ContaPlus y Sage 50 lo
// comprueban), así que es la gestoría quien elige la longitud. 8 es la más habitual.
export const DIGITOS = { a3: [6, 12], contaplus: [6, 12], contasol: [6, 10] };
export function digitosValidos(formato, digitos) {
  const [min, max] = DIGITOS[formato] || [];
  if (!Number.isInteger(digitos) || !min || digitos < min || digitos > max) throw new Error(max === 10 ? 'Dígitos de subcuenta no válidos (6-10)' : 'Dígitos de subcuenta no válidos (6-12)');
  return digitos;
}

// Se conserva el prefijo de cuatro cifras si existe en el plan de Fisquo.
export function subcuenta(cuenta, digitos = 8) {
  const c = String(cuenta);
  if (!/^[1-7]\d{2,11}$/.test(c)) throw new Error(`Cuenta no válida: ${c}`);
  if (!Number.isInteger(digitos) || digitos < 3 || digitos > 12) throw new Error('Longitud de subcuenta no válida (3-12)');
  if (c.length > digitos) throw new Error(`La cuenta ${c} supera los ${digitos} dígitos de la subcuenta`);
  const prefijo = c.length >= 4 && CUENTAS[c.slice(0, 4)] ? 4 : 3;
  return c.slice(0, prefijo) + '0'.repeat(digitos - c.length) + c.slice(prefijo);
}

const ascii = (v) => String(v ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\x20-\x7e]/gu, ' ');
const decimal = (c) => `${c / 100n}.${String(c % 100n).padStart(2, '0')}`;
const conSigno = (c) => (c < 0n ? `-${decimal(-c)}` : decimal(c));
const registros = (filas) => filas.length ? filas.join('\r\n') + '\r\n' : '';
const nombreDe = (c) => CUENTAS[c] || CUENTAS[String(c).slice(0, 4)] || CUENTAS[String(c).slice(0, 3)] || `Cuenta ${c}`;

function fijo(formato, valores) {
  const registro = Array(formato.longitud).fill(' ');
  for (const [campo, [posicion, longitud, tipo]] of Object.entries(formato.campos)) {
    let valor = ascii(valores[campo]);
    if (tipo === 'N' && valor.length > longitud) throw new Error(`El campo ${campo} supera las ${longitud} posiciones`);
    valor = tipo === 'N' ? valor.padStart(longitud, ' ') : valor.slice(0, longitud).padEnd(longitud, ' ');
    registro.splice(posicion - 1, longitud, ...valor);
  }
  return registro.join('');
}

function centimos(v) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER / 100) throw new Error('Importe contable no válido o demasiado grande');
  return BigInt(r2(n).toFixed(2).replace('.', ''));
}

function preparar(asientos, anio, digitos) {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new Error('Año no válido');
  const orden = { apertura: 0, cierre: 3 };
  const lista = diario(asientos.filter((a) => a.origen?.tipo !== 'regularizacion').slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || (orden[a.origen?.tipo] ?? 1) - (orden[b.origen?.tipo] ?? 1)), anio);
  return lista.map((a) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha) || !Number.isFinite(Date.parse(a.fecha)) || new Date(a.fecha).toISOString().slice(0, 10) !== a.fecha) throw new Error(`Fecha no válida en el asiento ${a.n}`);
    const lineas = a.lineas.map((l) => {
      const debe = centimos(l.debe), haber = centimos(l.haber);
      if (debe && haber) throw new Error(`El asiento ${a.n} tiene debe y haber en el mismo apunte`);
      return { fisquo: String(l.cuenta), cuenta: subcuenta(l.cuenta, digitos), nombre: nombreDe(l.cuenta), debe: (debe > 0n ? debe : 0n) - (haber < 0n ? haber : 0n), haber: (haber > 0n ? haber : 0n) - (debe < 0n ? debe : 0n) };
    }).filter((l) => l.debe || l.haber);
    if (lineas.length < 2) throw new Error(`El asiento ${a.n} necesita al menos dos apuntes con importe`);
    if (lineas.reduce((s, l) => s + l.debe - l.haber, 0n) !== 0n) throw new Error(`El asiento ${a.n} no cuadra al céntimo`);
    return { ...a, lineas };
  });
}

// ---- Registro de IVA de cada factura y cada gasto, sacado de sus datos (no de los asientos) con el mismo reparto que los
// libros registro (lib/librosRegistro.js): una línea por tipo de IVA, la cuota deducible repartida igual (la última se
// lleva el céntimo) y la retención repartida por bases. La parte no deducible de un gasto va en su propia línea (subtipo
// 07 de A3), con la cuota en la cuenta del gasto, como en el asiento. Lo que una factura cobra fuera de la base del IVA
// (lo que no es margen en el REBU o el REAV, el IVA de otro país de la ventanilla única o la compensación del REAGP) va en
// líneas «no sujetas» (sujeta: false), que no entran en el libro del IVA pero sí en el asiento y en el total.
// Subtipos de A3 de las expedidas al 0 % según su operación (lib/operaciones.js); al 0 % sin motivo, exenta.
const SUBTIPO_EXPEDIDA = { exenta: '02', intracomunitaria: '03', 'servicios-ue': '03', exportacion: '06', 'servicios-fuera': '08', isp: '08' };
// Las mismas en ContaPlus, donde el tipo es de la subcuenta de IVA (*3 del protocolo): X entregas UE de bienes, Y de
// servicios, E exportaciones, J no sujetas; exentas y al 0 %, G (régimen general) a 0 %.
const TIPO_CP_EXPEDIDA = { intracomunitaria: 'X', 'servicios-ue': 'Y', exportacion: 'E', 'servicios-fuera': 'J', isp: 'J' };
const nifLimpio = (nif) => String(nif || '').toUpperCase().replace(/[\s.\-/]/g, '').replace(/^ES(?=[0-9A-Z]{9}$)/, '');
// Código postal español de una dirección (A3 lo pide con el NIF para el 347).
const cpDe = (texto) => String(texto || '').match(/\b(?:0[1-9]|[1-4]\d|5[0-2])\d{3}\b/)?.[0] || '';

// La retención se reparte entre las líneas sujetas en proporción a su base; la última se lleva el céntimo.
function repartirRetencion(lineas, ret, pct, cuenta) {
  const sujetas = lineas.filter((l) => l.sujeta);
  const destino = sujetas.length ? sujetas : lineas.slice(0, 1);
  const total = destino.reduce((s, l) => s + l.base, 0);
  let resto = ret;
  destino.forEach((l, k) => {
    const parte = k === destino.length - 1 ? r2(resto) : total ? r2((ret * l.base) / total) : 0;
    resto = r2(resto - parte);
    if (ret) Object.assign(l, { pctRet: Number(pct) || 0, ret: parte, cuentaRet: cuenta });
  });
}

export function registrosIva({ facturas = [], gastos = [], fiscal = {}, productos = [] } = {}) {
  const c303 = usa303(fiscal), recc = reccDe(fiscal);
  // Base de cada tipo que es venta de productos del catálogo con stock (700 en el asiento, lib/asientos.js).
  const conStock = new Set(productos.filter(controla).map((p) => p.id));
  const bienesDe = (f, pct) => (f.lineas || []).filter((l) => Number(l.ivaPct) === Number(pct) && conStock.has(l.producto)).reduce((t, l) => t + baseLinea(l), 0);
  const deCaja = new Set((c303 ? operacionesCaja(facturas, recc) : []).flatMap((g) => g.map((f) => f.id)));
  const R = new Map();
  for (const f of facturas) {
    const i = importes(f), oss = Boolean(f.oss?.pais), caja = deCaja.has(f.id);
    const nif = nifLimpio(f.cliente?.nif), ue = Boolean(nifUE(nif)), op = operacionDe(f);
    const cuentaIva = caja ? '4779' : '477';
    // Impreso: 347 (01) con NIF español, 349 de bienes (02) o de servicios (11) a la UE; ninguno con retención (va al 190
    // de quien paga), en la ventanilla única ni sin NIF.
    const impreso = i.irpf || oss ? '' : ue ? (op === 'intracomunitaria' ? '02' : '11') : NIF_ES.test(nif) ? '01' : '';
    const d = desglose(f);
    const lineas = d.map((x) => (x.fueraBase ? { sujeta: false, base: x.base }
      : { sujeta: true, subtipo: oss ? '07' : x.pct > 0 ? '01' : SUBTIPO_EXPEDIDA[op] || '02', base: x.base, bienes: f.margen ? 0 : r2(bienesDe(f, x.pct)), pct: oss ? 0 : x.pct, cuota: oss ? 0 : x.iva, re: x.re || 0, recargo: x.recargo || 0, impreso, libro: cuentaIva,
        tipoCp: x.pct > 0 ? (x.re ? 'R' : 'G') : TIPO_CP_EXPEDIDA[op] || 'G', ...(oss ? {} : { cuentaIva, cuentaRecargo: cuentaIva }) }));
    if (oss) lineas.push({ sujeta: false, base: r2(d.reduce((s, x) => s + x.iva + (x.recargo || 0), 0)), cuenta: '4750' });
    if (i.compensacion) lineas.push({ sujeta: false, base: i.compensacion });
    repartirRetencion(lineas, i.irpf, f.irpfPct, '473');
    const rect = f.rectifica?.numero && /^\d{4}-\d{2}-\d{2}$/.test(f.rectifica.fecha || '') ? { numero: String(f.rectifica.numero), fecha: f.rectifica.fecha } : null;
    R.set(`factura:${f.id}`, { emitida: true, tipoFactura: '1', rect, numero: numeroFactura(f), correlativo: /^\d{1,8}$/.test(String(f.numero ?? '')) ? String(Number(f.numero)) : '',
      serie: f.serie || '', fecha: f.fecha, fechaOperacion: rect ? rect.fecha : fechaDevengo(f), nif, tercero: f.cliente?.nombre || '', cp: NIF_ES.test(nif) ? cpDe(`${f.cliente?.ciudad || ''} ${f.cliente?.direccion || ''}`) : '', lineas });
  }
  for (const g of gastos) {
    const nif = nifLimpio(g.proveedorNif);
    // Sin factura (ni NIF, ni proveedor, ni IVA) o traído de otro programa: sin registro de IVA, como en los libros.
    if (g.nomina || g.migrado || (!nif && !g.proveedor && !conIva(g))) continue;
    const i = importes(g), origen = origenGasto(g), v = ivaGasto(g), caja = c303 && gastoEnCaja(g, recc);
    const comp = COMPENSACION.includes(Number(g.compensacion)) ? r2(i.compensacion || 0) : 0;
    const compDed = c303 && comp ? r2((comp * pctDeducible(g)) / 100) : 0;
    const tipos = origen ? [{ pct: tipoAutoliquidado(g), base: g.base, iva: r2(g.base * (tipoAutoliquidado(g) / 100)) }] : comp ? [{ pct: Number(g.compensacion), base: g.base, iva: comp }] : desglose(g);
    const subtipo = origen === 'ue' ? '03' : origen ? '04' : comp ? '02' : '01';
    const impreso = i.irpf ? (g.noResidente ? '' : g.alquiler ? '03' : '05') : origen === 'ue' ? (compraDeBienes(g) ? '02' : '11') : origen === 'fuera' ? '' : NIF_ES.test(nif) ? '01' : '';
    const cuentaIva = caja ? '4729' : '472';
    // Tipo de IVA de las subcuentas de ContaPlus: el soportado (472) y, si se autoliquida, el devengado (477).
    const bienes = compraDeBienes(g);
    const [tipoCp, tipoCp2] = origen === 'ue' ? (bienes ? ['C', 'N'] : ['Z', 'V']) : origen ? ['P', 'P'] : comp ? ['A'] : [];
    const lineas = [];
    let antes = 0;
    tipos.forEach((x, k) => {
      const ded = comp ? compDed : c303 ? (k === tipos.length - 1 ? r2(v.deducible - antes) : partirIva(g, x.iva).deducible) : 0;
      antes = r2(antes + ded);
      // cuentaIva vacía: la cuota va a la cuenta del gasto (IVA que no se deduce); cuentaIva2: el IVA autoliquidado.
      const comun = { sujeta: true, pct: x.pct, impreso, caja, tipoCp: tipoCp || (x.re ? 'R' : 'O'), ...(origen ? { cuentaIva2: '477', tipoCp2 } : {}) };
      const recargo = x.recargo ? { re: x.re, recargo: x.recargo } : {};
      const deducible = (base, cuota) => ({ ...comun, subtipo: c303 ? subtipo : '07', base, cuota, ...(c303 ? { cuentaIva, libro: cuentaIva } : {}) });
      const noDeducible = (base, cuota) => ({ ...comun, subtipo: '07', base, cuota });
      const nd = r2(x.iva - ded);
      if (!x.iva || !nd) lineas.push({ ...deducible(x.base, x.iva), ...recargo });
      else if (!ded) lineas.push({ ...noDeducible(x.base, x.iva), ...recargo });
      else { const base = r2((x.base * ded) / x.iva); lineas.push(deducible(base, ded), { ...noDeducible(r2(x.base - base), nd), ...recargo }); }
    });
    repartirRetencion(lineas, i.irpf, g.noResidente ? g.noResidente.pct : g.alquiler ? 19 : g.irpfPct, '4751');
    R.set(`gasto:${g.id}`, { emitida: false, tipoFactura: bienInversionIva(g) ? '3' : '2', rect: null, numero: String(g.numero || ''), correlativo: '', serie: '',
      fecha: g.fecha, fechaOperacion: g.fecha, nif, tercero: g.proveedor || '', cp: '', lineas });
  }
  return R;
}

// Encaja el registro de IVA con el asiento de Fisquo: la cuenta del cliente o proveedor, la de ventas o del gasto de cada
// línea (con ventas de mercaderías y servicios, cada línea se parte entre la 700 y la 705 como el asiento) y lo que el
// programa de destino no sacaría del registro (la baja de un bien vendido, por ejemplo), que va en un asiento aparte
// (ajuste) para que el diario quede igual que el de Fisquo. Importes en céntimos, con el signo del documento.
const IMPUESTOS = new Set(['472', '4729', '477', '4779', '473', '4751', '4750']);
const prop = (x, n, d) => (d ? BigInt(Math.round((Number(x) * Number(n)) / Number(d))) : 0n);
function encajar(reg, a) {
  const saldo = new Map();
  for (const l of a.lineas) saldo.set(l.fisquo, (saldo.get(l.fisquo) || 0n) + l.debe - l.haber);
  const cuentas = [...saldo.keys()];
  const contra = reg.emitida ? (cuentas.find((c) => c.startsWith('430')) || '430') : (cuentas.find((c) => /^(400|410|523)/.test(c)) || '410');
  const ventas = cuentas.filter((c) => /^70[05]/.test(c));
  const principal = reg.emitida ? (ventas[0] || cuentas.find((c) => /^[67]71/.test(c)) || '705')
    : cuentas.filter((c) => c !== contra && !IMPUESTOS.has(c)).sort((x, y) => Number((saldo.get(y) < 0n ? -saldo.get(y) : saldo.get(y)) - (saldo.get(x) < 0n ? -saldo.get(x) : saldo.get(x))))[0] || '629';
  const C = (v) => centimos(v);
  let lineas = reg.lineas.map((l) => ({ ...l, base: C(l.base), cuota: C(l.cuota), recargo: C(l.recargo), ret: C(l.ret), cuenta: l.cuenta || principal }));
  // Mercaderías y servicios en la misma factura: lo de la 700 va a cada tipo según sus líneas de productos con stock (si
  // no se sabe, en proporción a la base); la última línea con mercaderías se lleva el céntimo para que sume el asiento.
  if (reg.emitida && ventas.length === 2) {
    const [c700, c705] = ventas[0].startsWith('700') ? ventas : [ventas[1], ventas[0]];
    const objetivo = -saldo.get(c700), suyas = lineas.filter((l) => l.cuenta === principal);
    const porLineas = suyas.some((l) => l.bienes), peso = (l) => (porLineas ? C(l.bienes) : l.base);
    const total = suyas.reduce((s, l) => s + peso(l), 0n), ultima = suyas.findLastIndex((l) => peso(l));
    let resto = objetivo;
    lineas = lineas.flatMap((l) => {
      if (l.cuenta !== principal) return [l];
      const k = suyas.indexOf(l), base = k === ultima ? resto : k > ultima ? 0n : prop(peso(l), objetivo, total);
      resto -= base;
      const parte = (campo) => prop(l[campo], base, l.base);
      const a700 = { ...l, cuenta: c700, base, cuota: parte('cuota'), recargo: parte('recargo'), ret: parte('ret') };
      const a705 = { ...l, cuenta: c705, base: l.base - base, cuota: l.cuota - a700.cuota, recargo: l.recargo - a700.recargo, ret: l.ret - a700.ret };
      return [a700, a705].filter((x) => x.base || x.cuota || x.recargo || x.ret);
    });
  }
  // El asiento que el programa genera del registro (manual de A3, nota 2), con el signo de Fisquo: debe positivo.
  const s = reg.emitida ? -1n : 1n, generado = new Map();
  const sumar = (c, v) => { if (v) generado.set(c, (generado.get(c) || 0n) + v); };
  let total = 0n;
  for (const l of lineas) {
    sumar(l.cuenta, s * l.base);
    sumar(l.cuentaIva || l.cuenta, s * l.cuota);
    if (l.cuentaIva2) sumar(l.cuentaIva2, -s * l.cuota);
    sumar(l.cuentaRecargo || l.cuenta, s * l.recargo);
    sumar(l.cuentaRet, -s * l.ret);
    total += l.base + (l.cuentaIva2 ? 0n : l.cuota) + l.recargo - l.ret;
  }
  sumar(contra, -s * total);
  const ajuste = [...new Set([...saldo.keys(), ...generado.keys()])].map((c) => [c, (saldo.get(c) || 0n) - (generado.get(c) || 0n)]).filter(([, v]) => v);
  return { contra, lineas, total, ajuste };
}

// Asiento de ajuste: lo del asiento de Fisquo que el registro de IVA no genera, como apuntes sin IVA.
const lineasAjuste = (ajuste, digitos) => ajuste.map(([c, v]) => ({ fisquo: c, cuenta: subcuenta(c, digitos), nombre: nombreDe(c), debe: v > 0n ? v : 0n, haber: v < 0n ? -v : 0n }));

// iva: { facturas, gastos, fiscal } para llevar el registro de IVA de cada factura y gasto. Sin él, todo va como apuntes
// sin IVA (registro 0).
function porDocumento(asientos, anio, digitos, iva) {
  const R = iva ? registrosIva(iva) : new Map();
  return preparar(asientos, anio, digitos).map((a) => {
    const reg = a.origen?.registro && R.get(`${a.origen.tipo}:${a.origen.id}`);
    if (!reg) return { a };
    const e = encajar(reg, a);
    return e.lineas.some((l) => l.sujeta && (l.base || l.cuota)) ? { a, reg, e } : { a };
  });
}

const importeA3 = (c, n) => {
  const t = decimal(c < 0n ? -c : c);
  if (t.length > 13) throw new Error(`El importe del asiento ${n} supera las 14 posiciones de A3`);
  return (c < 0n ? '-' : '+') + t.padStart(13, '0');
};
const pctA3 = (p) => { const n = Number(p) || 0; if (n < 0 || n >= 100) throw new Error(`Porcentaje no válido para A3: ${p}`); return n.toFixed(2).padStart(5, '0'); };
const docA3 = (s) => ascii(s).trim().slice(-10);

// empresa es el código numérico de la empresa en A3 (por defecto 00001).
export function diarioA3(asientos, { anio, empresa = 1, digitos = 8, iva } = {}) {
  if (!/^\d{1,5}$/.test(String(empresa)) || Number(empresa) < 1) throw new Error('Código de empresa A3 no válido (1-99999)');
  digitosValidos('a3', digitos);
  const comun = (fecha, tipo) => ({ formato: '4', empresa: String(empresa).padStart(5, '0'), fecha: fecha.replaceAll('-', ''), tipo, generado: 'N' });
  const sinIva = (a, lineas, documento) => lineas.map((l, i) => fijo(A3, { ...comun(a.fecha, '0'), cuenta: l.cuenta, nombre: l.nombre, lado: l.debe ? 'D' : 'H', documento, linea: i === 0 ? 'I' : i === lineas.length - 1 ? 'U' : 'M', concepto: a.concepto, importe: importeA3(l.debe || l.haber, a.n), moneda: 'E' }));
  return registros(porDocumento(asientos, anio, digitos, iva).flatMap(({ a, reg, e }) => {
    if (!reg) return sinIva(a, a.lineas, String(a.n));
    // Rectificativa: registro 2, con los importes en positivo si rebaja la factura (abono) y en negativo si la sube.
    const s = reg.rect ? -1n : 1n, documento = docA3(reg.numero) || String(a.n);
    const lineas = e.lineas.filter((l) => l.base || l.cuota || l.recargo || l.ret);
    const nifValido = reg.nif.length <= 14 ? reg.nif : '';
    const filas = [fijo(A3_CABECERA, { ...comun(a.fecha, reg.rect ? '2' : '1'), cuenta: subcuenta(e.contra, digitos), nombre: nombreDe(e.contra), tipoFactura: reg.tipoFactura, documento, linea: 'I', concepto: a.concepto,
      importe: importeA3(s * e.total, a.n), ...(nifValido ? { nif: nifValido, tercero: reg.tercero, cp: reg.cp } : {}), fechaOperacion: reg.fechaOperacion.replaceAll('-', ''), fechaFactura: reg.fecha.replaceAll('-', ''), moneda: 'E' })];
    lineas.forEach((l, i) => filas.push(fijo(A3_IVA, { ...comun(a.fecha, '9'), cuenta: subcuenta(l.cuenta, digitos), nombre: nombreDe(l.cuenta), lado: 'C', documento, linea: i === lineas.length - 1 ? 'U' : 'M', concepto: a.concepto,
      subtipo: l.sujeta ? l.subtipo : '07', base: importeA3(s * l.base, a.n), pctIva: pctA3(l.pct), cuota: importeA3(s * l.cuota, a.n), pctRecargo: pctA3(l.re), recargo: importeA3(s * l.recargo, a.n),
      pctRetencion: pctA3(l.ret ? l.pctRet : 0), retencion: importeA3(s * l.ret, a.n), impreso: l.sujeta ? l.impreso : '', sujeta: l.sujeta ? 'S' : 'N', caja: l.caja ? 'S' : '',
      cuentaIva: l.cuota ? subcuenta(l.cuentaIva || l.cuenta, digitos) : '', cuentaRecargo: l.recargo ? subcuenta(l.cuentaRecargo || l.cuenta, digitos) : '', cuentaRetencion: l.ret ? subcuenta(l.cuentaRet, digitos) : '',
      cuentaIva2: l.cuota && l.cuentaIva2 ? subcuenta(l.cuentaIva2, digitos) : '', moneda: 'E' })));
    // Registro 4 detrás de la factura (como el 3, «después de finalizar el apunte»): la que rectifica.
    if (reg.rect) filas.push(fijo(A3_AMPLIACION, { ...comun(a.fecha, '4'), fechaRectificada: reg.rect.fecha.replaceAll('-', ''), numeroRectificada: docA3(reg.rect.numero) }));
    if (e.ajuste.length) filas.push(...sinIva(a, lineasAjuste(e.ajuste, digitos), documento));
    return filas;
  }));
}

// ContaPlus saca los libros del IVA de los apuntes de sus cuentas de IVA (472 y 477) que llevan Contra (la subcuenta del
// cliente o proveedor), Factura, BaseEuro e IVA (y Recequiv): uno por tipo de IVA, también a 0,00 € si la operación va al
// 0 % (exenta, intracomunitaria, exportación…), para que su base llegue al 303, al 390 y al 349. El resto de apuntes, y
// los de IVA que no son de una factura (liquidaciones, criterio de caja, prorrata), llevan Auxiliar '*': no entran en las
// declaraciones.
// El tipo de IVA (régimen general, entregas a la UE, exportación…) y el porcentaje no van en el apunte: son de la
// subcuenta (TipoIVA y TPC, *3 del protocolo). Por eso cada tipo y porcentaje tiene su subcuenta de la 472 o la 477: la
// cuenta, un dígito del tipo y el porcentaje (47700121, IVA repercutido al 21 %; 47200221, soportado en compras de bienes a
// la UE al 21 %). Y el 347 y el 349 salen del NIF de la subcuenta de contrapartida, así que cada cliente y proveedor con
// NIF tiene la suya (430, 400, 410 o 523 y un número por orden de aparición), también en sus cobros y pagos. El cierre, la
// apertura y la liquidación del IVA reparten su importe entre esas subcuentas para dejar cada una con su saldo.
// ContaPlus importa las subcuentas de XSubCta.txt (contaplusSubcuentas) y el diario de XDiario.txt, por esos nombres.
// Ningún tipo usa el 0 (sería la subcuenta general de la cuenta, la de las liquidaciones, si el porcentaje es 0) y el
// recargo usa el 9 (47790021: no choca con la 4779 del criterio de caja, 47790000, porque nunca va al 0 %).
const TIPOS_CP = {
  477: { G: [1, 'IVA repercutido'], X: [2, 'IVA entregas UE de bienes'], Y: [3, 'IVA servicios prestados a la UE'], E: [4, 'IVA exportaciones'], J: [5, 'IVA operaciones no sujetas'],
    P: [6, 'IVA devengado inv. sujeto pasivo'], N: [7, 'IVA devengado adq. UE bienes'], V: [8, 'IVA devengado adq. UE servicios'], R: [9, 'IVA repercutido con recargo', 'G'] },
  472: { O: [1, 'IVA soportado'], C: [2, 'IVA soportado adq. UE bienes'], Z: [3, 'IVA soportado adq. UE servicios'], A: [4, 'Compensación régimen agrario'], P: [5, 'IVA soportado inv. sujeto pasivo'], R: [6, 'IVA soportado con recargo', 'O'] },
};
const pctCodigo = (p) => (Number.isInteger(p) ? String(p).padStart(2, '0') : String(Math.round(p * 10)));
const cuentaIvaCp = (cuenta, tipo, pct) => `${cuenta}${TIPOS_CP[cuenta][tipo][0]}${pctCodigo(Number(pct))}`;
const fichaIvaCp = (cuenta, tipo, pct, re) => ({ titulo: `${TIPOS_CP[cuenta][tipo][1]} ${String(Number(pct)).replace('.', ',')} %`, tipoIva: TIPOS_CP[cuenta][tipo][2] || tipo, tpc: Number(pct), re: Number(re) || 0 });

// Clientes y proveedores con NIF: su subcuenta en el orden en que aparecen por primera vez (todos los años, para que no
// cambie de un ejercicio a otro) y, por documento, la cuenta de Fisquo que sustituye (base) y la suya (cuenta).
const TERCERO = /^(430|400|410|523)$/;
function tercerosContaplus(asientos, { facturas = [], gastos = [] } = {}) {
  const datos = new Map();
  for (const f of facturas) datos.set(`factura:${f.id}`, { nif: nifLimpio(f.cliente?.nif), nombre: f.cliente?.nombre || '', direccion: f.cliente?.direccion || '', poblacion: f.cliente?.ciudad || '' });
  for (const g of gastos) datos.set(`gasto:${g.id}`, { nif: nifLimpio(g.proveedorNif), nombre: g.proveedor || '' });
  const porDocumento = new Map(), fichas = new Map(), claves = new Map(), cuantos = {};
  for (const a of asientos.filter((x) => x.origen?.registro).sort((x, y) => x.fecha.localeCompare(y.fecha))) {
    const doc = `${a.origen.tipo}:${a.origen.id}`, d = datos.get(doc);
    const base = a.lineas.map((l) => String(l.cuenta)).find((c) => TERCERO.test(c) && (a.origen.tipo === 'factura') === (c === '430'));
    if (!d?.nif || !base) continue;
    const clave = `${base}|${d.nif}`;
    if (!claves.has(clave)) {
      cuantos[base] = (cuantos[base] || 0) + 1;
      claves.set(clave, `${base}${cuantos[base]}`);
      fichas.set(`${base}${cuantos[base]}`, { ...d, base, titulo: d.nombre || nombreDe(base) });
    }
    porDocumento.set(doc, { base, cuenta: claves.get(clave) });
  }
  return { porDocumento, fichas };
}

// opciones.todos: los asientos de todos los años (para numerar los clientes y proveedores y saber su saldo al empezar el año).
export function contaplus(asientos, { anio, digitos = 8, iva, todos = asientos } = {}) {
  digitosValidos('contaplus', digitos);
  const T = iva ? tercerosContaplus(todos, iva) : { porDocumento: new Map(), fichas: new Map() };
  const subcuentas = new Map();
  // Código de la subcuenta de una cuenta de Fisquo (o de las de arriba) y su ficha para XSubCta.
  const usar = (cuenta, ficha) => {
    const codigo = subcuenta(cuenta, digitos);
    if (!subcuentas.has(codigo)) subcuentas.set(codigo, ficha || T.fichas.get(cuenta) || { titulo: nombreDe(cuenta), ...(/^47[27]9?$/.test(cuenta) ? { tipoIva: cuenta.startsWith('477') ? 'G' : 'O', tpc: 0, re: 0 } : {}) });
    return codigo;
  };
  const tercero = (a) => a.origen && T.porDocumento.get(`${a.origen.tipo}:${a.origen.id}`);
  // Saldo de cada subcuenta (céntimos) y las subcuentas de cada cuenta que se reparte.
  const saldo = new Map(), deCuenta = new Map();
  const REPARTIR = /^(430|400|410|523|472|477)$/;
  const anotar = (cuenta, codigo, v) => {
    saldo.set(codigo, (saldo.get(codigo) || 0n) + v);
    if (!deCuenta.has(cuenta)) deCuenta.set(cuenta, new Set());
    deCuenta.get(cuenta).add(codigo);
  };
  // Saldo de cada cliente y proveedor al empezar el año, para repartir la apertura.
  const inicial = new Map();
  for (const a of todos) {
    const t = a.fecha < `${anio}-01-01` && tercero(a);
    if (t) for (const l of a.lineas) if (String(l.cuenta) === t.base) inicial.set(t.cuenta, (inicial.get(t.cuenta) || 0n) + centimos(l.debe) - centimos(l.haber));
  }
  const ceros = { ptadebe: '0.00', ptahaber: '0.00', factura: '0', baseimpo: '0.00', iva: '0.00', recequiv: '0.00', ncasado: '0', tcasado: '0', trans: '0', cambio: '0.000000', debeme: '0.00', haberme: '0.00', impauxme: '0.00', baseeuro: '0.00', noconv: 'F' };
  const apunte = (a, l) => fijo(CONTAPLUS, { ...ceros, asien: a.n, fecha: a.fecha.replaceAll('-', ''), subcta: l.codigo, concepto: a.concepto, documento: String(a.n), auxiliar: '*', monedauso: '2', eurodebe: decimal(l.debe), eurohaber: decimal(l.haber), ...l.extra });
  const linea = (cuenta, codigo, v, extra) => ({ cuenta, codigo, debe: v > 0n ? v : 0n, haber: v < 0n ? -v : 0n, extra });
  // Apertura: el saldo inicial de cada cliente y proveedor, y el resto en la subcuenta general. Cierre y liquidaciones: si
  // el apunte salda la cuenta, una línea por subcuenta con saldo.
  const repartir = (a, l) => {
    const v = l.debe - l.haber;
    if (!REPARTIR.test(l.cuenta) || !v) return [l];
    if (a.origen?.tipo === 'apertura') {
      const suyas = [...inicial].filter(([c, s]) => s && T.fichas.get(c).base === l.cuenta);
      if (!suyas.length) return [l];
      const resto = v - suyas.reduce((s, [, x]) => s + x, 0n);
      return [...suyas.map(([c, x]) => linea(l.cuenta, usar(c), x)), ...(resto ? [linea(l.cuenta, l.codigo, resto)] : [])];
    }
    const conSaldo = [...(deCuenta.get(l.cuenta) || [])].map((c) => [c, saldo.get(c) || 0n]).filter(([, s]) => s);
    if (conSaldo.reduce((s, [, x]) => s + x, 0n) !== -v || (conSaldo.length === 1 && conSaldo[0][0] === l.codigo)) return [l];
    return conSaldo.map(([c, x]) => linea(l.cuenta, c, -x));
  };
  let recibidas = 0;
  const diario = registros(porDocumento(asientos, anio, digitos, iva).flatMap(({ a, reg, e }) => {
    const t = tercero(a);
    const propia = (l) => (t && l.fisquo === t.base ? usar(t.cuenta) : usar(l.fisquo));
    let lineas;
    if (!reg) lineas = a.lineas.map((l) => linea(l.fisquo, propia(l), l.debe - l.haber));
    else {
      // Un apunte por subcuenta de IVA (el autoliquidado, en las dos: 472 y 477), con el signo de Fisquo (debe positivo).
      // El IVA de criterio de caja (4729 y 4779) se queda fuera de las declaraciones: ContaPlus lo lleva con campos que
      // el diario clásico no tiene.
      const s = reg.emitida ? -1n : 1n, grupos = new Map();
      const agrupar = (cuenta, tipo, l, importe) => {
        const fisquo = cuentaIvaCp(cuenta, tipo, l.pct), k = `${fisquo}|${l.re || 0}`;
        const g = grupos.get(k) || grupos.set(k, { cuenta, codigo: usar(fisquo, fichaIvaCp(cuenta, tipo, l.pct, l.re)), pct: l.pct, re: l.re || 0, base: 0n, importe: 0n }).get(k);
        g.base += l.base; g.importe += importe;
      };
      for (const l of e.lineas.filter((x) => x.sujeta)) {
        if (l.libro === '472' || l.libro === '477') agrupar(l.libro, l.tipoCp, l, s * (l.cuota + (reg.emitida ? l.recargo : 0n)));
        if (l.cuentaIva2) agrupar(l.cuentaIva2, l.tipoCp2, l, -s * l.cuota);
      }
      const factura = reg.emitida ? (reg.correlativo || reg.numero.replace(/\D/g, '').slice(-8) || String(a.n)) : String(++recibidas);
      const contra = t ? usar(t.cuenta) : usar(e.contra);
      const extra = (g) => ({ contra, factura: String(Number(factura)), baseeuro: conSigno(g.base), iva: Number(g.pct).toFixed(2), recequiv: Number(g.re).toFixed(2), auxiliar: '', serie: reg.serie.slice(0, 1) });
      const hechas = new Set();
      lineas = [];
      const deIva = (cuenta) => [...grupos.values()].filter((g) => g.cuenta === cuenta);
      const conIva = (cuenta, total) => {
        hechas.add(cuenta);
        let resto = total;
        for (const g of deIva(cuenta)) { resto -= g.importe; lineas.push(linea(cuenta, g.codigo, g.importe, extra(g))); }
        // Lo que el registro no explica (no debería haber nada) se queda como apunte sin IVA.
        if (resto) lineas.push(linea(cuenta, usar(cuenta), resto));
      };
      for (const l of a.lineas) {
        if (hechas.has(l.fisquo)) continue;
        if (deIva(l.fisquo).length) conIva(l.fisquo, a.lineas.filter((x) => x.fisquo === l.fisquo).reduce((n, x) => n + x.debe - x.haber, 0n));
        else lineas.push(linea(l.fisquo, propia(l), l.debe - l.haber));
      }
      // Operaciones al 0 %: su cuenta de IVA no tiene importe en el asiento, pero el apunte a 0,00 € lleva la base al libro.
      for (const g of grupos.values()) if (!hechas.has(g.cuenta)) conIva(g.cuenta, 0n);
    }
    if (!reg && !t) lineas = lineas.flatMap((l) => repartir(a, l));
    for (const l of lineas) anotar(l.cuenta, l.codigo, l.debe - l.haber);
    return lineas.map((l) => apunte(a, l));
  }));
  return { diario, subcuentas: contaplusSubcuentas(subcuentas) };
}
export const diarioContaplus = (asientos, opciones) => contaplus(asientos, opciones).diario;

// XSubCta clásico: los campos 1-24 del protocolo (Subcuentas) en posiciones fijas, como el diario. Los de IVA llevan su
// tipo (TipoIVA) y porcentaje (TPC y RecEquiv); los de clientes y proveedores, su NIF, la clave del documento (IdNif: 1
// NIF español, 2 NIF-IVA de la UE, 6 otro) y el país.
const SUBCTA = {
  longitud: 385,
  campos: {
    cod: [1, 12], titulo: [13, 40], nif: [53, 15], domicilio: [68, 35], poblacion: [103, 25], provincia: [128, 20], codpostal: [148, 5],
    divisa: [153, 1], coddivisa: [154, 5], documento: [159, 1], ajustame: [160, 1], tipoiva: [161, 1], proye: [162, 9], subequiv: [171, 12],
    subcierre: [183, 12], linterrump: [195, 1], segmento: [196, 12], tpc: [208, 5, 'N'], recequiv: [213, 5, 'N'], fax01: [218, 15], email: [233, 50],
    titulol: [283, 100], idnif: [383, 1, 'N'], codpais: [384, 2],
  },
};
const idTercero = (nif) => (NIF_ES.test(nif) ? ['1', 'ES'] : nifUE(nif) ? ['2', nif.slice(0, 2) === 'EL' ? 'GR' : nif.slice(0, 2)] : ['6', '']);
function contaplusSubcuentas(subcuentas) {
  return registros([...subcuentas].sort(([a], [b]) => a.localeCompare(b)).map(([cod, s]) => {
    const [idnif, codpais] = s.nif ? idTercero(s.nif) : ['', ''];
    return fijo(SUBCTA, { cod, titulo: s.titulo, divisa: 'F', documento: 'F', ajustame: 'F', linterrump: 'F', tpc: (s.tpc || 0).toFixed(2), recequiv: (s.re || 0).toFixed(2), tipoiva: s.tipoIva || '',
      ...(s.nif ? { nif: s.nif, idnif, codpais, domicilio: s.direccion, poblacion: s.poblacion, codpostal: idnif === '1' ? cpDe(`${s.poblacion} ${s.direccion}`) : '' } : {}) });
  }));
}

// ContaSol solo importa el diario como hoja de cálculo «APU.xls» o «APU.ods», sin cabecera y con las columnas A-Q del
// manual de DELSOL (GIP.C.01.10 «Importación Excel - Calc», tabla Apuntes). Un campo más largo de lo permitido hace que
// ContaSol descarte el registro, así que los textos se recortan aquí. Se importa en Utilidades › Importaciones.
// https://sdelsol.com/pub/programas/adjuntos/1/GIP.C.01.10._CONTASOL_-_Importacion_Excel_-_Calc_1.pdf
const latin1 = (v, max) => [...String(v ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')]
  .map((c) => (c <= '\xff' ? c : c.normalize('NFD')[0] <= '\xff' ? c.normalize('NFD')[0] : ' ')).join('').trim().slice(0, max);
const xml = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const odsCelda = ([tipo, v]) => tipo === 'n' ? `<table:table-cell office:value-type="float" office:value="${v}"><text:p>${v}</text:p></table:table-cell>`
  : tipo === 'f' ? `<table:table-cell office:value-type="date" office:date-value="${v}"><text:p>${v.split('-').reverse().join('/')}</text:p></table:table-cell>`
  : v ? `<table:table-cell office:value-type="string"><text:p>${xml(v)}</text:p></table:table-cell>` : '<table:table-cell/>';

export function ods(filas, hoja = 'Hoja1') {
  const contenido = '<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:spreadsheet>'
    + `<table:table table:name="${xml(hoja)}">${filas.map((f) => `<table:table-row>${f.map(odsCelda).join('')}</table:table-row>`).join('')}</table:table></office:spreadsheet></office:body></office:document-content>`;
  const manifiesto = '<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>';
  // El mimetype va el primero y sin comprimir (lib/zip.js no comprime): así lo pide ODF.
  return zip([{ nombre: 'mimetype', datos: 'application/vnd.oasis.opendocument.spreadsheet' }, { nombre: 'META-INF/manifest.xml', datos: manifiesto }, { nombre: 'content.xml', datos: contenido }]);
}

// Filas de APU: Diario, Fecha, Asiento, Orden, Cuenta, Importe en pesetas (0), Concepto, Documento, Debe, Haber,
// Moneda (E), Punteo (0), Tipo de IVA, Código de IVA, Departamento, Subdepartamento y Archivo de imagen.
export function apuntesContasol(asientos, { anio, digitos = 8 }) {
  digitosValidos('contasol', digitos);
  const filas = [];
  for (const a of preparar(asientos, anio, digitos)) {
    if (a.n > 99999) throw new Error('ContaSol admite como mucho 99.999 asientos al año');
    a.lineas.forEach((l, i) => filas.push([['n', '1'], ['f', a.fecha], ['n', String(a.n)], ['n', String(i + 1)], ['n', l.cuenta], ['n', '0'], ['s', latin1(a.concepto, 60)], ['s', String(a.n)], ['n', decimal(l.debe)], ['n', decimal(l.haber)], ['s', 'E'], ['n', '0'], ['s', ''], ['n', '0'], ['n', '0'], ['n', '0'], ['s', '']]));
  }
  return filas;
}

export const diarioContasol = (asientos, opciones) => ods(apuntesContasol(asientos, opciones), 'APU');
