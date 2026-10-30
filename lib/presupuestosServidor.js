// Alta de presupuestos (pantalla de presupuestos y Fisquo por WhatsApp).
import { randomBytes } from 'node:crypto';
import { conCerrojo, Ocupado } from './cerrojo.js';
import { leer, leerUno, guardar, redis } from './redis.js';
import { crearFactura, limpiar, guardarCliente } from './facturas.js';
import { numeroFactura, siguienteNumero } from './calculos.js';
import { hoy } from './formato.js';
import { baseResto, baseSenal, estadoDe, numeroPresupuesto } from './presupuestos.js';
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

// Datos de la factura de un presupuesto. tipo «senal»: el % de señal · «resto»: lo que falta (todo, si no hubo señal).
// { error } si no se puede facturar.
export function facturaDePresupuesto(p, tipo, dia = hoy()) {
  const estado = estadoDe(p, dia);
  if (['rechazado', 'facturado'].includes(estado)) return { error: estado === 'rechazado' ? 'El cliente lo rechazó' : 'Ya está facturado entero' };
  const senal = p.facturas.find((f) => f.tipo === 'senal');
  if (tipo === 'senal' && (!p.senalPct || senal)) return { error: senal ? 'La señal ya está facturada' : 'Este presupuesto no lleva señal' };
  const base = tipo === 'senal' ? baseSenal(p) : baseResto(p);
  const n = numeroPresupuesto(p);
  const concepto = tipo === 'senal'
    ? `Señal del ${p.senalPct} % según presupuesto ${n}: ${p.concepto}`
    : `${p.concepto}${senal ? ` (descontada la señal de la factura ${senal.numero})` : ''} · Presupuesto ${n}`;
  const datos = { ...(p.impuesto === 'igic' ? { impuesto: 'igic' } : {}), fecha: dia, actividad: p.actividad, cliente: p.cliente, concepto: concepto.slice(0, 200), base, ivaPct: p.ivaPct, irpfPct: p.irpfPct, nota: p.nota, cobrada: false, ...(p.evento ? { evento: p.evento } : {}) };
  // Con varios conceptos, la factura del total (o del resto) los lleva todos; la señal ya facturada resta en una línea.
  if (tipo !== 'senal' && p.lineas?.length) {
    datos.lineas = [...p.lineas, ...(senal ? [{ concepto: `Señal ya facturada (factura ${senal.numero})`, cantidad: 1, precio: -senal.base, dto: 0, ivaPct: p.ivaPct }] : [])];
  }
  return { datos, base };
}

// Factura el presupuesto y lo deja enlazado. Todo bajo el cerrojo del presupuesto (el mismo que responderlo, editarlo o
// borrarlo): señal y resto a la vez leían la versión sin señal y se facturaba de más (30 + 100 de un presupuesto de 100).
// → { factura } o { error, status }. Lanza Ocupado si tarda demasiado.
export async function facturarPresupuesto(u, id, tipo, opciones = {}) {
  return conCerrojo(`presupuesto:${u.empresa || u.id}:${id}`, async ({ quedaMs }) => {
    const p = await leerUno(u, 'presupuestos', id);
    if (!p) return { error: 'Ese presupuesto ya no existe', status: 404 };
    const r = facturaDePresupuesto(p, tipo);
    if (r.error) return r;
    // Idempotente: un doble clic o un reintento tras un corte devuelve la misma factura, no otra.
    const { factura: f, error: e } = await crearFactura(u, r.datos, { ...opciones, extra: { presupuesto: { id: p.id, numero: numeroPresupuesto(p) } }, idem: `pres:${p.id}:${tipo === 'senal' ? 'senal' : 'resto'}` });
    if (e) return { error: e };
    if (p.facturas.some((x) => x.id === f.id)) return { factura: f };
    if (quedaMs() <= 0) throw new Ocupado('La factura está hecha, pero el presupuesto no se ha podido actualizar: vuelve a pulsar y quedará enlazada.');
    await guardar(u, 'presupuestos', {
      ...p, estado: p.estado === 'pendiente' ? 'aceptado' : p.estado,
      facturas: [...p.facturas, { id: f.id, numero: numeroFactura(f), tipo: tipo === 'senal' ? 'senal' : 'resto', base: r.base }],
    });
    return { factura: f };
  }, { caduca: 70000, espera: 25000 });
}
