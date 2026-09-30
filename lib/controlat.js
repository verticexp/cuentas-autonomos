import { redis, crudo, clave } from './redis.js';
import { r2 } from './calculos.js';

// Conector con Controla'T: cada mes, un ingreso «Nómina autónomo» con el neto de ese mes.
// Neto = base facturada − gastos puntuales del mes − IRPF del mes.
// IRPF = 20 % del beneficio del mes (base − todos los gastos, cuota incluida). La retención del 15 %
// cuenta como parte de ese 20 %. La cuota no se resta del neto: va como gasto fijo en Controla'T.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function netoMes(facturas, gastos, ym) {
  const base = facturas.filter((f) => f.fecha.startsWith(ym)).reduce((s, f) => s + f.base, 0);
  const delMes = gastos.filter((g) => g.fecha.startsWith(ym));
  const todos = delMes.reduce((s, g) => s + g.base, 0);
  const puntuales = delMes.filter((g) => !String(g.id).startsWith('cuota-')).reduce((s, g) => s + g.base, 0);
  const irpf = Math.max(0, 0.2 * (base - todos));
  return r2(base - puntuales - irpf);
}

// Usuario de Controla'T con el mismo email (el administrador guarda el suyo en admin:email).
export async function idControlat(email) {
  if (!crudo || !email) return null;
  const e = String(email).trim().toLowerCase();
  const [admin, id] = await Promise.all([crudo.get('admin:email'), crudo.hget('emails', e)]);
  if (admin && String(admin).toLowerCase() === e) return 'admin';
  return id || null;
}

async function escribir(idC, ym, importe) {
  const movs = idC === 'admin' ? 'movs' : `movs:${idC}`;
  const id = `autonomo-${ym}`;
  if (importe <= 0) {
    await crudo.hdel(`${movs}:${ym}`, id);
    await crudo.hdel(`${movs}:idx`, id);
    return;
  }
  const [y, m] = ym.split('-').map(Number);
  const mov = {
    id,
    tipo: 'ingreso',
    importe,
    categoria: 'i-trabajo',
    comercio: 'Cuentas',
    concepto: `Nómina autónomo – ${MESES[m - 1]} ${y}`,
    fecha: new Date(Date.UTC(y, m, 0, 10)).toISOString(),
  };
  const p = crudo.pipeline();
  p.hset(`${movs}:${ym}`, { [id]: mov });
  p.sadd(`${movs}:meses`, ym);
  p.hset(`${movs}:idx`, { [id]: ym });
  await p.exec();
}

// Recalcula y envía los meses indicados. Nunca bloquea la acción principal.
export async function enviarNomina(u, meses) {
  if (!u.controlat || !redis) return;
  try {
    const idC = await idControlat(u.email);
    if (!idC) return;
    const [facturas, gastos] = await Promise.all([redis.hgetall(clave(u, 'facturas')), redis.hgetall(clave(u, 'gastos'))]);
    const F = Object.values(facturas || {});
    const G = Object.values(gastos || {});
    for (const ym of new Set(meses.filter(Boolean).map((x) => x.slice(0, 7)))) await escribir(idC, ym, netoMes(F, G, ym));
  } catch (e) {
    console.error('Controla\'T:', e.message);
  }
}

// Todos los meses con facturas o gastos del año en curso y el anterior.
export async function enviarTodo(u) {
  const [facturas, gastos] = await Promise.all([redis.hgetall(clave(u, 'facturas')), redis.hgetall(clave(u, 'gastos'))]);
  const desde = `${new Date().getFullYear() - 1}-01`;
  const meses = [...Object.values(facturas || {}), ...Object.values(gastos || {})].map((x) => x.fecha.slice(0, 7)).filter((m) => m >= desde);
  await enviarNomina(u, meses);
  return new Set(meses).size;
}
