import { leer } from '@/lib/redis';
import { usuarioApi } from '@/lib/api';
import { ACTIVIDADES, importes, numeroFactura, trimestre } from '@/lib/calculos';
import { fechaCorta } from '@/lib/formato';

export const dynamic = 'force-dynamic';

const num = (n) => n.toFixed(2).replace('.', ',');
const celda = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = (filas) => '\uFEFF' + filas.map((f) => f.map(celda).join(';')).join('\r\n');

// CSV para Excel (separador «;», coma decimal). ?tipo=facturas|gastos&anio=2026&t=3 (sin t: todo el año)
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const tipo = q.get('tipo') === 'gastos' ? 'gastos' : 'facturas';
  const { u, res } = await usuarioApi({ permiso: tipo });
  if (res) return res;
  const anio = Number(q.get('anio')) || new Date().getFullYear();
  const t = Number(q.get('t')) || 0;
  const lista = (await leer(u, tipo))
    .filter((x) => x.fecha.startsWith(`${anio}-`) && (!t || trimestre(x.fecha) === t))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const filas = tipo === 'facturas'
    ? [['Número', 'Fecha', 'Cliente', 'NIF', 'Actividad', 'Concepto', 'Base', 'IVA %', 'Cuota IVA', 'IRPF %', 'Retención', 'Total', 'Cobrada', 'Rectifica'],
      ...lista.map((f) => { const i = importes(f); return [numeroFactura(f), fechaCorta(f.fecha), f.cliente.nombre, f.cliente.nif, ACTIVIDADES[f.actividad], f.concepto, num(i.base), f.ivaPct, num(i.iva), f.irpfPct, num(i.irpf), num(i.total), f.cobrada ? 'Sí' : 'No', f.rectifica?.numero || '']; })]
    : [['Fecha', 'Concepto', 'Actividad', 'Base', 'IVA %', 'Cuota IVA', 'Total'],
      ...lista.map((g) => { const i = importes(g); return [fechaCorta(g.fecha), g.concepto, ACTIVIDADES[g.actividad], num(i.base), g.ivaPct, num(i.iva), num(i.base + i.iva)]; })];

  const nombre = `${tipo}-${anio}${t ? `-${t}T` : ''}.csv`;
  return new Response(csv(filas), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}"` } });
}
