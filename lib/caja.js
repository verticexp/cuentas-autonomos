// Cierre de caja (ventas del día): para tiendas con TPV o caja registradora, o negocios que no ponen los productos en la
// factura. Se guarda como una factura simplificada de resumen (serie Z): el total cobrado por tipo de IVA, repartido en
// efectivo, tarjeta y otros, y si se quiere las unidades vendidas de cada producto (restan stock en lib/inventario.js).
// Los tiques los emite el TPV (que es el sistema de facturación): el cierre es el «asiento resumen» del libro registro
// (art. 63.4 del Reglamento del IVA), así que no se registra en Verifactu. Sin dependencias de servidor, para poder probarlo.
import { TIPOS_IGIC } from './igic.js';
import { r2 } from './calculos.js';
import { eur } from './formato.js';
import { fechaReal, importeEscrito } from './validacion.js';
import { limpiarProyecto } from './proyectos.js';

export const SERIE_CAJA = 'Z';
// Si una actividad ya usaba la Z para sus facturas (antes de los cierres de caja), los cierres van en la ZC.
export const serieCaja = (actividades = []) => (actividades.some((a) => a.serie === SERIE_CAJA) ? 'ZC' : SERIE_CAJA);
export const esCierre = (f) => Boolean(f?.caja);
const TIPOS = [21, 10, 5, 4, 2, 0];

// Base sin IVA de un total con IVA, ajustada al céntimo para que base + cuota dé el total (a veces no hay ninguna base
// exacta, como 100 € al 21 %: queda a un céntimo, el redondeo de sumar el IVA de cada tique).
export function baseDeTotal(total, pct) {
  const b = r2(total / (1 + pct / 100));
  for (const x of [b, r2(b + 0.01), r2(b - 0.01), r2(b + 0.02), r2(b - 0.02)]) if (r2(x + r2((x * pct) / 100)) === r2(total)) return x;
  return b;
}

const num = (v) => r2(importeEscrito(v, 0));
const importeInvalido = () => ({ error: 'Escribe importes finitos válidos en el cierre', status: 400 });
const txt = (v, n) => String(v ?? '').trim().slice(0, n);

// b: { fecha, actividad, porIva: [{ pct, total }], efectivo, tarjeta, otros, unidades: [{ producto, cantidad, importe? }],
//      desde, hasta (números de tique del TPV), nota, importado }. productos: el catálogo (para validar y valorar las unidades).
export function limpiarCierre(b = {}, productos = [], { igic = false } = {}) {
  if (!fechaReal(b.fecha)) return { error: 'Escribe una fecha que exista (AAAA-MM-DD)', status: 400 };
  const porIva = new Map();
  for (const x of Array.isArray(b.porIva) ? b.porIva.slice(0, 10) : []) {
    const pct = Number(x?.pct);
    const t = num(x?.total);
    if (!Number.isFinite(pct) || !Number.isFinite(t)) return importeInvalido();
    if (!(igic ? TIPOS_IGIC : TIPOS).includes(pct) || !t) continue;
    porIva.set(pct, r2((porIva.get(pct) || 0) + t));
  }
  const total = r2([...porIva.values()].reduce((s, t) => s + t, 0));
  if (!Number.isFinite(total)) return importeInvalido();
  if (!total) return { error: `Pon lo vendido en el día (con ${igic ? 'IGIC' : 'IVA'})` };
  // Cobro: si no se dice, lo que falta hasta el total va a tarjeta.
  const efectivo = num(b.efectivo), otros = num(b.otros);
  const tarjeta = b.tarjeta === undefined || b.tarjeta === '' ? r2(total - efectivo - otros) : num(b.tarjeta);
  if (![efectivo, otros, tarjeta, r2(efectivo + tarjeta + otros)].every(Number.isFinite)) return importeInvalido();
  if (Math.abs(r2(efectivo + tarjeta + otros) - total) > 0.009) return { error: `Efectivo, tarjeta y otros suman ${eur(r2(efectivo + tarjeta + otros))} y lo vendido ${eur(total)}: tienen que cuadrar` };
  const lineas = [...porIva].sort((a, b2) => Math.abs(b2[1]) - Math.abs(a[1]))
    .map(([pct, t]) => ({ concepto: `Ventas del día al ${pct} %`, cantidad: 1, precio: baseDeTotal(t, pct), dto: 0, ivaPct: pct }));
  const base = r2(lineas.reduce((s, l) => s + l.precio, 0));
  if (!Number.isFinite(base) || lineas.some((l) => !Number.isFinite(l.precio))) return importeInvalido();
  // Cuota real por tipo = lo cobrado − la base. Solo se guarda donde difiere de base × tipo (el redondeo de los tiques):
  // así el total del documento es exactamente lo cobrado y no sobra ni falta un céntimo que acabe en el banco.
  const cuotas = Object.fromEntries(lineas.map((l) => [l.ivaPct, r2(porIva.get(l.ivaPct) - l.precio)]).filter(([pct, c]) => c !== r2((lineas.find((l) => l.ivaPct === Number(pct)).precio * Number(pct)) / 100)));
  // Unidades vendidas (opcional): solo productos del catálogo. Sin importe, se valoran a su precio de venta sin IVA.
  const P = new Map(productos.map((p) => [p.id, p]));
  const U = new Map();
  for (const x of Array.isArray(b.unidades) ? b.unidades.slice(0, 500) : []) {
    const p = P.get(x?.producto);
    const cantidad = Math.round(importeEscrito(x?.cantidad, 0) * 1000) / 1000;
    if (!Number.isFinite(cantidad)) return importeInvalido();
    if (!p || !cantidad) continue;
    const importe = x.importe !== undefined && x.importe !== '' ? num(x.importe) : r2(cantidad * (Number(p.precio) || 0));
    if (!Number.isFinite(importe)) return importeInvalido();
    const o = U.get(p.id) || { producto: p.id, cantidad: 0, importe: 0 };
    U.set(p.id, { ...o, cantidad: Math.round((o.cantidad + cantidad) * 1000) / 1000, importe: r2(o.importe + importe) });
  }
  if ([...U.values()].some((x) => !Number.isFinite(x.cantidad) || !Number.isFinite(x.importe))) return importeInvalido();
  const unidades = [...U.values()].filter((x) => x.cantidad);
  const desde = txt(b.desde, 20), hasta = txt(b.hasta, 20);
  return {
    fecha: b.fecha,
    actividad: b.actividad,
    cliente: { nombre: 'Ventas del día', nif: '', direccion: '', ciudad: '' },
    concepto: `Cierre de caja${desde ? ` · tiques ${desde}${hasta ? `–${hasta}` : ''}` : ''}`,
    base,
    ...(igic ? { impuesto: 'igic' } : {}),
    ivaPct: lineas[0].ivaPct,
    lineas,
    irpfPct: 0,
    nota: txt(b.nota, 300),
    cobrada: true,
    simplificada: true,
    caja: { efectivo, tarjeta: r2(tarjeta), otros, ...(Object.keys(cuotas).length ? { cuotas } : {}) },
    ...(unidades.length ? { unidades } : {}),
    ...(desde ? { resumen: { desde, ...(hasta ? { hasta } : {}) } } : {}),
    ...(b.importado ? { importado: txt(b.importado, 20) } : {}),
    // El local o centro (lib/proyectos.js): para ver la rentabilidad de cada tienda.
    ...(limpiarProyecto(b.proyecto) ? { proyecto: limpiarProyecto(b.proyecto) } : {}),
  };
}

// Total cobrado de un cierre (con IVA).
export const totalCierre = (f) => r2((f.caja?.efectivo || 0) + (f.caja?.tarjeta || 0) + (f.caja?.otros || 0));
