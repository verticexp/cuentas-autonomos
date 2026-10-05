// Importar clientes, facturas, gastos y productos desde Holded o desde un Excel/CSV propio.
// Reconoce las columnas por su nombre, prepara una vista previa y marca lo que ya existe para no duplicarlo.
import { importes, leerImporte, r2 } from './calculos.js';

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/n[º°o]\.?(?=\s|$)/g, 'num').replace(/[^a-z0-9%]+/g, ' ').trim();
const lista = (...xs) => xs.map(norm);

// Nombres de columna que se reconocen (Holded en español, y los habituales de un Excel propio).
export const TIPOS = {
  clientes: {
    nombre: 'Clientes', permiso: 'facturar', requeridos: ['nombre'],
    campos: {
      nombre: lista('nombre', 'razon social', 'cliente', 'contacto', 'nombre fiscal', 'empresa', 'name'),
      nif: lista('nif', 'cif', 'nif cif', 'cif nif', 'dni', 'nif nie', 'vat', 'id fiscal', 'identificacion fiscal'),
      email: lista('email', 'e mail', 'correo', 'correo electronico'),
      direccion: lista('direccion', 'domicilio', 'calle', 'address'),
      cp: lista('codigo postal', 'cp', 'c p', 'postal code'),
      ciudad: lista('poblacion', 'ciudad', 'localidad', 'municipio', 'city'),
    },
  },
  facturas: {
    nombre: 'Facturas', permiso: 'facturar', requeridos: ['numero', 'fecha', 'cliente', 'base|total'],
    campos: {
      numero: lista('num', 'numero', 'num factura', 'numero factura', 'numero de factura', 'factura', 'documento', 'invoice number'),
      fecha: lista('fecha', 'fecha factura', 'fecha emision', 'fecha de emision', 'date'),
      cliente: lista('cliente', 'contacto', 'nombre', 'razon social', 'customer', 'nombre cliente'),
      nif: lista('nif', 'cif', 'nif cif', 'cif nif', 'nif cliente', 'cif cliente', 'dni'),
      concepto: lista('concepto', 'descripcion', 'description', 'detalle'),
      base: lista('subtotal', 'base', 'base imponible', 'importe sin iva', 'neto'),
      ivaPct: lista('% iva', 'iva %', 'tipo iva', 'tipo de iva'),
      iva: lista('iva', 'cuota iva', 'importe iva', 'impuestos'),
      irpfPct: lista('% irpf', 'irpf %', '% retencion', 'retencion %', 'tipo irpf'),
      irpf: lista('retencion', 'irpf', 'importe retencion', 'retenciones'),
      total: lista('total', 'importe', 'importe total', 'total factura'),
      estado: lista('estado', 'status', 'cobrada', 'cobrado', 'pagada'),
      pendiente: lista('pendiente', 'pendiente de cobro', 'por cobrar', 'importe pendiente'),
    },
  },
  gastos: {
    nombre: 'Gastos', permiso: 'gastar', requeridos: ['fecha', 'concepto|proveedor', 'base|total'],
    campos: {
      fecha: lista('fecha', 'fecha factura', 'fecha gasto', 'fecha de emision', 'date'),
      concepto: lista('concepto', 'descripcion', 'description', 'detalle', 'cuenta'),
      proveedor: lista('proveedor', 'contacto', 'nombre', 'emisor', 'razon social', 'supplier'),
      proveedorNif: lista('nif', 'cif', 'nif cif', 'nif proveedor', 'cif proveedor'),
      base: lista('subtotal', 'base', 'base imponible', 'importe sin iva', 'neto'),
      ivaPct: lista('% iva', 'iva %', 'tipo iva', 'tipo de iva'),
      iva: lista('iva', 'cuota iva', 'importe iva', 'impuestos'),
      total: lista('total', 'importe', 'importe total'),
      estado: lista('estado', 'status', 'pagado', 'pagada'),
      pendiente: lista('pendiente', 'pendiente de pago', 'por pagar', 'importe pendiente'),
    },
  },
  productos: {
    nombre: 'Productos', permiso: 'facturar', requeridos: ['nombre', 'precio'],
    campos: {
      nombre: lista('nombre', 'producto', 'servicio', 'concepto', 'descripcion', 'name', 'articulo'),
      precio: lista('precio', 'precio venta', 'precio de venta', 'pvp', 'precio unitario', 'subtotal', 'price', 'importe'),
      ivaPct: lista('% iva', 'iva', 'iva %', 'tipo iva', 'impuesto'),
    },
  },
};

// Busca la fila de cabecera (Holded a veces pone un título encima) y a qué columna va cada campo.
export function columnas(filas, tipo) {
  const { campos } = TIPOS[tipo];
  let mejor = { fila: 0, mapa: {}, n: -1 };
  filas.slice(0, 10).forEach((f, i) => {
    const mapa = {};
    f.forEach((h, c) => {
      const k = Object.keys(campos).find((x) => !(x in mapa) && campos[x].includes(norm(h)));
      if (k) mapa[k] = c;
    });
    const n = Object.keys(mapa).length;
    if (n > mejor.n) mejor = { fila: i, mapa, n };
  });
  const falta = TIPOS[tipo].requeridos.filter((r) => !r.split('|').some((x) => x in mejor.mapa));
  return { fila: mejor.fila, mapa: mejor.mapa, cabecera: filas[mejor.fila] || [], falta };
}

// Fechas: número de serie de Excel, dd/mm/aaaa (o con guiones/puntos, año de 2 cifras) o aaaa-mm-dd.
export function leerFecha(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return valida(m[1], m[2], m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(s);
  if (m) return valida(m[3].length === 2 ? `20${m[3]}` : m[3], m[2], m[1]);
  return null;
}
function valida(a, mes, d) {
  const f = `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return !Number.isNaN(Date.parse(`${f}T12:00:00Z`)) && new Date(`${f}T12:00:00Z`).toISOString().startsWith(f) ? f : null;
}

const importe = (v) => {
  if (v === '' || v === undefined || v === null) return null;
  const n = typeof v === 'number' ? v : leerImporte(v);
  return Number.isFinite(n) ? r2(n) : null;
};
// Porcentaje: «21», «21 %», «21,00%» o 0,21 (formato porcentaje de Excel).
const porcentaje = (v) => {
  const n = importe(v);
  if (n === null) return null;
  return Math.abs(n) > 0 && Math.abs(n) < 1 ? r2(n * 100) : n;
};
const TIPOS_IVA = [0, 4, 5, 10, 21];
// Del importe de la cuota al tipo: 210 sobre 1000 → 21 %. Se ajusta al tipo legal más cercano si está a menos de 0,6 puntos.
const pctDe = (cuota, base) => {
  if (!base || cuota === null) return 0;
  const p = Math.abs((cuota / base) * 100);
  const cerca = TIPOS_IVA.concat([7, 15, 19]).find((t) => Math.abs(t - p) < 0.6);
  return cerca ?? r2(p);
};
const txt = (v, n = 120) => String(v ?? '').trim().slice(0, n);
const cobradaDe = (estado, pendiente) => {
  if (pendiente !== null && pendiente !== undefined) return Math.abs(pendiente) < 0.005;
  return /cobrad|pagad|paid|^si$|^s$|^true$|^1$/.test(norm(estado));
};

// «F260012», «2026/015», «A-2026-7» → serie (letras) y número (las últimas cifras).
export function numeroDe(v) {
  const s = String(v ?? '').trim().toUpperCase();
  const numero = Number(/(\d+)\D*$/.exec(s)?.[1]);
  if (!numero) return null;
  return { serie: (/^[A-Z]+/.exec(s)?.[0] || '').slice(0, 4), numero, original: s.slice(0, 40) };
}

// Una fila → los datos a guardar, o { error }.
function fila(tipo, f, mapa) {
  const v = (k) => (k in mapa ? f[mapa[k]] : undefined);
  if (tipo === 'clientes') {
    const nombre = txt(v('nombre'));
    if (!nombre) return { error: 'Sin nombre' };
    const ciudad = [txt(v('cp'), 10), txt(v('ciudad'))].filter(Boolean).join(' ');
    return { nombre, nif: txt(v('nif'), 20).toUpperCase(), direccion: txt(v('direccion')), ciudad, ...(v('email') ? { email: txt(v('email')).toLowerCase() } : {}) };
  }
  if (tipo === 'productos') {
    const nombre = txt(v('nombre'), 200);
    const precio = importe(v('precio'));
    if (!nombre) return { error: 'Sin nombre' };
    if (!precio) return { error: 'Precio no válido' };
    return { nombre, precio, ivaPct: Math.min(100, Math.max(0, porcentaje(v('ivaPct')) ?? 21)) };
  }
  const fecha = leerFecha(v('fecha'));
  if (!fecha) return { error: 'Fecha no válida' };
  let base = importe(v('base'));
  const iva = importe(v('iva')), total = importe(v('total')), irpf = tipo === 'facturas' ? importe(v('irpf')) : null;
  let ivaPct = porcentaje(v('ivaPct'));
  let irpfPct = tipo === 'facturas' ? porcentaje(v('irpfPct')) : 0;
  if (base === null && total !== null) {
    // Sin base: se saca del total con los tipos o con las cuotas.
    base = iva !== null ? r2(total - iva + (irpf || 0)) : r2(total / (1 + ((ivaPct || 0) - (irpfPct || 0)) / 100));
  }
  if (!base) return { error: 'Importe no válido' };
  if (ivaPct === null) ivaPct = pctDe(iva, base);
  if (irpfPct === null) irpfPct = pctDe(irpf, base);
  const pendiente = importe(v('pendiente'));
  if (tipo === 'gastos') {
    const proveedor = txt(v('proveedor'), 80);
    const concepto = txt(v('concepto'), 140) || proveedor;
    if (!concepto) return { error: 'Sin concepto' };
    const pagado = cobradaDe(v('estado'), pendiente) || (v('estado') === undefined && pendiente === null);
    return { fecha, concepto, base, ivaPct, ...(proveedor ? { proveedor } : {}), ...(proveedor && v('proveedorNif') ? { proveedorNif: txt(v('proveedorNif'), 20).toUpperCase() } : {}), ...(pagado ? {} : { pendiente: true }) };
  }
  const num = numeroDe(v('numero'));
  if (!num) return { error: 'Sin número de factura' };
  const cliente = txt(v('cliente'));
  if (!cliente) return { error: 'Sin cliente' };
  return {
    numero: num.numero, anio: Number(fecha.slice(0, 4)), ...(num.serie ? { serie: num.serie } : {}),
    fecha, cliente: { nombre: cliente, nif: txt(v('nif'), 20).toUpperCase(), direccion: '', ciudad: '' },
    concepto: txt(v('concepto'), 200) || 'Factura importada', base, ivaPct, irpfPct, nota: '',
    // Sin columna de estado se da por cobrada: lo normal al traer el histórico.
    cobrada: cobradaDe(v('estado'), pendiente) || (v('estado') === undefined && pendiente === null), importada: num.original,
  };
}

const nif = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Lo que identifica a cada cosa para no duplicarla.
export const claves = {
  clientes: (c) => [`n:${c.nombre.trim().toUpperCase()}`, ...(nif(c.nif) ? [`f:${nif(c.nif)}`] : [])],
  facturas: (f) => [`${f.serie || ''}|${f.anio}|${f.numero}`],
  gastos: (g) => [`${g.fecha}|${importes(g).total.toFixed(2)}|${norm(g.concepto)}`],
  productos: (p) => [norm(p.nombre)],
};

// filas del archivo + lo que ya hay → vista previa: cada fila con estado «nuevo», «duplicado» o «error».
export function previa(tipo, filas, existentes = []) {
  const col = columnas(filas, tipo);
  if (col.falta.length) return { error: `Faltan columnas: ${col.falta.map((x) => x.replace('|', ' o ')).join(', ')}`, cabecera: col.cabecera.map(String) };
  const vistos = new Set((existentes || []).flatMap((x) => claves[tipo](x)));
  const items = filas.slice(col.fila + 1).map((f, i) => {
    const d = fila(tipo, f, col.mapa);
    if (d.error) return { n: col.fila + i + 2, estado: 'error', error: d.error };
    const ks = claves[tipo](d);
    const dup = ks.some((k) => vistos.has(k));
    ks.forEach((k) => vistos.add(k));
    return { n: col.fila + i + 2, estado: dup ? 'duplicado' : 'nuevo', datos: d };
  });
  const columnasUsadas = Object.fromEntries(Object.entries(col.mapa).map(([k, c]) => [k, String(col.cabecera[c])]));
  const cuenta = (e) => items.filter((x) => x.estado === e).length;
  return { columnas: columnasUsadas, items, nuevos: cuenta('nuevo'), duplicados: cuenta('duplicado'), errores: cuenta('error') };
}
