// Qué hace cada tipo de trabajo de la cola (lib/trabajos.js). Se carga al procesar, no al encolar: así lo que solo
// guarda una factura no arrastra el correo, el PDF ni el push. Cada tarea relee sus datos al ejecutarse y es
// idempotente: repetirla tras un corte no duplica nada que no duplicara ya el proceso de antes.
import { randomBytes } from 'node:crypto';
import { redis, leer, leerUno } from './redis.js';
import { asegurar, comprobarTotales, leerMarcados } from './indices.js';
import { metrica } from './metricas.js';
import { opsEncolar, Definitivo } from './trabajos.js';
import { subirFactura, subirGasto } from './drive.js';
import { enviarNomina } from './controlat.js';
import { actualizarFactura } from './actualizarFactura.js';
import { identidadDoc } from './documento.js';
import { emisorDe, importes, numeroFactura, vencimiento } from './calculos.js';
import { eur, fechaTexto } from './formato.js';
import { facturaPdf } from './pdf.js';
import { emailListo, emailValido, enviarEmail, htmlMensaje } from './email.js';
import { enlacePago } from './cobros.js';
import { stripeListo } from './stripe.js';
import { tocaRecordatorio } from './recordatorios.js';
import { avisosPushEmpresa, pushListo } from './push.js';
import { enviarPendientes } from './verifactuEnvio.js';
import { procesarRecurrente } from './recurrentesServidor.js';
import { asuntoFactura, enviarFactura, mensajeFactura } from './envio.js';
import { tocaRecurrente } from './recurrentes.js';

const empresaU = async (id) => {
  const e = await redis.hget('empresas', id);
  return e && !e.baja ? { ...e, empresa: id } : null;
};

// Drive: un error de red (no llegó) se reintenta; si Google respondió con un error o tardó demasiado, puede que el
// script ya escribiera la fila: no se repite solo, queda en la bandeja para reintentarlo a mano.
async function drive(r) {
  if (!r || r.ok || /^No hay URL/.test(r.error || '')) return;
  if (/^No se pudo conectar/.test(r.error || '')) throw new Error(r.error);
  throw new Definitivo(r.error);
}

async function recordatorios({ empresa, dia, origen }) {
  const u = await empresaU(empresa);
  const e = u?.emisor || {};
  const cada = Number(e.recordatorios) || 0;
  if (!u || !cada || !e.nif || !e.iban || !emailListo()) return { enviados: 0 };
  const fallos = [];
  let enviados = 0;
  // Solo las facturas sin cobrar (índice): las cobradas nunca tienen recordatorio.
  for (const f0 of await leerMarcados(u, 'facturas', 'p')) {
    if (!tocaRecordatorio(f0, { plazo: e.plazo, cada }, dia) || !emailValido(f0.cliente.email)) continue;
    const { f, ruta } = stripeListo() ? await enlacePago(u, f0) : { f: f0 };
    const num = numeroFactura(f);
    const token = randomBytes(16).toString('hex');
    const mensaje = [
      'Hola,',
      `Te recordamos que la factura ${num} por ${eur(importes(f).total)} venció el ${fechaTexto(vencimiento(f, e.plazo))} y aún no nos consta el pago.`,
      ruta && `Puedes pagarla con tarjeta o Bizum aquí: ${origen}${ruta}`,
      `${ruta ? 'O' : 'Puedes pagarla'} por transferencia a ${e.iban}, indicando la factura ${num}.`,
      'Si ya la has pagado, ignora este mensaje.',
      `Gracias,\n${e.nombre || u.nombre}`,
    ].filter(Boolean).join('\n\n');
    const r = await enviarEmail({
      para: f.cliente.email,
      asunto: `Recordatorio: factura ${num} pendiente de pago`,
      html: htmlMensaje(mensaje, `${origen}/api/abierta/${token}`),
      adjuntos: [{ nombre: `${num}.pdf`, datos: await facturaPdf(f, ...Object.values(await identidadDoc(u, f))) }],
    });
    if (r.error) { fallos.push(`${f.id}: ${r.error}`); continue; }
    await redis.hset('factura-envios', { [token]: { empresa, id: f.id } });
    await actualizarFactura(u, f.id, (actual) => ({ nueva: { ...actual, envios: [...(actual.envios || []), { tipo: 'recordatorio', fecha: new Date().toISOString(), para: f.cliente.email, token }] } }));
    enviados += 1;
  }
  // Los enviados quedan apuntados en su factura: al reintentar solo se repiten los que fallaron.
  if (fallos.length) throw new Error(fallos.join('; ').slice(0, 300));
  return { enviados };
}

async function recurrentes({ empresa, dia, origen }) {
  const u = await empresaU(empresa);
  if (!u) return { creadas: [] };
  const enviar = (u2, f) => (emailListo() && emailValido(f.cliente.email)
    ? enviarFactura(u2, f, { para: f.cliente.email, asunto: asuntoFactura(f, emisorDe(f, u2)), mensaje: mensajeFactura(f, emisorDe(f, u2)), origen })
    : Promise.resolve({}));
  const fallos = [], creadas = [];
  for (const r of (await leer(u, 'recurrentes')) || []) {
    if (!tocaRecurrente(r, dia) && !r.envio) continue;
    // procesarRecurrente es idempotente por periodo: repetirlo no emite otra factura.
    const x = await procesarRecurrente(u, r.id, dia, { enviar }).catch((e) => ({ fallo: e.message }));
    if (x.creada) creadas.push(x.creada);
    if (x.fallo) fallos.push(`${r.id}: ${x.fallo}`);
    if (x.falloEnvio) fallos.push(`${r.id}: envío: ${x.falloEnvio}`);
  }
  if (fallos.length) throw new Error(fallos.join('; ').slice(0, 300));
  return { creadas };
}

export const TAREAS = {
  'drive-factura': async ({ empresa, factura }) => {
    const u = await empresaU(empresa);
    const f = u?.drive?.url && (await leerUno(u, 'facturas', factura));
    if (f) await drive(await subirFactura(u, f));
  },
  'drive-gasto': async ({ empresa, gasto }) => {
    const u = await empresaU(empresa);
    const g = u?.drive?.url && (await leerUno(u, 'gastos', gasto));
    if (g) await drive(await subirGasto(u, g));
  },
  controlat: async ({ empresa, usuario, mes }) => {
    const [emp, usu] = await Promise.all([empresaU(empresa), redis.hget('usuarios', usuario)]);
    if (emp && usu) await enviarNomina({ ...usu, ...emp, id: usu.id, empresa }, [mes]);
  },
  'dia-recordatorios': recordatorios,
  'dia-recurrentes': recurrentes,
  'dia-push': async ({ empresa, usuarios, dia }) => {
    const emp = await redis.hget('empresas', empresa);
    return { avisos: emp && !emp.baja ? await avisosPushEmpresa(emp, usuarios || [], dia) : 0 };
  },
  // Índices y totales de la empresa al día (tras un cambio de versión, la primera visita no tiene que construirlos) y
  // comprobación de que los totales cuadran con las fichas; un descuadre queda en los registros (E06/E11).
  'dia-indices': async ({ empresa }) => {
    const u = { id: empresa, empresa };
    let descuadres = 0;
    for (const col of ['facturas', 'gastos', 'presupuestos']) {
      await asegurar(u, col);
      if (col !== 'presupuestos') descuadres += (await comprobarTotales(u, col)).length;
    }
    if (descuadres) metrica('totales-descuadrados', { empresa, campos: descuadres });
    return { descuadres };
  },
  'dia-verifactu': async ({ empresa }) => {
    const u = await empresaU(empresa);
    if (!u?.verifactu) return { enviados: 0 };
    const r = await enviarPendientes(u);
    if (r.error) throw new Error(r.error);
    return { enviados: r.enviados || 0 };
  },
};

// Plan del día (lo llama el cron): un trabajo por empresa y tarea, en lotes de 50 empresas por transacción. Volver a
// planificar (un cron repetido o reanudado) solo vuelve a encolar: cada tarea es idempotente (las recurrentes, por
// periodo; los recordatorios, por los envíos apuntados en la factura; los avisos, una vez por día y tipo).
const LOTE = 50;
export async function planificarDia(dia, origen, que = ['recordatorios', 'push', 'verifactu']) {
  const empresas = Object.values((await redis.hgetall('empresas')) || {}).filter((e) => e && !e.baja).sort((a, b) => a.id.localeCompare(b.id));
  const porEmpresa = {};
  if (que.includes('push') && pushListo()) {
    // Como antes: cada usuario recibe los avisos de la empresa con la que trabaja.
    for (const usu of Object.values((await redis.hgetall('usuarios')) || {})) (porEmpresa[usu.empresa || usu.id] ||= []).push(usu.id);
  }
  let n = 0;
  for (let i = 0; i < empresas.length; i += LOTE) {
    const tx = redis.multi();
    let hay = false;
    for (const e of empresas.slice(i, i + LOTE)) {
      const em = e.emisor || {};
      const datos = { dia, origen };
      const t = [];
      if (que.includes('recordatorios') && Number(em.recordatorios) && em.nif && em.iban && emailListo()) t.push(['dia-recordatorios', datos]);
      if (que.includes('recurrentes')) t.push(['dia-recurrentes', datos]);
      if (que.includes('push') && porEmpresa[e.id]?.length) t.push(['dia-push', { ...datos, usuarios: porEmpresa[e.id] }]);
      if (que.includes('verifactu') && e.verifactu) t.push(['dia-verifactu', datos]);
      if (que.includes('indices')) t.push(['dia-indices', datos]);
      for (const [tipo, d] of t) { opsEncolar(tx, e.id, { id: `${tipo}:${dia}`, tipo, datos: d }); n += 1; hay = true; }
    }
    if (hay) await tx.exec();
  }
  return n;
}

// Resumen de lo hecho en una tanda, para la respuesta del cron.
export function resumenTanda(r) {
  const de = (tipo) => r.resultados.filter((x) => x.tipo === tipo);
  return {
    enviados: de('dia-recordatorios').reduce((s, x) => s + (x.enviados || 0), 0),
    creadas: de('dia-recurrentes').flatMap((x) => x.creadas || []),
    avisos: de('dia-push').reduce((s, x) => s + (x.avisos || 0), 0),
    verifactu: de('dia-verifactu').reduce((s, x) => s + (x.enviados || 0), 0),
    indices: de('dia-indices').length, descuadres: de('dia-indices').reduce((s, x) => s + (x.descuadres || 0), 0),
    errores: r.errores, quedan: r.quedan,
  };
}
