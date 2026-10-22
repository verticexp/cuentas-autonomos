// Lectura de tickets con IA (Claude): de la foto saca proveedor, fecha, base e IVA.
// Hace falta ANTHROPIC_API_KEY en Vercel; ANTHROPIC_MODEL para cambiar de modelo.
import { r2 } from './calculos.js';
import { proveedorJSON } from './llamadas.js';

// Modelo de las lecturas (tickets, extractos en PDF) y del emparejado de columnas al importar: Claude Haiku 5.5, rápido y
// diez veces más barato que Haiku 4.5 (lib/cuotasIA.js TARIFAS). Piensa por su cuenta: con esfuerzo bajo piensa poco o
// nada en lo sencillo, y el pensamiento cuenta dentro de max_tokens (por eso los topes llevan margen). Las respuestas se
// leen por los bloques de texto, no por su posición (antes de ellos puede haber bloques de pensamiento).
export const MODELO_IA = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
// El esfuerzo no existe en los modelos de antes (Haiku 4.5, Sonnet 4.5 y los 3.x): con ANTHROPIC_MODEL apuntando a uno, no se manda.
export const esfuerzoBajo = (modelo) => (/^claude-(haiku-4-5|sonnet-4-5|3)/.test(modelo) ? {} : { output_config: { effort: 'low' } });
export { PLAZOS_PROVEEDOR, conPlazo, proveedorJSON } from './llamadas.js';

export const iaLista = () => Boolean(process.env.ANTHROPIC_API_KEY);
const TIPOS = [21, 10, 5, 4, 2, 0];

const PROMPT = `Es la foto de un ticket o factura de gasto en España. Responde SOLO con un objeto JSON, sin texto alrededor:
{"proveedor": "nombre del comercio", "nif": "NIF/CIF del comercio o vacío", "numero": "número de la factura o null (un ticket sin número: null)", "fecha": "AAAA-MM-DD", "vencimiento": "AAAA-MM-DD si la factura dice cuándo vence o hasta cuándo se paga, o null", "concepto": "qué se compró, en 2-6 palabras", "base": número sin IVA, "ivaPct": 21|10|5|4|2|0, "total": número final con IVA y descontando la retención, "desglose": [{"ivaPct": 21|10|5|4|2|0, "base": número sin IVA, "cuota": importe del IVA}], "irpf": importe retenido o null, "irpfPct": porcentaje de retención explícito del documento o null, "lineas": [{"descripcion": "texto de la línea con su referencia", "cantidad": número, "precio": precio unitario sin IVA}]}
Devuelve el desglose por cada tipo de IVA leído, con su base y su cuota. La base es la suma de las bases del desglose; ivaPct es el tipo con mayor base. No apliques un único tipo de IVA a la suma de bases. Copia la base de la casilla «Base imponible», no el total a pagar ni el cargo bancario. Copia el total neto de la factura. La retención puede aparecer como IRPF, retención o I.R.P.F. y con signo negativo (por ejemplo IRPF 15%: -3,38 €). Devuelve irpf como importe positivo en ese caso, e irpfPct como 15, sin confundir importe y porcentaje. Lee también irpfPct explícitamente: 0 si indica que no hay retención, el porcentaje impreso si hay retención (aunque no sea 7 o 15), o null si no se ve. No inventes ni deduzcas el porcentaje. Si no se ve un dato, pon null.`;

// Deja la respuesta de la IA lista para el formulario (sin fiarse de ella: todo se revisa).
export function limpiarTicket(d, hoy) {
  const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')));
  const ivaLeido = d?.ivaPct == null || String(d.ivaPct).trim() === '' ? NaN : num(d.ivaPct);
  let ivaPct = TIPOS.includes(ivaLeido) ? ivaLeido : 21;
  // null o un dato ilegible no son un importe cero (ni un tipo de IVA del 0 %).
  const importe = (v) => v == null || String(v).trim() === '' || !/\d/.test(String(v)) || !Number.isFinite(num(v)) ? null : num(v);
  const porTipo = new Map();
  for (const l of Array.isArray(d?.desglose) ? d.desglose : []) {
    const tipo = importe(l?.ivaPct), b = importe(l?.base), cuota = importe(l?.cuota);
    if (!TIPOS.includes(tipo) || b === null || b < 0) continue;
    const previo = porTipo.get(tipo) || { ivaPct: tipo, base: 0, cuota: 0 };
    previo.base += b;
    previo.cuota = previo.cuota === null || cuota === null || cuota < 0 ? null : previo.cuota + cuota;
    porTipo.set(tipo, previo);
  }
  const desglose = [...porTipo.values()].map((l) => ({ ...l, base: r2(l.base), cuota: l.cuota === null ? null : r2(l.cuota) })).sort((a, b) => b.base - a.base);
  const irpfLeido = importe(d?.irpf);
  let irpf = irpfLeido !== null ? r2(Math.abs(irpfLeido)) : null;
  const pctLeido = importe(d?.irpfPct) === null ? null : Math.abs(importe(d.irpfPct));
  let base = num(d?.base);
  const total = num(d?.total);
  if (!(base > 0) && total > 0) {
    base = irpf !== null ? (total + irpf) / (1 + ivaPct / 100)
      : [0, 7, 15].includes(pctLeido) ? total / (1 + ivaPct / 100 - pctLeido / 100)
      : total / (1 + ivaPct / 100);
  }
  if (desglose.length) {
    base = r2(desglose.reduce((s, l) => s + l.base, 0));
    ivaPct = desglose[0].ivaPct;
  }
  const fechaDudosa = !(/^\d{4}-\d{2}-\d{2}$/.test(d?.fecha || '') && d.fecha <= hoy);
  const fecha = fechaDudosa ? hoy : d.fecha;
  const cuotas = desglose.length ? (desglose.every((l) => l.cuota !== null) ? r2(desglose.reduce((s, l) => s + l.cuota, 0)) : null) : base > 0 ? r2(base * ivaPct / 100) : null;
  const totalLeido = importe(d?.total);
  // Si el porcentaje está impreso pero falta su cuota, el total debe confirmarla.
  if (irpf === null && [7, 15].includes(pctLeido) && base > 0 && cuotas !== null && totalLeido !== null) {
    const calculada = r2(base * pctLeido / 100);
    if (Math.abs(r2(base + cuotas - calculada - totalLeido)) <= 0.02) irpf = calculada;
  }
  const cuadra = Number.isFinite(base) && base > 0 && cuotas !== null && totalLeido !== null
    ? Math.abs(r2(base + cuotas - (irpf || 0) - totalLeido)) <= 0.02 : null;
  // Valida en euros: un cociente redondeado puede ocultar una lectura incorrecta.
  // En bases pequeñas varios tipos pueden cuadrar; nunca elijas uno por defecto.
  const candidatos = irpf !== null && base > 0
    ? [0, 7, 15].filter((pct) => (pct !== 0 || irpf === 0) && Math.abs(r2(r2(base * pct / 100) - irpf)) <= 0.02) : [];
  let irpfPct = null;
  const avisos = [];
  if (pctLeido !== null && ![0, 7, 15].includes(pctLeido)) {
    avisos.push('El tipo de retención leído no está soportado: revisa el IRPF');
  } else if (irpfLeido !== null || pctLeido !== null) {
    if (irpf === 0 && (pctLeido === null || pctLeido === 0)) irpfPct = 0;
    else if (candidatos.length === 1 && (pctLeido === null || pctLeido === candidatos[0])) irpfPct = candidatos[0];
    else if (irpf === null && irpfLeido === null && pctLeido === 0) irpfPct = 0;
    else avisos.push('No se ha podido validar el porcentaje de IRPF: revisa la retención');
  }
  if (cuadra === false) avisos.push('Los importes leídos no cuadran con el total: revisa la base y el IVA');
  if (fechaDudosa) avisos.push('No se ha podido leer la fecha: comprueba que es la del ticket');
  const txt = (v, n) => (v ? String(v).trim().slice(0, n) : '');
  const lineas = (Array.isArray(d?.lineas) ? d.lineas : []).slice(0, 50).map((l) => ({ descripcion: txt(l?.descripcion, 140), cantidad: num(l?.cantidad) || 0, precio: num(l?.precio) || 0 })).filter((l) => l.descripcion && l.cantidad > 0);
  // El número de la factura (para avisar de duplicados y para el libro de facturas recibidas), si se lee.
  // Sin el «Factura nº» delante; «N2026-01» se queda como está (la N es parte del número).
  // Vencimiento impreso (para los pagos pendientes, lib/pagos.js): una fecha real desde la de la factura.
  const vence = /^\d{4}-\d{2}-\d{2}$/.test(d?.vencimiento || '') && !fechaDudosa && d.vencimiento >= fecha && Date.parse(d.vencimiento) - Date.parse(fecha) <= 730 * 864e5 ? d.vencimiento : '';
  const numero = txt(d?.numero, 60).replace(/^(factura\s*)?(n[º°]|n\.|no\.|núm\.?|num\.?)?\s*:?\s*/i, '').trim().slice(0, 40);
  return { proveedor: txt(d?.proveedor, 80), nif: txt(d?.nif, 20), ...(numero && !/^null$/i.test(numero) ? { numero } : {}), fecha, ...(vence ? { vence } : {}), concepto: txt(d?.concepto, 140), base: base > 0 ? r2(base) : '', ivaPct, lineas,
    // Conserva los campos de una lectura antigua de un único tipo que cuadra.
    ...(Array.isArray(d?.desglose) || irpfLeido !== null || pctLeido !== null || cuadra !== true || fechaDudosa
      ? { desglose, irpf, irpfPct, varios: desglose.length > 1, cuadra, fechaDudosa, avisos } : {}) };
}

export async function leerTicket(base64, tipo) {
  let resultado;
  try {
    resultado = await proveedorJSON('Anthropic', process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELO_IA(),
        max_tokens: 4000,
        ...esfuerzoBajo(MODELO_IA()),
        messages: [{ role: 'user', content: [{ type: tipo === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: tipo, data: base64 } }, { type: 'text', text: PROMPT }] }],
      }),
    }, { idempotente: false, deadline: Date.now() + 25000 });
  } catch { return { error: 'No se ha podido leer el ticket. Prueba otra vez o rellénalo a mano.' }; }
  const { d } = resultado;
  const consumo = { modelo: d.model || MODELO_IA(), ...(d.usage || {}) };
  const texto = (d.content || []).map((c) => c.text || '').join('');
  try { return { datos: JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)), consumo }; } catch { return { error: 'No se entendió el ticket. Rellénalo a mano.', consumo }; }
}

// Extracto del banco en PDF (lo que dan muchos bancos): la IA saca los movimientos y se leen como una tabla
// (lib/banco.js leerTablaBanco), así que los ids, el saldo y los repetidos funcionan igual que con un Excel.
const PROMPT_EXTRACTO = `Es un extracto bancario español en PDF. Responde SOLO con un objeto JSON, sin texto alrededor:
{"iban": "IBAN de la cuenta del extracto, o null si no aparece", "movimientos": [{"fecha": "AAAA-MM-DD", "concepto": "texto del movimiento tal cual", "importe": número (negativo si es un cargo, positivo si es un abono), "saldo": número o null}]}
Incluye todos los movimientos de todas las páginas, en el orden del extracto. Usa la fecha de operación. No incluyas saldos iniciales ni totales como movimientos.`;

export async function leerExtracto(base64, paginas = 1) {
  let resultado;
  try {
    resultado = await proveedorJSON('Anthropic', process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELO_IA(),
        max_tokens: Math.min(32000, 4000 * paginas + 2000),
        ...esfuerzoBajo(MODELO_IA()),
        messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: PROMPT_EXTRACTO }] }],
      }),
    }, { idempotente: false, deadline: Date.now() + 25000 });
  } catch { return { error: 'No se ha podido leer el PDF. Prueba otra vez o descárgalo en Excel o Norma 43.' }; }
  const { d } = resultado;
  const consumo = { modelo: d.model || MODELO_IA(), ...(d.usage || {}) };
  const texto = (d.content || []).map((c) => c.text || '').join('');
  try {
    const { iban, movimientos } = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
    // El IBAN va encima de la tabla, como en un Excel del banco: leerTablaBanco lo comprueba antes de usarlo.
    const filas = [...(typeof iban === 'string' && iban ? [['IBAN', iban]] : []), ['Fecha', 'Concepto', 'Importe', 'Saldo'], ...(movimientos || []).map((m) => [m.fecha, m.concepto, m.importe, m.saldo ?? ''])];
    return { filas, consumo };
  } catch { return { error: 'No se entendió el PDF. Descárgalo en Excel o Norma 43.', consumo }; }
}

// El contador del proveedor no genera una respuesta de pago. Evita enviar un PDF de una sola página
// con cantidades anómalas de texto que desborden el coste previsto por lectura.
export async function validarEntradaIA(base64, tipo, paginas, extracto = false) {
  try {
    const url = new URL(process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages');
    url.pathname = url.pathname.replace(/\/$/, '') + '/count_tokens';
    const { d } = await proveedorJSON('Anthropic-count', url.toString(), {
      method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO_IA(), messages: [{ role: 'user', content: [
        { type: tipo === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: tipo, data: base64 } },
        { type: 'text', text: extracto ? PROMPT_EXTRACTO : PROMPT },
      ] }] }),
    }, { idempotente: false, timeoutMs: 5000 });
    if (!Number.isSafeInteger(d.input_tokens) || d.input_tokens < 1) throw new Error('Conteo no válido');
    // 8.000 por página: Haiku 5.5 cuenta un 30 % más de tokens que Haiku 4.5 para el mismo documento (antes, 6.000).
    return d.input_tokens > 8000 * paginas ? { error: 'El documento tiene demasiado contenido para esta lectura. Divide el PDF o usa una imagen más sencilla.', status: 400 } : { inputTokens: d.input_tokens };
  } catch { return { error: 'No se ha podido preparar la lectura. No se han descontado páginas: inténtalo de nuevo o registra el gasto a mano.', status: 503 }; }
}
