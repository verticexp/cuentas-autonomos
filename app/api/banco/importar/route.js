import { guardar, leer } from '@/lib/redis';
import { error, usuarioApi } from '@/lib/api';
import { puede } from '@/lib/permisos';
import { leerHoja } from '@/lib/hoja';
import { esNorma43, leerNorma43, leerTablaBanco } from '@/lib/banco';
import { actualizarSaldo, guardarMovimientos } from '@/lib/bancoServidor';
import { hoy } from '@/lib/formato';
import { MUCHOS, pasado } from '@/lib/limite';

export const dynamic = 'force-dynamic';
const MAX_MB = 5, MAX_MOV = 5000;

// Extracto del banco (Norma 43, CSV o Excel) → movimientos. Los ya subidos no se repiten.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  // Escribe movimientos y cambia el saldo real (Tesorería): no basta con ver el resumen.
  if (!puede(u, 'facturar') && !puede(u, 'gastar')) return error('No tienes permiso para esto. Pídeselo al administrador de tu empresa.', 403);
  if (await pasado('importar', u.id, 30, 3600)) return error(MUCHOS, 429);
  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  if (!archivo || typeof archivo === 'string' || !archivo.size) return error('Elige el extracto (Norma 43, .csv o .xlsx)');
  if (archivo.size > MAX_MB * 1024 * 1024) return error(`El archivo pasa de ${MAX_MB} MB`);
  const buf = Buffer.from(await archivo.arrayBuffer());
  const texto = buf.toString('latin1');
  let r;
  try { r = esNorma43(texto) ? leerNorma43(texto) : leerTablaBanco(leerHoja(buf)); } catch { return error('No se puede leer el archivo: descárgalo del banco en Norma 43, .csv o .xlsx'); }
  if (r.error) return error(r.error);
  if (r.movimientos.length > MAX_MOV) return error(`Demasiados movimientos: como máximo ${MAX_MOV} por archivo`);
  const g = await guardarMovimientos(u, r.movimientos);
  // El saldo del extracto cuenta como saldo real de esa cuenta si es más reciente que el que había.
  const previas = Object.fromEntries(((await leer(u, 'bancos')) || []).map((c) => [c.id, c]));
  let conSaldo = false;
  for (const c of r.cuentas) {
    const antes = previas[c.id];
    const nuevo = c.saldo !== null && (!antes?.fechaSaldo || (c.fechaSaldo || '') >= antes.fechaSaldo);
    if (nuevo) conSaldo = true;
    await guardar(u, 'bancos', { ...(antes || {}), id: c.id, nombre: antes?.nombre || c.nombre, origen: 'extracto', subido: hoy(),
      ...(nuevo ? { saldo: c.saldo, fechaSaldo: c.fechaSaldo } : {}) });
  }
  const saldo = conSaldo ? await actualizarSaldo(u) : null;
  return Response.json({ ok: true, ...g, errores: r.errores || 0, saldo });
}
