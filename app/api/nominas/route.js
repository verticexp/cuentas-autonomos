import { mensajePlan } from '@/lib/app';
import { guardar, leer, leerUno, redis, clave } from '@/lib/redis';
import { soltarEnlaces } from '@/lib/enlacesBanco';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { leerImporte, r2 } from '@/lib/calculos';
import { actividadesDe, actividadValida } from '@/lib/empresa';
import { gastoDeNomina, nominaCompleta } from '@/lib/nominas';
import { extrasNomina, resumenMes } from '@/lib/jornada';
import { secundarios } from '@/lib/trabajos';
import { hoy } from '@/lib/formato';
import { usarFuncion } from '@/lib/usoPlan';
import { conCerrojo, Ocupado } from '@/lib/cerrojo';

export const dynamic = 'force-dynamic';
// Un sueldo bruto mensual: más de 0 y sin cifras absurdas (un 1e309 llegaba como Infinity).
const MAX_BRUTO = 1000000;
const brutoValido = (x) => Number.isFinite(x) && x > 0 && x <= MAX_BRUTO;
// Meses en que se pagan las pagas extra que no van prorrateadas: una en diciembre, dos en junio y diciembre…
const MESES_PAGAS = { 1: [12], 2: [6, 12], 3: [3, 6, 12], 4: [3, 6, 9, 12] };

// Cada nómina guarda también su gasto (bruto + Seguridad Social de la empresa), con id nomina-<id>.
async function guardarConGasto(u, n) {
  await guardar(u, 'nominas', n);
  const g = gastoDeNomina(n, actividadValida(actividadesDe(u)));
  await guardar(u, 'gastos', g);
  await secundarios(u, { meses: [g.fecha] });
}

// Genera las nóminas de un mes para los empleados de alta ese mes (las que ya existan no se tocan).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const sinPlan = await usarFuncion(u, 'nominas');
  if (sinPlan) return error(mensajePlan(sinPlan, req.headers.get('user-agent')), 403);
  const { mes } = await cuerpo(req);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '')) return error('Mes no válido');
  // Bajo cerrojo de la empresa: dos «Generar nóminas» a la vez (doble clic, dos pestañas) leían las mismas pendientes y
  // duplicaban nóminas y gastos.
  try {
    return await conCerrojo(`nominas:${u.empresa}`, async () => {
      const [empleados, nominas, jornada] = await Promise.all([leer(u, 'empleados'), leer(u, 'nominas'), leer(u, 'jornada')]);
      const activos = (empleados || []).filter((e) => e.alta.slice(0, 7) <= mes && (!e.baja || e.baja.slice(0, 7) >= mes));
      if (!activos.length) return error('No hay empleados de alta ese mes');
      const hechas = new Set((nominas || []).filter((n) => n.mes === mes).map((n) => n.empleado));
      // Con el registro de jornada: las horas del mes quedan en la nómina y, si tiene precio de hora extra, se pagan.
      const nuevas = [];
      for (const e of activos.filter((x) => !hechas.has(x.id))) {
        const x = extrasNomina(resumenMes(jornada || [], e, mes), e);
        const base = { id: crypto.randomUUID(), mes, empleado: e.id, empleadoNombre: e.nombre, pagada: false, ...(x ? { horas: x.horas } : {}), ...(x?.importe ? { extras: { importe: x.importe, precio: e.precioHoraExtra } } : {}) };
        if (e.cotizacion) {
          // Nómina completa: bases y cuotas de 2026 y el IRPF del 145; con pagas sin prorratear, la del mes que toca.
          const pagaExtra = !e.cotizacion.prorrateadas && (MESES_PAGAS[e.cotizacion.pagas] || []).includes(Number(mes.slice(5, 7))) ? e.bruto : 0;
          const c = nominaCompleta(e, { bruto: r2(e.bruto + pagaExtra + (x?.importe || 0)), pagaExtra, horasExtra: x?.importe || 0 });
          if (c.error) return error(`${e.nombre}: ${c.error}`);
          nuevas.push({ ...base, bruto: c.importes.bruto, ...c, completa: true });
        } else nuevas.push({ ...base, bruto: r2(e.bruto + (x?.importe || 0)), irpfPct: e.irpfPct, ssTrabajadorPct: e.ssTrabajadorPct, ssEmpresaPct: e.ssEmpresaPct });
      }
      for (const n of nuevas) await guardarConGasto(u, n);
      return Response.json({ ok: true, creadas: nuevas.length });
    }, { caduca: 60000 });
  } catch (e) {
    if (e instanceof Ocupado) return error(e.message, 409);
    throw e;
  }
}

// Corregir una nómina (pagas extra, horas, otro % de IRPF) o marcarla como pagada.
export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const b = await cuerpo(req);
  const antes = b.id && (await leerUno(u, 'nominas', b.id));
  if (!antes) return error('Esa nómina ya no existe', 404);
  const n = { ...antes };
  if ('pagada' in b) {
    n.pagada = Boolean(b.pagada);
    n.pagado = n.pagada ? (antes.pagada && antes.pagado ? antes.pagado : hoy()) : undefined;
  }
  if ('bruto' in b) {
    n.bruto = r2(leerImporte(b.bruto));
    if (!brutoValido(n.bruto)) return error('Escribe el sueldo bruto del mes: un importe mayor que 0 €.');
    const e = antes.completa && (await leerUno(u, 'empleados', antes.empleado));
    if (e?.cotizacion) {
      // Nómina completa: se recalcula con los datos de ahora del empleado; el IRPF, a mano si se escribe.
      const pagaExtra = 'pagaExtra' in b ? r2(leerImporte(b.pagaExtra) || 0) : antes.detalle?.pagaExtra || 0;
      const horasExtra = 'horasExtra' in b ? r2(leerImporte(b.horasExtra) || 0) : antes.detalle?.horasExtra || 0;
      if (pagaExtra < 0 || horasExtra < 0 || pagaExtra + horasExtra > n.bruto) return error('La paga extra y las horas extra van dentro del bruto del mes');
      const c = nominaCompleta(e, { bruto: n.bruto, pagaExtra, horasExtra, irpfPct: 'irpfPct' in b && String(b.irpfPct).trim() !== '' ? Number(String(b.irpfPct).replace(',', '.')) : undefined });
      if (c.error) return error(c.error);
      Object.assign(n, c, { completa: true });
    } else {
      // El porcentaje que no llega se queda como estaba (antes pasaba a 0).
      delete n.importes; delete n.detalle; delete n.completa;
      for (const k of ['irpfPct', 'ssTrabajadorPct', 'ssEmpresaPct']) if (k in b) n[k] = Math.min(100, Math.max(0, Number(String(b[k]).replace(',', '.')) || 0));
    }
  }
  await guardarConGasto(u, n);
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  const antes = id && (await leerUno(u, 'nominas', id));
  if (!antes) return error('Esa nómina ya no existe', 404);
  // El gasto de la nómina se va con ella; si su pago estaba emparejado con el banco, el cargo vuelve a pendiente.
  const tx = redis.multi().hdel(clave(u, 'nominas'), id).hdel(clave(u, 'gastos'), `nomina-${id}`);
  await soltarEnlaces(u, tx, 'gasto', `nomina-${id}`);
  await tx.exec();
  await secundarios(u, { meses: [gastoDeNomina(antes, '').fecha] });
  return Response.json({ ok: true });
}
