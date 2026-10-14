// Construye por adelantado los índices y totales de todas las empresas (informe de capacidad E06), una tras otra, para
// que tras un cambio de versión del índice la primera visita de cada empresa no tenga que hacerlo. Solo lee los
// documentos y escribe índices (nunca cambia facturas ni gastos); se puede repetir y cortar en cualquier momento.
// Uso: KV_REST_API_URL=… KV_REST_API_TOKEN=… node scripts/indices.mjs [--comprobar]
import '../tests/apoyo/cargador.mjs';

const { redis } = await import('../lib/redis.js');
const I = await import('../lib/indices.js');
const comprobar = process.argv.includes('--comprobar');
const empresas = Object.keys((await redis.hgetall('empresas')) || {}).sort();
let n = 0, descuadres = 0;
for (const id of empresas) {
  const u = { id, empresa: id };
  for (const col of ['facturas', 'gastos', 'presupuestos']) {
    await I.asegurar(u, col);
    if (comprobar && col !== 'presupuestos') {
      const d = await I.comprobarTotales(u, col);
      if (d.length) { descuadres++; console.log(`${id} ${col}: ${d.length} totales descuadrados`, d.slice(0, 3)); }
    }
  }
  if (++n % 50 === 0) console.log(`${n}/${empresas.length}`);
}
console.log(`Índices listos en ${n} empresas${comprobar ? `; ${descuadres} con descuadres` : ''}.`);
process.exit(0);
