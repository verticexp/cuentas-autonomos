// Avisos de Impuestos para los casos que Fisquo no puede resolver solo (informe de la asesoría, 20-10-2026): lo que hay
// que presentar aparte (autoliquidación rectificativa, modelo 952), lo que conviene revisar antes del 4T (afectación al
// IRPF, facturas sin IVA sin motivo) y lo que hace que el 130 o el 111 salgan mal (trimestres sin marcar, 111 negativo).
// Sin dependencias de servidor: se prueba en tests/revision-fiscal.test.mjs.
import { alzaPorError, fechaIrpf, importes, nifUE, numeroFactura, r2, situacionTrimestre, trimestre } from './calculos.js';
import { pctDeducible } from './ivaDeducible.js';
import { operacionDe } from './operaciones.js';
import { requisitosIncobrable } from './incobrables.js';
import { TIPOS_UE } from './oss.js';
import { eur, fechaCorta } from './formato.js';

const T = [1, 2, 3, 4];
const delAnio = (l, anio) => l.filter((x) => x.fecha.startsWith(`${anio}-`));
const cuota = (f) => { const i = importes(f); return r2(i.iva + (i.recargo || 0)); };
const lista = (l, n = 3) => (l.length > n ? `${l.slice(0, n).join(', ')} y ${l.length - n} más` : l.join(', '));

// Cada aviso: { id, texto, href? }. op:
//   c303, c130: si presenta esos modelos · liquidaciones: liquidaciones303 del año · r130: resumenAnual (con 130)
//   pagos130: los del año (marcados) · a111(t): retenciones del 111 del trimestre · hoy
export function avisosFiscales({ facturas = [], gastos = [], anio, hoy, c303 = true, c130 = true, liquidaciones = [], r130 = null, pagos130 = {}, a111 = null }) {
  const out = [];

  // Rectificativas al alza por un error al facturar: van al periodo de la original (art. 89.Cinco LIVA).
  if (c303) for (const f of facturas.filter((x) => alzaPorError(x) && x.rectifica.fecha.startsWith(`${anio}-`))) {
    const t = trimestre(f.rectifica.fecha);
    out.push({ id: `alza-${f.id}`, href: `/facturas/${f.id}`, texto: `La rectificativa ${numeroFactura(f)} sube el IVA en ${eur(cuota(f))} por un error en una factura del ${t}T ${anio}: preséntala en una autoliquidación rectificativa de ese trimestre, con recargo por presentarla tarde (art. 27 LGT) e intereses si procede. Fisquo ya la cuenta en el ${t}T, no en el ${trimestre(f.fecha)}T${f.fecha.slice(0, 4) !== String(anio) ? ` de ${f.fecha.slice(0, 4)}` : ''}.` });
  }
  // Rectificativas al alza de otro trimestre sin motivo: si corrigen un error, también van al periodo original.
  if (c303) for (const f of delAnio(facturas, anio).filter((x) => x.rectifica?.fecha && !x.rectifica.motivo && cuota(x) > 0 && (x.rectifica.fecha.slice(0, 4) !== x.fecha.slice(0, 4) || trimestre(x.rectifica.fecha) !== trimestre(x.fecha)))) {
    out.push({ id: `alza-sin-${f.id}`, href: `/facturas/${f.id}`, texto: `La rectificativa ${numeroFactura(f)} sube el IVA de una factura del ${trimestre(f.rectifica.fecha)}T ${f.rectifica.fecha.slice(0, 4)} y no tiene motivo: si corrige un error al facturar (un tipo mal aplicado, una cuota que faltaba), no va en este trimestre sino en una autoliquidación rectificativa de aquel. Si es un cambio de precio o de lo acordado, está bien aquí.` });
  }
  // IRPF: una rectificativa por error de una factura de otro año cuenta en ese año (fechaIrpf).
  if (c130) for (const f of facturas.filter((x) => fechaIrpf(x) !== x.fecha && (x.fecha.startsWith(`${anio}-`) || fechaIrpf(x).startsWith(`${anio}-`)))) {
    const original = fechaIrpf(f).slice(0, 4);
    out.push({ id: `irpf-${f.id}`, href: `/facturas/${f.id}`, texto: original === String(anio)
      ? `La rectificativa ${numeroFactura(f)} (de ${f.fecha.slice(0, 4)}) corrige un error de una factura de ${anio}: cuenta en la renta de ${anio}${f.fecha.slice(0, 4) > original ? '; si ya la presentaste, hay que rectificarla' : ''}.`
      : `La rectificativa ${numeroFactura(f)} corrige un error de una factura de ${original}: no cuenta en el 130 de ${anio}, sino en la renta de ${original} (si ya la presentaste, hay que rectificarla).` });
  }
  // Créditos incobrables: comunicación a Hacienda con el modelo 952 en un mes (art. 24 RIVA).
  if (c303) for (const f of delAnio(facturas, anio).filter((x) => x.rectifica?.motivo === 'incobrable' && x.rectifica.fecha)) {
    const r = requisitosIncobrable({ fechaOriginal: f.rectifica.fecha, fechaRectificativa: f.fecha, base: Math.abs(f.base) });
    if (hoy <= r.limite952) out.push({ id: `952-${f.id}`, href: `/facturas/${f.id}`, texto: `Impagado de la ${f.rectifica.numero}: comunica la rectificativa ${numeroFactura(f)} a Hacienda con el modelo 952 hasta el ${fechaCorta(r.limite952)}, con copia de la rectificativa y de la reclamación del cobro.` });
  }

  // Ventas a particulares de otros países de la UE con IVA español: pasados 10.000 € en el año (o el anterior), llevan
  // el IVA del país del cliente y se declaran en el 369 (ventanilla única, lib/oss.js).
  if (c303) {
    const aUE = (y) => r2(delAnio(facturas, y).filter((f) => !f.oss?.pais && Object.hasOwn(TIPOS_UE, String(f.cliente?.pais || '').toUpperCase()) && !nifUE(f.cliente?.nif) && importes(f).iva > 0).reduce((s, f) => s + importes(f).base, 0));
    const ahora = aUE(anio), antes = aUE(anio - 1);
    if (ahora > 10000 || antes > 10000) out.push({ id: `oss-${anio}`, texto: `Has vendido ${eur(Math.max(ahora, antes))} a particulares de otros países de la UE con IVA español${ahora > 10000 ? ` en ${anio}` : ` en ${anio - 1}`}. Por encima de 10.000 € al año, esas ventas llevan el IVA del país del cliente y se declaran en el modelo 369 (ventanilla única): date de alta en el régimen (modelo 035), actívalo en Ajustes › Actividades e impuestos y elige el país en cada factura.` });
  }

  // Gastos con el IVA deducible en parte y sin decir qué parte cuenta en el IRPF: se restan enteros.
  if (c130) {
    const sin = delAnio(gastos, anio).filter((g) => pctDeducible(g) < 100 && (g.afectoPct === undefined || g.afectoPct === null || g.afectoPct === ''));
    if (sin.length) out.push({ id: 'afecto', href: `/gastos/${sin[0].id}`, texto: `${sin.length === 1 ? 'Un gasto' : `${sin.length} gastos`} con el IVA deducible en parte (${lista(sin.map((g) => g.concepto || g.proveedor || 'sin concepto'))}) no ${sin.length === 1 ? 'dice' : 'dicen'} qué parte cuenta en el IRPF, así que el 130 ${sin.length === 1 ? 'lo resta entero' : 'los resta enteros'}. Un turismo sin uso exclusivo no cuenta en el IRPF; los suministros de casa con despacho, el 30 % de la parte del despacho. Revísalo antes del 130 del 4T y de la renta.` });
  }

  // Facturas sin IVA a clientes de España sin motivo: si son exentas del art. 20, afectan a la prorrata.
  if (c303) {
    const sin = delAnio(facturas, anio).filter((f) => !f.operacion && operacionDe(f) === 'exenta');
    if (sin.length) out.push({ id: 'exentas', href: `/facturas/${sin[0].id}`, texto: `${sin.length === 1 ? 'Una factura' : `${sin.length} facturas`} sin IVA a clientes de España no ${sin.length === 1 ? 'dice' : 'dicen'} por qué (${lista(sin.map(numeroFactura))}). Si es una operación exenta del art. 20 (sanidad, enseñanza, seguros, alquiler de vivienda…), márcala como «Exenta»: si además facturas con IVA, solo te deduces una parte del IVA de tus gastos (prorrata) y Fisquo lo calcula con esa marca.` });
    const conProrrata = liquidaciones.some((l) => l.perdidoProrrata);
    if (conProrrata && gastos.some((g) => g.inversion && g.base >= 3005.06 && g.fecha <= `${anio}-12-31`)) out.push({ id: 'prorrata-bienes', texto: `Con prorrata, el IVA de los bienes de inversión se regulariza durante los cuatro años siguientes a la compra (nueve si son inmuebles) si el porcentaje cambia más de 10 puntos (art. 107 de la Ley del IVA). Fisquo no lo calcula: revísalo con tu gestor en cada 4T.` });
  }

  // Saldo a favor del 303 a punto de caducar: cuatro años para compensarlo (art. 99.Cinco LIVA).
  const ultima = [...liquidaciones].reverse().find((l) => l.pendiente > 0 && l.caduca);
  if (c303 && ultima) {
    const caducado = ultima.caduca < hoy;
    if (caducado || ultima.caduca <= `${anio + 1}-12-31`) out.push({ id: 'caduca', texto: caducado
      ? `Tienes saldo del IVA a compensar desde el ${ultima.origen.t}T ${ultima.origen.anio} y ya han pasado cuatro años (art. 99.Cinco de la Ley del IVA): ya no se puede compensar. Consulta con tu gestor cómo pedir su devolución.`
      : `Tienes saldo del IVA a compensar desde el ${ultima.origen.t}T ${ultima.origen.anio}: solo se puede compensar hasta el ${fechaCorta(ultima.caduca)} (art. 99.Cinco de la Ley del IVA). Para no perderlo, pide la devolución en el 303 del 4T.` });
  }

  // 130: un trimestre ya vencido sin marcar como presentado no cuenta como pagado (casilla 05) y el siguiente sale de más.
  // Todos los trimestres en un solo aviso (antes, una frase casi igual por trimestre; auditoría 23-10-2026).
  if (c130 && r130) {
    const ts = r130.trimestres.filter((q) => (pagos130[q.t] === undefined || pagos130[q.t] === null) && q.m130 > 0 && situacionTrimestre(q.t, anio, hoy).estado === 'fuera').map((q) => `${q.t}T`);
    if (ts.length === 1) out.push({ id: `130-${ts[0].slice(0, 1)}`, texto: `El 130 del ${ts[0]} no está marcado como presentado. Si lo presentaste, márcalo abajo: si no, Fisquo no lo cuenta como pagado y los trimestres siguientes salen de más.` });
    else if (ts.length > 1) out.push({ id: `130-${ts[0].slice(0, 1)}`, texto: `El 130 del ${ts.slice(0, -1).join(', ')} y ${ts.at(-1)} no está marcado como presentado. Si los presentaste, márcalos abajo: si no, Fisquo no los cuenta como pagados y los trimestres siguientes salen de más.` });
  }

  // 111: un abono de un profesional con retención puede dejar el trimestre en negativo, y el modelo no lo admite.
  if (a111) for (const t of T) {
    const v = a111(t);
    if (v < 0) out.push({ id: `111-${t}`, texto: `El 111 del ${t}T sale negativo (${eur(v)}) por un abono de un profesional con retención. El modelo no admite negativos: regularízalo con ese profesional (por ejemplo, descontándolo de su próxima factura) y presenta el 111 con lo que quede.` });
  }
  return out;
}
