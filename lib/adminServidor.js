import { redis } from './redis.js';
import { actividadReciente, ultimaActividad } from './actividad.js';
import { resumenAdmin } from './admin.js';

// Se fija una sola vez, cuando el panel o un cambio de suscripción inicia el seguimiento.
// La consulta de la oficina solo lee: nunca inicializa ni escribe datos.
export async function iniciarBajasAdmin(hoy = new Date()) {
  await redis.set('admin-bajas-desde', hoy.toISOString(), { nx: true });
}

export async function leerResumenAdmin(hoy = new Date()) {
  const [empresas, usuarios, actividad, ultima, bajasDesde] = await Promise.all([
    redis.hgetall('empresas'), redis.hgetall('usuarios'), actividadReciente(30, hoy), ultimaActividad(), redis.get('admin-bajas-desde'),
  ]);
  return {
    empresas: empresas || {}, ultima,
    resumen: resumenAdmin({ empresas: Object.values(empresas || {}), usuarios: Object.values(usuarios || {}), actividad, ultima, bajasDesde, hoy }),
  };
}
