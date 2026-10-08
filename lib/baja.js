import { redis, clave } from './redis.js';
import { borrarUsuario } from './auth.js';
import { conMembresia, membresias } from './membresias.js';

// Baja de una empresa, a petición de su administrador. Al momento: nadie más entra (se borran las cuentas de quienes solo
// estaban en ella; al resto se le quita esta empresa) y se borra lo que la ley no obliga a guardar.
// Facturas, registros Verifactu, gastos, clientes, empleados, nóminas y jornada se conservan CONSERVAR años, bloqueados
// (Código de Comercio art. 30, Ley General Tributaria, Estatuto de los Trabajadores art. 34.9); después los borra purgarBajas.
export const CONSERVAR = 6;
const GUARDAR = ['facturas', 'registros', 'verifactu', 'gastos', 'clientes', 'empleados', 'nominas', 'jornada', 'auditoria'];
const BORRAR_YA = ['presupuestos', 'recurrentes', 'productos', 'banco', 'bancos', 'saldo', 'portales'];

export async function darDeBaja(empresa) {
  const ahora = new Date();
  const borrarEl = new Date(Date.UTC(ahora.getUTCFullYear() + CONSERVAR, ahora.getUTCMonth(), ahora.getUTCDate())).toISOString().slice(0, 10);
  for (const o of Object.values((await redis.hgetall('usuarios')) || {}).filter((x) => membresias(x)[empresa])) {
    if (Object.keys(membresias(o)).length > 1) await redis.hset('usuarios', { [o.id]: conMembresia(o, empresa, null) });
    else await borrarUsuario(o.id);
  }
  await redis.del(...BORRAR_YA.map((n) => clave({ empresa }, n)));
  const { marca, drive, driveError, controlat, controlatEmail, ...resto } = (await redis.hget('empresas', empresa)) || {};
  await redis.hset('empresas', { [empresa]: { ...resto, id: empresa, baja: { fecha: ahora.toISOString(), borrarEl } } });
  return borrarEl;
}

// Lo llama el cron de cada mañana: borra del todo las empresas dadas de baja cuyo plazo de conservación ha acabado.
export async function purgarBajas(dia) {
  let n = 0;
  for (const e of Object.values((await redis.hgetall('empresas')) || {})) {
    if (!e.baja?.borrarEl || e.baja.borrarEl > dia) continue;
    await redis.del(...[...GUARDAR, ...BORRAR_YA].map((x) => clave({ empresa: e.id }, x)));
    await redis.hdel('empresas', e.id);
    n += 1;
  }
  return n;
}
