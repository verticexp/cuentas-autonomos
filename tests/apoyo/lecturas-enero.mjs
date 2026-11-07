// Ejecuta los bloques de preparación de datos de las páginas reales, antes del JSX.
// Así las mediciones siguen sus lecturas actuales sin instalar React/Next. No incluye
// sesión, layout, renderizado de componentes ni trabajos posteriores a la respuesta.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as R from '../../lib/redis.js';
import * as I from '../../lib/indices.js';
import * as E from '../../lib/empresa.js';
import * as C from '../../lib/calculos.js';
import * as N from '../../lib/nominas.js';
import * as P from '../../lib/permisos.js';
import * as F from '../../lib/formato.js';
import * as Pagos from '../../lib/pagos.js';
import * as Proyectos from '../../lib/proyectos.js';
import * as Bandeja from '../../lib/bandeja.js';
import * as Banco from '../../lib/banco.js';
import * as Deducciones from '../../lib/deducciones.js';
import * as Planes from '../../lib/planes.js';
import * as Buzon from '../../lib/buzon.js';
import * as Revision from '../../lib/revisionGastos.js';
import * as RevisionIRPF from '../../lib/revisionGastosIRPF.js';
import * as Cuotas from '../../lib/cuotasIAConfig.js';

const raiz = new URL('../../', import.meta.url);
async function bloque(archivo, inicio, fin) {
  const s = await readFile(new URL(archivo, raiz), 'utf8');
  const a = s.indexOf(inicio), b = s.indexOf(fin, a + inicio.length);
  assert.ok(a >= 0 && b > a, `Han cambiado los límites del bloque medido de ${archivo}`);
  assert.equal(s.indexOf(inicio, a + inicio.length), -1, 'el inicio debe ser único');
  return s.slice(a, b);
}
const compilar = (s, contexto) => {
  const nombres = Object.keys(contexto);
  return new Function(...nombres, 'return async () => { "use strict";\n' + s + '\n};')(...Object.values(contexto));
};
const comun = { ...R, ...I, ...E, ...C, ...N, ...P, ...F, ...Pagos, ...Proyectos, ...Bandeja, ...Banco, ...Deducciones, ...Planes, ...Buzon, ...Revision, ...RevisionIRPF, ...Cuotas };
// Extrae las funciones reales que tienen imports externos ajenos a estas lecturas.
const fuenteCupo = (await bloque('lib/cuotasIA.js', 'const fechaMadrid', '// Se valida y cuenta')).replaceAll('export ', '');
const fuenteCandidatos = (await bloque('lib/bancoServidor.js', 'const masDias', 'const SEIS_HORAS')).replaceAll('export ', '');
const cupoEscaneos = async (u) => compilar(fuenteCupo + '\nreturn cupoEscaneos(u);', { ...comun, u })();
const candidatosConciliacion = async (u, movs) => compilar(fuenteCandidatos + '\nreturn candidatosConciliacion(u, movs);', { ...comun, u, movs })();

export async function lecturas(u, panelDe, datosImpuestos) {
  const h = '2027-01-15', anio = 2026, actual = 2027, f = E.fiscalDe(u);
  const resumen = await bloque('app/page.js', '  const [nFacturas, nGastos', '  const actividades =');
  const modelos = await bloque('app/modelos/page.js', '  const [{ facturas, gastos }, nominas', '  const capital =');
  const facturas = await bloque('app/facturas/page.js', '  const ACTIVIDADES =', '\n  return (');
  const gastos = await bloque('app/gastos/page.js', '  const { q, estado, banco, desde', '  // Una fila de la lista:');
  const contexto = { ...comun, u, panelDe, datosImpuestos, h, anio, actual, f, anioPedido: 2027, searchParams: Promise.resolve({}), tr: (s) => s,
    candidatosConciliacion, cupoEscaneos, correoEntranteListo: () => false,
    // La fixture no tiene bandeja ni trabajos; se rechaza si deja de cumplirse.
    documentosBandeja: async (u) => { const ds = await R.leer(u, 'bandeja'); assert.equal(ds.length, 0); return ds; },
    adelantarLecturas: async (_u, ds) => { assert.equal(ds.length, 0); },
    resumenBandeja: Bandeja.resumen, vencidasHoy: I.vencidas,
  };
  return {
    resumen: compilar(resumen + '\nreturn { nFacturas, nGastos, P, teso, casillas, cierres };', contexto),
    modelos: compilar(modelos + '\nreturn { facturas, gastos, nominas, empleados, productos, ajustes, albaranes, manuales, capitalLeido, recurrentes, saldo, fichasCli, fichasProv };', contexto),
    facturas: compilar(facturas + '\nreturn { total, lista, totalMes };', contexto),
    gastos: compilar(gastos + '\nreturn { total, lista, totalMes };', contexto),
  };
}
