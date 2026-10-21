// Alta de presupuestos (pantalla de presupuestos y Fisquo por WhatsApp).
import { randomBytes } from 'node:crypto';
import { leer, guardar, redis } from './redis.js';
import { limpiar, guardarCliente } from './facturas.js';
import { siguienteNumero } from './calculos.js';
import { actividadesDe, fiscalDe } from './empresa.js';

// Cuerpo del formulario → datos del presupuesto (o { error }).
export function datosPresupuesto(u, b) {
  const d = limpiar(b, actividadesDe(u), fiscalDe(u).tipo === 'sociedad');
  if (d.error) return d;
  delete d.cobrada;
  return { ...d, senalPct: [0, 20, 30, 50].includes(Number(b.senalPct)) ? Number(b.senalPct) : 0, validez: Math.min(90, Math.max(1, Number(b.validez) || 15)) };
}

export async function crearPresupuesto(u, d) {
  const anio = Number(d.fecha.slice(0, 4));
  const numero = siguienteNumero(await leer(u, 'presupuestos'), anio, 'P');
  // El enlace público lleva un código imposible de adivinar que apunta a la empresa y al presupuesto.
  const token = randomBytes(18).toString('base64url');
  const p = { id: `P${anio}-${numero}`, numero, anio, serie: 'P', ...d, estado: 'pendiente', token, facturas: [] };
  await guardar(u, 'presupuestos', p);
  await redis.hset('presupuesto-enlaces', { [token]: { empresa: u.empresa || u.id, id: p.id } });
  await guardarCliente(u, p.cliente);
  return p;
}
