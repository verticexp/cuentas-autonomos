// Exportaciones de TPV y tiendas: pedidos, cobros e inventario por día.
import { leerImporte, r2 } from './calculos.js';
import { leerFecha } from './importar.js';
import { controla, emparejarLineas } from './inventario.js';

const texto = (v) => String(v ?? '').trim();
const norm = (v) => texto(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();
const clave = (v) => texto(v).toLowerCase().replace(/\s/g, '');
const presente = (v) => v !== null && v !== undefined && texto(v) !== '';
const suma = (xs) => r2(xs.reduce((s, x) => s + x, 0));
const r3 = (n) => Math.round(n * 1000) / 1000;

const CAMPOS = {
  fecha: ['fecha', 'date', 'fecha de venta', 'fecha de transaccion', 'fecha y hora', 'date time'],
  id: ['id de transaccion', 'id transaccion', 'transaction id', 'transaction code', 'codigo de transaccion', 'pedido', 'numero de pedido', 'order id'],
  nombre: ['producto', 'descripcion', 'description', 'nombre', 'articulo', 'item', 'nombre del articulo', 'item name', 'product name'],
  sku: ['sku', 'referencia', 'ref', 'product sku', 'sku del producto'],
  codigo: ['codigo de barras', 'codigo', 'ean', 'barcode', 'bar code', 'upc'],
  cantidad: ['cantidad', 'quantity', 'qty', 'cant', 'unidades'],
  total: ['total', 'importe', 'importe total', 'total amount', 'total con iva', 'importe con iva', 'line total', 'total linea', 'total de linea', 'importe de linea', 'importe de la linea'],
  precio: ['precio', 'price', 'precio unitario', 'unit price', 'pvp'],
  pct: ['iva %', '% iva', 'iva pct', 'tipo iva', 'tipo de iva', 'vat rate', 'tax rate', 'iva', 'vat'],
  impuesto: ['importe iva', 'cuota iva', 'impuesto', 'impuestos', 'tax', 'tax amount', 'vat amount'],
  metodo: ['metodo de pago', 'forma de pago', 'payment method', 'payment type', 'tipo de pago', 'medio de pago'],
  estado: ['estado', 'status', 'estado de pago', 'estado de la transaccion'],
  descuento: ['descuento', 'descuentos', 'discount', 'discounts'],
  reembolso: ['refunded amount', 'importe reembolsado', 'refund amount'],
  cancelado: ['cancelled at', 'canceled at', 'fecha de cancelacion'],
};
const FORMATOS = {
  shopify: {
    fecha: ['paid at', 'created at'], id: ['name', 'id'], nombre: ['lineitem name'], sku: ['lineitem sku'],
    cantidad: ['lineitem quantity'], precio: ['lineitem price'], descuento: ['lineitem discount'],
    estado: ['financial status'], totalPedido: ['total'], impuestoPedido: ['taxes', 'tax 1 value'],
    nombreImpuesto: ['tax 1 name'], segundoImpuesto: ['tax 2 name'],
  },
  woocommerce: {
    fecha: ['order date', 'fecha del pedido', 'fecha de pedido'], id: ['order number', 'order id', 'numero de pedido', 'numero del pedido'],
    estado: ['order status', 'estado del pedido'], metodo: ['payment method title', 'titulo del metodo de pago'],
    totalPedido: ['order total', 'total del pedido', 'total pedido'], impuestoPedido: ['order total tax', 'impuestos del pedido', 'iva del pedido'],
    precio: ['item cost', 'item price', 'coste del articulo'], neto: ['item total', 'total del articulo'],
    impuesto: ['item tax', 'item total tax', 'impuesto del articulo'],
  },
  sumup: { totalPedido: ['importe total', 'total amount', 'total'] },
  square: {
    bruto: ['gross sales', 'ventas brutas', 'venta bruta'], neto: ['net sales', 'ventas netas', 'venta neta'],
    nombre: ['item', 'articulo', 'nombre del articulo'], impuesto: ['tax', 'impuesto', 'impuestos', 'iva'],
  },
  generico: {},
};

function formatoDe(cabecera) {
  const h = cabecera.map(norm), tiene = (...xs) => xs.some((x) => h.includes(x));
  if (tiene('lineitem name', 'lineitem quantity', 'lineitem price', 'lineitem sku')) return 'shopify';
  if (tiene('order number', 'order date', 'order total', 'fecha del pedido', 'fecha de pedido', 'total del pedido', 'total pedido', 'numero de pedido', 'numero del pedido')) return 'woocommerce';
  if (tiene('gross sales', 'net sales', 'ventas brutas', 'ventas netas', 'venta bruta', 'venta neta')) return 'square';
  if (tiene('transaction id', 'id de transaccion', 'id transaccion', 'transaction code', 'codigo de transaccion')
    && tiene('total amount', 'importe total', 'vat rate', 'estado', 'status')) return 'sumup';
  return 'generico';
}

// Se puntúan las diez primeras filas, también cuando hay un título antes de la tabla.
function columnas(filas) {
  let mejor = { fila: 0, mapa: {}, formato: 'generico', n: -1 };
  (Array.isArray(filas) ? filas : []).slice(0, 10).forEach((f, fila) => {
    if (!Array.isArray(f)) return;
    const formato = formatoDe(f), propios = FORMATOS[formato], h = f.map(norm), mapa = {};
    for (const k of new Set([...Object.keys(CAMPOS), ...Object.keys(propios)])) {
      const indices = [...(propios[k] || []), ...(CAMPOS[k] || [])].map((x) => h.indexOf(x)).filter((i) => i >= 0);
      if (indices.length) mapa[k] = [...new Set(indices)];
    }
    // En Square «IVA» es una cuota, no un porcentaje.
    if (formato === 'square' && mapa.pct) mapa.pct = mapa.pct.filter((i) => h[i] !== 'iva');
    const n = new Set(Object.values(mapa).flat()).size;
    if (n > mejor.n) mejor = { fila, mapa, formato, n };
  });
  return mejor;
}

export const detectarFormato = (filas) => columnas(filas).formato;

function numero(v) {
  if (!presente(v) || !['string', 'number'].includes(typeof v)) return null;
  let n = v;
  if (typeof v === 'string') {
    let s = texto(v).replace(/^(?:EUR|USD|GBP|JPY|CHF|CAD|AUD|MXN|[€$£¥])\s*/i, '')
      .replace(/\s*(?:EUR|USD|GBP|JPY|CHF|CAD|AUD|MXN|[€$£¥])$/i, '').replace(/\s/g, '');
    if (/^\(.*\)$/.test(s)) s = `-${s.slice(1, -1)}`;
    if (!/^[+-]?(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/.test(s)) return null;
    n = leerImporte(s);
  }
  return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER / 100 ? n : null;
}
const importe = (v) => { const n = numero(v); return n === null ? null : r2(n); };
function porcentaje(v) {
  const explicito = typeof v === 'string' && /%\s*$/.test(v);
  let n = numero(explicito ? v.replace(/%\s*$/, '') : v);
  if (!explicito && n !== null && n > 0 && n < 1) n = r2(n * 100);
  return n !== null && n >= 0 && n <= 100 ? n : null;
}
const fechaDe = (v) => ['string', 'number'].includes(typeof v) ? leerFecha(typeof v === 'number' ? Math.floor(v) : v) : null;
function tipoDeCuota(cuota, total) {
  if (cuota === null || total === null || cuota < 0 || cuota >= total) return null;
  const pct = cuota / (total - cuota) * 100;
  return [0, 4, 5, 10, 21].reduce((a, b) => Math.abs(b - pct) < Math.abs(a - pct) ? b : a);
}
function metodoDe(v, formato) {
  const s = norm(v);
  if (/\b(cash|efectivo|metalico)\b/.test(s)) return 'efectivo';
  if (/bizum|paypal|transfer/.test(s)) return 'otros';
  if (/card|tarjeta|visa|mastercard|sumup|stripe|tpv|contactless|shopify payments/.test(s)) return 'tarjeta';
  return !s || /^(unknown|desconocido|n a)$/.test(s) ? (formato === 'generico' ? 'otros' : 'tarjeta') : 'otros';
}
function excluido(v) {
  const s = norm(v);
  if (/partial|parcial/.test(s)) return false;
  return /\b(cancelled|canceled|refunded|failed|pending|voided|void|unpaid|on hold|cancelado|cancelada|reembolsado|reembolsada|fallido|fallida|pendiente|anulado|anulada)\b/.test(s);
}

// Ajusta los céntimos en la mayor partida sin cambiar las proporciones de las demás.
function cuadrar(valores, total) {
  const out = valores.map(r2);
  if (!out.length) return out;
  const mayor = out.reduce((a, x, i) => x > out[a] ? i : a, 0);
  out[mayor] = r2(out[mayor] + r2(total - suma(out)));
  return out;
}
function repartir(pesos, total) {
  const s = pesos.reduce((a, b) => a + b, 0);
  const centimos = Math.round(total * 100), partes = pesos.map((p) => s ? centimos * p / s : centimos / pesos.length);
  const out = partes.map(Math.floor);
  const orden = partes.map((p, i) => i).sort((a, b) => (partes[b] - out[b]) - (partes[a] - out[a]) || pesos[b] - pesos[a]);
  const resto = centimos - out.reduce((a, b) => a + b, 0);
  for (let i = 0; i < resto; i += 1) out[orden[i % orden.length]] += 1;
  return out.map((n) => n / 100);
}
function emparejar(l, productos) {
  const p = productos.find((p) => l.sku && clave(p.sku) === clave(l.sku))
    || productos.find((p) => l.codigo && clave(p.codigo) === clave(l.codigo));
  if (p) return p;
  const [m] = emparejarLineas([{ descripcion: `${l.sku} ${l.codigo} ${l.nombre}`, cantidad: l.cantidad, precio: l.precio }], productos);
  return m ? productos.find((p) => p.id === m.producto) : productos.find((p) => p.servicio && norm(p.nombre) && norm(p.nombre) === norm(l.nombre));
}

export function ventasDesdeFilas(filas, productos = [], { ivaPct = 21 } = {}) {
  const { fila, mapa, formato } = columnas(filas);
  if (!mapa.fecha?.length) return { error: 'Falta la columna de fecha.' };
  if (!['total', 'totalPedido', 'precio', 'neto', 'bruto'].some((k) => mapa[k]?.length)) return { error: 'Falta una columna de total o importe de línea.' };
  const defecto = porcentaje(ivaPct) ?? 21, catalogo = Array.isArray(productos) ? productos.filter(Boolean) : [];
  const avisos = [], grupos = new Map(), dias = new Map(), pendientes = new Map();
  const esPedido = formato === 'shopify' || formato === 'woocommerce';
  let anterior;
  filas.slice(fila + 1).forEach((f, i) => {
    if (!Array.isArray(f) || !f.some(presente)) return;
    const l = Object.fromEntries(Object.entries(mapa).map(([k, indices]) => [k, indices.map((c) => f[c]).find(presente)]));
    l.fila = fila + i + 2;
    let id = texto(l.id);
    if (esPedido && !id && !presente(l.fecha) && !presente(l.totalPedido)) id = anterior;
    if (esPedido) anterior = id;
    const k = id ? JSON.stringify(esPedido ? [id] : [fechaDe(l.fecha), id]) : `fila:${i}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(l);
  });

  for (const ls of grupos.values()) {
    const primero = (k) => ls.map((l) => l[k]).find(presente);
    const ref = `Fila ${ls[0].fila}`;
    const totalPedido = importe(primero('totalPedido')), reembolso = importe(primero('reembolso')) || 0;
    if (ls.some((l) => excluido(l.estado) || presente(l.cancelado)) || (reembolso > 0 && totalPedido !== null && reembolso >= totalPedido)) {
      avisos.push(`${ref}: ${ls.length} fila(s) ignorada(s) por estado cancelado, reembolsado o no cobrado.`);
      continue;
    }
    const fecha = ls.map((l) => fechaDe(l.fecha)).find(Boolean);
    if (!fecha) { avisos.push(`${ref}: ${ls.length} fila(s) sin fecha válida.`); continue; }
    if (presente(primero('totalPedido')) && totalPedido === null) { avisos.push(`${ref}: total del pedido no válido.`); continue; }
    const cuotaPedido = importe(primero('impuestoPedido'));
    const nombreImpuesto = !presente(primero('segundoImpuesto')) ? /([\d.,]+)\s*%/.exec(texto(primero('nombreImpuesto')))?.[1] : undefined;
    const lineas = [];
    for (const l of ls) {
      const cantidad = presente(l.cantidad) ? numero(l.cantidad) : 1;
      if (cantidad === null || cantidad <= 0) { avisos.push(`Fila ${l.fila}: cantidad no válida.`); continue; }
      const datos = { nombre: texto(l.nombre), sku: texto(l.sku), codigo: texto(l.codigo), cantidad, precio: numero(l.precio) };
      const producto = emparejar(datos, catalogo);
      const descuento = Math.abs(importe(l.descuento) || 0), cuota = importe(l.impuesto);
      const neto = importe(l.neto), bruto = importe(l.bruto), precio = datos.precio;
      let total = importe(l.total);
      // Total es de pedido en estas exportaciones, aunque se repita en cada artículo.
      if (mapa.totalPedido?.some((i) => mapa.total?.includes(i))) total = null;
      let valor = total ?? neto ?? (bruto === null ? null : bruto - descuento) ?? (precio === null ? null : precio * cantidad - descuento);
      const esNeto = total === null && (formato === 'square' || formato === 'woocommerce');
      const conCuota = valor === null ? null : valor + (esNeto ? (cuota || 0) : 0);
      const pct = porcentaje(l.pct) ?? porcentaje(nombreImpuesto)
        ?? tipoDeCuota(cuota, conCuota)
        ?? (ls.length === 1 ? tipoDeCuota(cuotaPedido, totalPedido) : null)
        ?? porcentaje(producto?.ivaPct) ?? defecto;
      if (valor !== null && esNeto) valor += cuota ?? valor * pct / 100;
      if (valor === null && ls.length === 1) valor = totalPedido;
      if (valor !== null && (!Number.isFinite(valor) || valor < 0)) { avisos.push(`Fila ${l.fila}: importe de línea no válido.`); continue; }
      if (valor === null) {
        avisos.push(`Fila ${l.fila}: importe de línea no válido${totalPedido !== null ? '; se repartirá el total del pedido' : ''}.`);
        if (totalPedido === null) continue;
        valor = 0;
      }
      lineas.push({ ...datos, producto, pct, valor, metodo: l.metodo });
    }
    if (!lineas.length) continue;
    // Shopify puede exportar precios sin IVA; Taxes permite reconocer ese caso.
    const sumaLineas = suma(lineas.map((l) => l.valor));
    if (formato === 'shopify' && cuotaPedido > 0 && totalPedido !== null && Math.abs(r2(sumaLineas + cuotaPedido - totalPedido)) <= 0.01) {
      for (const l of lineas) l.valor *= 1 + l.pct / 100;
    }
    let total = totalPedido ?? suma(lineas.map((l) => l.valor));
    if (total < 0 || !Number.isFinite(total)) { avisos.push(`${ref}: total no válido.`); continue; }
    if (reembolso > 0) {
      total = r2(Math.max(0, total - reembolso));
      avisos.push(`${ref}: reembolso parcial descontado; revisa las unidades, no se indica qué artículos se devolvieron.`);
    }
    const importes = repartir(lineas.map((l) => l.valor), total);
    if (!dias.has(fecha)) dias.set(fecha, { fecha, total: 0, efectivo: 0, tarjeta: 0, otros: 0, iva: new Map(), unidades: new Map(), pedidos: 0 });
    const d = dias.get(fecha);
    d.total = r2(d.total + total); d.pedidos += 1;
    lineas.forEach((l, i) => {
      const metodo = metodoDe(l.metodo || primero('metodo'), formato);
      d[metodo] = r2(d[metodo] + importes[i]);
      d.iva.set(l.pct, r2((d.iva.get(l.pct) || 0) + importes[i]));
      if (l.producto && controla(l.producto)) {
        const id = l.producto.id, u = d.unidades.get(id) || { producto: id, cantidad: 0, importe: 0 };
        u.cantidad = r3(u.cantidad + l.cantidad); u.importe += importes[i] / (1 + l.pct / 100);
        d.unidades.set(id, u);
      } else if (!l.producto && (l.nombre || l.sku || l.codigo)) {
        const k = JSON.stringify([norm(l.nombre), clave(l.sku), clave(l.codigo)]);
        const p = pendientes.get(k) || { descripcion: l.nombre || l.codigo || l.sku, sku: l.sku, cantidad: 0 };
        p.cantidad = r3(p.cantidad + l.cantidad); pendientes.set(k, p);
      }
    });
  }
  return {
    formato,
    dias: [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((d) => {
      const [efectivo, tarjeta, otros] = cuadrar([d.efectivo, d.tarjeta, d.otros], d.total);
      return { fecha: d.fecha, total: d.total, efectivo, tarjeta, otros,
        porIva: [...d.iva].map(([pct, total]) => ({ pct, total })).sort((a, b) => b.total - a.total),
        unidades: [...d.unidades.values()].map((u) => ({ ...u, importe: r2(u.importe) })), pedidos: d.pedidos };
    }),
    sinEmparejar: [...pendientes.values()], avisos,
  };
}

// Solo admite datos finitos, sin negativos, y descuadres de redondeo (hasta dos céntimos).
export function limpiarDia(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const fecha = fechaDe(d.fecha), total = importe(d.total);
  if (!fecha || total === null || total < 0 || !Array.isArray(d.porIva) || !d.porIva.length) return null;
  const pagos = ['efectivo', 'tarjeta', 'otros'].map((k) => importe(d[k] ?? 0));
  if (pagos.some((n) => n === null || n < 0) || Math.abs(r2(suma(pagos) - total)) > 0.02) return null;
  const iva = new Map(), unidades = new Map();
  for (const x of d.porIva) {
    const pct = porcentaje(x?.pct), t = importe(x?.total);
    if (pct === null || t === null || t < 0) return null;
    iva.set(pct, r2((iva.get(pct) || 0) + t));
  }
  if (Math.abs(r2(suma([...iva.values()]) - total)) > 0.02) return null;
  if (d.unidades !== undefined && !Array.isArray(d.unidades)) return null;
  for (const u of d.unidades || []) {
    if (!u || !['string', 'number'].includes(typeof u.producto) || !texto(u.producto)) return null;
    const producto = texto(u.producto), cantidad = numero(u.cantidad), valor = importe(u.importe);
    if (cantidad === null || cantidad <= 0 || valor === null || valor < 0) return null;
    const previo = unidades.get(producto) || { producto, cantidad: 0, importe: 0 };
    previo.cantidad = r3(previo.cantidad + cantidad); previo.importe = r2(previo.importe + valor);
    unidades.set(producto, previo);
  }
  const pedidos = numero(d.pedidos ?? 0);
  if (!Number.isSafeInteger(pedidos) || pedidos < 0) return null;
  const [efectivo, tarjeta, otros] = cuadrar(pagos, total), importes = cuadrar([...iva.values()], total);
  if ([efectivo, tarjeta, otros, ...importes].some((n) => n < 0)) return null;
  return { fecha, total, efectivo, tarjeta, otros,
    porIva: [...iva.keys()].map((pct, i) => ({ pct, total: importes[i] })).sort((a, b) => b.total - a.total),
    unidades: [...unidades.values()], pedidos };
}
