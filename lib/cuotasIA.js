// La cuota se descuenta justo antes de enviar una lectura al proveedor, bajo cerrojo por empresa y periodo.
// No depende del modo LIMITES (que puede estar en observación). Un fallo de Redis corta la llamada de pago.
import { PDFDocument } from 'pdf-lib';
import { redis } from './redis.js';
import { conCerrojo } from './cerrojo.js';
import { escaneosDe, esPruebaIA, MAX_PAGINAS_IA } from './cuotasIAConfig.js';

export const MAX_BYTES_IA = 3 * 1024 * 1024;
const RETENCION = 400 * 86400;
const fechaMadrid = (fecha) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(fecha).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
export function periodoEscaneos(plan, ahora = new Date()) {
  const { year, month } = fechaMadrid(ahora);
  const prueba = esPruebaIA(plan);
  return { periodo: prueba ? `prueba-${plan.hasta}` : `${year}-${month}`, prueba,
    renueva: prueba ? null : new Date(Date.UTC(Number(year), Number(month), 1)).toISOString().slice(0, 10) };
}
const claveDe = (u, periodo) => {
  const empresa = u.empresa || u.id;
  if (!empresa) throw new Error('No se ha podido identificar la empresa.');
  return `escaneos-ia:${empresa}:${periodo}`;
};
const numero = (valor) => {
  const n = Number(valor ?? 0);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('No se ha podido comprobar el consumo de escaneos.');
  return n;
};
const estado = (plan, usadas, periodo) => {
  const limite = escaneosDe(plan);
  return { limite, usadas, restantes: Math.max(0, limite - usadas), porcentaje: Math.min(100, Math.floor(usadas * 100 / limite)), renueva: periodo.renueva, prueba: periodo.prueba, agotado: usadas >= limite };
};
export async function cupoEscaneos(u, ahora = new Date()) {
  if (!redis) throw new Error('No se ha podido comprobar el consumo de escaneos.');
  const p = periodoEscaneos(u.plan, ahora);
  return estado(u.plan, numero(await redis.hget(claveDe(u, p.periodo), 'paginas')), p);
}

// Se valida y cuenta en el servidor; no se acepta el número de páginas enviado por el navegador.
export async function paginasIA(buf, tipo) {
  if (!buf.length || buf.length > MAX_BYTES_IA) return { error: 'Sube un archivo de hasta 3 MB.' };
  if (tipo === 'application/pdf') {
    if (!buf.subarray(0, 5).equals(Buffer.from('%PDF-'))) return { error: 'El archivo no es un PDF válido.' };
    try {
      const pdf = await PDFDocument.load(buf, { updateMetadata: false, throwOnInvalidObject: true });
      const paginas = pdf.getPageCount();
      if (paginas < 1 || paginas > MAX_PAGINAS_IA) return { error: `El PDF debe tener entre 1 y ${MAX_PAGINAS_IA} páginas. Divide los documentos más largos.` };
      return { paginas };
    } catch { return { error: 'No se puede leer el PDF. Comprueba que sea válido y que no esté protegido con contraseña.' }; }
  }
  const firma = tipo === 'image/png' ? buf.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : tipo === 'image/jpeg' ? buf[0] === 255 && buf[1] === 216 && buf[2] === 255
    : tipo === 'image/webp' && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
  return firma ? { paginas: 1 } : { error: 'La imagen no es válida. Sube un JPG, PNG o WebP.' };
}

export async function consumirEscaneos(u, paginas, ahora = new Date()) {
  if (!Number.isSafeInteger(paginas) || paginas < 1 || paginas > MAX_PAGINAS_IA) throw new Error('Número de páginas no válido.');
  const p = periodoEscaneos(u.plan, ahora), clave = claveDe(u, p.periodo);
  return conCerrojo(clave, async ({ quedaMs }) => {
    const usadas = numero(await redis.hget(clave, 'paginas'));
    const cupo = estado(u.plan, usadas, p);
    if (paginas > cupo.restantes) return { error: cupo.prueba
      ? `No quedan suficientes páginas de lectura IA en tu prueba (${cupo.restantes} disponibles). Puedes registrar el gasto a mano o elegir un plan.`
      : `No quedan suficientes páginas de lectura IA este mes (${cupo.restantes} disponibles). Puedes registrar el gasto a mano o solicitar una ampliación.`, cupo };
    if (quedaMs() <= 0) throw new Error('No se ha podido reservar la lectura. Inténtalo de nuevo.');
    await redis.multi().hincrby(clave, 'paginas', paginas).hincrby(clave, 'lecturas', 1).expire(clave, RETENCION).exec();
    return { clave, cupo: estado(u.plan, usadas + paginas, p) };
  });
}

// Solo cantidades y modelo: nunca imágenes, texto, importes ni identificadores de proveedores/clientes.
// El coste es una estimación de tarifa estándar en microdólares, no una factura del proveedor.
// Tarifa estándar en microdólares por token [entrada, salida] (platform.claude.com/docs/en/about-claude/pricing, 22-10-2026).
// Haiku 5.5 cobra según la longitud del prompt (toda la entrada, también lo leído o escrito en caché): hasta 100.000
// tokens, 0,10 y 0,50 $ por millón; por encima, 0,50 y 2,50. Haiku 4.5: 1 y 5 $. Otros modelos: sin estimación.
export function tarifaIA(modelo, t = {}) {
  if (/^claude-haiku-5-5(?:-|$)/.test(modelo)) return (t.input_tokens || 0) + (t.cache_creation_input_tokens || 0) + (t.cache_read_input_tokens || 0) > 100000 ? [0.5, 2.5] : [0.1, 0.5];
  if (/^claude-haiku-4-5(?:-|$)/.test(modelo)) return [1, 5];
  return null;
}

export async function registrarConsumoIA(reserva, consumo) {
  if (!reserva?.clave || !consumo) return;
  try {
    const modelo = String(consumo.modelo || 'desconocido').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 100) || 'desconocido';
    if (!Number.isSafeInteger(consumo.input_tokens) || !Number.isSafeInteger(consumo.output_tokens)) {
      await redis.hincrby(reserva.clave, `llamadas_sin_medicion:${modelo}`, 1);
      return;
    }
    const campos = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];
    const tokens = Object.fromEntries(campos.map((c) => [c, numero(consumo[c])]));
    const t = redis.multi().hincrby(reserva.clave, `llamadas:${modelo}`, 1);
    for (const campo of campos) t.hincrby(reserva.clave, `${campo}:${modelo}`, tokens[campo]);
    const tarifa = tarifaIA(modelo, tokens);
    if (tarifa) t.hincrby(reserva.clave, 'coste_estimado_micro_usd', Math.ceil(tokens.input_tokens * tarifa[0] + tokens.output_tokens * tarifa[1] + tokens.cache_creation_input_tokens * tarifa[0] * 1.25 + tokens.cache_read_input_tokens * tarifa[0] * 0.1));
    t.expire(reserva.clave, RETENCION);
    await t.exec();
  } catch { console.warn('[escaneos-ia] No se ha podido registrar la medición de tokens. La cuota sigue descontada.'); }
}

export const respuestaCupo = (r) => Response.json({ error: r.error, cupo: r.cupo, cuotaAgotada: true }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
