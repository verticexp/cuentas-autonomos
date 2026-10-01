// Todas las cifras de la pantalla Resumen, calculadas en un solo sitio (sin React) para poder probarlas.
import { importes, proximoPlazo, r2, resumenAnual, trimestre, vencida } from './calculos.js';
import { ACTIVIDADES_ANTIGUAS, FISCAL_BASE, usa130, usa303 } from './empresa.js';

const suma = (l, f) => r2(l.reduce((s, x) => s + f(x), 0));

export function panelResumen({ facturas, gastos, pagos130 = {}, emisor = {}, anio, hoy, actividades = ACTIVIDADES_ANTIGUAS, fiscal = FISCAL_BASE }) {
  const ids = actividades.map((a) => a.id);
  const c303 = usa303(fiscal);
  const c130 = usa130(fiscal);
  // Solo suma lo que esta empresa presenta: sin 303 si no cobra IVA, sin 130 si es sociedad o le retienen casi todo.
  const hacienda = (q) => r2((c303 ? Math.max(0, q.m303) : 0) + (c130 ? q.m130 : 0));
  const anioActual = Number(hoy.slice(0, 4));
  anio = anio || anioActual;
  const esteAnio = anio === anioActual;
  const pagos = (y) => pagos130?.[y] || {};
  const r = resumenAnual(facturas, gastos, anio, pagos(anio), ids);

  // Año: todo sin IVA. Beneficio = facturado − gastos (antes de impuestos).
  const facturado = suma(r.porActividad, (a) => a.ingresos);
  const gastado = suma(r.porActividad, (a) => a.gastos);
  const beneficio = r2(facturado - gastado);

  // Hacienda: si el trimestre cuyo plazo está abierto no está marcado como presentado, primero ese.
  const plazo = proximoPlazo(hoy);
  const qPlazo = plazo.dias <= 25 ? resumenAnual(facturas, gastos, plazo.anio, pagos(plazo.anio), ids).trimestres[plazo.t - 1] : null;
  const debe = (c303 || c130) && qPlazo && !qPlazo.presentado ? qPlazo : null;
  const tHoy = trimestre(hoy);
  // Lo que llevas del trimestre en curso, dando por pagado el 130 del que está pendiente (si no, se contaría dos veces).
  const pagosHoy = debe && plazo.anio === anioActual ? { ...pagos(anioActual), [plazo.t]: debe.m130 } : pagos(anioActual);
  const qAhora = resumenAnual(facturas, gastos, anioActual, pagosHoy, ids).trimestres[tHoy - 1];
  const apartado = hacienda(qAhora);
  const aPagar = debe ? hacienda(debe) : 0;

  // Por cobrar: todas las facturas sin cobrar, sean del año que sean (es dinero que te deben igual).
  const sinCobrar = facturas.filter((f) => !f.cobrada);
  const porCobrar = suma(sinCobrar, (f) => importes(f).total);
  const vencidas = facturas.filter((f) => vencida(f, emisor.plazo, hoy));
  const totalVencidas = suma(vencidas, (f) => importes(f).total);

  // Previsión al ritmo actual (solo tiene sentido el año en curso).
  const dia = (Date.parse(hoy) - Date.parse(`${anioActual}-01-01`)) / 864e5 + 1;
  const ritmo = 365 / Math.max(dia, 30);
  const prevFact = r2(facturado * ritmo);
  const prevBeneficio = r2(beneficio * ritmo);

  // Mes a mes (sin IVA) y comparación con el mismo periodo del año anterior.
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mm = `${anio}-${String(i + 1).padStart(2, '0')}`;
    return { ing: suma(facturas.filter((x) => x.fecha.startsWith(mm)), (x) => x.base), gas: suma(gastos.filter((x) => x.fecha.startsWith(mm)), (x) => x.base) };
  });
  const hasta = esteAnio ? hoy.slice(5) : '12-31';
  const periodo = (y) => suma(facturas.filter((f) => f.fecha.startsWith(`${y}-`) && f.fecha.slice(5) <= hasta), (f) => f.base);
  const antes = periodo(anio - 1);
  const cambio = antes > 0 ? ((periodo(anio) - antes) / antes) * 100 : null;
  const tope = esteAnio ? Number(hoy.slice(5, 7)) - 1 : 11;
  const ultimoMes = Math.max(0, ...meses.map((m, i) => (i <= tope && (m.ing || m.gas) ? i : 0)));

  const porCliente = {};
  for (const f of facturas.filter((x) => x.fecha.startsWith(`${anio}-`))) porCliente[f.cliente.nombre] = r2((porCliente[f.cliente.nombre] || 0) + f.base);
  const top = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const limite = Number(emisor.limite) || 0;
  return {
    anio, anioActual, esteAnio, r, c303, c130, facturado, gastado, beneficio,
    plazo, debe, tHoy, qAhora, apartado, aPagar, mesPago: ['abril', 'julio', 'octubre', 'enero'][tHoy - 1],
    sinCobrar, porCobrar, vencidas, totalVencidas, prevFact, prevBeneficio, meses, cambio, ultimoMes, top, limite,
  };
}
