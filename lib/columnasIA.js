// Importar con IA (Claude): cuando el archivo trae títulos que no se reconocen, la IA dice qué columna es cada dato.
// Solo se le envían los títulos y unos pocos valores de ejemplo de las columnas sin reconocer; los datos los lee
// después lib/importar.js como siempre, y el usuario lo revisa en la vista previa antes de guardar.
import { TIPOS } from './importar.js';
import { proveedorJSON } from './llamadas.js';

const DESCRIPCION = {
  nombre: 'nombre o razón social', nif: 'NIF, CIF, DNI o NIE', email: 'correo electrónico', direccion: 'dirección (calle y número)',
  cp: 'código postal', ciudad: 'población o ciudad', numero: 'número de factura', fecha: 'fecha', cliente: 'nombre del cliente',
  concepto: 'concepto o descripción', base: 'base imponible (sin IVA)', ivaPct: 'tipo de IVA en %', iva: 'cuota de IVA en euros',
  irpfPct: 'tipo de retención IRPF en %', irpf: 'retención IRPF en euros', total: 'total con impuestos', estado: 'estado (cobrada, pagada, pendiente…)',
  pendiente: 'importe pendiente de cobro o pago', proveedor: 'nombre del proveedor', proveedorNif: 'NIF del proveedor', precio: 'precio',
  cuenta: 'número de cuenta contable', debe: 'debe', haber: 'haber', deudor: 'saldo deudor', acreedor: 'saldo acreedor', saldo: 'saldo',
  valor: 'valor de compra', acumulada: 'amortización acumulada', tipo: 'tipo de bien', coef: 'coeficiente de amortización en %',
};

// Columnas con título que no se han asignado a ningún campo: son las que se le preguntan a la IA.
export function columnasSinUsar(cabecera, mapa) {
  const usadas = new Set(Object.values(mapa));
  return cabecera.map((h, c) => c).filter((c) => String(cabecera[c] ?? '').trim() && !usadas.has(c));
}

export function pregunta(tipo, cabecera, ejemplos, mapa) {
  const libres = Object.keys(TIPOS[tipo].campos).filter((k) => !(k in mapa));
  const cols = columnasSinUsar(cabecera, mapa).map((c) => `${c}: «${cabecera[c]}» (ejemplos: ${ejemplos[c]?.length ? ejemplos[c].map((e) => `«${e}»`).join(', ') : 'vacía'})`);
  return `Es un Excel de ${TIPOS[tipo].nombre.toLowerCase()} de una empresa española que se va a importar en un programa de facturación.
Columnas sin identificar (índice: título y ejemplos):
${cols.join('\n')}
Campos que faltan por asignar:
${libres.map((k) => `${k}: ${DESCRIPCION[k] || k}`).join('\n')}
Responde SOLO con un objeto JSON {"campo": índice de columna}. Incluye solo los campos de los que estés seguro por el título o los ejemplos; cada columna, como mucho para un campo. Si no hay ninguno, responde {}.`;
}

// La respuesta de la IA, saneada: solo campos libres del tipo y columnas libres, sin repetir. Se suma a lo ya detectado.
export function limpiarSugerencia(tipo, sugerencia, cabecera, mapa) {
  const libres = new Set(columnasSinUsar(cabecera, mapa));
  const nuevos = {};
  if (!sugerencia || typeof sugerencia !== 'object') return nuevos;
  for (const [k, v] of Object.entries(sugerencia)) {
    const c = Number(v);
    if (k in TIPOS[tipo].campos && !(k in mapa) && !(k in nuevos) && Number.isInteger(c) && libres.has(c)) { nuevos[k] = c; libres.delete(c); }
  }
  return nuevos;
}

// { tipo, cabecera, ejemplos, mapa } → { campos: { campo: columna } } con lo que añade la IA, o { error }.
export async function sugerirColumnas({ tipo, cabecera, ejemplos, mapa }) {
  if (!columnasSinUsar(cabecera, mapa).length) return { campos: {} };
  const modelo = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  let d;
  try {
    ({ d } = await proveedorJSON('Anthropic', process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, max_tokens: 300, messages: [{ role: 'user', content: pregunta(tipo, cabecera, ejemplos, mapa) }] }),
    }, { idempotente: true, deadline: Date.now() + 15000 }));
  } catch { return { error: 'La IA no ha respondido' }; }
  const texto = (d.content || []).map((c) => c.text || '').join('');
  try { return { campos: limpiarSugerencia(tipo, JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)), cabecera, mapa) }; }
  catch { return { error: 'La IA no ha dado una respuesta válida' }; }
}
