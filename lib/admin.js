// Cifras del panel del administrador de Fisquo (/admin), sin React para poder probarlas: estado de cada empresa,
// ingresos recurrentes, pruebas, conversión, altas y actividad (lib/actividad.js).
import { importe } from './planes.js';
import { diasPrueba, esFundador, planDe, TIPOS, TIPOS_ALTA } from './prueba.js';
import { membresias } from './membresias.js';
import { nifDeSociedad, pareceSociedad } from './formaJuridica.js';

const DIA = 86400000;
export const ESTADOS = { pago: 'De pago', impago: 'Pago fallido', despacho: 'La paga su gestoría', prueba: 'En prueba', caducada: 'Prueba acabada', cancelada: 'Cancelada', fundador: 'Fundador' };

export function estadoEmpresa(e, hoy = new Date()) {
  const p = e.plan;
  if (esFundador(p)) return 'fundador';
  // Licencia pagada por su despacho (lib/licencias.js): no cuenta como ingreso de la empresa; se cobra al despacho.
  if (p.porDespacho) return 'despacho';
  if (p.pagado) return ['past_due', 'unpaid', 'incomplete'].includes(p.estado) ? 'impago' : 'pago';
  if (diasPrueba(p, hoy) === 0) return p.suscripcion ? 'cancelada' : 'caducada';
  return 'prueba';
}

// Lo que paga al mes, en céntimos y sin IVA (el anual, repartido en 12), con el cupón de Stripe si sigue vigente
// (lib/suscripcion.js descuentoDe: { pct } o { cent } por factura).
export function mensualDe(plan, hoy = new Date()) {
  const periodo = plan?.periodo === 'anio' ? 'anio' : 'mes';
  let c = plan?.tipo && importe(plan.tipo, plan.nombre, periodo);
  if (!c) return 0;
  const d = plan.descuento;
  if (d && (!d.hasta || d.hasta >= hoy.toISOString().slice(0, 10))) c = d.pct ? c * (1 - d.pct / 100) : Math.max(0, c - (d.cent || 0));
  return Math.round(periodo === 'anio' ? c / 12 : c);
}

// De dónde viene la empresa: registro normal, código de gestoría (3 meses), recomendación (2 meses) o Fundador.
export const ORIGENES = { web: 'Registro', gestoria: 'Gestoría', recomendacion: 'Recomendación', fundador: 'Fundador' };
const origenDe = (e) => (!e.plan?.tipo ? 'fundador' : e.plan.gestoria ? 'gestoria' : e.plan.recomendacion ? 'recomendacion' : 'web');

// Planes que no cuadran con la forma jurídica: una sociedad con plan de Autónomos (lib/formaJuridica.js). El bloqueo
// solo frena cambios nuevos; las cuentas que ya estaban así se enseñan en /admin sin tocarlas. Fundador y las cuentas
// sin plan no cuentan. Devuelve los motivos (vacío si cuadra).
export function motivosForma(e) {
  if (e.plan?.tipo !== 'aut' || esFundador(e.plan)) return [];
  const motivos = [];
  if (e.emisor?.nif && nifDeSociedad(e.emisor.nif)) motivos.push('NIF de sociedad');
  if ([e.emisor?.nombre, e.nombre].some(pareceSociedad)) motivos.push('Nombre de sociedad');
  if (e.fiscal?.tipo === 'sociedad') motivos.push('Forma: sociedad');
  return motivos;
}

const lunes = (d) => { const x = new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };

// empresas, usuarios: los valores de los hash de Redis. actividad: lib/actividad.js actividadReciente. ultima: { empresa: día }.
export function resumenAdmin({ empresas = [], usuarios = [], actividad = {}, ultima = {}, hoy = new Date() }) {
  const vivas = empresas.filter((e) => e?.id && !e.baja);
  const nombres = Object.fromEntries(vivas.map((e) => [e.id, e.nombre]));
  const personas = {};
  for (const u of usuarios) for (const id of Object.keys(membresias(u))) personas[id] = (personas[id] || 0) + 1;
  const filas = vivas.map((e) => {
    const estado = estadoEmpresa(e, hoy);
    const motivos = motivosForma(e);
    return {
      id: e.id, nombre: e.nombre || e.emisor?.nombre || '(sin nombre)', nif: e.emisor?.nif || '', creada: (e.creada || '').slice(0, 10),
      estado, tipo: e.plan?.tipo ? TIPOS[e.plan.tipo] : '', plan: e.plan?.nombre || '', periodo: e.plan?.periodo || 'mes',
      dias: diasPrueba(e.plan, hoy), hasta: e.plan?.hasta || '', mensual: ['pago', 'impago'].includes(estado) ? mensualDe(e.plan, hoy) : 0,
      origen: origenDe(e), recomendadaPor: e.plan?.recomendacion ? nombres[e.plan.recomendacion.empresa] || 'empresa de baja' : '',
      premiada: e.plan?.recomendacion?.premiada || '', mesesGanados: e.recomienda?.meses || 0,
      cupon: e.plan?.descuento ? `${e.plan.descuento.codigo ? `${e.plan.descuento.codigo} · ` : ''}${e.plan.descuento.pct ? `−${e.plan.descuento.pct} %` : `−${(e.plan.descuento.cent / 100).toLocaleString('es-ES')} €`}${e.plan.descuento.hasta ? ` hasta ${e.plan.descuento.hasta}` : ''}` : '',
      personas: personas[e.id] || 0, ultima: ultima[e.id] || '', gestoria: e.plan?.gestoria || '', regalo: Boolean(e.plan?.fundador), tipoId: e.plan?.tipo || '', clienteStripe: e.plan?.cliente || '', suscripcion: e.plan?.suscripcion || '', registrada: Boolean(e.plan?.tipo),
      forma: motivos.length ? 'no-cuadra' : '', motivoForma: motivos.join(' · '),
    };
  }).sort((a, b) => b.creada.localeCompare(a.creada));

  const cuenta = (f) => filas.filter(f).length;
  const porEstado = Object.fromEntries(Object.keys(ESTADOS).map((k) => [k, cuenta((x) => x.estado === k)]));
  const mrr = filas.filter((x) => x.estado === 'pago').reduce((s, x) => s + x.mensual, 0);
  // Conversión: de las empresas que se registraron y ya han acabado la prueba, cuántas pagan.
  const acabadas = filas.filter((x) => x.registrada && !x.regalo && ['pago', 'impago', 'caducada', 'cancelada'].includes(x.estado));
  const conversion = acabadas.length ? Math.round((100 * acabadas.filter((x) => ['pago', 'impago'].includes(x.estado)).length) / acabadas.length) : null;

  const semana0 = lunes(hoy);
  const altas = Array.from({ length: 12 }, (_, i) => {
    const desde = new Date(semana0.getTime() - (11 - i) * 7 * DIA), hasta = new Date(desde.getTime() + 7 * DIA);
    const n = filas.filter((x) => x.registrada && !x.regalo && x.creada && Date.parse(x.creada) >= desde.getTime() && Date.parse(x.creada) < hasta.getTime()).length;
    return { desde: desde.toISOString().slice(0, 10), n };
  });
  const mes = hoy.toISOString().slice(0, 7);
  const dias = Object.keys(actividad).sort();
  const unicos = (n) => new Set(dias.slice(-n).flatMap((d) => actividad[d].usuarios)).size;
  const planes = {};
  for (const x of filas) if (['pago', 'prueba', 'impago'].includes(x.estado)) {
    const k = `${x.tipo} ${x.plan}`;
    planes[k] = planes[k] || { plan: k, pago: 0, prueba: 0 };
    planes[k][x.estado === 'prueba' ? 'prueba' : 'pago']++;
  }

  // Por origen: cuántas se registran y cuántas acaban pagando (la conversión de cada canal).
  const origenes = Object.keys(ORIGENES).filter((o) => o !== 'fundador').map((o) => {
    const de = filas.filter((x) => x.origen === o && !x.regalo);
    const acabadas = de.filter((x) => ['pago', 'impago', 'caducada', 'cancelada'].includes(x.estado));
    const pagan = de.filter((x) => ['pago', 'impago'].includes(x.estado)).length;
    return { origen: o, total: de.length, prueba: de.filter((x) => x.estado === 'prueba').length, pagan, conversion: acabadas.length ? Math.round((100 * pagan) / acabadas.length) : null };
  });
  const recomendaciones = {
    registradas: filas.filter((x) => x.origen === 'recomendacion').length,
    premiadas: filas.filter((x) => x.premiada).length,
    meses: filas.reduce((s, x) => s + x.mesesGanados, 0),
    top: filas.filter((x) => x.mesesGanados).sort((a, b) => b.mesesGanados - a.mesesGanados).slice(0, 5).map((x) => ({ nombre: x.nombre, meses: x.mesesGanados })),
  };
  return {
    filas, porEstado, origenes, recomendaciones, planes: Object.values(planes).sort((a, b) => b.pago + b.prueba - a.pago - a.prueba),
    kpis: {
      empresas: filas.length, mrr, arr: mrr * 12, conversion,
      altasMes: cuenta((x) => x.registrada && !x.regalo && x.creada.startsWith(mes)),
      usuarios: usuarios.length, verificados: usuarios.filter((u) => u.emailVerificado).length,
      activosHoy: unicos(1), activos7: unicos(7), activos30: unicos(30),
      formaNoCuadra: cuenta((x) => x.forma === 'no-cuadra'),
      pruebasQueAcabanEn7: filas.filter((x) => x.estado === 'prueba' && x.dias !== null && x.dias <= 7).length,
    },
    altas,
    diario: dias.map((d) => ({ dia: d, usuarios: actividad[d].usuarios.length, empresas: actividad[d].empresas.length })),
  };
}

// Cambios que el administrador de Fisquo hace en el plan de una empresa (app/api/admin). Devuelve { plan } o { error }.
// 'plan' cambia el plan (tipo y nombre) solo si no lo cobra Stripe: con suscripción, Stripe lo volvería a pisar.
export function cambioDePlan(e, accion, { dias = 0, tipo = '', nombre = '', hoy = new Date() } = {}) {
  const p = e.plan;
  const dia = hoy.toISOString().slice(0, 10);
  if (accion === 'fundador') {
    if (esFundador(p)) return { error: 'Ya tiene el plan Fundador' };
    if (p.pagado && p.suscripcion) return { error: 'Tiene una suscripción en Stripe: cancélala primero para que no se le siga cobrando.' };
    return { plan: { ...p, fundador: true, fundadorDesde: dia } };
  }
  if (accion === 'quitar-fundador') {
    if (!p?.fundador) return { error: p ? 'No tiene un plan Fundador regalado' : 'Es una cuenta anterior a los planes: no tiene un plan al que volver' };
    const { fundador, fundadorDesde, ...resto } = p;
    return { plan: resto };
  }
  if (accion === 'alargar') {
    const n = Math.round(Number(dias));
    if (!(n >= 1 && n <= 90)) return { error: 'Elige entre 1 y 90 días' };
    if (esFundador(p) || p.pagado) return { error: 'Solo se alarga una prueba' };
    const base = p.hasta && p.hasta >= dia ? p.hasta : new Date(hoy.getTime() - DIA).toISOString().slice(0, 10);
    return { plan: { ...p, hasta: new Date(Date.parse(`${base}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10) } };
  }
  if (accion === 'plan') {
    if (esFundador(p)) return { error: p ? 'Tiene el plan Fundador: quítaselo primero' : 'Es una cuenta anterior a los planes: no tiene límites' };
    if (p.pagado || p.suscripcion) return { error: 'Tiene una suscripción en Stripe: cámbiale el plan en Stripe para que se le cobre lo mismo.' };
    if (!Object.hasOwn(TIPOS_ALTA, tipo) || !planDe(tipo, nombre)) return { error: 'Ese plan no existe' };
    if (tipo === 'aut' && motivosForma({ ...e, plan: { ...p, tipo } }).length) return { error: 'Es una sociedad: solo puede tener un plan de Pymes' };
    if (p.tipo === tipo && p.nombre === nombre) return { error: 'Ya tiene ese plan' };
    return { plan: { ...p, tipo, nombre } };
  }
  return { error: 'Acción no válida' };
}
