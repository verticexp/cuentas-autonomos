import { guardar, borrar, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { subirGasto } from '@/lib/drive';
import { enviarNomina } from '@/lib/controlat';
import { emparejar } from '@/lib/bancoServidor';
import { auditar } from '@/lib/auditoria';
import { leerImporte, nifUE, r2 } from '@/lib/calculos';
import { actividadesDe, actividadValida } from '@/lib/empresa';
import { CATEGORIAS } from '@/lib/categorias';
import { TIPOS_BIEN } from '@/lib/amortizaciones';

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

// Categoría del plan contable (si no se elige, Netto la deduce del concepto) y bien de inversión (se amortiza en años).
const categoriaDe = (b) => (CATEGORIAS.some((c) => c.id === b.categoria) ? b.categoria : undefined);
const inversionDe = (b) => (b.inversion && TIPOS_BIEN.some((t) => t.id === b.inversion.tipo) ? { tipo: b.inversion.tipo } : undefined);

// Productos que entran al almacén con este gasto (inventario): [{ producto, cantidad, coste unitario sin IVA }].
const stockDe = (b) => {
  const l = (Array.isArray(b.stock) ? b.stock : []).slice(0, 50).map((x) => ({ producto: String(x.producto || ''), cantidad: Math.round((Number(String(x.cantidad).replace(',', '.')) || 0) * 1000) / 1000, coste: r2(leerImporte(x.coste) || 0) }))
    .filter((x) => /^[a-f0-9]{12}$/.test(x.producto) && x.cantidad > 0);
  return l.length ? l : undefined;
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
  const base = r2(leerImporte(b.base));
  if (!base) return error('Importe no válido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) return error('Fecha no válida');
  if (!String(b.concepto || '').trim()) return error('Falta el concepto');
  const g = {
    id: crypto.randomUUID(),
    fecha: b.fecha,
    actividad: actividadValida(actividadesDe(u), b.actividad),
    concepto: String(b.concepto).trim().slice(0, 140),
    base,
    ivaPct: Math.min(100, Math.max(0, Number(b.ivaPct) || 0)),
    ...proveedorDe(b),
    ...(b.pendiente ? { pendiente: true } : {}),
    ...(b.alquiler ? { alquiler: true } : {}),
    ...(categoriaDe(b) ? { categoria: categoriaDe(b) } : {}),
    ...(inversionDe(b) ? { inversion: inversionDe(b) } : {}),
    ...(stockDe(b) ? { stock: stockDe(b), categoria: categoriaDe(b) || '600' } : {}),
  };
  if (origenDe(b, g.ivaPct)) g.origen = origenDe(b, g.ivaPct);
  if (retencionDe(b)) g.irpfPct = retencionDe(b);
  await guardar(u, 'gastos', g);
  // Apuntado desde un movimiento del banco que no tenía gasto: queda emparejado (y pagado con la fecha del banco).
  if (b.banco) await emparejar(u, String(b.banco), 'gasto', g.id);
  await Promise.all([subirGasto(u, g), enviarNomina(u, [g.fecha])]);
  return Response.json({ ok: true, gasto: g });
}

export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  const antes = b.id && (await leerUno(u, 'gastos', b.id));
  if (!antes) return error('Ese gasto ya no existe', 404);
  const base = r2(leerImporte(b.base));
  if (!base) return error('Importe no válido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) return error('Fecha no válida');
  if (!String(b.concepto || '').trim()) return error('Falta el concepto');
  const g = { ...antes, fecha: b.fecha, actividad: actividadValida(actividadesDe(u), b.actividad), concepto: String(b.concepto).trim().slice(0, 140), base, ivaPct: Math.min(100, Math.max(0, Number(b.ivaPct) || 0)), proveedor: undefined, proveedorNif: undefined, ...proveedorDe(b), pendiente: b.pendiente ? true : undefined, alquiler: b.alquiler ? true : undefined, categoria: stockDe(b) ? categoriaDe(b) || '600' : categoriaDe(b), inversion: inversionDe(b), stock: stockDe(b) };
  g.origen = origenDe(b, g.ivaPct);
  g.irpfPct = retencionDe(b);
  await guardar(u, 'gastos', g);
  await enviarNomina(u, [antes.fecha, g.fecha]);
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  const antes = await leerUno(u, 'gastos', id);
  await borrar(u, 'gastos', id);
  // Si venía de un pedido a proveedor, el pedido vuelve a estar pendiente de recibir.
  const pedido = antes?.pedidoProv && (await leerUno(u, 'pedidosProv', antes.pedidoProv));
  if (pedido?.gasto === id) await guardar(u, 'pedidosProv', { ...pedido, recibido: undefined, gasto: undefined });
  if (antes) await auditar(u, 'Gasto borrado', `${antes.concepto} · ${antes.fecha} · ${antes.base} € sin IVA`);
  if (antes) await enviarNomina(u, [antes.fecha]);
  return Response.json({ ok: true });
}
