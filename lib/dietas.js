// Kilometraje y dietas como gasto, con lo que la normativa deja exento o deducible. Sin dependencias, para poder probarlo.
// Importes vigentes en 2026 (sin cambios desde julio de 2023):
// · Kilometraje en vehículo propio: 0,26 €/km (art. 9.A.2.a RIRPF, Orden HFP/792/2023). Peajes y aparcamiento, aparte con justificante.
// · Manutención (art. 9.A.3.a RIRPF): sin pernocta 26,67 €/día en España y 48,08 €/día en el extranjero;
//   con pernocta en otro municipio, 53,34 € y 91,35 €. Son los mismos límites para el autónomo (art. 30.2.5ª.c LIRPF),
//   que además debe pagar en restaurantes u hoteles y con tarjeta u otro medio electrónico.
import { leerImporte, r2 } from './calculos.js';

export const KM = 0.26;
export const MANUTENCION = { espana: { sin: 26.67, con: 53.34 }, extranjero: { sin: 48.08, con: 91.35 } };
export const limiteDia = ({ extranjero, pernocta }) => MANUTENCION[extranjero ? 'extranjero' : 'espana'][pernocta ? 'con' : 'sin'];

// d: { tipo: 'km' | 'manutencion', quien: 'empleado' | 'titular', km, dias, pernocta, extranjero, pagado, ivaPct, electronico }
// Devuelve el gasto que se apunta (base, IVA) y el desglose: exento o deducible, y el exceso.
export function calcularDieta(d) {
  const tipo = d.tipo === 'km' ? 'km' : 'manutencion';
  const quien = d.quien === 'titular' ? 'titular' : 'empleado';
  const pagado = d.pagado === '' || d.pagado === undefined || d.pagado === null ? null : r2(leerImporte(d.pagado));
  if (pagado !== null && !(pagado >= 0)) return { error: 'Importe no válido' };
  if (tipo === 'km') {
    if (quien === 'titular') return { error: 'El kilometraje de tu propio coche no es un gasto a tanto por kilómetro: apunta la gasolina, peajes y parking con su factura si el coche está afecto a la actividad.' };
    const km = Math.round((leerImporte(d.km) || 0) * 10) / 10;
    if (!(km > 0) || km > 100000) return { error: 'Escribe los kilómetros' };
    const exento = r2(km * KM);
    const total = pagado ?? exento;
    return { tipo, quien, km, exento, pagado: total, exceso: r2(Math.max(0, total - exento)), base: total, ivaPct: 0 };
  }
  const dias = Math.round(Number(d.dias) || 0);
  if (dias < 1 || dias > 366) return { error: 'Escribe los días' };
  const lim = limiteDia(d);
  const limite = r2(lim * dias);
  if (quien === 'empleado') {
    const total = pagado ?? limite;
    return { tipo, quien, dias, pernocta: Boolean(d.pernocta), extranjero: Boolean(d.extranjero), limiteDia: lim, exento: r2(Math.min(total, limite)), pagado: total, exceso: r2(Math.max(0, total - limite)), base: total, ivaPct: 0 };
  }
  // Titular: el ticket con IVA; se deduce hasta el límite (y su IVA en proporción). Sin pago electrónico, nada.
  if (pagado === null || !pagado) return { error: 'Escribe lo que pagaste' };
  const ivaPct = [21, 10, 4, 0].includes(Number(d.ivaPct)) ? Number(d.ivaPct) : 10;
  const deducible = d.electronico ? r2(Math.min(pagado, limite)) : 0;
  if (!deducible) return { error: 'Solo es deducible si lo pagaste con tarjeta u otro medio electrónico' };
  return { tipo, quien, dias, pernocta: Boolean(d.pernocta), extranjero: Boolean(d.extranjero), limiteDia: lim, pagado, deducible, exceso: r2(pagado - deducible),
    base: r2(deducible / (1 + ivaPct / 100)), ivaPct };
}

export function conceptoDieta(c) {
  if (c.tipo === 'km') return `Kilometraje: ${String(c.km).replace('.', ',')} km`;
  return `${c.quien === 'titular' ? 'Comidas' : 'Dietas'}: ${c.dias} ${c.dias === 1 ? 'día' : 'días'}${c.pernocta ? ' con noche' : ''}${c.extranjero ? ' en el extranjero' : ''}`;
}
