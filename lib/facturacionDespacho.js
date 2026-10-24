// Facturación del despacho (app/despacho/facturacion): lo que su propia empresa en Fisquo les factura a sus clientes,
// emparejado por NIF (o por nombre si la factura no lo lleva), con lo pendiente, lo vencido y lo que le cuesta Fisquo.
import { importes } from './calculos.js';

const nifNormal = (v) => String(v || '').toUpperCase().replace(/[\s-]/g, '').replace(/^ES/, '');
const nombreNormal = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
const centimos = (v) => Math.round(v * 100);
const masDias = (fecha, dias) => new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 864e5).toISOString().slice(0, 10);

// Las licencias ya vienen valoradas en clientes[].licencia.cent. El coste anual es una proyección del mes actual.
export function facturacionPorCliente({ clientes = [], facturas = [], hoy, licencias }) {
  const filas = clientes.map((c) => ({ ...c, facturado12m: 0, facturas: 0, ultima: null, pendiente: 0, vencido: 0,
    costeFisquo12m: c.licencia ? c.licencia.cent * 12 : 0, margen12m: 0, sinFacturar3m: true }));
  const porNif = new Map();
  const porNombre = new Map();
  // Las identidades ambiguas se dejan sin emparejar para no atribuir ingresos a otro cliente.
  for (const fila of filas) {
    for (const [mapa, clave] of [[porNif, nifNormal(fila.nif)], [porNombre, nombreNormal(fila.nombre)]]) {
      if (clave) mapa.set(clave, mapa.has(clave) ? null : fila);
    }
  }
  const sinEmparejar = { numero: 0, total: 0 };
  const limite = masDias(hoy, -90);
  for (const f of facturas) {
    // Las facturas de la app llevan el cliente dentro (f.cliente = { nombre, nif }); también vale plano.
    const nif = nifNormal(f.cliente?.nif ?? f.nif);
    const fila = nif ? porNif.get(nif) : porNombre.get(nombreNormal(f.cliente?.nombre ?? f.cliente));
    const total = centimos(importes(f).total);
    if (!fila) { sinEmparejar.numero++; sinEmparejar.total += total; continue; }
    fila.facturado12m += total;
    fila.facturas++;
    if (!fila.ultima || f.fecha > fila.ultima) fila.ultima = f.fecha;
    if (f.fecha >= limite && f.fecha <= hoy) fila.sinFacturar3m = false;
    if (!f.cobrada) {
      fila.pendiente += total;
      if ((f.vence || masDias(f.fecha, 30)) < hoy) fila.vencido += total;
    }
    // Margen sin IVA ni efecto de las retenciones: bases con su signo menos el coste anual de Fisquo.
    fila.margen12m += centimos(Number(f.base) || 0);
  }
  const totales = { facturado12m: 0, pendiente: 0, vencido: 0, costeFisquo12m: 0 };
  for (const fila of filas) {
    fila.margen12m -= fila.costeFisquo12m;
    for (const campo of Object.keys(totales)) totales[campo] += fila[campo];
    for (const campo of [...Object.keys(totales), 'margen12m']) fila[campo] /= 100;
  }
  for (const campo of Object.keys(totales)) totales[campo] /= 100;
  sinEmparejar.total /= 100;
  filas.sort((a, b) => Number(b.vencido > 0) - Number(a.vencido > 0) || b.facturado12m - a.facturado12m || a.nombre.localeCompare(b.nombre, 'es'));
  return { filas, totales, sinEmparejar };
}
