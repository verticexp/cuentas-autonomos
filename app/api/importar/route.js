import { randomBytes } from 'node:crypto';
import { leer, redis, clave } from '@/lib/redis';
import { error, usuarioApi } from '@/lib/api';
import { puede } from '@/lib/permisos';
import { actividadesDe } from '@/lib/empresa';
import { leerHoja } from '@/lib/hoja';
import { TIPOS, previa } from '@/lib/importar';

export const dynamic = 'force-dynamic';

const MAX_MB = 5, MAX_FILAS = 3000;

// Cómo se guarda cada cosa importada (las facturas, con su serie y número de origen y sin pasar por Verifactu).
const crear = {
  clientes: (d) => ({ id: d.nombre.toUpperCase(), ...d }),
  productos: (d) => ({ id: randomBytes(6).toString('hex'), ...d }),
  gastos: (d, act) => ({ id: crypto.randomUUID(), actividad: act, ...d }),
  facturas: (d, act) => ({ id: `${d.serie || ''}${d.anio}-${d.numero}`, actividad: act, ...d }),
};

// Un archivo y un tipo → vista previa. Con «guardar», además guarda lo nuevo (lo duplicado y lo erróneo se salta).
export async function POST(req) {
  const form = await req.formData().catch(() => null);
  const tipo = String(form?.get('tipo') || '');
  if (!TIPOS[tipo]) return error('Elige qué quieres importar');
  const { u, res } = await usuarioApi({ permiso: TIPOS[tipo].permiso });
  if (res) return res;
  if (!puede(u, 'empresa')) return error('Solo quien gestiona la empresa puede importar datos', 403);
  const archivo = form.get('archivo');
  if (!archivo || typeof archivo === 'string' || !archivo.size) return error('Elige un archivo .xlsx o .csv');
  if (archivo.size > MAX_MB * 1024 * 1024) return error(`El archivo pasa de ${MAX_MB} MB`);
  let filas;
  try { filas = leerHoja(Buffer.from(await archivo.arrayBuffer())); } catch { return error('No se puede leer el archivo: guárdalo como .xlsx o .csv'); }
  if (filas.length > MAX_FILAS + 10) return error(`Demasiadas filas: como máximo ${MAX_FILAS} por archivo`);
  const p = previa(tipo, filas, await leer(u, tipo));
  if (p.error) return Response.json(p, { status: 400 });
  if (form.get('guardar') !== '1') return Response.json(p);
  const act = actividadesDe(u)[0]?.id;
  const nuevos = p.items.filter((x) => x.estado === 'nuevo').map((x) => crear[tipo](x.datos, act));
  for (let i = 0; i < nuevos.length; i += 200) {
    await redis.hset(clave(u, tipo), Object.fromEntries(nuevos.slice(i, i + 200).map((x) => [x.id, x])));
  }
  // Los clientes de las facturas importadas quedan en la agenda (sin pisar los que ya hay).
  if (tipo === 'facturas' && nuevos.length) {
    const ya = new Set(((await leer(u, 'clientes')) || []).map((c) => c.id));
    const cl = Object.fromEntries(nuevos.map((f) => f.cliente).filter((c) => !ya.has(c.nombre.toUpperCase())).map((c) => [c.nombre.toUpperCase(), { id: c.nombre.toUpperCase(), ...c }]));
    if (Object.keys(cl).length) await redis.hset(clave(u, 'clientes'), cl);
  }
  return Response.json({ ...p, guardados: nuevos.length });
}
