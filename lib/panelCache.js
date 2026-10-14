// Resumen calculado y guardado por versión de los datos (informe de capacidad E06: «proyecciones versionadas»). Mientras
// no cambie ninguna factura ni gasto (contador «rev» de sus totales, que sube en la misma ejecución atómica que cada
// escritura), ni los ajustes, recurrentes, nóminas o saldo que usa, ni el día, el panel se sirve sin leer documentos.
// La clave es de la empresa: nunca se comparte entre empresas. Caduca sola en un día.
import { createHash } from 'node:crypto';
import { redis, leer } from './redis.js';
import { claves } from './fichas.js';
import { asegurar, delosAnios } from './indices.js';
import { panelResumen } from './panel.js';
import { prevision } from './tesoreria.js';
import { casillas303 } from './calculos.js';
import { actividadesDe, fiscalDe } from './empresa.js';

const empresa = (u) => u.empresa || u.id;
const huella = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 24);

// Lo que la pantalla necesita del panel, sin los documentos (las vencidas, solo cuántas y los primeros nombres).
function reducido(P) {
  return { ...P, sinCobrar: { length: P.sinCobrar.length }, vencidas: { length: P.vencidas.length, nombres: P.vencidas.map((f) => f.cliente?.nombre).slice(0, 3) } };
}

export async function panelDe(u, { anio, hoy, recurrentes = [], nominas = [], saldo = null }) {
  await Promise.all([asegurar(u, 'facturas'), asegurar(u, 'gastos')]);
  const [rf, rg] = await Promise.all(['facturas', 'gastos'].map((c) => redis.hget(claves(c, empresa(u)).ixa, 'rev')));
  const actividades = actividadesDe(u), fiscal = fiscalDe(u);
  const empleados = (await leer(u, 'empleados')) || [];
  const ajustes = { pagos130: u.pagos130, rend130: u.rend130, emisor: u.emisor, cuotaIS: u.cuotaIS, pagos202: u.pagos202, actividades, fiscal };
  const k = `panel:v2:${empresa(u)}:${anio}:${hoy}:${rf || 0}:${rg || 0}:${huella([ajustes, recurrentes, nominas, empleados, saldo])}`;
  const guardado = await redis.get(k);
  if (guardado) return guardado;
  const anioActual = Number(hoy.slice(0, 4));
  const { facturas, gastos } = await delosAnios(u, [...Array.from({ length: 5 }, (_, i) => anio - i), ...Array.from({ length: 5 }, (_, i) => anioActual - i)], { pendientes: true });
  const P = panelResumen({ facturas, gastos, pagos130: u.pagos130, rend130: u.rend130, emisor: u.emisor, anio, hoy, actividades, fiscal });
  const teso = P.esteAnio && prevision({ facturas, gastos, recurrentes, nominas, empleados, fiscal, pagos130: u.pagos130 || {}, rend130: u.rend130 || {}, cuotaIS: u.cuotaIS || {}, pagos202: u.pagos202 || {}, plazo: u.emisor?.plazo, saldo, actividades: actividades.map((a) => a.id), hoy, meses: 3 });
  const casillas = Object.fromEntries([1, 2, 3, 4].map((t) => [t, casillas303(facturas, gastos, anio, t)]));
  const r = { P: reducido(P), teso, casillas };
  await redis.set(k, r, { ex: 86400 });
  return r;
}
