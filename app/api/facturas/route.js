import { leer, guardar, borrar, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { subirFactura } from '@/lib/drive';
import { enviarNomina } from '@/lib/controlat';
import { ACTIVIDADES, leerImporte, numeroFactura, r2, serieDe, siguienteNumero } from '@/lib/calculos';

export const dynamic = 'force-dynamic';

function limpiar(b) {
  const base = r2(leerImporte(b.base));
  if (!base) return { error: 'Importe no válido' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) return { error: 'Fecha no válida' };
  const c = b.cliente || {};
  if (!String(c.nombre || '').trim()) return { error: 'Falta el cliente' };
  const txt = (v, n = 120) => String(v || '').trim().slice(0, n);
  return {
    fecha: b.fecha,
    actividad: ACTIVIDADES[b.actividad] ? b.actividad : 'dj',
    cliente: { nombre: txt(c.nombre), nif: txt(c.nif, 20), direccion: txt(c.direccion), ciudad: txt(c.ciudad) },
    concepto: txt(b.concepto, 200),
    base,
    ivaPct: Math.min(100, Math.max(0, Number(b.ivaPct) || 0)),
    irpfPct: Math.min(100, Math.max(0, Number(b.irpfPct) || 0)),
    nota: txt(b.nota, 300),
    cobrada: Boolean(b.cobrada),
  };
}

const guardarCliente = (u, c) => guardar(u, 'clientes', { id: c.nombre.toUpperCase(), ...c });

export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const b = await cuerpo(req);
  const datos = limpiar(b);
  if (datos.error) return error(datos.error);
  const original = b.rectifica && (await leerUno(u, 'facturas', b.rectifica));
  if (b.rectifica && !original) return error('La factura a rectificar no existe');
  const serie = original ? 'R' : serieDe(datos.actividad);
  const anio = Number(datos.fecha.slice(0, 4));
  const numero = siguienteNumero(await leer(u, 'facturas'), anio, serie);
  const f = { id: `${serie}${anio}-${numero}`, numero, anio, ...datos };
  if (serie) f.serie = serie;
  if (original) f.rectifica = { id: original.id, numero: numeroFactura(original), fecha: original.fecha };
  await guardar(u, 'facturas', f);
  await guardarCliente(u, f.cliente);
  await Promise.all([subirFactura(u, f), enviarNomina(u, [f.fecha])]);
  return Response.json({ ok: true, factura: f });
}

// El número y el año no cambian al editar: la numeración debe ser correlativa.
export async function PATCH(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const b = await cuerpo(req);
  const antes = b.id && (await leerUno(u, 'facturas', b.id));
  if (!antes) return error('Esa factura ya no existe', 404);
  if (Object.keys(b).length === 2 && 'cobrada' in b) {
    const f = { ...antes, cobrada: Boolean(b.cobrada) };
    await guardar(u, 'facturas', f);
    await subirFactura(u, f);
    return Response.json({ ok: true });
  }
  const datos = limpiar(b);
  if (datos.error) return error(datos.error);
  if (Number(datos.fecha.slice(0, 4)) !== antes.anio) return error(`La fecha debe ser de ${antes.anio}`);
  await guardar(u, 'facturas', { ...antes, ...datos });
  await guardarCliente(u, datos.cliente);
  await Promise.all([subirFactura(u, { ...antes, ...datos }), enviarNomina(u, [antes.fecha, datos.fecha])]);
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  const antes = await leerUno(u, 'facturas', id);
  await borrar(u, 'facturas', id);
  if (antes) await enviarNomina(u, [antes.fecha]);
  return Response.json({ ok: true });
}
