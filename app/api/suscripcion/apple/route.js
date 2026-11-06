import { cuerpo, error, usuarioApi } from '@/lib/api';
import { fiscalDe } from '@/lib/empresa';
import { tiposContratables } from '@/lib/formaJuridica';
import { MUCHOS, pasado } from '@/lib/limite';
import { esFundador } from '@/lib/prueba';
import { redis } from '@/lib/redis';
import { aplicarTransaccion, appleVigente, productosPara, tokenDe, verificarTransaccion } from '@/lib/compraApple';

export const dynamic = 'force-dynamic';

// Compras dentro de la app de iOS (lib/compraApple.js, components/PlanesApple.js).
// GET → lo que la app necesita para enseñar los planes: productos que puede contratar la empresa, su appAccountToken
// (solo al administrador) y la suscripción de Apple que tenga. motivo: por qué no puede comprar (null si puede).
// POST { transacciones: [JWS] } → al comprar, al restaurar y al abrir la app: guarda lo que diga cada transacción firmada
// en su empresa y devuelve el plan de la empresa actual.

const motivoDe = (u) => {
  if (esFundador(u.plan)) return 'fundador';
  if (u.plan?.porDespacho) return 'despacho';
  if (appleVigente(u.plan)) return u.rol === 'admin' ? null : 'admin';
  if (u.plan?.pagado && u.plan.suscripcion && ['active', 'trialing', 'past_due'].includes(u.plan.estado)) return 'web';
  if (u.rol !== 'admin') return 'admin';
  return null;
};

const suscripcionDe = (plan) => (plan?.apple ? (({ original, producto, estado, expira, renueva, siguiente, gracia, entorno }) => ({ original, producto, estado, expira, renueva: renueva ?? null, siguiente: siguiente || null, gracia: gracia || null, entorno }))(plan.apple) : null);

export async function GET() {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const motivo = motivoDe(u);
  const tipos = tiposContratables(fiscalDe(u).tipo);
  return Response.json({
    motivo, tipos, productos: productosPara(tipos),
    token: u.rol === 'admin' ? await tokenDe(u.empresa) : null,
    apple: suscripcionDe(u.plan), vigente: appleVigente(u.plan),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (await pasado('compras-apple', u.id, 60, 3600)) return error(MUCHOS, 429);
  const { transacciones } = await cuerpo(req);
  const lista = Array.isArray(transacciones) ? transacciones.filter((t) => typeof t === 'string' && t.length < 20000).slice(0, 10) : [];
  if (!lista.length) return error('No hay ninguna compra que comprobar');
  let aplicadas = 0, deOtra = false, cambiado = false, fallo = null;
  for (const jws of lista) {
    const t = verificarTransaccion(jws);
    if (t.error) { fallo = t.error; continue; }
    const r = await aplicarTransaccion(t.tx, { empresa: u.empresa });
    if (r.error) { fallo = r.error; continue; }
    aplicadas += 1;
    if (r.cambiado && r.empresa === String(u.empresa)) cambiado = true;
    if (r.empresa !== String(u.empresa)) deOtra = true;
  }
  if (!aplicadas && fallo) console.warn(`[apple] ${u.empresa}: ${fallo}`);
  if (!aplicadas) return error('No se ha podido comprobar la compra con Apple. Vuelve a intentarlo.', 400);
  const plan = (await redis.hget('empresas', u.empresa))?.plan || null;
  return Response.json({ plan, apple: suscripcionDe(plan), vigente: appleVigente(plan), aplicadas, deOtra, cambiado });
}
