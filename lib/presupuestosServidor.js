// Alta de presupuestos (pantalla de presupuestos y Fisquo por WhatsApp).
import { randomBytes } from 'node:crypto';
import { conCerrojo, Ocupado } from './cerrojo.js';
import { leer, guardar, redis } from './redis.js';
import { limpiar, guardarCliente } from './facturas.js';
import { siguienteNumero } from './calculos.js';
import { actividadesDe, fiscalDe, usaIgic } from './empresa.js';

export { Ocupado };

// Cuerpo del formulario → datos del presupuesto (o { error }).
export function datosPresupuesto(u, b) {
  const d = limpiar(b, actividadesDe(u), fiscalDe(u).tipo === 'sociedad', { igic: usaIgic(fiscalDe(u)), presupuesto: true });
  if (d.error) return d;
  delete d.cobrada;
  return { ...d, senalPct: [0, 20, 30, 50].includes(Number(b.senalPct)) ? Number(b.senalPct) : 0, validez: Math.min(90, Math.max(1, Number(b.validez) || 15)) };
}

// El número se lee y se guarda bajo cerrojo de la empresa: dos presupuestos a la vez tomaban el mismo id y el segundo
// pisaba al primero. Lanza Ocupado si tarda demasiado.
export async function crearPresupuesto(u, d) {
  const anio = Number(d.fecha.slice(0, 4));
  return conCerrojo(`presupuestos:${u.empresa || u.id}`, async ({ quedaMs }) => {
    const numero = siguienteNumero(await leer(u, 'presupuestos'), anio, 'P');
    // El enlace público lleva un código imposible de adivinar que apunta a la empresa y al presupuesto.
    const token = randomBytes(18).toString('base64url');
    const p = { id: `P${anio}-${numero}`, numero, anio, serie: 'P', ...d, estado: 'pendiente', token, facturas: [] };
    if (quedaMs() <= 0) throw new Ocupado('La operación ha tardado demasiado: inténtalo de nuevo.');
    await guardar(u, 'presupuestos', p);
    await redis.hset('presupuesto-enlaces', { [token]: { empresa: u.empresa || u.id, id: p.id } });
    await guardarCliente(u, p.cliente);
    return p;
  });
}
