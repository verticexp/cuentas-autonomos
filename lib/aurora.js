import { randomBytes } from 'node:crypto';
import datos from '../data/aurora-web.json' with { type: 'json' };
import { redis } from './redis.js';
import { cifrar } from './auth.js';
import { conCerrojo } from './cerrojo.js';

export const EMAIL_AURORA = 'direccion@aurora-eventos.example';

// Alta única de los datos ficticios auditados. Nunca reutiliza ni rehace una empresa existente.
export async function crearAurora() {
  return conCerrojo('alta-aurora', async () => {
    if (await redis.hget('emails', EMAIL_AURORA)) return { error: 'Aurora ya tiene cuenta. No se han modificado sus datos.', status: 409 };
    const id = randomBytes(16).toString('hex'), password = randomBytes(24).toString('base64url');
    if (await redis.hget('empresas', id) || await redis.hget('usuarios', id)) throw new Error('Identificador ocupado');
    const remap = (v) => typeof v === 'string' ? v === datos.origen ? id : v : Array.isArray(v) ? v.map(remap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)])) : v;
    const empresa = { ...remap(datos.empresa), id, nombre: 'Aurora Producciones y Eventos S.L. (SIMULADA)', demo: true, pendiente: false, verifactu: null };
    for (const k of ['drive', 'driveError', 'controlat', 'controlatEmail']) delete empresa[k];
    empresa.emisor = { ...empresa.emisor, nombre: empresa.nombre, email: EMAIL_AURORA, recordatorios: 0 };
    const usuario = { id, empresa: id, nombre: 'Clara Soler (ficticia)', email: EMAIL_AURORA, admin: false, rol: 'admin', emailVerificado: true, creado: new Date().toISOString(), pass: await cifrar(password) };
    const tx = redis.multi();
    const resumen = {};
    for (const [col, entrada] of Object.entries(datos.colecciones)) {
      const valor = remap(entrada.valor);
      if (entrada.tipo === 'string') { tx.set(`${col}:${id}`, valor); continue; }
      for (const doc of Object.values(valor)) {
        if (col === 'recurrentes') { doc.activa = false; doc.enviar = false; }
        if (col === 'presupuestos') {
          doc.token = randomBytes(24).toString('base64url');
          tx.hset('presupuesto-enlaces', { [doc.token]: { empresa: id, id: doc.id } });
        }
      }
      resumen[col] = Object.keys(valor).length;
      if (resumen[col]) tx.hset(`${col}:${id}`, valor);
    }
    tx.hset('empresas', { [id]: empresa }).hset('usuarios', { [id]: usuario }).hset('emails', { [EMAIL_AURORA]: id });
    await tx.exec();
    return { id, email: EMAIL_AURORA, password, resumen };
  }, { caduca: 60000 });
}
