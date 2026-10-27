// Resumen calculado y guardado por versión de los datos (informe de capacidad E06: «proyecciones versionadas»). Mientras
// no cambie ninguna factura ni gasto (contador «rev» de sus totales, que sube en la misma ejecución atómica que cada
// escritura), ni los ajustes, recurrentes, nóminas o saldo que usa, ni el día, el panel se sirve sin leer documentos.
// La clave es de la empresa: nunca se comparte entre empresas. Caduca sola en un día.
import { createHash } from 'node:crypto';
import { redis, leer } from './redis.js';
import { claves } from './fichas.js';
import { asegurar, delosAnios } from './indices.js';
import { datosImpuestos } from './datosImpuestos.js';
import { panelResumen } from './panel.js';
import { prevision } from './tesoreria.js';
import { liquidaciones420 } from './igic.js';
import { casillas303 } from './calculos.js';
import { actividadesDe, fiscalDe, ajustesIva, usaIgic } from './empresa.js';

// Sube la versión de la clave (panel:vN) cada vez que cambie lo que calcula panelResumen: si no, se sirve el de antes un día.
const empresa = (u) => u.empresa || u.id;
const huella = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 24);

// Lo que la pantalla necesita del panel, sin los documentos (las vencidas: cuántas, de cuántos clientes y los primeros
// nombres, sin repetir: un cliente con varias vencidas sale una vez).
export function reducido(P) {
  const clientes = [...new Set(P.vencidas.map((f) => String(f.cliente?.nombre || '').trim()).filter(Boolean))];
  // Lo mismo con los pagos vencidos a proveedores (lib/pagos.js).
  const proveedores = [...new Set((P.pagosVencidos || []).map((g) => String(g.proveedor || g.concepto || '').trim()).filter(Boolean))];
  return { ...P, sinCobrar: { length: P.sinCobrar.length }, vencidas: { length: P.vencidas.length, clientes: clientes.length, nombres: clientes.slice(0, 3) },
    sinPagar: { length: (P.sinPagar || []).length }, pagosVencidos: { length: (P.pagosVencidos || []).length, proveedores: proveedores.length, nombres: proveedores.slice(0, 3) } };
}

export async function panelDe(u, { anio, hoy, recurrentes = [], nominas = [], saldo = null }) {
  await Promise.all([asegurar(u, 'facturas'), asegurar(u, 'gastos')]);
  const [rf, rg] = await Promise.all(['facturas', 'gastos'].map((c) => redis.hget(claves(c, empresa(u)).ixa, 'rev')));
  const actividades = actividadesDe(u), fiscal = fiscalDe(u);
  const empleados = (await leer(u, 'empleados')) || [];
  const capital = (await leer(u, 'capital')) || [];
  const ajustes = { pagos130: u.pagos130, pres303: u.pres303, pres111: u.pres111, pres115: u.pres115, pres123: u.pres123, pres216: u.pres216, pres369: u.pres369, pagos131: u.pagos131, modulos: u.modulos, prorrata: u.prorrata, saldoIva: u.saldoIva, rend130: u.rend130, emisor: u.emisor, cuotaIS: u.cuotaIS, pagos202: u.pagos202, actividades, fiscal };
  const k = `panel:v15:${empresa(u)}:${anio}:${hoy}:${rf || 0}:${rg || 0}:${huella([ajustes, recurrentes, nominas, empleados, saldo, capital])}`;
  const guardado = await redis.get(k);
  if (guardado) return guardado;
  const anioActual = Number(hoy.slice(0, 4));
  const { facturas, gastos } = usaIgic(fiscal) ? await Promise.all([leer(u, 'facturas'), leer(u, 'gastos')]).then(([facturas, gastos]) => ({ facturas: facturas || [], gastos: gastos || [] })) : await delosAnios(u, [...Array.from({ length: 5 }, (_, i) => anio - i), ...Array.from({ length: 5 }, (_, i) => anioActual - i)], { pendientes: true });
  // Los impuestos, con los mismos datos que la página Impuestos (el año pedido, el actual y el del plazo de enero).
  const anios = [...new Set([anio, anioActual, anioActual - 1])];
  const impuestos = Object.fromEntries(await Promise.all(anios.map(async (y) => [y, await datosImpuestos(u, y)])));
  const P = panelResumen({ facturas, gastos, pagos130: u.pagos130, pres303: u.pres303, prorrata: u.prorrata || {}, saldoIva: u.saldoIva || null, rend130: u.rend130, emisor: u.emisor, anio, hoy, actividades, fiscal, impuestos });
  const teso = P.esteAnio && prevision({ facturas, gastos, recurrentes, nominas, empleados, fiscal, pagos130: u.pagos130 || {}, pres303: u.pres303 || {}, pres111: u.pres111 || {}, pres115: u.pres115 || {}, pres123: u.pres123 || {}, pres216: u.pres216 || {}, pres369: u.pres369 || {}, capital, pagos131: u.pagos131 || {}, modulos: u.modulos || {}, prorrata: u.prorrata || {}, rend130: u.rend130 || {}, cuotaIS: u.cuotaIS || {}, pagos202: u.pagos202 || {}, plazo: u.emisor?.plazo, saldo, actividades: actividades.map((a) => a.id), hoy, meses: 3 });
  const l420 = usaIgic(fiscal) && liquidaciones420(impuestos[anio].facturas, impuestos[anio].gastos, anio, ajustesIva(u));
  const casillas = Object.fromEntries([1, 2, 3, 4].map((t) => [t, l420 ? l420[t - 1] : casillas303(impuestos[anio].facturas, impuestos[anio].gastos, anio, t, ajustesIva(u))]));
  // Días de los cierres de caja de los dos últimos meses (lib/caja.js diasSinCerrar): para avisar de los que faltan.
  const desdeCaja = new Date(Date.parse(`${hoy}T12:00:00Z`) - 62 * 864e5).toISOString().slice(0, 10);
  const cierres = [...new Set(facturas.filter((f) => f.caja && f.fecha >= desdeCaja && f.fecha <= hoy).map((f) => f.fecha))].sort();
  const r = { P: reducido(P), teso, casillas, cierres };
  await redis.set(k, r, { ex: 86400 });
  return r;
}
