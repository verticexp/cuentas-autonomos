// Inventario: el stock de cada producto sale de sus movimientos, no se guarda. Ventas (líneas de factura con su
// producto; una rectificativa devuelve), compras (gastos con líneas de producto) y ajustes a mano (recuento, roturas,
// stock inicial). Se valora a coste medio ponderado. Sin dependencias de servidor, para poder probarlo.
import { baseLinea, r2 } from './calculos.js';

const r3 = (n) => Math.round(n * 1000) / 1000;
export const MOTIVOS = { inicial: 'Stock inicial', recuento: 'Recuento', rotura: 'Rotura o merma', perdida: 'Pérdida o robo', regalo: 'Muestra o regalo', otro: 'Otro' };
// Los servicios (servicio: true) no llevan stock.
export const controla = (p) => p && !p.servicio;

// Movimientos de stock hasta una fecha, en orden, de los productos que controlan stock.
// Cantidad con signo: + entra, − sale. coste: el unitario de lo que entra (compras y ajustes con coste).
export function movimientos({ productos = [], facturas = [], gastos = [], ajustes = [] }, hasta = '9999-12-31') {
  const ids = new Set(productos.filter(controla).map((p) => p.id));
  const M = [];
  for (const f of facturas) {
    if (f.fecha > hasta) continue;
    for (const l of f.lineas || []) {
      if (!l.producto || !ids.has(l.producto) || !Number(l.cantidad)) continue;
      // Una línea en negativo (rectificativa o devolución) vuelve al almacén.
      const devuelve = baseLinea(l) < 0 || Number(l.cantidad) < 0;
      const q = Math.abs(Number(l.cantidad));
      M.push({ fecha: f.fecha, producto: l.producto, cantidad: devuelve ? q : -q, tipo: devuelve ? 'devolucion' : 'venta', ingreso: devuelve ? 0 : Math.abs(baseLinea(l)), doc: { tipo: 'factura', id: f.id } });
    }
  }
  for (const g of gastos) {
    if (g.fecha > hasta) continue;
    for (const l of g.stock || []) {
      if (!ids.has(l.producto) || !Number(l.cantidad)) continue;
      M.push({ fecha: g.fecha, producto: l.producto, cantidad: Number(l.cantidad), tipo: 'compra', coste: Number(l.coste) || 0, doc: { tipo: 'gasto', id: g.id } });
    }
  }
  for (const a of ajustes) {
    if (a.fecha > hasta || !ids.has(a.producto) || !Number(a.cantidad)) continue;
    M.push({ fecha: a.fecha, producto: a.producto, cantidad: Number(a.cantidad), tipo: 'ajuste', motivo: a.motivo, coste: Number(a.coste) || 0, doc: { tipo: 'ajuste', id: a.id } });
  }
  // Mismo día: primero lo que entra (para no vender lo que se compró esa mañana como si faltara).
  return M.sort((a, b) => a.fecha.localeCompare(b.fecha) || b.cantidad - a.cantidad);
}

// Recorre los movimientos con el coste medio ponderado: cada entrada con coste lo recalcula; las salidas salen a ese coste.
function recorrer(M, productos) {
  const P = Object.fromEntries(productos.filter(controla).map((p) => [p.id, { stock: 0, medio: Number(p.coste) || 0, ventas: 0, ingresos: 0, costeVentas: 0, ultimaVenta: '', ultimo: '' }]));
  for (const m of M) {
    const x = P[m.producto];
    if (!x) continue;
    if (m.cantidad > 0 && m.coste > 0 && x.stock + m.cantidad > 0) x.medio = (Math.max(0, x.stock) * x.medio + m.cantidad * m.coste) / (Math.max(0, x.stock) + m.cantidad);
    m.costeUnitario = m.cantidad > 0 && m.coste > 0 ? m.coste : x.medio;
    x.stock = r3(x.stock + m.cantidad);
    m.stock = x.stock;
    x.ultimo = m.fecha;
    if (m.tipo === 'venta') { x.ventas = r3(x.ventas - m.cantidad); x.ingresos = r2(x.ingresos + m.ingreso); x.costeVentas = r2(x.costeVentas - m.cantidad * x.medio); x.ultimaVenta = m.fecha; }
    if (m.tipo === 'devolucion') { x.ventas = r3(x.ventas - m.cantidad); x.costeVentas = r2(x.costeVentas - m.cantidad * x.medio); }
  }
  return P;
}

// Valor del inventario a una fecha (stock × coste medio; lo negativo no cuenta).
export function valorInventario(datos, fecha) {
  const P = recorrer(movimientos(datos, fecha), datos.productos || []);
  return r2(Object.values(P).reduce((s, x) => s + Math.max(0, x.stock) * x.medio, 0));
}

// Estado de cada producto: stock, coste medio, valor, si está bajo mínimo, ventas y margen de un periodo y si está parado.
// diasParado: sin ventas en tantos días (y con stock) cuenta como parado.
export function inventario(datos, { hoy, desde = `${hoy.slice(0, 4)}-01-01`, diasParado = 90 } = {}) {
  const productos = (datos.productos || []).filter(controla);
  const todos = movimientos(datos, hoy);
  const P = recorrer(todos, productos);
  // Ventas y margen solo del periodo: se recorre otra vez hasta el día antes y se resta.
  const antes = recorrer(movimientos(datos, desdeAyer(desde)), productos);
  const limite = new Date(Date.parse(`${hoy}T12:00:00Z`) - diasParado * 864e5).toISOString().slice(0, 10);
  const lista = productos.map((p) => {
    const x = P[p.id], a = antes[p.id];
    const ventas = r3(x.ventas - a.ventas), ingresos = r2(x.ingresos - a.ingresos), costeVentas = r2(x.costeVentas - a.costeVentas);
    const minimo = Number(p.minimo) || 0;
    return {
      ...p, stock: x.stock, costeMedio: r2(x.medio), valor: r2(Math.max(0, x.stock) * x.medio), minimo, bajo: minimo > 0 && x.stock <= minimo, agotado: x.stock <= 0,
      ventas, ingresos, costeVentas, margen: r2(ingresos - costeVentas), margenPct: ingresos ? r2(((ingresos - costeVentas) / ingresos) * 100) : 0,
      ultimaVenta: x.ultimaVenta, parado: x.stock > 0 && (!x.ultimaVenta || x.ultimaVenta < limite),
    };
  });
  return { productos: lista, valor: r2(lista.reduce((s, p) => s + p.valor, 0)), bajos: lista.filter((p) => p.bajo), movimientos: todos };
}
const desdeAyer = (f) => new Date(Date.parse(`${f}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);

// Qué pedir: lo que está en el mínimo o por debajo, por proveedor, hasta el máximo (o el doble del mínimo).
export function quePedir(lista) {
  const grupos = {};
  for (const p of lista.filter((x) => x.bajo)) {
    const hasta = Number(p.maximo) || p.minimo * 2;
    const cantidad = Math.max(1, Math.ceil(hasta - p.stock));
    const k = p.proveedor || 'Sin proveedor';
    (grupos[k] ||= []).push({ id: p.id, nombre: p.nombre, sku: p.sku || '', stock: p.stock, minimo: p.minimo, cantidad, coste: r2(cantidad * (p.costeMedio || Number(p.coste) || 0)) });
  }
  return Object.entries(grupos).map(([proveedor, items]) => ({ proveedor, items, total: r2(items.reduce((s, x) => s + x.coste, 0)) }));
}

// Líneas de una factura de proveedor leídas por la IA → productos del catálogo por SKU, código o nombre.
export function emparejarLineas(lineas = [], productos = []) {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const P = productos.filter(controla);
  return lineas.map((l) => {
    const t = ` ${norm(l.descripcion)} `;
    const p = P.find((x) => (x.sku && t.includes(` ${norm(x.sku)} `)) || (x.codigo && t.includes(norm(x.codigo)))) || P.find((x) => norm(x.nombre) && t.includes(norm(x.nombre)));
    return p && Number(l.cantidad) > 0 ? { producto: p.id, cantidad: Number(l.cantidad), coste: r2(Number(l.precio) || 0) } : null;
  }).filter(Boolean);
}
