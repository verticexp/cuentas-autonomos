// Índices de facturas, gastos y presupuestos para los scripts de demo, escritos de golpe. Sin ellos, la primera visita
// a cada empresa los reconstruía documento a documento con un script de Redis (lib/indices.js reconstruir): Upstash
// cuenta cada operación de dentro, unas 10 por documento, y cada «Rehacer la demo» costaba decenas de miles.
// Mismo contenido que dejaría reconstruir (lib/fichas.js indiceDe y textoDe), con un ZADD y un HSET por cada 1.000.
import { claves, clavesAntiguas, indiceDe, textoDe, VERSION_INDICE } from '../lib/fichas.js';

const LOTE = 1000;
const Z = { ix: 'ix', p: 'ixp', i: 'ixi', d: 'ixd', n: 'ixn' };

export async function escribirIndices(r, P, emp, col, docs) {
  const k = claves(col, emp), pk = (x) => P + x;
  // «rev» sigue subiendo (la usan las cachés para saber que algo ha cambiado): nunca vuelve a un valor de antes.
  const rev = (Number(await r.hget(pk(k.ixa), 'rev')) || 0) + docs.length + 1;
  await r.del(...[k.ix, k.ixp, k.ixi, k.ixd, k.ixn, k.ixf, k.ixt, k.ixa, k.ixv, ...clavesAntiguas(col, emp)].map(pk));
  const z = { ix: [], p: [], i: [], d: [], n: [] }, ixf = {}, ixt = {}, ixa = {};
  for (const d of docs) {
    const { ficha } = indiceDe(col, d);
    for (const [e, m] of ficha.zs) z[e].push(m);
    ixf[d.id] = JSON.stringify(ficha);
    ixt[d.id] = textoDe(col, d) ?? '';
    for (const [c, n] of Object.entries(ficha.ag)) ixa[c] = (ixa[c] || 0) + n;
  }
  for (const [e, miembros] of Object.entries(z)) {
    for (let i = 0; i < miembros.length; i += LOTE) {
      const [primero, ...resto] = miembros.slice(i, i + LOTE).map((member) => ({ score: 0, member }));
      await r.zadd(pk(k[Z[e]]), primero, ...resto);
    }
  }
  for (const [clave, h] of [[k.ixf, ixf], [k.ixt, ixt]]) {
    const ids = Object.keys(h);
    for (let i = 0; i < ids.length; i += LOTE) await r.hset(pk(clave), Object.fromEntries(ids.slice(i, i + LOTE).map((id) => [id, h[id]])));
  }
  await r.hset(pk(k.ixa), { ...ixa, rev });
  await r.set(pk(k.ixv), VERSION_INDICE);
}
