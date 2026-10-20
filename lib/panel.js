// Todas las cifras de la pantalla Resumen, calculadas en un solo sitio (sin React) para poder probarlas.
import { costeGasto, importes, liquidaciones303, minoracion130, pendienteDe, proximoPlazo, r2, resumenAnual, trimestre, vencida } from './calculos.js';
import { bienes, cuotaEntre } from './amortizaciones.js';
import { esCuota } from './cuotas.js';
import { ACTIVIDADES_ANTIGUAS, FISCAL_BASE, hecho130, hecho303, usa130, usa303 } from './empresa.js';

const suma = (l, f) => r2(l.reduce((s, x) => s + f(x), 0));

// rend130: rendimiento neto de cada año, para la casilla 13 del 130 del año siguiente.
// impuestos: { [año]: { facturas, gastos } } de lib/datosImpuestos.js, para que el 303 y el 130 salgan con los mismos
// datos que en Impuestos; sin él, se usan facturas y gastos.
// pres303: trimestres con el 303 marcado como presentado (aparte del 130, que va en pagos130).
export function panelResumen({ facturas, gastos, pagos130 = {}, pres303 = {}, prorrata = {}, rend130 = {}, emisor = {}, anio, hoy, actividades = ACTIVIDADES_ANTIGUAS, fiscal = FISCAL_BASE, impuestos = {} }) {
  const ids = actividades.map((a) => a.id);
  const c303 = usa303(fiscal);
  const c130 = usa130(fiscal);
  // Solo suma lo que esta empresa presenta: sin 303 si no cobra IVA, sin 130 si es sociedad o le retienen casi todo.
  const iva = { pres303, prorrata };
  const op = (y) => ({ ivaCoste: !c303, regimen: fiscal.tipo, hasta: hoy < `${y}-12-31` ? hoy : `${y}-12-31`, minoracion: c130 ? minoracion130(rend130?.[y - 1]) : 0, iva });
  const hacienda = (q) => r2((c303 ? q.ivaIngresar : 0) + (c130 ? q.m130 : 0));
  const anioActual = Number(hoy.slice(0, 4));
  anio = anio || anioActual;
  const esteAnio = anio === anioActual;
  const pagos = (y) => pagos130?.[y] || {};
  // El 303 como en Impuestos: la liquidación del trimestre entero (casilla 46 y compensación), sin cortar en hoy.
  const trimestres = (y, p) => {
    const d = impuestos[y] || { facturas, gastos };
    const res = resumenAnual(d.facturas, d.gastos, y, p, ids, op(y));
    const liq = liquidaciones303(d.facturas, d.gastos, y, undefined, iva);
    return { ...res, trimestres: res.trimestres.map((q) => { const l = liq[q.t - 1]; return { ...q, m303: l.bruto, ivaIngresar: l.ingresar, ivaCompensado: l.compensado, ivaPendiente: l.pendiente, ivaDevolucion: l.devolucion }; }) };
  };
  const r = trimestres(anio, pagos(anio));

  // Año: todo sin IVA. Beneficio = facturado − gastos (antes de impuestos).
  const facturado = suma(r.porActividad, (a) => a.ingresos);
  const gastado = suma(r.porActividad, (a) => a.gastos);
  const beneficio = r2(facturado - gastado);

  // Hacienda: si en el trimestre cuyo plazo está abierto queda algún modelo sin presentar, primero ese (solo lo pendiente).
  const plazo = proximoPlazo(hoy);
  const qPlazo = plazo.dias <= 25 ? trimestres(plazo.anio, pagos(plazo.anio)).trimestres[plazo.t - 1] : null;
  const pend303 = c303 && !hecho303(pres303, pagos130, plazo.anio, plazo.t);
  const pend130 = c130 && !hecho130(pagos130, plazo.anio, plazo.t);
  const debe = qPlazo && (pend303 || pend130) ? { ...qPlazo, pend303, pend130 } : null;
  const tHoy = trimestre(hoy);
  // Lo que llevas del trimestre en curso (solo hasta hoy, por eso no usa trimestres()), dando por pagado el 130 del que está pendiente (si no, se contaría dos veces).
  const pagosHoy = debe?.pend130 && plazo.anio === anioActual ? { ...pagos(anioActual), [plazo.t]: debe.m130 } : pagos(anioActual);
  const qAhora = resumenAnual(facturas, gastos, anioActual, pagosHoy, ids, op(anioActual)).trimestres[tHoy - 1];
  const apartado = hacienda(qAhora);
  const aPagar = debe ? r2((debe.pend303 ? debe.ivaIngresar : 0) + (debe.pend130 ? debe.m130 : 0)) : 0;

  // Por cobrar: todas las facturas sin cobrar, sean del año que sean (es dinero que te deben igual).
  const sinCobrar = facturas.filter((f) => !f.cobrada);
  const porCobrar = suma(sinCobrar, pendienteDe);
  const vencidas = facturas.filter((f) => vencida(f, emisor.plazo, hoy));
  const totalVencidas = suma(vencidas, pendienteDe);

  // Previsión al ritmo actual (solo tiene sentido el año en curso).
  const dia = (Date.parse(hoy) - Date.parse(`${anioActual}-01-01`)) / 864e5 + 1;
  const ritmo = 365 / Math.max(dia, 30);
  const prevFact = r2(facturado * ritmo);
  const prevBeneficio = r2(beneficio * ritmo);

  // Mes a mes (sin IVA) y comparación con el mismo periodo del año anterior.
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mm = `${anio}-${String(i + 1).padStart(2, '0')}`;
    // Los bienes de inversión, por su amortización del mes (no enteros el mes de la compra).
    const fin = new Date(Date.UTC(anio, i + 1, 0)).toISOString().slice(0, 10);
    const corte = fin > hoy ? hoy : fin;
    const amort = `${mm}-01` > corte ? 0 : suma(bienes(gastos), (g) => cuotaEntre(g, `${mm}-01`, corte, op(anio)));
    const neto = (x) => { const i = importes(x); return c303 ? i.base : r2(i.base + i.iva); };
    // Gastos: con el IVA que no se recupera (todo sin 303; si no, el no deducible, lib/ivaDeducible.js).
    return { ing: suma(facturas.filter((x) => x.fecha.startsWith(mm) && x.fecha <= hoy), neto), gas: r2(suma(gastos.filter((x) => x.fecha.startsWith(mm) && x.fecha <= hoy && !(x.inversion && x.base > 0)), (g) => costeGasto(g, { ivaCoste: !c303 })) + amort) };
  });
  const hasta = esteAnio ? hoy.slice(5) : '12-31';
  const periodo = (y) => suma(facturas.filter((f) => f.fecha.startsWith(`${y}-`) && f.fecha.slice(5) <= hasta), (f) => f.base);
  const antes = periodo(anio - 1);
  const cambio = antes > 0 ? ((periodo(anio) - antes) / antes) * 100 : null;
  const tope = esteAnio ? Number(hoy.slice(5, 7)) - 1 : 11;
  // El último mes con movimiento; sin ninguno, el mes en curso (o diciembre en un año pasado).
  const conDatos = meses.map((m, i) => (i <= tope && (m.ing || m.gas) ? i : -1)).filter((i) => i >= 0);
  const ultimoMes = conDatos.length ? Math.max(...conDatos) : tope;

  const porCliente = {};
  for (const f of facturas.filter((x) => x.fecha.startsWith(`${anio}-`) && x.fecha <= hoy)) porCliente[f.cliente.nombre] = r2((porCliente[f.cliente.nombre] || 0) + f.base);
  const top = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const limite = Number(emisor.limite) || 0;
  // Tarifa plana: la Seguridad Social mira el rendimiento neto del IRPF más las cuotas de autónomos que se han restado como
  // gasto, menos un 7 % de gastos genéricos (sin tope). Eso es lo que se compara con el límite (el SMI anual).
  const cuotasSS = suma(gastos.filter((g) => esCuota(g) && g.fecha.startsWith(`${anio}-`) && g.fecha <= hoy), (g) => Number(g.base) || 0);
  const rendSS = r2(Math.max(0, beneficio + cuotasSS) * 0.93);
  const prevRendSS = r2(rendSS * ritmo);
  return {
    anio, anioActual, esteAnio, r, c303, c130, facturado, gastado, beneficio,
    plazo, debe, tHoy, qAhora, apartado, aPagar, mesPago: ['abril', 'julio', 'octubre', 'enero'][tHoy - 1],
    sinCobrar, porCobrar, vencidas, totalVencidas, prevFact, prevBeneficio, meses, cambio, ultimoMes, top, limite, cuotasSS, rendSS, prevRendSS,
  };
}
