// Cerrojo con propietario sobre Redis: solo quien lo tiene puede soltarlo (una tarea que tardó más que su caducidad no
// borra el cerrojo de la siguiente). Para serializar la emisión de facturas de una empresa: número, factura y cadena
// Verifactu se calculan y se guardan sin que otra emisión se cuele en medio.
import { randomUUID } from 'node:crypto';
import { redis } from './redis.js';
import { metrica } from './metricas.js';

export const SOLTAR = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

export class Ocupado extends Error {}

// Ejecuta fn con el cerrojo `nombre`. caduca: lo que como mucho puede durar fn (si se pasa, fn recibe quedaMs() <= 0 y
// debe abandonar antes de escribir). espera: cuánto se espera a que otro lo suelte antes de rendirse.
export async function conCerrojo(nombre, fn, { caduca = 30000, espera = 20000 } = {}) {
  const clave = `cerrojo:${nombre}`;
  const yo = randomUUID();
  const limite = Date.now() + espera;
  for (let i = 0; !(await redis.set(clave, yo, { nx: true, px: caduca })); i++) {
    if (Date.now() >= limite) throw new Ocupado('Hay otra operación en curso con estos datos: inténtalo de nuevo en unos segundos.');
    await dormir(Math.min(200, 15 + i * 10) + Math.random() * 25);
  }
  const desde = Date.now();
  // E11: las esperas largas por un cerrojo (empresa muy concurrida) quedan en los registros, sin datos de la empresa.
  if (desde - (limite - espera) > 500) metrica('espera-cerrojo', { tipo: nombre.split(':')[0], ms: desde - (limite - espera) });
  try {
    return await fn({ quedaMs: () => caduca - (Date.now() - desde) - 2000 });
  } finally {
    await redis.eval(SOLTAR, [clave], [yo]).catch(() => {});
  }
}
