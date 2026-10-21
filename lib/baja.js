import { redis, clave, leer } from './redis.js';
import { borrarUsuario, quitarDeEmpresa } from './auth.js';
import { membresias } from './membresias.js';
import { borrarDeEmpresa } from './justificantes.js';

// Baja de una empresa, a petición de su administrador. Al momento: nadie más entra (se borran las cuentas de quienes solo
// estaban en ella; al resto se le quita esta empresa) y se borra lo que la ley no obliga a guardar.
// Facturas, registros Verifactu, gastos, clientes, empleados, nóminas y jornada se conservan CONSERVAR años, bloqueados
// (Código de Comercio art. 30, Ley General Tributaria, Estatuto de los Trabajadores art. 34.9); después los borra purgarBajas.
export const CONSERVAR = 6;
const GUARDAR = ['facturas', 'registros', 'verifactu', 'gastos', 'clientes', 'empleados', 'nominas', 'jornada', 'auditoria', 'asientos', 'cuentasAnuales', 'stock', 'albaranes', 'pedidosProv', 'domiciliaciones', 'cuentasProv', 'fichasProv', 'remesas', 'numeracion', 'facturasBorradas'];
const BORRAR_YA = ['presupuestos', 'recurrentes', 'productos', 'banco', 'bancos', 'saldo', 'portales'];

// Los enlaces públicos (portal del cliente, pago de factura y pixel de apertura de correos) viven en índices globales por
// token. Una empresa dada de baja los pierde todos (auditoría N02): sus documentos se conservan, pero nadie llega a ellos
// con un enlace antiguo. Los resolutores públicos además rechazan las empresas de baja (lib/portal.js, lib/cobros.js).
export async function revocarEnlaces(empresa) {
  const e = { empresa };
  const portales = Object.entries((await redis.hgetall('portal-enlaces')) || {}).filter(([, v]) => v?.empresa === empresa).map(([t]) => t);
  if (portales.length) await redis.hdel('portal-enlaces', ...portales);
  const facturas = (await leer(e, 'facturas')) || [];
  const pagos = facturas.map((f) => f.pago).filter(Boolean);
  const envios = facturas.flatMap((f) => (f.envios || []).map((x) => x.token)).filter(Boolean);
  if (pagos.length) await redis.hdel('factura-pagos', ...pagos);
  if (envios.length) await redis.hdel('factura-envios', ...envios);
  return { portales: portales.length, pagos: pagos.length, envios: envios.length };
}

export async function darDeBaja(empresa) {
  const ahora = new Date();
  const borrarEl = new Date(Date.UTC(ahora.getUTCFullYear() + CONSERVAR, ahora.getUTCMonth(), ahora.getUTCDate())).toISOString().slice(0, 10);
  for (const o of Object.values((await redis.hgetall('usuarios')) || {}).filter((x) => membresias(x)[empresa])) await quitarDeEmpresa(o.id, empresa);
  await revocarEnlaces(empresa);
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
    await borrarDeEmpresa(e.id);
    await redis.hdel('empresas', e.id);
    n += 1;
  }
  return n;
}

// Eliminar la propia cuenta (Ajustes › Eliminar mi cuenta; Apple 5.1.1(v) la exige en la app). Por cada empresa:
// - con más administradores: solo se va esta persona;
// - es su único miembro: la empresa se da de baja como en darDeBaja (lo que la ley obliga se conserva bloqueado);
// - es su único administrador pero hay más gente: no se puede, primero tiene que nombrar a otro administrador.
// Devuelve { empresas: [ids dados de baja] } o { error }.
export async function eliminarCuenta(u) {
  if (!u || u.admin) return { error: 'La cuenta del administrador de Fisquo no se puede eliminar desde aquí.' };
  const usuarios = Object.values((await redis.hgetall('usuarios')) || {});
  const empresas = (await redis.hgetall('empresas')) || {};
  const mias = Object.entries(membresias(u));
  const deBaja = [];
  for (const [empresa, m] of mias) {
    if (m.rol !== 'admin') continue;
    const otros = usuarios.filter((o) => o.id !== u.id && membresias(o)[empresa]);
    if (otros.some((o) => membresias(o)[empresa].rol === 'admin')) continue;
    if (otros.length) return { error: `Eres el único administrador de «${empresas[empresa]?.nombre || 'tu empresa'}»: nombra a otra persona administradora en Usuarios y permisos, o da de baja la empresa, antes de eliminar tu cuenta.` };
    deBaja.push(empresa);
  }
  for (const empresa of deBaja) await darDeBaja(empresa);
  await borrarUsuario(u.id);
  return { empresas: deBaja };
}
