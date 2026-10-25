import { leer, leerUno, guardar } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { fiscalDe } from '@/lib/empresa';
import { generarAsientos } from '@/lib/asientos';
import { cuentasAnuales, SECCIONES } from '@/lib/cuentasAnuales';
import { cuentasAnualesPdf } from '@/lib/cuentasAnualesPdf';
import { hoy } from '@/lib/formato';
import { auditar } from '@/lib/auditoria';
import { pasado, respuesta429 } from '@/lib/limite';
import { gastosQueVe, nominasQueVe } from '@/lib/nominas';

export const dynamic = 'force-dynamic';

// PDF de las cuentas anuales de un año (?anio=2025): balance, pérdidas y ganancias, cambios en el patrimonio neto,
// memoria, formulación y certificado de aprobación.
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  if (await pasado('pdf', u.id, 120, 600)) return respuesta429(600, 'Has descargado demasiados PDF. Espera 10 minutos antes de descargar más.');
  const anio = Number(req.nextUrl.searchParams.get('anio')) || Number(hoy().slice(0, 4)) - 1;
  const [facturas, gastosLeidos, nominasLeidas, manuales, guardado, productos, ajustes, albaranes] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), leer(u, 'asientos'), leerUno(u, 'cuentasAnuales', String(anio)), leer(u, 'productos'), leer(u, 'stock'), leer(u, 'albaranes')]);
  // Sin el permiso «Nóminas», las de cada persona van juntas por mes (lib/nominas.js, Codex H2).
  const gastos = gastosQueVe(u, gastosLeidos), nominas = nominasQueVe(u, nominasLeidas);
  const asientos = generarAsientos({ facturas, gastos, nominas: nominas || [], manuales: manuales || [], fiscal: fiscalDe(u), pagos130: u.pagos130 || {}, pres303: u.pres303 || {}, pres369: u.pres369 || {}, pres123: u.pres123 || {}, pres111: u.pres111 || {}, pres115: u.pres115 || {}, pagadosHacienda: u.pagadosHacienda || {}, capital: (await leer(u, 'capital')) || [], pagos202: u.pagos202 || {}, cuotaIS: u.cuotaIS || {}, binsPrevias: u.binsPrevias || {}, fondosPropios: u.fondosPropios || {}, productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [] }, hoy());
  const c = cuentasAnuales({ asientos, gastos, nominas: nominas || [], empresa: u, anio, guardado: guardado || {} });
  const nombre = `cuentas-anuales-${anio}.pdf`;
  await auditar(u, 'Cuentas anuales', `Descarga del PDF de ${anio}`);
  return new Response(await cuentasAnualesPdf(c), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nombre}"` } });
}

// Guarda lo que pone la empresa: administradores, datos registrales, fechas y la memoria retocada (vacía = el borrador).
// Solo con el permiso «Contabilidad».
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'contabilidad' });
  if (res) return res;
  const b = await cuerpo(req);
  const anio = Number(b.anio);
  if (!(anio >= 2000 && anio <= 2100)) return error('Año no válido');
  const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
  const texto = (v, n) => String(v || '').trim().slice(0, n);
  const memoria = Object.fromEntries(SECCIONES.map(([n]) => [n, texto(b.memoria?.[n], 6000)]).filter(([, v]) => v));
  const datos = { id: String(anio), administradores: texto(b.administradores, 500), registro: texto(b.registro, 300), formulacion: fecha(b.formulacion), junta: fecha(b.junta), memoria };
  await guardar(u, 'cuentasAnuales', datos);
  await auditar(u, 'Cuentas anuales', `Datos de ${anio} guardados`);
  return Response.json({ ok: true });
}
