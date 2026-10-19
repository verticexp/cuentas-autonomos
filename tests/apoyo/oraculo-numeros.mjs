// Referencia independiente: cocientes BigInt y céntimos, sin importar código de lib/.
export function fraccion(valor) {
  const s = String(valor ?? 0);
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Decimal no válido: ${s}`);
  const [entero, decimal = ''] = s.replace('-', '').split('.');
  return [BigInt(entero + decimal) * (s.startsWith('-') ? -1n : 1n), 10n ** BigInt(decimal.length)];
}
export function redondear(n, d = 1n) {
  const signo = n < 0n ? -1n : 1n;
  const a = n * signo;
  return signo * ((2n * a + d) / (2n * d));
}
export const centimos = (n) => { const [a, b] = fraccion(n); return Number(redondear(a * 100n, b)); };
export const porcentaje = (cent, pct) => { const [a, b] = fraccion(pct || 0); return Number(redondear(BigInt(cent) * a, b * 100n)); };
export function baseLineaIndependiente(l) {
  const [q, dq] = fraccion(l.cantidad), [p, dp] = fraccion(l.precio), [dto, dd] = fraccion(l.dto || 0);
  return Number(redondear(q * p * (100n * dd - dto) * 100n, dq * dp * 100n * dd));
}
export function importesIndependientes(doc) {
  const tipos = new Map();
  const lineas = doc.lineas?.length ? doc.lineas : null;
  if (lineas) for (const l of lineas) tipos.set(Number(l.ivaPct || 0), (tipos.get(Number(l.ivaPct || 0)) || 0) + baseLineaIndependiente(l));
  else tipos.set(Number(doc.ivaPct || 0), centimos(doc.base));
  const base = [...tipos.values()].reduce((s, n) => s + n, 0);
  let iva = [...tipos].reduce((s, [pct, b]) => s + (doc.caja?.cuotas?.[pct] !== undefined ? centimos(doc.caja.cuotas[pct]) : porcentaje(b, pct)), 0);
  if (doc.caja && !doc.caja.cuotas) {
    const cobrado = centimos(doc.caja.efectivo || 0) + centimos(doc.caja.tarjeta || 0) + centimos(doc.caja.otros || 0);
    if (Math.abs(cobrado - base - iva) <= tipos.size) iva = cobrado - base;
  }
  const irpf = porcentaje(base, doc.alquiler ? 19 : doc.irpfPct);
  return { base, iva, irpf, total: base + iva - irpf };
}
export function nominaIndependiente(n) {
  const bruto = centimos(n.bruto), irpf = porcentaje(bruto, n.irpfPct), trabajador = porcentaje(bruto, n.ssTrabajadorPct), empresa = porcentaje(bruto, n.ssEmpresaPct);
  return { bruto, irpf, ssTrabajador: trabajador, ssEmpresa: empresa, neto: bruto - irpf - trabajador, coste: bruto + empresa, seguros: trabajador + empresa };
}
export function amortizacionIndependiente(g, desde, hasta, sociedad = true) {
  const fin = (f) => Date.parse(`${f}T00:00:00Z`) / 864e5;
  const valor = centimos(g.base);
  if (hasta < g.fecha || valor <= 0) return 0;
  const coef = { edificios: [3, 2], instalaciones: [10, 10], mobiliario: [10, 10], maquinaria: [12, 12], electronicos: [12, 20], informatica: [26, 25], software: [26, 33], transporte: [16, 16], utiles: [30, 25], otros: [10, 10] }[g.inversion.tipo] || [10, 10];
  const max = coef[sociedad ? 1 : 0], tipo = g.inversion.coef > 0 && g.inversion.coef < max ? g.inversion.coef : max;
  // Cada día vale 1/365 o 1/366 de año según el suyo: fracción exacta con denominador 100 × 365 × 366.
  const largo = (y) => (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 366n : 365n);
  const porDias = (de, a) => {
    let n = 0n;
    for (let y = Number(de.slice(0, 4)); y <= Number(a.slice(0, 4)); y++) {
      const i = de > `${y}-01-01` ? de : `${y}-01-01`, f = a < `${y}-12-31` ? a : `${y}-12-31`;
      if (f >= i) n += BigInt(fin(f) - fin(i) + 1) * (365n * 366n / largo(y));
    }
    return Number(redondear(BigInt(valor) * BigInt(tipo) * n, 100n * 365n * 366n));
  };
  const acumulada = (fecha) => {
    if (fecha < g.fecha) return 0;
    if (g.inversion.acumulada !== undefined && g.inversion.desde) {
      const anterior = centimos(g.inversion.acumulada);
      return fecha < g.inversion.desde ? Math.min(valor, anterior) : Math.min(valor, anterior + porDias(g.inversion.desde, fecha));
    }
    return valor <= 30000 ? valor : Math.min(valor, porDias(g.fecha, fecha));
  };
  const ayer = new Date((fin(desde) - 1) * 864e5).toISOString().slice(0, 10);
  return acumulada(hasta) - acumulada(ayer);
}
