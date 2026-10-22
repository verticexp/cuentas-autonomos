import { mensajePlan } from '@/lib/app';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { sinFuncion } from '@/lib/planes';
import { emparejar } from '@/lib/bancoServidor';
import { auditar } from '@/lib/auditoria';
import { leerImporte, nifUE, r2, COMPENSACION } from '@/lib/calculos';
import { validarGasto } from '@/lib/validacion';
import { afectoPctDe, deduciblePctDe } from '@/lib/ivaDeducible';
import { actividadesDe, actividadValida } from '@/lib/empresa';
import { CATEGORIAS } from '@/lib/categorias';
import { TIPOS_BIEN, inversionEditada } from '@/lib/amortizaciones';
import { limpiarProyecto } from '@/lib/proyectos';
import { borrarGasto, crearGasto, editarGasto, pagarGasto } from '@/lib/gastosServidor';
import { hoy } from '@/lib/formato';
import { secundarios } from '@/lib/trabajos';
import { borrarJustificantes, huellaValida } from '@/lib/justificantes';

export const dynamic = 'force-dynamic';

// Sin IVA en la factura, de dónde es el proveedor: 'es', 'ue' (otro país de la UE) o 'fuera'. Si no se dice y el NIF
// es un NIF-IVA de la UE, 'ue'. Con IVA, nada (lib/calculos.js origenGasto).
const origenDe = (b, ivaPct) => {
  if (ivaPct) return undefined;
  if (['es', 'ue', 'fuera'].includes(b.origen)) return b.origen;
  return b.proveedor && nifUE(b.proveedorNif) ? 'ue' : undefined;
};

// Retención que le haces a un profesional (por ejemplo, la gestoría): 15 % o 7 % (los que empiezan). Va en el 111.
const retencionDe = (b) => ([7, 15].includes(Number(b.irpfPct)) ? Number(b.irpfPct) : undefined);

// Categoría del plan contable (si no se elige, Fisquo la deduce del concepto) y bien de inversión (se amortiza en años).
const categoriaDe = (b) => (CATEGORIAS.some((c) => c.id === b.categoria) ? b.categoria : undefined);
const inversionDe = (b) => (b.inversion && TIPOS_BIEN.some((t) => t.id === b.inversion.tipo) ? { tipo: b.inversion.tipo } : undefined);
// Productos que entran al almacén con este gasto (inventario): [{ producto, cantidad, coste unitario sin IVA }].
const stockDe = (b) => {
  const l = (Array.isArray(b.stock) ? b.stock : []).slice(0, 50).map((x) => ({ producto: String(x.producto || ''), cantidad: Math.round((Number(String(x.cantidad).replace(',', '.')) || 0) * 1000) / 1000, coste: r2(leerImporte(x.coste) || 0) }))
    .filter((x) => /^[a-f0-9]{12}$/.test(x.producto) && x.cantidad > 0);
  return l.length ? l : undefined;
};

// Factura del proveedor (opcional): su número y, si llegó como factura electrónica, en qué formato (facturae, ubl, cii).
const facturaDe = (b) => {
  const numero = String(b.numero || '').trim().slice(0, 40);
  return { ...(numero ? { numero } : {}), ...(['facturae', 'ubl', 'cii'].includes(b.efactura) ? { efactura: b.efactura } : {}) };
};

// Proveedor (opcional): nombre y NIF de quien emite el ticket o la factura.
const proveedorDe = (b) => {
  const nombre = String(b.proveedor || '').trim().slice(0, 80);
  const nif = String(b.proveedorNif || '').trim().toUpperCase().slice(0, 20);
  return { ...(nombre ? { proveedor: nombre } : {}), ...(nombre && nif ? { proveedorNif: nif } : {}) };
};

export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  if (b.banco) {
    const no = sinFuncion(u.plan, 'revision');
    if (no) return error(mensajePlan(no, req.headers.get('user-agent')), 403);
  }
  const v = validarGasto(b);
  if (!v.ok) return Response.json({ error: v.error, errores: v.errores }, { status: 400 });
  const base = r2(leerImporte(b.base));
  const g = {
    id: crypto.randomUUID(),
    fecha: b.fecha,
    actividad: actividadValida(actividadesDe(u), b.actividad),
    concepto: String(b.concepto).trim().slice(0, 140),
    base,
    ivaPct: Math.min(100, Math.max(0, Number(b.ivaPct) || 0)),
    ...proveedorDe(b),
    ...facturaDe(b),
    ...(limpiarProyecto(b.proyecto) ? { proyecto: limpiarProyecto(b.proyecto) } : {}),
    ...(b.pendiente ? { pendiente: true } : {}),
    ...(b.alquiler ? { alquiler: true } : {}),
    // Proveedor en el criterio de caja (lo dice su factura): su IVA se deduce al pagarlo (lib/calculos.js).
    ...(b.recc ? { recc: true } : {}),
    // Compra a quien está en el régimen de la agricultura: sin IVA, con la compensación del 12 o el 10,5 % (casilla 42).
    ...(COMPENSACION.includes(Number(b.compensacion)) && !(Number(b.ivaPct) > 0) ? { compensacion: Number(b.compensacion) } : {}),
    ...(deduciblePctDe(b.deduciblePct) !== undefined ? { deduciblePct: deduciblePctDe(b.deduciblePct) } : {}),
    ...(afectoPctDe(b.afectoPct) !== undefined ? { afectoPct: afectoPctDe(b.afectoPct) } : {}),
    ...(categoriaDe(b) ? { categoria: categoriaDe(b) } : {}),
    ...(inversionDe(b) ? { inversion: inversionDe(b) } : {}),
    ...(stockDe(b) ? { stock: stockDe(b), categoria: categoriaDe(b) || '600' } : {}),
    // Huella del justificante que el navegador va a subir justo después (PUT /api/gastos/justificante): avisa de duplicados
    // ya al guardar. Al subirlo, el servidor la vuelve a calcular sobre el archivo.
    ...(huellaValida(b.huella) ? { archivo: { huella: b.huella } } : {}),
  };
  if (origenDe(b, g.ivaPct)) g.origen = origenDe(b, g.ivaPct);
  if (retencionDe(b)) g.irpfPct = retencionDe(b);
  const alta = await crearGasto(u, g, { duplicadoConfirmado: b.duplicadoConfirmado });
  if (alta.error) return Response.json(alta, { status: 409 });
  Object.assign(g, alta.gasto);
  // Apuntado desde un movimiento del banco que no tenía gasto: queda emparejado (y pagado con la fecha del banco).
  // Si el cargo no casa con el gasto (informe R01), el gasto queda apuntado sin emparejar y se avisa.
  const emp = b.banco ? await emparejar(u, String(b.banco), 'gasto', g.id) : null;
  await secundarios(u, { gastos: [g.id], meses: [g.fecha] });
  return Response.json({ ok: true, gasto: g, ...(emp?.error ? { aviso: `Gasto guardado, pero sin emparejar con el banco: ${emp.error}` } : {}) });
}

export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  if (!b.id) return error('Ese gasto ya no existe', 404);
  // Solo {id, pagado: true}: marcar como pagado un gasto sin pagar (deslizar en la lista), sin tocar nada más.
  if (Object.keys(b).length === 2 && b.pagado === true) {
    const p = await pagarGasto(u, String(b.id), hoy());
    if (p.error) return error(p.error, p.status || 400);
    await secundarios(u, { meses: [p.antes.fecha] });
    return Response.json({ ok: true });
  }
  // Se valida y se construye sobre el gasto releído dentro del cerrojo de su pedido (informe R04), si es de una recepción.
  const r = await editarGasto(u, String(b.id), (antes) => {
    const v = validarGasto(b, { antes });
    if (!v.ok) return { error: v.error, errores: v.errores, status: 400 };
    const base = r2(leerImporte(b.base));
    const g = { ...antes, fecha: b.fecha, actividad: actividadValida(actividadesDe(u), b.actividad), concepto: String(b.concepto).trim().slice(0, 140), base, ivaPct: Math.min(100, Math.max(0, Number(b.ivaPct) || 0)), proveedor: undefined, proveedorNif: undefined, ...proveedorDe(b), numero: undefined, efactura: antes.efactura, ...facturaDe(b), proyecto: limpiarProyecto(b.proyecto) || undefined, pendiente: b.pendiente ? true : undefined, alquiler: b.alquiler ? true : undefined, recc: b.recc ? true : undefined, compensacion: COMPENSACION.includes(Number(b.compensacion)) && !(Number(b.ivaPct) > 0) ? Number(b.compensacion) : undefined, deduciblePct: deduciblePctDe(b.deduciblePct), afectoPct: afectoPctDe(b.afectoPct), categoria: stockDe(b) ? categoriaDe(b) || '600' : categoriaDe(b), inversion: inversionEditada(inversionDe(b), antes.inversion), stock: stockDe(b) };
    g.origen = origenDe(b, g.ivaPct);
    g.irpfPct = retencionDe(b);
    if (antes.inversion?.acumulada !== undefined && !g.inversion) return { error: 'Este bien trae su amortización de otro programa: no se puede dejar de amortizar desde aquí' };
    return { gasto: g };
  });
  if (r.errores) return Response.json({ error: r.error, errores: r.errores }, { status: 400 });
  if (r.error) return error(r.error, r.status || 400);
  const { antes, gasto: g } = r;
  if (antes.inversion && antes.inversion.tipo !== g.inversion?.tipo) await auditar(u, 'Criterio de amortización cambiado', `${antes.concepto} · ${antes.inversion.tipo} → ${g.inversion?.tipo || 'sin inversión'}`);
  await secundarios(u, { meses: [antes.fecha, g.fecha] });
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  // Si venía de un pedido a proveedor, se quita su recepción (el pedido recupera sus unidades pendientes) a la vez.
  const r = await borrarGasto(u, id);
  if (r.error) return error(r.error, r.status || 400);
  const { antes } = r;
  if (antes) await auditar(u, 'Gasto borrado', `${antes.concepto} · ${antes.fecha} · ${antes.base} € sin IVA`);
  if (antes?.archivo) await borrarJustificantes(u, [antes.archivo]);
  if (antes) await secundarios(u, { meses: [antes.fecha] });
  return Response.json({ ok: true });
}
