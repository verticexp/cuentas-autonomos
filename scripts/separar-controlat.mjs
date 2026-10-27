// node scripts/separar-controlat.mjs [--copiar | --comparar | --borrar-origen]
// Copia a una base de datos aparte las claves de Controla'T (todas las que no empiezan por «cuentas:») de la base de
// datos compartida. Sin opciones solo cuenta y no escribe nada.
//   ORIGEN_URL / ORIGEN_TOKEN    la base compartida de ahora
//   DESTINO_URL / DESTINO_TOKEN  la nueva de Controla'T (debe estar vacía)
// --copiar        copia cada clave con su tipo y su caducidad y compara después origen y destino.
// --comparar      solo compara origen y destino, sin escribir.
// --borrar-origen borra del origen las claves de Controla'T ya presentes e iguales en el destino.
import { Redis } from '@upstash/redis';

const P = 'cuentas:';
const opcion = process.argv[2];
try {
  if (process.argv.length > 3 || (opcion && !['--copiar', '--comparar', '--borrar-origen'].includes(opcion))) throw new Error('Uso: node scripts/separar-controlat.mjs [--copiar | --comparar | --borrar-origen]');
  const falta = ['ORIGEN_URL', 'ORIGEN_TOKEN', 'DESTINO_URL', 'DESTINO_TOKEN'].filter((v) => !process.env[v]);
  if (falta.length) throw new Error(`Faltan ${falta.join(', ')}`);
  if (process.env.ORIGEN_URL === process.env.DESTINO_URL) throw new Error('Origen y destino son la misma base de datos');
  const o = new Redis({ url: process.env.ORIGEN_URL, token: process.env.ORIGEN_TOKEN, automaticDeserialization: false });
  const d = new Redis({ url: process.env.DESTINO_URL, token: process.env.DESTINO_TOKEN, automaticDeserialization: false });

  const claves = [];
  let cursor = '0';
  do {
    const [sig, lote] = await o.scan(cursor, { count: 1000 });
    cursor = String(sig);
    claves.push(...lote.filter((k) => !k.startsWith(P)));
  } while (cursor !== '0');

  // Contenido de una clave en forma comparable, según su tipo.
  async function leer(r, k) {
    const tipo = await r.type(k);
    if (tipo === 'string') return { tipo, v: await r.get(k) };
    // Sin deserializar, hgetall devuelve [campo, valor, campo, valor…] (como hgetallCrudo de lib/redis.js).
    if (tipo === 'hash') {
      const a = (await r.hgetall(k)) || [];
      const pares = [];
      if (Array.isArray(a)) for (let i = 0; i < a.length; i += 2) pares.push([a[i], a[i + 1]]);
      else pares.push(...Object.entries(a));
      return { tipo, v: pares.sort() };
    }
    if (tipo === 'list') return { tipo, v: await r.lrange(k, 0, -1) };
    if (tipo === 'set') return { tipo, v: (await r.smembers(k)).sort() };
    if (tipo === 'zset') return { tipo, v: await r.zrange(k, 0, -1, { withScores: true }) };
    if (tipo === 'none') return null;
    throw new Error(`Tipo no previsto en ${k}: ${tipo}`);
  }
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const tipos = {};
  for (const k of claves) { const t = await o.type(k); tipos[t] = (tipos[t] || 0) + 1; }
  console.log(`Claves de Controla'T en el origen: ${claves.length}`, tipos);

  if (opcion === '--copiar') {
    if ((await d.dbsize()) > 0) throw new Error('El destino no está vacío');
    for (const k of claves) {
      const x = await leer(o, k);
      if (!x) continue;
      if (x.tipo === 'string') await d.set(k, x.v);
      else if (x.tipo === 'hash') await d.hset(k, Object.fromEntries(x.v));
      else if (x.tipo === 'list') await d.rpush(k, ...x.v);
      else if (x.tipo === 'set') await d.sadd(k, ...x.v);
      else for (let i = 0; i < x.v.length; i += 2) await d.zadd(k, { member: x.v[i], score: Number(x.v[i + 1]) });
      const ttl = await o.pttl(k);
      if (ttl > 0) await d.pexpire(k, ttl);
    }
    const distintas = [];
    for (const k of claves) if (!igual(await leer(o, k), await leer(d, k))) distintas.push(k);
    if (distintas.length) throw new Error(`No coinciden ${distintas.length} claves: ${distintas.slice(0, 20).join(', ')}`);
    console.log(`Copiadas y comprobadas ${claves.length} claves`);
  }

  if (opcion === '--comparar') {
    const distintas = [];
    for (const k of claves) if (!igual(await leer(o, k), await leer(d, k))) distintas.push(k);
    const sobran = (await d.dbsize()) - claves.length;
    console.log(distintas.length ? `Difieren ${distintas.length} claves: ${distintas.join(', ')}` : 'Todas las claves del origen son iguales en el destino');
    if (sobran > 0) console.log(`El destino tiene ${sobran} claves más (escritas ya en la base nueva)`);
  }

  if (opcion === '--borrar-origen') {
    const distintas = [];
    for (const k of claves) if (!igual(await leer(o, k), await leer(d, k))) distintas.push(k);
    if (distintas.length) throw new Error(`No se borra nada: ${distintas.length} claves difieren del destino (${distintas.slice(0, 20).join(', ')})`);
    for (let i = 0; i < claves.length; i += 500) await o.del(...claves.slice(i, i + 500));
    console.log(`Borradas del origen ${claves.length} claves`);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
