// Lectura de tickets con IA (Claude): de la foto saca proveedor, fecha, base e IVA.
// Hace falta ANTHROPIC_API_KEY en Vercel; ANTHROPIC_MODEL para cambiar de modelo.
import { r2 } from './calculos.js';
import { proveedorJSON } from './llamadas.js';
export { PLAZOS_PROVEEDOR, conPlazo, proveedorJSON } from './llamadas.js';

export const iaLista = () => Boolean(process.env.ANTHROPIC_API_KEY);
const TIPOS = [21, 10, 5, 4, 2, 0];

const PROMPT = `Es la foto de un ticket o factura de gasto en España. Responde SOLO con un objeto JSON, sin texto alrededor:
{"proveedor": "nombre del comercio", "nif": "NIF/CIF del comercio o vacío", "fecha": "AAAA-MM-DD", "concepto": "qué se compró, en 2-6 palabras", "base": número sin IVA, "ivaPct": 21|10|5|4|2|0, "total": número final con IVA y descontando la retención, "desglose": [{"ivaPct": 21|10|5|4|2|0, "base": número sin IVA, "cuota": importe del IVA}], "irpf": importe retenido o null, "irpfPct": porcentaje de retención explícito del documento o null, "lineas": [{"descripcion": "texto de la línea con su referencia", "cantidad": número, "precio": precio unitario sin IVA}]}
Devuelve el desglose por cada tipo de IVA leído, con su base y su cuota. La base es la suma de las bases del desglose; ivaPct es el tipo con mayor base. No apliques un único tipo de IVA a la suma de bases. El irpf es el importe retenido, no un porcentaje. Lee también irpfPct explícitamente: 0 si indica que no hay retención, el porcentaje impreso si hay retención (aunque no sea 7 o 15), o null si no se ve. No inventes ni deduzcas el porcentaje. Si no se ve un dato, pon null.`;

// Deja la respuesta de la IA lista para el formulario (sin fiarse de ella: todo se revisa).
export function limpiarTicket(d, hoy) {
  const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')));
  const ivaLeido = num(d?.ivaPct);
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
  const irpf = irpfLeido !== null && irpfLeido >= 0 ? r2(irpfLeido) : null;
  const pctLeido = importe(d?.irpfPct);
  let base = num(d?.base);
  const total = num(d?.total);
  if (!(base > 0) && total > 0) base = (total + (irpf || 0)) / (1 + ivaPct / 100);
  if (desglose.length) {
    base = r2(desglose.reduce((s, l) => s + l.base, 0));
    ivaPct = desglose[0].ivaPct;
  }
  const fechaDudosa = !(/^\d{4}-\d{2}-\d{2}$/.test(d?.fecha || '') && d.fecha <= hoy);
  const fecha = fechaDudosa ? hoy : d.fecha;
  const cuotas = desglose.length ? (desglose.every((l) => l.cuota !== null) ? r2(desglose.reduce((s, l) => s + l.cuota, 0)) : null) : base > 0 ? r2(base * ivaPct / 100) : null;
  const totalLeido = importe(d?.total);
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
  return { proveedor: txt(d?.proveedor, 80), nif: txt(d?.nif, 20), fecha, concepto: txt(d?.concepto, 140), base: base > 0 ? r2(base) : '', ivaPct, lineas,
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
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: [{ type: tipo === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: tipo, data: base64 } }, { type: 'text', text: PROMPT }] }],
      }),
    }, { idempotente: true, deadline: Date.now() + 25000 });
  } catch { return { error: 'No se pudo leer el ticket. Prueba otra vez o rellénalo a mano.' }; }
  const { d } = resultado;
  const texto = (d.content || []).map((c) => c.text || '').join('');
  try { return { datos: JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)) }; } catch { return { error: 'No se entendió el ticket. Rellénalo a mano.' }; }
}

// Extracto del banco en PDF (lo que dan muchos bancos): la IA saca los movimientos y se leen como una tabla
// (lib/banco.js leerTablaBanco), así que los ids, el saldo y los repetidos funcionan igual que con un Excel.
const PROMPT_EXTRACTO = `Es un extracto bancario español en PDF. Responde SOLO con un objeto JSON, sin texto alrededor:
{"movimientos": [{"fecha": "AAAA-MM-DD", "concepto": "texto del movimiento tal cual", "importe": número (negativo si es un cargo, positivo si es un abono), "saldo": número o null}]}
Incluye todos los movimientos de todas las páginas, en el orden del extracto. Usa la fecha de operación. No incluyas saldos iniciales ni totales como movimientos.`;

export async function leerExtracto(base64) {
  let resultado;
  try {
    resultado = await proveedorJSON('Anthropic', process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 16000,
        messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: PROMPT_EXTRACTO }] }],
      }),
    }, { idempotente: true, deadline: Date.now() + 25000 });
  } catch { return { error: 'No se pudo leer el PDF. Prueba otra vez o descárgalo en Excel o Norma 43.' }; }
  const { d } = resultado;
  const texto = (d.content || []).map((c) => c.text || '').join('');
  try {
    const { movimientos } = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
    const filas = [['Fecha', 'Concepto', 'Importe', 'Saldo'], ...(movimientos || []).map((m) => [m.fecha, m.concepto, m.importe, m.saldo ?? ''])];
    return { filas };
  } catch { return { error: 'No se entendió el PDF. Descárgalo en Excel o Norma 43.' }; }
}
