// Repara los descuadres de la conciliación bancaria que dejaba borrar un documento emparejado (issue #72): el movimiento
// seguía apuntando a una factura o un gasto que ya no existe. Esos movimientos vuelven a «pendiente», igual que al
// deshacer el emparejamiento. El resto de descuadres solo se describen (sin importes, nombres ni conceptos) para
// decidir a mano.
// Uso:
//   KV_REST_API_URL=… KV_REST_API_TOKEN=… node --import ./tests/apoyo/cargador.mjs scripts/reparar-conciliacion.mjs   → simula
//   … scripts/reparar-conciliacion.mjs --aplicar [--empresa=<id>]                                                  → escribe
// Idempotente: se puede repetir. Antes de aplicar, una copia cifrada (scripts/copia.mjs; el workflow la hace).
if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) throw new Error('Faltan KV_REST_API_URL y KV_REST_API_TOKEN');
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? (process.argv.includes(`--${k}`) || undefined);
const { redis, leer, clave } = await import('../lib/redis.js');
const { movimientoLibre } = await import('../lib/enlacesBanco.js');

const aplicar = Boolean(arg('aplicar'));
const empresas = Object.values((await redis.hgetall('empresas')) || {}).filter((e) => !arg('empresa') || e.id === arg('empresa'));
const informe = [];
for (const e of empresas) {
  const u = { empresa: e.id };
  const movs = ((await leer(u, 'banco')) || []).filter((m) => m.estado === 'emparejado' && ['factura', 'gasto'].includes(m.enlace?.tipo));
  if (!movs.length) continue;
  const docs = { factura: (await redis.hgetall(clave(u, 'facturas'))) || {}, gasto: (await redis.hgetall(clave(u, 'gastos'))) || {} };
  const soltar = {};
  for (const m of movs) {
    const { tipo, id, yaCobrada } = m.enlace;
    const d = docs[tipo][id];
    const linea = { empresa: e.id, movimiento: m.id, tipo, documento: id };
    if (!d) { soltar[m.id] = movimientoLibre(m); informe.push({ ...linea, problema: 'documento inexistente', accion: 'soltar' }); continue; }
    if (tipo === 'factura') {
      const enPagos = (d.pagos || []).some((p) => p.banco === m.id) || d.cobro?.banco === m.id;
      if (yaCobrada ? d.cobrada || d.pagos?.length : enPagos && !(d.cobro?.banco === m.id && !d.cobrada)) continue;
      informe.push({ ...linea, problema: 'factura sin referencia recíproca', accion: 'revisar a mano',
        diagnostico: { yaCobrada: Boolean(yaCobrada), cobrada: Boolean(d.cobrada), metodoCobro: d.cobro?.metodo || null, cobroBanco: d.cobro?.banco === m.id,
          pagos: (d.pagos || []).map((p) => ({ metodo: p.metodo || null, esteMovimiento: p.banco === m.id, otroMovimiento: Boolean(p.banco && p.banco !== m.id) })) } });
    } else if (d.banco !== m.id || d.pendiente) {
      informe.push({ ...linea, problema: 'gasto sin referencia recíproca', accion: 'revisar a mano',
        diagnostico: { gastoConOtroMovimiento: Boolean(d.banco && d.banco !== m.id), pendiente: Boolean(d.pendiente), deBanco: Boolean(d.deBanco) } });
    }
  }
  if (aplicar && Object.keys(soltar).length) await redis.hset(clave(u, 'banco'), soltar);
}
for (const x of informe) console.log(JSON.stringify(x));
const n = informe.filter((x) => x.accion === 'soltar').length;
console.log(`${aplicar ? 'Aplicado' : 'Simulación'}: ${n} movimientos ${aplicar ? 'soltados' : 'a soltar'}, ${informe.length - n} para revisar a mano, en ${empresas.length} empresas.`);
