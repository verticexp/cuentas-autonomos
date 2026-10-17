import { PLANES } from '../components/web/datos.js';

// Alta desde la web: cada empresa nueva elige tipo de negocio y plan, y lo prueba gratis PRUEBA_DIAS sin tarjeta.
// En la empresa: plan = { tipo: 'aut' | 'pym' | 'gra', nombre: 'Esencial' | 'Pro' | 'Plus', hasta: 'AAAA-MM-DD' }.
// Las empresas de antes no tienen plan: no ven el contador (cuentas de fundador o dadas de alta a mano).
export const PRUEBA_DIAS = 30;
export const TIPOS = { aut: 'Autónomo', pym: 'Pyme', gra: 'Gran empresa' };
const DIA = 86400000;

export const planDe = (tipo, nombre) => PLANES[tipo]?.find((p) => p.n === nombre) || null;

// Plan que se guarda al registrarse; null si el tipo o el plan no existen. Hoy es el día 1: hasta = hoy + 29.
export function nuevoPlan(tipo, nombre, hoy = new Date()) {
  if (!planDe(tipo, nombre)) return null;
  return { tipo, nombre, hasta: new Date(hoy.getTime() + (PRUEBA_DIAS - 1) * DIA).toISOString().slice(0, 10) };
}

// Días de prueba que quedan (el último día cuenta como 1); 0 si ya acabó; null si la empresa no tiene prueba.
export function diasPrueba(plan, hoy = new Date()) {
  if (!plan?.hasta || plan.pagado) return null;
  const fin = Date.parse(`${plan.hasta}T23:59:59Z`);
  if (!Number.isFinite(fin)) return null;
  return Math.max(0, Math.ceil((fin - hoy.getTime()) / DIA));
}

// Las cuentas nuevas son autónomo o sociedad en el cuestionario: pyme y gran empresa empiezan como sociedad.
export const fiscalDeTipo = (tipo) => (tipo === 'aut' ? 'autonomo' : 'sociedad');
