import { guardar, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { crearFactura } from '@/lib/facturas';
import { numeroFactura } from '@/lib/calculos';
import { hoy } from '@/lib/formato';
import { baseResto, baseSenal, estadoDe, numeroPresupuesto } from '@/lib/presupuestos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // el envío a Verifactu puede esperar al control de flujo de la AEAT

// tipo «senal»: el % de señal · tipo «resto»: lo que falta (todo, si no hubo señal).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const { id, tipo } = await cuerpo(req);
  const p = id && (await leerUno(u, 'presupuestos', id));
  if (!p) return error('Ese presupuesto ya no existe', 404);
  const estado = estadoDe(p, hoy());
  if (['rechazado', 'facturado'].includes(estado)) return error(estado === 'rechazado' ? 'El cliente lo rechazó' : 'Ya está facturado entero');
  const senal = p.facturas.find((f) => f.tipo === 'senal');
  if (tipo === 'senal' && (!p.senalPct || senal)) return error(senal ? 'La señal ya está facturada' : 'Este presupuesto no lleva señal');
  const base = tipo === 'senal' ? baseSenal(p) : baseResto(p);
  const n = numeroPresupuesto(p);
  const concepto = tipo === 'senal'
    ? `Señal del ${p.senalPct} % según presupuesto ${n}: ${p.concepto}`
    : `${p.concepto}${senal ? ` (descontada la señal de la factura ${senal.numero})` : ''} · Presupuesto ${n}`;
  const datos = { fecha: hoy(), actividad: p.actividad, cliente: p.cliente, concepto: concepto.slice(0, 200), base, ivaPct: p.ivaPct, irpfPct: p.irpfPct, nota: p.nota, cobrada: false, ...(p.evento ? { evento: p.evento } : {}) };
  // Con varios conceptos, la factura del total (o del resto) los lleva todos; la señal ya facturada resta en una línea.
  if (tipo !== 'senal' && p.lineas?.length) {
    datos.lineas = [...p.lineas, ...(senal ? [{ concepto: `Señal ya facturada (factura ${senal.numero})`, cantidad: 1, precio: -senal.base, dto: 0, ivaPct: p.ivaPct }] : [])];
  }
  const { factura: f, error: e } = await crearFactura(u, datos, { extra: { presupuesto: { id: p.id, numero: n } } });
  if (e) return error(e);
  await guardar(u, 'presupuestos', {
    ...p, estado: p.estado === 'pendiente' ? 'aceptado' : p.estado,
    facturas: [...p.facturas, { id: f.id, numero: numeroFactura(f), tipo: tipo === 'senal' ? 'senal' : 'resto', base }],
  });
  return Response.json({ ok: true, factura: f });
}
