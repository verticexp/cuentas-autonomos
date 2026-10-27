// El libro diario de un año en el formato del programa de la gestoría (A3, ContaPlus o ContaSol, lib/exportarContable.js),
// con los mismos asientos que Contabilidad. Lo usan Exportar (app/api/exportar/contable) y Mi despacho (app/api/despacho).
import { leer } from './redis.js';
import { fiscalDe } from './empresa.js';
import { generarAsientos } from './asientos.js';
import { diarioA3, diarioContaplus, diarioContasol } from './exportarContable.js';
import { gastosQueVe, nominasQueVe } from './nominas.js';

export const FORMATOS_DIARIO = ['a3', 'contaplus', 'contasol'];
export const nombreDiario = (formato, anio) => (formato === 'a3' ? 'SUENLACE.DAT' : formato === 'contaplus' ? `XDiario-${anio}.txt` : `asientos-${anio}.csv`);
export const tipoDiario = (formato) => (formato === 'contasol' ? 'text/csv; charset=utf-8' : 'text/plain; charset=us-ascii');

// codigo: el número de la empresa en el programa de la gestoría (A3), no el id de Fisquo. → { nombre, contenido } o { error }.
export async function diarioDe(u, { anio, formato, codigo = 1, fecha }) {
  if (!FORMATOS_DIARIO.includes(formato)) return { error: 'Formato no válido: a3, contaplus o contasol' };
  const [facturas, gastosLeidos, nominasLeidas, manuales, productos, ajustes, albaranes, capital] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), leer(u, 'asientos'), leer(u, 'productos'), leer(u, 'stock'), leer(u, 'albaranes'), leer(u, 'capital')]);
  // Sin el permiso «Nóminas», las de cada persona van juntas por mes (lib/nominas.js, Codex H2).
  const gastos = gastosQueVe(u, gastosLeidos), nominas = nominasQueVe(u, nominasLeidas);
  if (!facturas || !gastos) return { error: 'No se han podido cargar los datos contables' };
  const asientos = generarAsientos({ facturas, gastos, nominas: nominas || [], manuales: manuales || [], fiscal: fiscalDe(u), pagos130: u.pagos130 || {}, pres303: u.pres303 || {}, pres369: u.pres369 || {}, pres123: u.pres123 || {}, pres111: u.pres111 || {}, pres115: u.pres115 || {}, pagadosHacienda: u.pagadosHacienda || {}, prorrata: u.prorrata || {}, capital: capital || [], pagos202: u.pagos202 || {}, cuotaIS: u.cuotaIS || {}, binsPrevias: u.binsPrevias || {}, fondosPropios: u.fondosPropios || {}, productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [] }, fecha);
  try {
    const contenido = formato === 'a3' ? diarioA3(asientos, { anio, empresa: codigo }) : formato === 'contaplus' ? diarioContaplus(asientos, { anio }) : diarioContasol(asientos, { anio });
    return { nombre: nombreDiario(formato, anio), contenido };
  } catch (e) {
    return { error: e.message };
  }
}
