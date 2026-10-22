// El paquete trimestral para la gestoría (lib/paquete.js): construirlo en el formato pedido y mandarlo por email a la
// gestoría de la empresa (Ajustes › Tu gestoría), a mano o solo, el día 5 del mes siguiente a cada trimestre.
import { leer, redis } from './redis.js';
import { datosPaquete, nombrePaquete, paqueteXlsx } from './paquete.js';
import { paquetePdf } from './paquetePdf.js';
import { zip } from './zip.js';
import { delosAnios } from './indices.js';
import { justificantesParaZip } from './justificantes.js';
import { trimestre } from './calculos.js';
import { emailListo, emailValido } from './email.js';
import { agruparGastosNomina, agruparNominas, veSueldos } from './nominas.js';
import { enviarCorreo } from './correos.js';

// Los mismos gastos que el paquete (lib/paquete.js datosPaquete).
const gastosDelTrimestre = (gastos, anio, t) => (gastos || []).filter((g) => g.fecha?.startsWith(`${anio}-`) && trimestre(g.fecha) === t);

// formato: 'zip' (Excel, PDF y justificantes de los gastos), 'xlsx' o 'pdf'. justificantes: false para el .zip sin ellos.
// sueldos: false junta las nóminas por mes, sin lo de cada persona (quien lo pide no tiene el permiso «Nóminas», Codex H2).
export async function construirPaquete(u, anio, t, formato = 'zip', { justificantes = true, sueldos = veSueldos(u) } = {}) {
  // Solo el año del trimestre y los bienes de inversión (informe de capacidad E01).
  const [{ facturas }, gastosLeidos, nominasLeidas] = await Promise.all([delosAnios(u, Array.from({ length: 5 }, (_, i) => anio - i)), leer(u, 'gastos'), leer(u, 'nominas')]);
  const gastos = sueldos ? gastosLeidos || [] : agruparGastosNomina(gastosLeidos || []);
  const nominas = sueldos ? nominasLeidas || [] : agruparNominas(nominasLeidas || []);
  const d = datosPaquete(u, { facturas, gastos, nominas }, anio, t);
  const nombre = nombrePaquete(d);
  if (formato === 'xlsx') return { nombre, ext: 'xlsx', tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', cuerpo: paqueteXlsx(d) };
  if (formato === 'pdf') return { nombre, ext: 'pdf', tipo: 'application/pdf', cuerpo: await paquetePdf(d) };
  const extra = justificantes ? await justificantesParaZip(u, gastosDelTrimestre(gastos, anio, t)) : [];
  return { nombre, ext: 'zip', tipo: 'application/zip', justificantes: extra.length, cuerpo: zip([{ nombre: `${nombre}.xlsx`, datos: paqueteXlsx(d) }, { nombre: `${nombre}.pdf`, datos: await paquetePdf(d) }, ...extra]) };
}

// El trimestre que acaba de cerrar el día dado (en enero, el 4T del año anterior).
export function trimestreAnterior(dia) {
  const anio = Number(dia.slice(0, 4)), t = trimestre(dia);
  return t === 1 ? { anio: anio - 1, t: 4 } : { anio, t: t - 1 };
}
// El envío automático: el día 5 de enero, abril, julio y octubre (tiempo para apuntar los últimos tickets, y la
// gestoría aún tiene hasta el 20 para presentar).
export const tocaPaqueteGestoria = (dia) => /^\d{4}-(01|04|07|10)-05$/.test(dia);

// Los correos aceptan unos 40 MB por envío: si con los justificantes se pasa, va sin ellos (y lo dice).
const MAX_ADJUNTO = 30 * 1024 * 1024;

// auto: el envío del día 5, sin nadie que lo pida: lleva lo de cada nómina si quien puso el email de la gestoría podía
// verlo (gestoria.sueldos, Ajustes › Tu gestoría; las de antes, sí).
export async function enviarPaqueteGestoria(u, { anio, t, auto = false }) {
  const g = u.gestoria;
  if (!g?.email || !emailValido(g.email)) return { error: 'Primero escribe el email de tu gestoría' };
  if (!emailListo()) return { error: 'El envío de emails aún no está configurado' };
  const sueldos = auto ? g.sueldos !== false : veSueldos(u);
  let p = await construirPaquete(u, anio, t, 'zip', { sueldos });
  let sinJustificantes = false;
  if (p.cuerpo.length > MAX_ADJUNTO) { p = await construirPaquete(u, anio, t, 'zip', { justificantes: false, sueldos }); sinJustificantes = true; }
  const e = u.emisor || {};
  const empresa = e.nombre || u.empresaNombre || 'la empresa';
  const r = await enviarCorreo('paquete-gestoria', {
    para: g.email,
    datos: { gestor: g.nombre, empresa, nif: e.nif, t, anio, justificantes: p.justificantes, sinJustificantes },
    ...(emailValido(e.email) ? { responderA: e.email } : {}),
    adjuntos: [{ nombre: `${p.nombre}.${p.ext}`, datos: p.cuerpo }],
  });
  if (r.error) return r;
  return { ok: true, para: g.email, sinJustificantes };
}

// La tarea del día (lib/trabajosTareas.js): solo una vez por trimestre y empresa, aunque el cron se repita.
export async function paqueteAutomatico(u, dia) {
  if (!u?.gestoria?.auto || !tocaPaqueteGestoria(dia)) return { enviados: 0 };
  const { anio, t } = trimestreAnterior(dia);
  const k = `gestoria-paquete:${u.empresa}:${anio}-${t}`;
  if (!(await redis.set(k, dia, { nx: true, ex: 200 * 86400 }))) return { enviados: 0 };
  const r = await enviarPaqueteGestoria(u, { anio, t, auto: true });
  if (r.error) { await redis.del(k); throw new Error(r.error); }
  return { enviados: 1 };
}
