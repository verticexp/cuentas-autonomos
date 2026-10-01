// Presupuestos: se envían con un enlace, el cliente los acepta o rechaza, y se facturan (señal + resto, o de una vez).
import { numeroFactura, r2 } from './calculos.js';

export const numeroPresupuesto = (p) => numeroFactura({ ...p, serie: 'P' });
const masDias = (fecha, dias) => new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 864e5).toISOString().slice(0, 10);
export const caduca = (p) => masDias(p.fecha, p.validez || 15);

// Texto y color (clases de la lista de facturas) de cada estado.
export const ESTADOS = { pendiente: ['Pendiente', 'e-pendiente'], aceptado: ['Aceptado', 'e-cobrada'], facturado: ['Facturado', 'e-cobrada'], rechazado: ['Rechazado', 'e-vencida'], caducado: ['Caducado', 'e-vencida'] };

// pendiente · aceptado · rechazado · caducado · facturado
export function estadoDe(p, hoy) {
  if (p.facturas?.some((f) => f.tipo !== 'senal')) return 'facturado';
  if (p.estado === 'pendiente' && hoy > caduca(p)) return 'caducado';
  return p.estado;
}

// Base de la factura de señal y de la del resto (descontada la señal ya facturada).
export const baseSenal = (p) => r2((p.base * (p.senalPct || 0)) / 100);
export const baseResto = (p) => r2(p.base - (p.facturas || []).filter((f) => f.tipo === 'senal').reduce((s, f) => s + f.base, 0));
