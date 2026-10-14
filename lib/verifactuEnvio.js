// Envío de los registros de Verifactu al servicio web de la AEAT (SOAP 1.1 por HTTPS con certificado de cliente).
// Netto envía en nombre de cada empresa con el certificado de quien produce el programa (apoderado o colaborador social):
// VERIFACTU_P12 (el .p12 en base64) y VERIFACTU_P12_CLAVE. NETTO_RAZON y NETTO_NIF: quién produce el programa.
// VERIFACTU_SELLO=1 si el certificado es de sello; VERIFACTU_URL cambia la dirección (solo pruebas).
// Control de flujo (Orden HAC/1177/2024, art. 16.2): tras cada envío se esperan los segundos que diga la AEAT
// (TiempoEsperaEnvio, 60 al principio), salvo que haya 1000 registros pendientes.
import https from 'node:https';
import { after } from 'next/server.js'; // con .js: también se carga fuera de Next (pruebas)
import { redis, leer, guardar, leerUno } from './redis.js';
import { sobre, xmlAlta, xmlAnulacion } from './verifactuXml.js';
import { fiscalDe } from './empresa.js';
import { randomUUID } from 'node:crypto';
import { HECHO, modoRegistro } from './verifactuEstado.js';
import { SOLTAR } from './cerrojo.js';
import { actualizarFactura } from './actualizarFactura.js';

const RUTA = '/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';
const HOST = { pruebas: ['prewww1.aeat.es', 'prewww10.aeat.es'], real: ['www1.agenciatributaria.gob.es', 'www10.agenciatributaria.gob.es'] };
export const VERSION = '1.0';
export const certificadoListo = () => Boolean(process.env.VERIFACTU_P12 && process.env.VERIFACTU_P12_CLAVE && process.env.NETTO_RAZON && process.env.NETTO_NIF);
const urlDe = (modo) => process.env.VERIFACTU_URL || `https://${HOST[modo][process.env.VERIFACTU_SELLO ? 1 : 0]}${RUTA}`;

function post(url, xml) {
  return new Promise((ok, mal) => {
    const req = https.request(url, {
      method: 'POST', timeout: 30000,
      pfx: Buffer.from(process.env.VERIFACTU_P12, 'base64'), passphrase: process.env.VERIFACTU_P12_CLAVE,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""', 'Content-Length': Buffer.byteLength(xml) },
    }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { b += c; });
      res.on('end', () => ok({ status: res.statusCode, cuerpo: b }));
    });
    req.on('timeout', () => req.destroy(new Error('La AEAT no ha contestado a tiempo')));
    req.on('error', mal);
    req.end(xml);
  });
}

const v = (xml, tag) => new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`).exec(xml)?.[1];

// Respuesta de la AEAT: un error SOAP (Fault) o el estado del envío y de cada registro.
export function leerRespuesta(xml) {
  if (/:Fault>|<Fault>/.test(xml)) return { fault: v(xml, 'faultstring') || 'Error de la AEAT' };
  const lineas = [...xml.matchAll(/<(?:\w+:)?RespuestaLinea>([\s\S]*?)<\/(?:\w+:)?RespuestaLinea>/g)].map(([, l]) => ({
    numSerie: v(l, 'NumSerieFactura'), operacion: v(l, 'TipoOperacion') || 'Alta', estado: v(l, 'EstadoRegistro'), codigo: v(l, 'CodigoErrorRegistro') || '', descripcion: v(l, 'DescripcionErrorRegistro') || '',
  }));
  return { estadoEnvio: v(xml, 'EstadoEnvio'), espera: Number(v(xml, 'TiempoEsperaEnvio')) || 60, csv: v(xml, 'CSV') || '', lineas };
}

// Envía lo pendiente de una empresa. Devuelve qué ha pasado; nunca lanza (si algo falla, se reintenta más tarde).
// Auditoría F11: solo los registros del modo actual (los de pruebas nunca van a la AEAT de verdad), el XML con la
// instantánea de la factura (emisor y régimen de IVA de cuando se emitió) y cada intento queda en el historial.
// opciones.post: para las pruebas (simula la AEAT sin red ni certificado).
export async function enviarPendientes(u, opciones = {}) {
  const enviarXml = opciones.post || post;
  const modo = ['pruebas', 'real'].includes(u.verifactu) ? u.verifactu : null;
  if (!modo || !redis) return { omitido: 'desactivado' };
  if (!certificadoListo() && !opciones.post) return { omitido: 'sin certificado' };
  // Marca de «hay algo pendiente» (la pone la emisión): así comprobarlo cuesta una lectura.
  const marca = `verifactu-pendiente:${u.empresa}`;
  if ((await redis.get(marca)) === '0') return { enviados: 0 };
  const registros = (await leer(u, 'registros')) || [];
  const candidatos = registros.filter((r) => !r.envio || r.envio.estado === 'Pendiente')
    .sort((a, b) => a.FechaHoraHusoGenRegistro.localeCompare(b.FechaHoraHusoGenRegistro));
  const facturas = {};
  const pendientes = [];
  // La factura de un registro: en la lista o, si se anuló o se borró, en «facturasBorradas».
  const facturaDe = async (id) => (await leerUno(u, 'facturas', id)) || (await leerUno(u, 'facturasBorradas', id));
  for (const r of candidatos) {
    if (pendientes.length >= 1000) break;
    facturas[r.factura] = await facturaDe(r.factura);
    if (modoRegistro(r, facturas[r.factura]) === modo) pendientes.push(r);
  }
  if (!pendientes.length) { await redis.set(marca, '0'); return { enviados: 0 }; }
  const espera = `verifactu-espera:${u.empresa}`;
  if (pendientes.length < 1000 && (await redis.get(espera))) return { esperando: true, pendientes: pendientes.length };
  // Cerrojo con propietario: un envío que tarde más de la cuenta no suelta el del siguiente.
  const cerrojo = `cerrojo:verifactu:${u.empresa}`;
  const yo = randomUUID();
  if (!(await redis.set(cerrojo, yo, { nx: true, ex: 90 }))) return { esperando: true, pendientes: pendientes.length };
  const ahora = new Date().toISOString();
  const marcar = async (r, envio) => {
    const actual = (await leerUno(u, 'registros', r.id)) || r;
    await guardar(u, 'registros', { ...actual, modo: modoRegistro(actual, facturas[r.factura]), envio, envios: [...(actual.envios || []), { ...envio, modo }].slice(-30) });
    // El estado va a la factura solo si es su registro vigente (uno anterior, ya subsanado, no lo pisa).
    const hash = (await leerUno(u, 'facturas', r.factura)) ? 'facturas' : 'facturasBorradas';
    const f = await leerUno(u, hash, r.factura);
    const resumen = { estado: envio.estado, ...(envio.csv ? { csv: envio.csv } : {}), ...(envio.descripcion ? { error: envio.descripcion } : { error: undefined }), ...(envio.codigo ? { codigo: envio.codigo } : { codigo: undefined }) };
    if (!f) return;
    // Se relee bajo el cerrojo de la factura: un cobro o un envío en curso no se pisa con la copia de antes.
    await actualizarFactura(u, r.factura, (actual) => {
      if (r.tipo === 'anulacion' && actual?.verifactu?.anulacion?.huella === r.Huella) return { nueva: { ...actual, verifactu: { ...actual.verifactu, anulacion: { ...actual.verifactu.anulacion, ...resumen } } } };
      if (r.tipo !== 'anulacion' && actual?.verifactu?.huella === r.Huella) return { nueva: { ...actual, verifactu: { ...actual.verifactu, ...resumen } } };
      return null;
    }, { hash });
  };
  try {
    const porId = Object.fromEntries(registros.map((r) => [r.id, r]));
    const sistema = { nombre: process.env.NETTO_RAZON, nif: process.env.NETTO_NIF, version: VERSION, instalacion: u.empresa };
    const xmls = pendientes.map((r) => {
      const factura = facturas[r.factura];
      if (r.tipo === 'anulacion') return xmlAnulacion(r, { anterior: r.HuellaAnterior ? porId[r.HuellaAnterior] : null, sistema });
      const fiscal = { ...fiscalDe(u), ...(factura?.regimenIva ? { iva: factura.regimenIva } : {}) };
      return xmlAlta(r, { factura, emisorNombre: factura?.emisor?.nombre || u.emisor?.nombre, anterior: r.HuellaAnterior ? porId[r.HuellaAnterior] : null, sistema, fiscal });
    });
    let res;
    try { res = await enviarXml(urlDe(modo), sobre({ nombre: u.emisor?.nombre, nif: u.emisor?.nif }, xmls)); } catch (e) { res = { status: 0, cuerpo: '', red: e.message }; }
    const r = res.red ? { fault: `Sin conexión con la AEAT: ${res.red}` } : leerRespuesta(res.cuerpo);
    if (r.fault) {
      // Rechazo de todo el envío o sin conexión: siguen pendientes y se reintenta tras la espera inicial.
      for (const x of pendientes) await marcar(x, { estado: 'Pendiente', descripcion: r.fault, fecha: ahora });
      await redis.set(espera, '1', { ex: 60 });
      console.warn('[verifactu]', u.empresa, r.fault);
      return { error: r.fault };
    }
    for (const x of pendientes) {
      const l = r.lineas.find((y) => y.numSerie === x.NumSerieFactura && (y.operacion === 'Anulacion') === (x.tipo === 'anulacion'));
      // 3000: ya estaba registrado (un envío anterior llegó aunque no recibiéramos la respuesta).
      const estado = !l ? 'Pendiente' : l.codigo === '3000' ? 'Correcto' : l.estado;
      await marcar(x, { estado, csv: HECHO.includes(estado) ? r.csv : '', codigo: l?.codigo || '', descripcion: estado === 'Correcto' ? '' : l?.descripcion || '', fecha: ahora });
    }
    await redis.set(espera, '1', { ex: Math.max(1, r.espera) });
    const quedan = candidatos.length - pendientes.length;
    await redis.set(marca, quedan > 0 || r.lineas.length < pendientes.length ? '1' : '0');
    return { enviados: pendientes.length, estado: r.estadoEnvio, espera: r.espera };
  } finally {
    await redis.eval(SOLTAR, [cerrojo], [yo]).catch(() => {});
  }
}

// Cron de cada mañana: lo que quedara pendiente en cualquier empresa con Verifactu (sin conexión, esperas…).
export async function enviarTodas() {
  if (!redis || !certificadoListo()) return 0;
  let n = 0;
  for (const e of Object.values((await redis.hgetall('empresas')) || {})) {
    if (!e.verifactu || e.baja) continue;
    const r = await enviarPendientes({ ...e, empresa: e.id }).catch(() => ({}));
    n += r.enviados || 0;
  }
  return n;
}

export const marcarPendiente = (u) => redis.set(`verifactu-pendiente:${u.empresa}`, '1');

// Se envía después de responder (al crear una factura y al abrir Resumen o Facturas). Si toca esperar (control de
// flujo) y cabe en la función (60 s como mucho), se espera y se envía; si no, lo recoge la siguiente visita o el cron.
export function enviarLuego(u) {
  if (!u.verifactu || !certificadoListo() || !redis) return;
  const tarea = async () => {
    const fin = Date.now() + 50000;
    let r = await enviarPendientes(u).catch((e) => ({ error: e.message }));
    while (r.esperando && Date.now() < fin) {
      const queda = await redis.ttl(`verifactu-espera:${u.empresa}`).catch(() => -1);
      const ms = queda > 0 ? queda * 1000 + 300 : 700; // sin espera: hay otro envío en curso (cerrojo)
      if (Date.now() + ms > fin) break;
      await new Promise((ok) => setTimeout(ok, ms));
      r = await enviarPendientes(u).catch((e) => ({ error: e.message }));
    }
  };
  try { after(tarea); } catch { tarea(); } // fuera de una petición (pruebas), en el momento
}
