import { comprobarCierre } from '@/lib/cierres';
import { mensajePlan } from '@/lib/app';
import { guardar, leer, leerUno, redis, clave } from '@/lib/redis';
import { soltarEnlaces } from '@/lib/enlacesBanco';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { leerImporte, r2 } from '@/lib/calculos';
import { actividadesDe, actividadValida } from '@/lib/empresa';
import { gastoDeNomina, nominaCompleta, mesValido, importeNominaValido, diasDeAlta, fechaNominaValida } from '@/lib/nominas';
import { calcularFiniquito } from '@/lib/finiquito';
import { extrasNomina, resumenMes } from '@/lib/jornada';
import { secundarios } from '@/lib/trabajos';
import { hoy } from '@/lib/formato';
import { usarFuncion } from '@/lib/usoPlan';
import { conCerrojo, Ocupado } from '@/lib/cerrojo';

export const dynamic = 'force-dynamic';
// Un sueldo bruto mensual: más de 0 y sin cifras absurdas (un 1e309 llegaba como Infinity).
const MAX_BRUTO = 1000000;
class TrimestreCerrado extends Error {}
const brutoValido = (x) => Number.isFinite(x) && x > 0 && x <= MAX_BRUTO;
// Meses en que se pagan las pagas extra que no van prorrateadas: una en diciembre, dos en junio y diciembre…
const MESES_PAGAS = { 1: [12], 2: [6, 12], 3: [3, 6, 12], 4: [3, 6, 9, 12] };

// Cada nómina guarda también su gasto (bruto + Seguridad Social de la empresa), con id nomina-<id>.
// fiscal: cambia el importe (nueva o corregida). Un trimestre cerrado por la gestoría (lib/cierres.js) no admite gastos
// nuevos ni cambiados, tampoco los de nómina; marcarla como pagada, sí.
async function guardarConGasto(u, n, { fiscal = true } = {}) {
  const g = gastoDeNomina(n, actividadValida(actividadesDe(u)));
  const cerrado = fiscal && (await comprobarCierre(u, g.fecha));
  if (cerrado) throw new TrimestreCerrado(cerrado);
  await guardar(u, 'nominas', n);
  await guardar(u, 'gastos', g);
  await secundarios(u, { meses: [g.fecha] });
}

// Genera las nóminas de un mes para los empleados de alta ese mes (las que ya existan no se tocan).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const sinPlan = await usarFuncion(u, 'nominas');
  if (sinPlan) return error(mensajePlan(sinPlan, req.headers.get('user-agent')), 403);
  const b = await cuerpo(req), { mes } = b;
  if (b.tipo !== 'finiquito' && !mesValido(mes)) return error('Mes no válido');
  // Bajo cerrojo de la empresa: dos «Generar nóminas» a la vez (doble clic, dos pestañas) leían las mismas pendientes y
  // duplicaban nóminas y gastos.
  try {
    return await conCerrojo(`nominas:${u.empresa}`, async () => {
      const [empleados, nominas, jornada] = await Promise.all([leer(u, 'empleados'), leer(u, 'nominas'), leer(u, 'jornada')]);
      if (b.tipo === 'finiquito') {
        const e = empleados.find((e) => e.id === b.empleado);
        if (!e) return error('Ese empleado ya no existe', 404);
        if (nominas.some((n) => n.empleado === e.id && n.tipo === 'finiquito')) return error('Ese empleado ya tiene un finiquito guardado', 409);
        const datos = { ...b.datos, vacacionesDisfrutadas: numero(b.datos?.vacacionesDisfrutadas === undefined ? 0 : b.datos.vacacionesDisfrutadas) };
        const n = calcularFiniquito(e, datos, nominas);
        if (n.error) return error(n.error);
        const cerrado = await comprobarCierre(u, gastoDeNomina(n, '').fecha, ...(e.baja ? [e.baja] : []));
        if (cerrado) return error(cerrado, 409);
        if (b.guardar !== true) return Response.json({ finiquito: n });
        n.id = crypto.randomUUID();
        await guardarConGasto(u, n);
        await guardar(u, 'empleados', { ...e, baja: datos.baja });
        return Response.json({ ok: true, id: n.id });
      }
      const activos = (empleados || []).filter((e) => e.alta.slice(0, 7) <= mes && (!e.baja || e.baja.slice(0, 7) >= mes));
      if (!activos.length) return error('No hay empleados de alta ese mes');
      const hechas = new Set((nominas || []).filter((n) => n.mes === mes).map((n) => n.empleado));
      // Con el registro de jornada: las horas del mes quedan en la nómina y, si tiene precio de hora extra, se pagan.
      const nuevas = [];
      for (const e of activos.filter((x) => !hechas.has(x.id))) {
        const x = extrasNomina(resumenMes(jornada || [], e, mes), e);
        const base = { id: crypto.randomUUID(), mes, empleado: e.id, empleadoNombre: e.nombre, empleadoNif: e.nif, naf: e.naf, pagada: false, ...(x ? { horas: x.horas } : {}), ...(x?.importe ? { extras: { importe: x.importe, precio: e.precioHoraExtra } } : {}) };
        if (e.cotizacion) {
          // Nómina completa: bases y cuotas de 2026 y el IRPF del 145; con pagas sin prorratear, la del mes que toca.
          const pagaExtra = !e.cotizacion.prorrateadas && (MESES_PAGAS[e.cotizacion.pagas] || []).includes(Number(mes.slice(5, 7))) ? e.bruto : 0;
          // A tiempo parcial, la base mínima por las horas fichadas del mes (lib/cotizacion.js); el IRPF, con los meses de alta del año.
          const altaMes = diasDeAlta(e, mes);
          const sueldo = r2(e.bruto * (altaMes.entero ? 1 : (e.cotizacion.grupo >= 8 ? altaMes.dias / altaMes.total : Math.min(30, altaMes.dias) / 30)));
          const brutoMes = r2(sueldo + pagaExtra + (x?.importe || 0));
          const c = nominaCompleta(e, { bruto: brutoMes, pagaExtra, horasExtra: x?.importe || 0, numeroHorasExtra: r2((x?.horas?.extra || 0) / 60), mes, ...(x?.horas?.trabajadas ? { horas: r2(x.horas.trabajadas / 60) } : {}) });
          if (c.error) return error(`${e.nombre}: ${c.error}`);
          nuevas.push({ ...base, bruto: c.importes.bruto, ajustes: { bruto: brutoMes, pagaExtra, horasExtra: x?.importe || 0, numeroHorasExtra: r2((x?.horas?.extra || 0) / 60) }, ...c, completa: true });
        } else nuevas.push({ ...base, bruto: r2(e.bruto + (x?.importe || 0)), irpfPct: e.irpfPct, ssTrabajadorPct: e.ssTrabajadorPct, ssEmpresaPct: e.ssEmpresaPct });
      }
      const cerrado = await comprobarCierre(u, ...nuevas.map((n) => gastoDeNomina(n, '').fecha));
      if (cerrado) return error(cerrado, 409);
      for (const n of nuevas) await guardarConGasto(u, n);
      return Response.json({ ok: true, creadas: nuevas.length });
    }, { caduca: 60000 });
  } catch (e) {
    if (e instanceof Ocupado || e instanceof TrimestreCerrado) return error(e.message, 409);
    throw e;
  }
}

// Corregir una nómina (pagas extra, horas, otro % de IRPF) o marcarla como pagada.
async function corregir(req, u) {
  const b = await cuerpo(req);
  const antes = b.id && (await leerUno(u, 'nominas', b.id));
  if (!antes) return error('Esa nómina ya no existe', 404);
  const n = { ...antes };
  if ('pagada' in b && typeof b.pagada !== 'boolean') return error('El estado de pago debe ser verdadero o falso');
  if ('pagada' in b) {
    n.pagada = Boolean(b.pagada);
    n.pagado = n.pagada ? (antes.pagada && antes.pagado ? antes.pagado : hoy()) : undefined;
  }
  const fiscal = ['bruto', 'it', 'atrasos', 'pagaExtra', 'horasExtra', 'horasExtraFuerzaMayor', 'numeroHorasExtra', 'numeroHorasExtraFuerzaMayor', 'irpfPct', 'ssTrabajadorPct', 'ssEmpresaPct'].some((k) => k in b);
  if (fiscal && antes.tipo === 'finiquito') return error('El finiquito conserva su cálculo: bórralo y vuelve a calcularlo si necesitas corregirlo');
  if (fiscal) {
    const relacionadas = (await leer(u, 'nominas')) || [];
    if (relacionadas.some((n) => n.tipo === 'finiquito' && n.empleado === antes.empleado && n.mes >= antes.mes)) return error('Hay un finiquito calculado con estas nóminas: corrige primero el finiquito', 409);
    const e = await leerUno(u, 'empleados', antes.empleado);
    const bruto = numero('bruto' in b ? b.bruto : antes.ajustes?.bruto ?? antes.bruto);
    if (!importeNominaValido(bruto)) return error('El bruto debe ser un importe entre 0 y 1.000.000 €');
    if (e?.cotizacion) {
      const prev = antes.ajustes || {};
      const valor = (k, defecto) => numero(k in b ? b[k] : defecto);
      const datos = { bruto, pagaExtra: valor('pagaExtra', prev.pagaExtra ?? antes.detalle?.pagaExtra ?? 0), horasExtra: valor('horasExtra', prev.horasExtra ?? antes.detalle?.horasExtraResto ?? antes.detalle?.horasExtra ?? 0), horasExtraFuerzaMayor: valor('horasExtraFuerzaMayor', prev.horasExtraFuerzaMayor ?? 0), numeroHorasExtra: valor('numeroHorasExtra', prev.numeroHorasExtra ?? antes.detalle?.numeroHorasExtra ?? r2((antes.horas?.extra || 0) / 60)), numeroHorasExtraFuerzaMayor: valor('numeroHorasExtraFuerzaMayor', prev.numeroHorasExtraFuerzaMayor ?? antes.detalle?.numeroHorasExtraFuerzaMayor ?? 0) };
      const tipo = 'irpfPct' in b ? (String(b.irpfPct).trim() !== '' ? numero(b.irpfPct) : undefined) : antes.irpfPct;
      if (tipo !== undefined && !importeNominaValido(tipo, 100)) return error('IRPF no válido: debe estar entre 0 y 100 %');
      const nominas = await leer(u, 'nominas');
      const entradaIT = 'it' in b ? b.it : prev.it;
      const it = entradaIT ? referenciaIT(e, entradaIT, nominas) : null;
      if (it?.error) return error(it.error);
      const entradaAtrasos = 'atrasos' in b ? b.atrasos : prev.atrasos;
      const atrasos = entradaAtrasos ? { importe: numero(entradaAtrasos.importe), meses: entradaAtrasos.meses } : null;
      const c = nominaCompleta(e, { ...datos, it, atrasos, irpfPct: tipo, mes: antes.mes, ...(antes.horas?.trabajadas ? { horas: r2(antes.horas.trabajadas / 60) } : {}) });
      if (c.error) return error(c.error);
      Object.assign(n, c, { bruto: c.importes.bruto, completa: true, ajustes: { ...datos, it, atrasos } });
    } else {
      if (b.it || b.atrasos || antes.ajustes?.it || antes.ajustes?.atrasos) return error('Completa los datos de cotización del empleado para usar IT o atrasos');
      if (!brutoValido(bruto)) return error('Escribe el sueldo bruto del mes: un importe mayor que 0 €');
      n.bruto = bruto;
      delete n.importes; delete n.detalle; delete n.completa;
      for (const k of ['irpfPct', 'ssTrabajadorPct', 'ssEmpresaPct']) if (k in b) {
        const v = numero(b[k]);
        if (!importeNominaValido(v, 100)) return error('Los porcentajes deben estar entre 0 y 100');
        n[k] = v;
      }
    }
  }
  try { await guardarConGasto(u, n, { fiscal }); } catch (e) { if (e instanceof TrimestreCerrado) return error(e.message, 409); throw e; }
  return Response.json({ ok: true });
}

async function eliminar(req, u) {
  const id = req.nextUrl.searchParams.get('id');
  const antes = id && (await leerUno(u, 'nominas', id));
  if (!antes) return error('Esa nómina ya no existe', 404);
  const relacionadas = (await leer(u, 'nominas')) || [];
  if (antes.tipo !== 'finiquito' && relacionadas.some((n) => n.tipo === 'finiquito' && n.empleado === antes.empleado && n.mes >= antes.mes)) return error('Hay un finiquito calculado con esta nómina: borra primero el finiquito', 409);
  const cerrado = await comprobarCierre(u, gastoDeNomina(antes, '').fecha);
  if (cerrado) return error(cerrado, 409);
  // El gasto de la nómina se va con ella; si su pago estaba emparejado con el banco, el cargo vuelve a pendiente.
  const tx = redis.multi().hdel(clave(u, 'nominas'), id).hdel(clave(u, 'gastos'), `nomina-${id}`);
  await soltarEnlaces(u, tx, 'gasto', `nomina-${id}`);
  await tx.exec();
  await secundarios(u, { meses: [gastoDeNomina(antes, '').fecha] });
  return Response.json({ ok: true });
}

const numero = (v) => typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? leerImporte(v) : NaN;

// La referencia es el mes anterior al inicio del proceso, también en una IT que continúa varios meses.
function referenciaIT(e, entrada, nominas) {
  const it = { ...entrada };
  if (!fechaNominaValida(it.baja)) return { error: 'Fecha de baja médica no válida' };
  for (const k of ['baseAnterior', 'baseATAnterior', 'horasExtraMesAnterior', 'horasExtraAnteriores', 'complementoPct']) {
    if (it[k] !== undefined && it[k] !== '') it[k] = numero(it[k]);
    else delete it[k];
  }
  const f = new Date(`${it.baja?.slice(0, 7)}-01T00:00:00Z`);
  if (!Number.isFinite(f.getTime())) return { error: 'Fecha de baja médica no válida' };
  f.setUTCMonth(f.getUTCMonth() - 1);
  const anterior = f.toISOString().slice(0, 7);
  const n = nominas.find((n) => n.empleado === e.id && n.mes === anterior && n.tipo !== 'finiquito' && n.detalle);
  if (n) { it.baseAnterior = n.detalle.base; it.baseATAnterior = n.detalle.baseAT; it.horasExtraMesAnterior = n.detalle.horasExtra || 0; }
  if (it.horasExtraAnteriores === undefined) {
    const anio = String(Number(it.baja.slice(0, 4)) - 1);
    const anuales = nominas.filter((n) => n.empleado === e.id && n.tipo !== 'finiquito' && n.mes.startsWith(`${anio}-`) && n.detalle);
    const esperados = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`).filter((mes) => diasDeAlta(e, mes).dias > 0);
    if (esperados.length && esperados.every((mes) => anuales.some((n) => n.mes === mes))) it.horasExtraAnteriores = r2(anuales.reduce((s, n) => s + (n.detalle.horasExtra || 0), 0));
  }
  // Se conserva la ausencia del histórico anual: calculoIT la muestra como aviso, nunca como cero confirmado.
  return it;
}

async function mutar(req, accion) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  try { return await conCerrojo(`nominas:${u.empresa}`, () => accion(req, u), { caduca: 60000 }); }
  catch (e) { if (e instanceof Ocupado || e instanceof TrimestreCerrado) return error(e.message, 409); throw e; }
}
export async function PATCH(req) { return mutar(req, corregir); }
export async function DELETE(req) { return mutar(req, eliminar); }
