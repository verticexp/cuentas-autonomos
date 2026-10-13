// Emisión de las facturas recurrentes (auditoría F08). El mes solo se da por hecho cuando la factura está emitida; si
// falla (p. ej. falta el NIF del cliente con Verifactu), queda apuntado el fallo y se reintenta en la siguiente pasada.
// La emisión es idempotente por plantilla y mes (clave rec:<id>:<AAAA-MM>): un cron repetido, dos a la vez o un corte
// entre emitir y apuntar nunca dan dos facturas. El envío por email va aparte: si falla, se reintenta sin emitir otra.
import { leerUno, guardar } from './redis.js';
import { crearFactura } from './facturas.js';
import { conCerrojo, Ocupado } from './cerrojo.js';
import { tocaRecurrente } from './recurrentes.js';

export const MAX_ENVIOS = 5;

// enviar(u, f) → { error? }: lo pone el cron (email); sin él, solo se emite.
export async function procesarRecurrente(u, id, dia, { enviar } = {}) {
  const periodo = dia.slice(0, 7);
  try {
    return await conCerrojo(`recurrente:${u.empresa || u.id}:${id}`, async () => {
      let r = await leerUno(u, 'recurrentes', id);
      if (!r) return {};
      const out = {};
      if (tocaRecurrente(r, dia)) {
        const { factura: f, error: e } = await crearFactura(u, { ...r.plantilla, fecha: dia, cobrada: false }, { idem: `rec:${r.id}:${periodo}` });
        if (e) {
          const intentos = (r.fallo?.periodo === periodo ? r.fallo.intentos : 0) + 1;
          await guardar(u, 'recurrentes', { ...r, fallo: { periodo, error: e, intentos, fecha: dia } });
          return { fallo: e };
        }
        r = { ...r, ultima: periodo, fallo: undefined, ...(r.enviar ? { envio: { factura: f.id, periodo, intentos: 0 } } : {}) };
        await guardar(u, 'recurrentes', r);
        out.creada = f.id;
      }
      if (r.envio && enviar && r.envio.intentos < MAX_ENVIOS) {
        const f = await leerUno(u, 'facturas', r.envio.factura);
        const s = f ? await enviar(u, f).catch((e) => ({ error: e.message })) : {};
        if (s?.error) {
          await guardar(u, 'recurrentes', { ...r, envio: { ...r.envio, intentos: r.envio.intentos + 1, error: s.error } });
          out.falloEnvio = s.error;
        } else {
          await guardar(u, 'recurrentes', { ...r, envio: undefined });
          if (f) out.enviada = f.id;
        }
      }
      return out;
    }, { espera: 0 });
  } catch (e) {
    if (e instanceof Ocupado) return { ocupado: true }; // otra pasada del cron la está procesando
    throw e;
  }
}
