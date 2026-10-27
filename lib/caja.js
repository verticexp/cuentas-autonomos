// Cierre de caja (ventas del día): para tiendas con TPV o caja registradora, o negocios que no ponen los productos en la
// factura. Se guarda como una factura simplificada de resumen (serie Z): el total cobrado por tipo de IVA, repartido en
// efectivo, tarjeta y otros, y si se quiere las unidades vendidas de cada producto (restan stock en lib/inventario.js).
// Los tiques los emite el TPV (que es el sistema de facturación): el cierre es el «asiento resumen» del libro registro
// (art. 63.4 del Reglamento del IVA), así que no se registra en Verifactu. Sin dependencias de servidor, para poder probarlo.
import { TIPOS_IGIC } from './igic.js';
import { r2 } from './calculos.js';
import { eur, fechaTexto } from './formato.js';
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
  const arqueo = limpiarArqueo(b.arqueo);
  if (arqueo?.error) return arqueo;
  const salido = r2((arqueo?.salidas || []).reduce((s, x) => s + x.importe, 0));
  if (arqueo && salido > r2(arqueo.fondo + efectivo) + 0.009) return { error: `Del cajón salen ${eur(salido)} y solo había ${eur(r2(arqueo.fondo + efectivo))} (fondo más efectivo cobrado)`, status: 400 };
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
    caja: { efectivo, tarjeta: r2(tarjeta), otros, ...(Object.keys(cuotas).length ? { cuotas } : {}), ...(arqueo ? { arqueo } : {}) },
    ...(unidades.length ? { unidades } : {}),
    ...(desde ? { resumen: { desde, ...(hasta ? { hasta } : {}) } } : {}),
    ...(b.importado ? { importado: txt(b.importado, 20) } : {}),
    // El local o centro (lib/proyectos.js): para ver la rentabilidad de cada tienda.
    ...(limpiarProyecto(b.proyecto) ? { proyecto: limpiarProyecto(b.proyecto) } : {}),
  };
}

// Arqueo (opcional): el fondo con el que se abrió el cajón, lo que salió de él en el día (ingresos en el banco, pagos en
// efectivo, retiradas del titular) y el efectivo contado al cerrar. Lo que debería haber = fondo + efectivo cobrado −
// salidas; la diferencia con lo contado es el descuadre (en contabilidad, 678 si falta y 778 si sobra; lib/asientos.js).
export const SALIDAS_CAJA = { banco: 'Ingreso en el banco', gasto: 'Pago en efectivo', retirada: 'Retirada del titular' };
function limpiarArqueo(a) {
  if (!a || typeof a !== 'object') return null;
  const vacio = (v) => v === undefined || v === null || String(v).trim() === '';
  if (vacio(a.contado)) return null; // sin contar el cajón no hay arqueo
  const fondo = num(a.fondo), contado = num(a.contado);
  if (![fondo, contado].every(Number.isFinite)) return importeInvalido();
  if (fondo < 0 || contado < 0) return { error: 'El fondo y el efectivo contado no pueden ser negativos', status: 400 };
  const salidas = [];
  for (const x of Array.isArray(a.salidas) ? a.salidas.slice(0, 20) : []) {
    const importe = num(x?.importe);
    if (!Number.isFinite(importe)) return importeInvalido();
    if (!(importe > 0)) continue;
    salidas.push({ tipo: SALIDAS_CAJA[x?.tipo] ? x.tipo : 'gasto', importe, ...(txt(x?.concepto, 80) ? { concepto: txt(x.concepto, 80) } : {}) });
  }
  return { fondo, contado, ...(salidas.length ? { salidas } : {}) };
}

// Cuentas del arqueo de un cierre: lo que debería haber en el cajón, lo contado y el descuadre (positivo: sobra).
export function cuentasArqueo(f) {
  const a = f?.caja?.arqueo;
  if (!a) return null;
  const salidas = r2((a.salidas || []).reduce((s, x) => s + x.importe, 0));
  const esperado = r2(a.fondo + (f.caja.efectivo || 0) - salidas);
  return { fondo: a.fondo, efectivo: f.caja.efectivo || 0, salidas, esperado, contado: a.contado, descuadre: r2(a.contado - esperado) };
}

// Fondo con el que se abre la caja hoy: lo contado en el último arqueo anterior (si se hizo).
export function fondoInicial(cierres = [], fecha) {
  const previo = cierres.filter((f) => f?.caja?.arqueo && f.fecha < fecha).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  return previo ? previo.caja.arqueo.contado : null;
}

// Días sin cierre de caja (para el aviso de «Qué hacer hoy» y el calendario de Caja). fechas: las de los cierres;
// cerrados: los días marcados como «no abrí». Solo cuenta si hay algún cierre en los últimos 30 días, y solo los días de la
// semana en que el negocio suele abrir (los que tienen cierres en las últimas 8 semanas). Sin domingos ni festivos nacionales salvo que se abra esos días. Desde el primer cierre, como mucho
// `dias` atrás, hasta ayer (hoy aún no ha cerrado).
export function diasSinCerrar(fechas = [], hoy, { cerrados = [], dias = 14, festivo = () => false } = {}) {
  const mas = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const dow = (f) => new Date(`${f}T12:00:00Z`).getUTCDay();
  const hay = new Set(fechas);
  const lista = [...hay].filter((f) => f <= hoy).sort();
  if (!lista.length || lista.at(-1) < mas(hoy, -30)) return [];
  const desde8 = mas(hoy, -56);
  const recientes = lista.filter((f) => f >= desde8);
  const cuenta = [0, 0, 0, 0, 0, 0, 0];
  for (const f of recientes) cuenta[dow(f)]++;
  // Un día de la semana se abre si tiene cierre en al menos el 30 % de las semanas desde el primer cierre reciente (con una
  // semana de historial basta uno): así un negocio nuevo solo recibe avisos de los días en que ya ha cerrado alguna vez.
  const semanas = Math.min(8, Math.max(1, Math.ceil((Date.parse(hoy) - Date.parse(recientes[0])) / (7 * 864e5))));
  const abre = cuenta.map((n) => n >= Math.max(1, Math.ceil(semanas * 0.3)));
  const abreFestivos = recientes.some((f) => festivo(f));
  const no = new Set(cerrados);
  const fuera = [];
  const inicio = lista[0] > mas(hoy, -dias) ? lista[0] : mas(hoy, -dias);
  for (let f = inicio; f < hoy; f = mas(f, 1)) {
    if (hay.has(f) || no.has(f) || !abre[dow(f)] || (!abreFestivos && festivo(f))) continue;
    fuera.push(f);
  }
  return fuera;
}

// Liquidaciones de la tarjeta: el banco ingresa lo cobrado con tarjeta de uno o varios días seguidos, normalmente al día
// siguiente y menos la comisión del TPV. Un ingreso pendiente casa con los cierres sin liquidar de los 7 días anteriores
// cuya tarjeta suma algo entre el ingreso y el ingreso más un 4 % (la diferencia es la comisión). Sin un concepto de TPV
// solo se propone si cuadra al céntimo. Nada se guarda solo: se propone y se confirma (lib/bancoServidor.js liquidarTarjeta).
export const TPV = /\b(tpv|datafono|dat[aá]fono|liquid|tarjeta|tarj\b|card|sumup|square|redsys|comercia|getnet|global ?payments|paycomet|adyen|viva ?wallet|izettle|zettle|abono comercio|remesa (de )?tarjetas?|op\.? ?tpv)/i;
export const COMISION_MAX = 0.04;
// A mano (el usuario elige el ingreso y los cierres) se admite más: TPV caros, cuotas del terminal descontadas…
export const COMISION_MAX_MANUAL = 0.1;
// Sin liquidar: ni cuadrada aquí ni enlazada desde Banco como liquidación de lo cobrado (cobro.liquidado, lib/banco.js).
const tarjetaLibre = (f) => f?.caja && (f.caja.tarjeta || 0) > 0 && !f.caja.liquidacion && !f.rectifica && !f.cobro?.liquidado && !(f.pagos || []).some((p) => p.liquidado);
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
export function comisionValida(tarjeta, importe, max = COMISION_MAX) {
  const comision = r2(tarjeta - importe);
  return comision >= 0 && comision <= r2(tarjeta * max) + 0.01 ? comision : null;
}
export function propuestasTarjeta(movimientos = [], cierres = []) {
  const libres = cierres.filter(tarjetaLibre).sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.id).localeCompare(String(b.id)));
  const usados = new Set();
  const out = [];
  const pendientes = movimientos.filter((m) => (!m.estado || m.estado === 'pendiente') && m.importe > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const m of pendientes) {
    const tpv = TPV.test(`${m.concepto || ''} ${m.contraparte || ''}`);
    const cand = libres.filter((f) => !usados.has(f.id) && f.fecha <= m.fecha && diasEntre(f.fecha, m.fecha) <= 7);
    let mejor = null;
    for (let i = 0; i < cand.length; i++) {
      let suma = 0;
      for (let j = i; j < cand.length && j - i < 7; j++) {
        suma = r2(suma + cand[j].caja.tarjeta);
        const comision = comisionValida(suma, m.importe);
        if (comision === null || (!tpv && comision)) continue;
        // La más reciente (la liquidación llega justo después) y, a igualdad, la de menos comisión.
        const p = { mov: m.id, fecha: m.fecha, importe: r2(m.importe), concepto: m.concepto || '', cierres: cand.slice(i, j + 1).map((f) => f.id), dias: cand.slice(i, j + 1).map((f) => f.fecha), tarjeta: suma, comision, tpv };
        if (!mejor || cand[j].fecha > mejor.dias.at(-1) || (cand[j].fecha === mejor.dias.at(-1) && comision < mejor.comision)) mejor = p;
      }
    }
    if (mejor) { out.push(mejor); for (const id of mejor.cierres) usados.add(id); }
  }
  return out;
}
// Cierres con tarjeta que el banco aún no ha ingresado (o que no se han cuadrado), de más de `dias` días.
export const tarjetaPorCuadrar = (cierres = []) => cierres.filter(tarjetaLibre).sort((a, b) => b.fecha.localeCompare(a.fecha));
export const tarjetaSinLiquidar = (cierres = [], hoy, dias = 3) => cierres.filter((f) => tarjetaLibre(f) && diasEntre(f.fecha, hoy) > dias)
  .sort((a, b) => b.fecha.localeCompare(a.fecha));

// «22 de octubre», «23 al 24 de octubre», «30 de septiembre al 2 de octubre» y, con días sueltos (cuadre a mano),
// «20 y 22 de octubre» o «20, 22 y 25 de octubre».
const seguidos = (dias) => dias.every((d, i) => !i || Date.parse(`${d}T12:00:00Z`) - Date.parse(`${dias[i - 1]}T12:00:00Z`) === 864e5);
export const listaDias = (dias) => {
  if (dias.length === 1) return fechaTexto(dias[0]);
  const mismoMes = dias[0].slice(0, 7) === dias.at(-1).slice(0, 7);
  const corto = (d) => (mismoMes ? Number(d.slice(8)) : fechaTexto(d));
  if (seguidos(dias)) return `${corto(dias[0])} al ${fechaTexto(dias.at(-1))}`;
  return `${dias.slice(0, -1).map(corto).join(', ')} y ${fechaTexto(dias.at(-1))}`;
};

// Saldo de caja: cada día con arqueo, lo que debería haber, lo contado y el descuadre; y el acumulado de descuadres.
export function saldoCaja(cierres = []) {
  const dias = cierres.filter((f) => f?.caja?.arqueo && !f.rectifica).sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.id).localeCompare(String(b.id)))
    .map((f) => ({ id: f.id, fecha: f.fecha, ...cuentasArqueo(f) }));
  let acumulado = 0;
  for (const d of dias) { acumulado = r2(acumulado + d.descuadre); d.acumulado = acumulado; }
  const ultimo = dias.at(-1) || null;
  return { dias, ultimo, descuadres: acumulado, faltante: r2(dias.reduce((s, d) => s + Math.min(0, d.descuadre), 0)), sobrante: r2(dias.reduce((s, d) => s + Math.max(0, d.descuadre), 0)) };
}

// Total cobrado de un cierre (con IVA).
export const totalCierre = (f) => r2((f.caja?.efectivo || 0) + (f.caja?.tarjeta || 0) + (f.caja?.otros || 0));
