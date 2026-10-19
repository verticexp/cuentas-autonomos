// Recomienda Netto: cada empresa tiene un enlace (/registro?ref=CODIGO). Quien se registra con él tiene un mes más de
// prueba; cuando esa empresa hace su primer pago real (suscripción «active» en Stripe), la que la recomendó gana un mes
// gratis: un abono en su saldo de Stripe si ya paga, o 30 días más de prueba si aún no. Fundador no gana nada (ya es
// gratis). Como mucho PREMIOS_MAX meses por empresa. No se combina con el código de una gestoría (lib/gestorias.js).
// En la empresa: recomienda = { codigo, meses } · en la recomendada: plan.recomendacion = { codigo, empresa, premiada? }.
import { randomBytes } from 'node:crypto';
import { redis } from './redis.js';
import { stripe } from './stripe.js';
import { conCerrojo } from './cerrojo.js';
import { importe } from './planes.js';
import { esFundador } from './prueba.js';

export const RECOMENDACION_DIAS = 30;
export const PREMIO_DIAS = 30;
export const PREMIOS_MAX = 12;
const IVA = 21;
const DIA = 86400000;
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I, para dictarlo sin dudas

export function normalizarRef(c) {
  const codigo = typeof c === 'string' ? c.trim().toUpperCase() : '';
  return /^[A-Z0-9]{6,12}$/.test(codigo) ? codigo : null;
}

// El código de la empresa; la primera vez se crea (HSETNX: único aunque se pidan dos a la vez).
export async function codigoDe(empresaId) {
  const e = await redis.hget('empresas', empresaId);
  if (!e) return null;
  if (e.recomienda?.codigo) return e.recomienda.codigo;
  for (let i = 0; i < 5; i++) {
    const codigo = [...randomBytes(8)].map((b) => LETRAS[b % LETRAS.length]).join('');
    if (!(await redis.hsetnx('recomendaciones', codigo, empresaId))) continue;
    const actual = await redis.hget('empresas', empresaId);
    await redis.hset('empresas', { [empresaId]: { ...actual, recomienda: { meses: 0, ...actual.recomienda, codigo } } });
    return codigo;
  }
  return null;
}

// La empresa que recomienda (sin baja), o null.
export async function empresaPorCodigo(c) {
  const codigo = normalizarRef(c);
  const id = codigo && (await redis.hget('recomendaciones', codigo));
  const e = id && (await redis.hget('empresas', id));
  return e && !e.baja ? e : null;
}

export const apuntarRecomendada = (codigo, empresaId) => redis.sadd(`recomendadas:${codigo}`, empresaId);

// Para Ajustes › Recomienda Netto: cuántas se han registrado con su enlace, cuántas pagan y los meses ganados.
export async function resumenRecomendaciones(empresaId) {
  const codigo = await codigoDe(empresaId);
  const ids = codigo ? await redis.smembers(`recomendadas:${codigo}`) : [];
  const [e, ...otras] = await Promise.all([redis.hget('empresas', empresaId), ...ids.map((id) => redis.hget('empresas', id))]);
  return {
    codigo, registradas: otras.filter(Boolean).length,
    pagando: otras.filter((x) => x?.plan?.recomendacion?.premiada).length,
    meses: e?.recomienda?.meses || 0, fundador: esFundador(e?.plan), max: PREMIOS_MAX,
  };
}

// Qué gana la empresa que recomienda: { tipo: 'abono', centimos } · { tipo: 'dias', hasta } · { tipo: 'nada', motivo }.
export function premioPara(e, hoy = new Date()) {
  if (!e || e.baja) return { tipo: 'nada', motivo: 'baja' };
  const p = e.plan;
  if (esFundador(p)) return { tipo: 'nada', motivo: 'fundador' };
  if ((e.recomienda?.meses || 0) >= PREMIOS_MAX) return { tipo: 'nada', motivo: 'maximo' };
  if (p.pagado && p.cliente) {
    const mes = importe(p.tipo, p.nombre, 'mes');
    if (mes) return { tipo: 'abono', centimos: Math.round((mes * (100 + IVA)) / 100) };
  }
  const dia = hoy.toISOString().slice(0, 10);
  const base = p.hasta && p.hasta >= dia ? p.hasta : new Date(hoy.getTime() - DIA).toISOString().slice(0, 10);
  return { tipo: 'dias', hasta: new Date(Date.parse(`${base}T12:00:00Z`) + PREMIO_DIAS * DIA).toISOString().slice(0, 10) };
}

// Lo llama lib/suscripcion.js cuando la empresa recomendada pasa a pagar. Una sola vez por empresa recomendada.
export async function premiarRecomendacion(recomendadaId, hoy = new Date()) {
  return conCerrojo(`recomendacion:${recomendadaId}`, async () => {
    const n = await redis.hget('empresas', recomendadaId);
    const r = n?.plan?.recomendacion;
    if (!r?.empresa || r.premiada) return null;
    const premio = await conCerrojo(`empresa-plan:${r.empresa}`, async () => {
      const e = await redis.hget('empresas', r.empresa);
      const p = premioPara(e, hoy);
      if (p.tipo === 'abono') {
        const t = await stripe(`customers/${encodeURIComponent(e.plan.cliente)}/balance_transactions`, { amount: -p.centimos, currency: 'eur', description: 'Netto: 1 mes gratis por recomendar a otra empresa' });
        if (t?.error) return { error: t.error };
      }
      if (p.tipo !== 'nada') {
        const plan = p.tipo === 'dias' ? { ...e.plan, hasta: p.hasta } : e.plan;
        await redis.hset('empresas', { [r.empresa]: { ...e, plan, recomienda: { ...e.recomienda, meses: (e.recomienda?.meses || 0) + 1 } } });
      }
      return p;
    });
    if (premio.error) return premio; // se reintenta con el siguiente aviso de Stripe
    const actual = await redis.hget('empresas', recomendadaId);
    await redis.hset('empresas', { [recomendadaId]: { ...actual, plan: { ...actual.plan, recomendacion: { ...r, premiada: hoy.toISOString().slice(0, 10), premio: premio.tipo } } } });
    return premio;
  });
}
