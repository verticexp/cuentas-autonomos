import { importes, numeroFactura, pendienteDe, vencimiento } from './calculos.js';
import { pagina, documentos } from './indices.js';
import { leer } from './redis.js';
import { puede } from './permisos.js';
import { gastosQueVe } from './nominas.js';
import { ordenDe } from './fichas.js';
import { ErrorApiPublica } from './apiPublica.js';

// Listas positivas también dentro de objetos anidados: nunca propagar fichas internas con «...f».
export function facturaPublica(f) {
  const { base, iva, irpf, total } = importes(f);
  const lineas = f.lineas?.length ? f.lineas : [{ concepto: f.concepto || '', cantidad: 1, precio: f.base, dto: 0, ivaPct: f.ivaPct }];
  return {
    id: f.id, numero: numeroFactura(f), serie: f.serie || '', fecha: f.fecha,
    cliente: { nombre: f.cliente?.nombre || '', nif: f.cliente?.nif || '', email: f.cliente?.email || '' },
    lineas: lineas.map((l) => ({ concepto: l.concepto, cantidad: l.cantidad, precio: l.precio, dto: l.dto || 0, ivaPct: l.ivaPct })),
    base, iva, irpf, total, cobrada: Boolean(f.cobrada), pendiente: pendienteDe(f), vence: vencimiento(f), idioma: f.idioma || 'es',
    // Los importes fiscales y precios expuestos están siempre en euros, también si el documento usa otra divisa.
    moneda: 'EUR',
  };
}
export const gastoPublico = (g) => {
  const { base, iva, irpf, total } = importes(g);
  return { id: g.id, fecha: g.fecha, concepto: g.concepto || '', proveedor: g.proveedor || '', proveedorNif: g.proveedorNif || '', base, iva, irpf, total, ivaPct: g.ivaPct || 0, pendiente: Boolean(g.pendiente), categoria: g.categoria || '' };
};
export const clientePublico = (c) => ({ id: c.id, nombre: c.nombre || '', nif: c.nif || '', email: c.email || '', direccion: c.direccion || '', ciudad: c.ciudad || '', pais: c.pais || 'ES', telefono: c.telefono || '' });

export function parametrosPagina(req) {
  const q = new URL(req.url).searchParams, cursor = q.get('cursor') || undefined;
  const l = q.get('limite');
  if (l !== null && (!/^\d{1,3}$/.test(l) || Number(l) < 1 || Number(l) > 100)) throw new ErrorApiPublica('El límite debe estar entre 1 y 100');
  if (cursor && (cursor.length > 1024 || !/^\d{1,16}~[A-Za-z0-9_-]{1,800}$/.test(cursor))) throw new ErrorApiPublica('Cursor no válido');
  const fechas = {};
  for (const campo of ['desde', 'hasta']) {
    const v = q.get(campo);
    if (v !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(`${v}T12:00:00Z`)) || new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) !== v)) throw new ErrorApiPublica('Usa fechas válidas con formato AAAA-MM-DD');
    if (v) fechas[campo] = v;
  }
  if (fechas.desde && fechas.hasta && fechas.desde > fechas.hasta) throw new ErrorApiPublica('La fecha desde debe ser anterior a hasta');
  return { cursor, limite: Number(l || 50), ...fechas };
}
const enFechas = (f, p) => (!p.desde || f >= p.desde) && (!p.hasta || f <= p.hasta);
export async function paginaPublica(u, col, p, transformar) {
  const pag = await pagina(u, col, { cursor: p.cursor, limite: p.limite, ...((p.desde || p.hasta) ? { filtro: (f) => enFechas(f.f, p) } : {}) });
  return { datos: (await documentos(u, col, pag.ids)).map(transformar), siguiente: pag.siguiente };
}
// Para colecciones sin índice y gastos agrupados: cursor estable por orden + id, sin offsets manipulables.
export function paginaLista(lista, p, transformar) {
  // Los ids de clientes son sus nombres en mayúsculas: pueden incluir espacios, acentos y «~».
  const miembro = (d) => `${String(ordenDe(d)).padStart(16, '0')}~${Buffer.from(String(d.id)).toString('base64url')}`;
  const cursor = p.cursor && `${p.cursor.split('~')[0].padStart(16, '0')}~${p.cursor.split('~')[1]}`;
  const visibles = lista.filter((d) => enFechas(d.fecha, p) && (!cursor || miembro(d) < cursor)).sort((a, b) => miembro(a) < miembro(b) ? 1 : miembro(a) > miembro(b) ? -1 : 0);
  const datos = visibles.slice(0, p.limite);
  return { datos: datos.map(transformar), siguiente: visibles.length > p.limite ? miembro(datos.at(-1)) : null };
}
export const gastosVisibles = async (u) => gastosQueVe(u, (await leer(u, 'gastos')) || []);
export async function paginaGastos(u, p) {
  // Agrupar toda la colección ANTES de cortar: ninguna página ni detalle revela un sueldo individual.
  return puede(u, 'nominas') ? paginaPublica(u, 'gastos', p, gastoPublico) : paginaLista(await gastosVisibles(u), p, gastoPublico);
}
