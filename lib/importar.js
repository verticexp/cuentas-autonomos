// Importar clientes, facturas, gastos y productos desde Holded o desde un Excel/CSV propio.
// Reconoce las columnas por su nombre, prepara una vista previa y marca lo que ya existe para no duplicarlo.
import { importes, leerImporte, r2, saldoDe } from './calculos.js';
import { TIPOS_IRPF, TIPOS_IVA, fechaReal } from './validacion.js';

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
      irpfPct: lista('% irpf', 'irpf %', '% retencion', 'retencion %', 'tipo irpf'),
      irpf: lista('retencion', 'irpf', 'importe retencion', 'retenciones'),
      total: lista('total', 'importe', 'importe total'),
      estado: lista('estado', 'status', 'pagado', 'pagada'),
      pendiente: lista('pendiente', 'pendiente de pago', 'por pagar', 'importe pendiente'),
      // IVA deducible en parte (lib/ivaDeducible.js): un coche al 50 %, por ejemplo.
      deduciblePct: lista('% iva deducible', 'iva deducible %', '% deducible', 'deducible %', 'porcentaje deducible', '% afectacion', 'afectacion'),
    },
  },
  // Para venir de otro programa (Holded, A3, Sage, Contasol…): el balance de sumas y saldos a la fecha de corte, que pasa a
  // ser el asiento de apertura, y el libro de bienes de inversión con lo ya amortizado.
  saldos: {
    nombre: 'Saldos contables', permiso: 'resumen', requeridos: ['cuenta', 'saldo|deudor|acreedor|debe'],
    campos: {
      cuenta: lista('cuenta', 'codigo', 'cod', 'subcuenta', 'num cuenta', 'numero cuenta', 'codigo cuenta', 'cuenta contable', 'account'),
      nombre: lista('nombre', 'descripcion', 'titulo', 'denominacion', 'concepto', 'nombre cuenta', 'descripcion cuenta'),
      debe: lista('debe', 'sumas debe', 'suma debe', 'total debe', 'movimientos debe'),
      haber: lista('haber', 'sumas haber', 'suma haber', 'total haber', 'movimientos haber'),
      deudor: lista('saldo deudor', 'deudor', 'saldos deudores'),
      acreedor: lista('saldo acreedor', 'acreedor', 'saldos acreedores'),
      saldo: lista('saldo', 'saldo final', 'saldo actual', 'saldo a fecha', 'importe', 'balance'),
    },
  },
  bienes: {
    nombre: 'Bienes de inversión', permiso: 'gastar', requeridos: ['fecha', 'concepto', 'valor'],
    campos: {
      fecha: lista('fecha', 'fecha alta', 'fecha compra', 'fecha de compra', 'fecha adquisicion', 'fecha de adquisicion', 'fecha inicio amortizacion', 'fecha puesta en funcionamiento', 'alta'),
      concepto: lista('descripcion', 'concepto', 'bien', 'elemento', 'nombre', 'activo', 'denominacion'),
      valor: lista('valor', 'coste', 'precio', 'importe', 'valor adquisicion', 'valor de adquisicion', 'coste adquisicion', 'valor inicial', 'base'),
      acumulada: lista('amortizacion acumulada', 'amort acumulada', 'acumulada', 'amortizado', 'amortizacion', 'total amortizado'),
      tipo: lista('tipo', 'cuenta', 'categoria', 'grupo', 'clase', 'tipo de bien'),
      coef: lista('coeficiente', '% amortizacion', 'porcentaje', '% anual', 'coef', 'tasa'),
      proveedor: lista('proveedor', 'emisor', 'supplier'),
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
// manual: { fila, mapa } elegido por el usuario (o sugerido por la IA) que sustituye a lo detectado.
export function columnas(filas, tipo, manual) {
  const { campos } = TIPOS[tipo];
  let mejor = { fila: 0, mapa: {}, n: -1 };
  if (manual) mejor = { fila: manual.fila, mapa: manual.mapa };
  else filas.slice(0, 10).forEach((f, i) => {
    const mapa = {};
    f.forEach((h, c) => {
      const k = Object.keys(campos).find((x) => !(x in mapa) && campos[x].includes(norm(h)));
      if (k) mapa[k] = c;
    });
    const n = Object.keys(mapa).length;
    if (n > mejor.n) mejor = { fila: i, mapa, n };
  });
  // Sin ningún título reconocido, la cabecera es la primera fila con más celdas llenas (no el rótulo de encima).
  if (!manual && !mejor.n) {
    const llenas = (f) => f.filter((v) => String(v ?? '').trim()).length;
    mejor.fila = filas.slice(0, 10).reduce((m, f, i) => (llenas(f) > llenas(filas[m]) ? i : m), 0);
  }
  const falta = TIPOS[tipo].requeridos.filter((r) => !r.split('|').some((x) => x in mejor.mapa));
  return { fila: mejor.fila, mapa: mejor.mapa, cabecera: filas[mejor.fila] || [], falta };
}

// Lo que manda el navegador ({ fila, mapa: { campo: columna } }), saneado: solo campos del tipo,
// columnas que existen y cada columna para un solo campo. null si no vale.
export function mapaManual(tipo, filas, m) {
  const fila = Number(m?.fila);
  if (!Number.isInteger(fila) || fila < 0 || fila >= Math.min(filas.length, 10) || !m.mapa || typeof m.mapa !== 'object') return null;
  const ancho = (filas[fila] || []).length, usadas = new Set(), mapa = {};
  for (const k of Object.keys(TIPOS[tipo].campos)) {
    const c = Number(m.mapa[k]);
    if (k in m.mapa && Number.isInteger(c) && c >= 0 && c < ancho && !usadas.has(c)) { mapa[k] = c; usadas.add(c); }
  }
  return { fila, mapa };
}

// Para los desplegables: los títulos de la fila de cabecera y unos pocos valores de ejemplo de cada columna.
export function muestra(filas, fila, n = 3) {
  const cabecera = (filas[fila] || []).map((h) => txt(h, 60));
  const datos = filas.slice(fila + 1).filter((f) => f.some((v) => String(v ?? '').trim())).slice(0, n);
  return { cabecera, ejemplos: cabecera.map((_, c) => datos.map((f) => txt(f[c], 40)).filter(Boolean)) };
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
  return fechaReal(f) ? f : null;
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
// Del importe de la cuota al tipo: 210 sobre 1000 → 21 %. Se ajusta al tipo legal más cercano si está a menos de 0,6 puntos.
const pctDe = (cuota, base) => {
  if (!base || cuota === null) return 0;
  const p = Math.abs((cuota / base) * 100);
  const cerca = [...new Set([...TIPOS_IVA, ...TIPOS_IRPF])].find((t) => Math.abs(t - p) < 0.6);
  return cerca ?? r2(p);
};
const txt = (v, n = 120) => String(v ?? '').trim().slice(0, n);
const coma = (n) => n.toFixed(2).replace('.', ',');
// «No cobrada», «Impagada», «Pendiente», «Vencida» o «Parcialmente pagada» no son cobradas aunque lleven «cobrad»/«pagad».
const NO_COBRADA = /(^|\s)(no|sin)(\s|$)|impag|pendient|parcial|vencid|devuelt|unpaid|overdue|partial|^n$|^false$|^0$/;
// Sin el cambio de «Nº»/«No» por «num» de las cabeceras: aquí «No cobrada» tiene que seguir diciendo «no».
const normEstado = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const cobradaDe = (estado, pendiente) => {
  if (pendiente !== null && pendiente !== undefined) return Math.abs(pendiente) < 0.005;
  const e = normEstado(estado);
  return !NO_COBRADA.test(e) && /cobrad|pagad|paid|^si$|^s$|^true$|^1$/.test(e);
};
const enParte = (estado) => /parcial|partial/.test(normEstado(estado));

// «F260012», «2026/015», «A-2026-7» → serie (letras) y número (las últimas cifras). Con el año detrás («001/2026»,
// «F12-26» o «07-2026», como numera la propia app), el número es lo de antes del año.
const esAnio = (g, anio) => Boolean(anio) && (g === String(anio) || g === String(anio - 1) || (g.length === 2 && g === String(anio).slice(2)));
export function numeroDe(v, anio) {
  const s = String(v ?? '').trim().toUpperCase();
  const grupos = s.match(/\d+/g) || [];
  let i = grupos.length - 1;
  if (i > 0 && esAnio(grupos[i], anio) && !esAnio(grupos[i - 1], anio)) i -= 1;
  const numero = Number(grupos[i]);
  if (!numero) return null;
  return { serie: (/^[A-Z]+/.exec(s)?.[0] || '').slice(0, 4), numero, original: s.slice(0, 40) };
}

// Tipo de bien por su cuenta (217, 2170001…) o por sus palabras.
const TIPO_CUENTA = { 206: 'software', 211: 'edificios', 212: 'instalaciones', 213: 'maquinaria', 214: 'utiles', 215: 'instalaciones', 216: 'mobiliario', 217: 'informatica', 218: 'transporte', 219: 'otros' };
function tipoBienDe(tipo, concepto) {
  const c = /^(2\d{2})/.exec(String(tipo ?? '').trim())?.[1];
  if (TIPO_CUENTA[c]) return TIPO_CUENTA[c];
  const t = norm(`${tipo ?? ''} ${concepto ?? ''}`);
  const PAL = [['informatica', /ordenador|portatil|informatic|tablet|movil|iphone|servidor|impresora|monitor/], ['software', /software|programa|aplicacion|licencia/],
    ['transporte', /vehiculo|furgoneta|coche|camion|moto|transporte/], ['mobiliario', /mueble|mobiliario|mesa|silla|estanteria/], ['edificios', /local|nave|edificio|construccion/],
    ['instalaciones', /instalacion|reforma|obra/], ['electronicos', /sonido|altavo|camara|focos|iluminacion|electronic|pantalla/], ['utiles', /herramienta|utillaje|util/], ['maquinaria', /maquin/]];
  return PAL.find(([, re]) => re.test(t))?.[0] || 'otros';
}

// Una fila → los datos a guardar, o { error }.
function fila(tipo, f, mapa) {
  const v = (k) => (k in mapa ? f[mapa[k]] : undefined);
  if (tipo === 'saldos') {
    const cuenta = String(v('cuenta') ?? '').replace(/[\s.]/g, '');
    // Grupos y subgrupos (1 o 2 cifras) y las filas de totales no son cuentas: se saltan.
    if (!/^[1-7]\d{2,11}$/.test(cuenta)) return { error: 'No es una cuenta' };
    const n = (k) => importe(v(k)) || 0;
    const saldo = 'saldo' in mapa ? n('saldo') : 'deudor' in mapa || 'acreedor' in mapa ? r2(n('deudor') - n('acreedor')) : r2(n('debe') - n('haber'));
    if (!saldo) return { error: 'Saldo cero' };
    return { cuenta, nombre: txt(v('nombre'), 80), saldo };
  }
  if (tipo === 'bienes') {
    const fecha = leerFecha(v('fecha'));
    if (!fecha) return { error: 'Fecha no válida' };
    const concepto = txt(v('concepto'), 140);
    if (!concepto) return { error: 'Sin descripción' };
    const valor = importe(v('valor'));
    if (!valor || valor < 0) return { error: 'Valor no válido' };
    const acumulada = Math.min(valor, Math.abs(importe(v('acumulada')) || 0));
    const coef = porcentaje(v('coef'));
    const proveedor = txt(v('proveedor'), 80);
    return { fecha, concepto, base: valor, ivaPct: 0, inversion: { tipo: tipoBienDe(v('tipo'), concepto), acumulada, ...(coef > 0 && coef <= 100 ? { coef } : {}) }, ...(proveedor ? { proveedor } : {}), migrado: true };
  }
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
  const iva = importe(v('iva')), total = importe(v('total')), irpf = importe(v('irpf'));
  let ivaPct = porcentaje(v('ivaPct'));
  let irpfPct = porcentaje(v('irpfPct'));
  if (base === null && total !== null) {
    // Sin base: se saca del total con los tipos o con las cuotas.
    base = iva !== null ? r2(total - iva + (irpf || 0)) : r2(total / (1 + ((ivaPct || 0) - (irpfPct || 0)) / 100));
  }
  if (!base) return { error: 'Importe no válido' };
  // Sin ninguna columna de IVA no se supone un 0 % (auditoría 10-2026): con base y total se deduce; si no, se pide.
  if (!('ivaPct' in mapa) && !('iva' in mapa)) {
    if (total === null || v('base') === undefined) return { error: 'Falta el IVA: añade la columna «% IVA» (0 si no lleva)' };
    const ret = irpf ?? (irpfPct ? r2((base * irpfPct) / 100) : 0);
    ivaPct = pctDe(r2(total - base + ret), base);
  }
  if (ivaPct === null) ivaPct = pctDe(iva, base);
  if (irpfPct === null) irpfPct = pctDe(irpf, base);
  // Nada de importes inventados (auditoría N07/N08): los tipos tienen que ser de los admitidos y, si el archivo trae el
  // total, tiene que cuadrar con base + IVA − retención. Si no, la fila se rechaza con lo que no cuadra.
  if (!TIPOS_IVA.includes(ivaPct)) return { error: `Tipo de IVA no admitido (${ivaPct} %)` };
  if (!TIPOS_IRPF.includes(irpfPct)) return { error: `Retención no admitida (${irpfPct} %)` };
  if (total !== null) {
    const calculado = importes({ base, ivaPct, irpfPct }).total;
    if (Math.abs(calculado - total) > 0.02) return { error: `El total (${coma(total)}) no cuadra con base + IVA − retención (${coma(calculado)})` };
  }
  const pendiente = importe(v('pendiente'));
  if (pendiente === null && enParte(v('estado'))) return { error: 'Cobrada o pagada en parte: añade la columna «Pendiente» con lo que falta' };
  if (pendiente !== null && (pendiente < -0.005 || pendiente > Math.abs(importes({ base, ivaPct, irpfPct }).total) + 0.005)) return { error: 'El pendiente es negativo o mayor que el total' };
  if (tipo === 'gastos') {
    const proveedor = txt(v('proveedor'), 80);
    const concepto = txt(v('concepto'), 140) || proveedor;
    if (!concepto) return { error: 'Sin concepto' };
    const pagado = cobradaDe(v('estado'), pendiente) || (v('estado') === undefined && pendiente === null);
    const totalDoc = importes({ base, ivaPct, irpfPct }).total;
    if (pendiente !== null && pendiente > 0.005 && pendiente < totalDoc - 0.005) return { error: 'Pago parcial de un gasto: no se puede representar, indica pendiente o pagado entero' };
    // Una celda con formato de porcentaje guarda 0,5 o 1 (100 %): un 1 % deducible no existe en la práctica, así que ≤ 1 es fracción.
    const dedLeido = v('deduciblePct') === undefined || String(v('deduciblePct')).trim() === '' ? 100 : importe(String(v('deduciblePct')).replace('%', ''));
    const ded = dedLeido !== null && dedLeido > 0 && dedLeido <= 1 ? r2(dedLeido * 100) : dedLeido;
    if (ded === null || ded < 0 || ded > 100) return { error: 'El % de IVA deducible tiene que estar entre 0 y 100' };
    return { fecha, concepto, base, ivaPct, ...(ded < 100 ? { deduciblePct: ded } : {}), ...(irpfPct ? { irpfPct } : {}), ...(proveedor ? { proveedor } : {}), ...(proveedor && v('proveedorNif') ? { proveedorNif: txt(v('proveedorNif'), 20).toUpperCase() } : {}), ...(pagado ? {} : { pendiente: true }) };
  }
  const num = numeroDe(v('numero'), Number(fecha.slice(0, 4)));
  if (!num) return { error: 'Sin número de factura' };
  const cliente = txt(v('cliente'));
  if (!cliente) return { error: 'Sin cliente' };
  const cobrada = cobradaDe(v('estado'), pendiente) || (v('estado') === undefined && pendiente === null);
  const totalF = importes({ base, ivaPct, irpfPct }).total;
  // Cobrada en parte: lo ya cobrado (total − pendiente) entra como un pago de apertura, sin inventar su fecha ni su método
  // (auditoría N08); así el saldo pendiente coincide con el del programa de origen.
  const cobradoYa = pendiente !== null && !cobrada ? r2(totalF - pendiente) : 0;
  return {
    numero: num.numero, anio: Number(fecha.slice(0, 4)), ...(num.serie ? { serie: num.serie } : {}),
    fecha, cliente: { nombre: cliente, nif: txt(v('nif'), 20).toUpperCase(), direccion: '', ciudad: '' },
    concepto: txt(v('concepto'), 200) || 'Factura importada', base, ivaPct, irpfPct, nota: '',
    // Sin columna de estado se da por cobrada: lo normal al traer el histórico.
    cobrada, importada: num.original,
    ...(cobradoYa > 0.005 ? { pagos: [{ importe: cobradoYa, apertura: true }] } : {}),
  };
}

const nif = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Lo que identifica a cada cosa para no duplicarla.
export const claves = {
  clientes: (c) => [`n:${c.nombre.trim().toUpperCase()}`, ...(nif(c.nif) ? [`f:${nif(c.nif)}`] : [])],
  facturas: (f) => [`${f.serie || ''}|${f.anio}|${f.numero}`],
  gastos: (g) => [`${g.fecha}|${importes(g).total.toFixed(2)}|${norm(g.concepto)}`],
  productos: (p) => [norm(p.nombre)],
  saldos: (x) => [x.cuenta],
  bienes: (g) => [`${g.fecha}|${Number(g.base).toFixed(2)}|${norm(g.concepto)}`],
};

const CAMPOS_COMPLETAR = ['nif', 'email', 'direccion', 'ciudad'];

const llenas = (f) => (f || []).filter((v) => String(v ?? '').trim());
// Fila de totales: la primera celda con texto es «Total», «Totales», «Suma», «Subtotal», «Total general», «Total 2025»…
const TOTALES = /^(total|totales|suma|sumas|subtotal|suma total|total general|totales generales)( \d{4})?$/;
const esTotal = (f) => TOTALES.test(norm(llenas(f)[0]));
// Fila de títulos: todo texto (ni importes ni fechas) y alguna celda es un título conocido de este tipo.
const pareceNumero = (v) => typeof v === 'number' || /^[-+]?[\d.,\s]+ ?(€|eur|%)?$/i.test(String(v).trim()) || leerFecha(v) !== null;
function esCabecera(tipo, f) {
  const cs = llenas(f);
  if (!cs.length || cs.some(pareceNumero)) return false;
  const titulos = new Set(Object.values(TIPOS[tipo].campos).flat());
  return cs.some((v) => titulos.has(norm(v)));
}

// Debajo de la lista a veces hay otra tabla (un resumen de facturación, totales por cliente…). La lista acaba en la
// primera fila de títulos distinta de la cabecera: desde ahí (y desde las filas vacías justo encima, con su rótulo)
// no se importa nada. Los títulos repetidos iguales (cabecera en cada página) y las filas de totales se saltan.
function finDeTabla(tipo, filas, col) {
  const cab = col.cabecera.map(norm).join('|');
  let corte = Infinity;
  if (tipo !== 'saldos') {
    for (let i = col.fila + 1; i < filas.length; i += 1) {
      if (!esCabecera(tipo, filas[i]) || filas[i].map(norm).join('|') === cab) continue;
      corte = i;
      // Hacia arriba hasta la última fila vacía (el rótulo de la otra tabla va entre el hueco y sus títulos).
      for (let j = i - 1; j > col.fila && j >= i - 3; j -= 1) if (!llenas(filas[j]).length) { corte = j; break; }
      break;
    }
  }
  return {
    fuera: (i) => {
      if (i >= corte) return 'Otra tabla debajo de la lista: no se importa';
      if (tipo === 'saldos') return '';
      if (filas[i].map(norm).join('|') === cab) return 'Títulos repetidos';
      if (esTotal(filas[i])) return 'Fila de totales';
      return '';
    },
  };
}

// filas del archivo + lo que ya hay → vista previa: cada fila con estado «nuevo», «duplicado» o «error».
// revision: { quitar, incluir } con números de fila (como en Excel): las que el usuario quita a mano y las que
// Fisquo había saltado (totales, otra tabla) y quiere importar igualmente.
export function previa(tipo, filas, existentes = [], manual = null, revision = {}) {
  const quitar = new Set(revision.quitar || []), incluir = new Set(revision.incluir || []);
  const col = columnas(filas, tipo, manual);
  // Lo necesario para que el usuario corrija a mano qué columna es cada dato.
  const elegir = { fila: col.fila, mapa: col.mapa, campos: Object.keys(TIPOS[tipo].campos), requeridos: TIPOS[tipo].requeridos, ...muestra(filas, col.fila) };
  if (col.falta.length) return { error: `Faltan columnas: ${col.falta.map((x) => x.replace('|', ' o ')).join(', ')}`, ...elegir };
  const vistos = new Set((existentes || []).flatMap((x) => claves[tipo](x)));
  // Clientes que ya existen (p. ej. creados al importar facturas, solo con nombre y NIF): se completan sus datos vacíos.
  const previos = new Map(tipo === 'clientes' ? (existentes || []).flatMap((x) => claves.clientes(x).map((k) => [k, x])) : []);
  const completados = new Set();
  const fin = finDeTabla(tipo, filas, col);
  const items = filas.slice(col.fila + 1).map((f, i) => {
    if (!llenas(f).length) return null;
    const n = col.fila + i + 2, original = f.map((v) => txt(v, 60));
    if (quitar.has(n)) return { n, estado: 'quitada', original };
    const fuera = fin.fuera(col.fila + 1 + i);
    if (fuera && !incluir.has(n)) return { n, estado: 'omitida', error: fuera, original };
    const d = fila(tipo, f, col.mapa);
    const forzada = fuera ? { incluida: true } : {};
    if (d.error) return { n, estado: 'error', error: d.error, original, ...forzada };
    const ks = claves[tipo](d);
    const dup = ks.some((k) => vistos.has(k));
    ks.forEach((k) => vistos.add(k));
    // Por NIF primero y, si no, por nombre. Solo los campos vacíos: lo que ya está escrito no se toca.
    const ya = previos.get(ks[1]) || previos.get(ks[0]);
    if (dup && ya?.id && !completados.has(ya.id)) {
      const completa = Object.fromEntries(CAMPOS_COMPLETAR.filter((k) => d[k] && !String(ya[k] ?? '').trim()).map((k) => [k, d[k]]));
      if (Object.keys(completa).length) { completados.add(ya.id); return { n, estado: 'completar', datos: { ...ya, ...completa }, id: ya.id, completa, original, ...forzada }; }
    }
    return { n, estado: dup ? 'duplicado' : 'nuevo', datos: d, original, ...forzada };
  }).filter(Boolean);
  const columnasUsadas = Object.fromEntries(Object.entries(col.mapa).map(([k, c]) => [k, String(col.cabecera[c])]));
  let extra = {};
  if (tipo === 'saldos') {
    // Las cuentas que son la suma de otras del archivo (430 si también vienen 4300001, 4300002…) no se cuentan dos veces.
    const todas = items.filter((x) => x.datos).map((x) => x.datos.cuenta);
    for (const x of items) if (x.datos && todas.some((c) => c !== x.datos.cuenta && c.startsWith(x.datos.cuenta))) { x.estado = 'agrupada'; }
    // Lo de «no es una cuenta» o saldo cero no es un error: son filas de títulos y totales.
    for (const x of items) if (x.estado === 'error' && /No es una cuenta|Saldo cero/.test(x.error)) x.estado = 'omitida';
    const validas = items.filter((x) => x.estado === 'nuevo');
    const debe = r2(validas.reduce((s, x) => s + Math.max(0, x.datos.saldo), 0)), haber = r2(validas.reduce((s, x) => s + Math.max(0, -x.datos.saldo), 0));
    extra = { debe, haber, descuadre: r2(debe - haber), conResultados: validas.some((x) => /^[67]/.test(x.datos.cuenta)) };
  }
  if (tipo === 'facturas') {
    // Para revisar antes de confirmar: lo que queda por cobrar de lo nuevo, por cliente, y cuántas vienen cobradas en parte.
    const nuevas = items.filter((x) => x.estado === 'nuevo');
    const porCliente = {};
    for (const x of nuevas) { const s = x.datos.cobrada ? 0 : saldoDe(x.datos); if (s) porCliente[x.datos.cliente.nombre] = r2((porCliente[x.datos.cliente.nombre] || 0) + s); }
    extra = { pendienteTotal: r2(Object.values(porCliente).reduce((a, b) => a + b, 0)), pendientePorCliente: porCliente, parciales: nuevas.filter((x) => x.datos.pagos?.length).length };
  }
  const cuenta = (e) => items.filter((x) => x.estado === e).length;
  return { columnas: columnasUsadas, ...elegir, items, nuevos: cuenta('nuevo'), completar: cuenta('completar'), duplicados: cuenta('duplicado'), errores: cuenta('error'), quitadas: cuenta('quitada'), ...extra };
}
