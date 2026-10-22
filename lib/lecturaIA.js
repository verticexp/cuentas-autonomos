// Lectura con IA de un ticket o factura con la cuota de escaneos de la empresa (lib/cuotasIA.js). La usan el escáner de
// Gastos (app/api/gastos/ticket) y la bandeja de facturas (lib/bandejaServidor.js), así las dos cuentan igual las páginas.
import { concurrencia } from './limite.js';
import { hoy } from './formato.js';
import { iaLista, leerTicket, limpiarTicket, validarEntradaIA } from './ticket.js';
import { consumirEscaneos, cupoEscaneos, paginasIA, registrarConsumoIA } from './cuotasIA.js';

// base64 y tipo ya comprobados (imagen JPG, PNG o WebP, o PDF). Devuelve { gasto, cupo } o { error, status, cupo?,
// sinCupo?, ocupado? }. No se reintenta sola: una conexión interrumpida puede haber generado un cargo.
export async function leerConCupo(u, base64, tipo) {
  if (!iaLista()) return { error: 'La lectura de tickets aún no está configurada.', status: 503 };
  const archivo = await paginasIA(Buffer.from(base64, 'base64'), tipo);
  if (archivo.error) return { error: archivo.error, status: 400 };
  let reserva;
  const r = await concurrencia('ticket', u.empresa, 3, 30000, () =>
    concurrencia('ia', 'global', 20, 60000, async () => {
      const cupo = await cupoEscaneos(u);
      if (archivo.paginas > cupo.restantes) { reserva = { error: 'No quedan suficientes páginas de lectura IA. Puedes registrar el gasto a mano o solicitar una ampliación.', cupo }; return { sinCupo: true }; }
      const preparacion = await validarEntradaIA(base64, tipo, archivo.paginas);
      if (preparacion.error) return { ...preparacion, sinEnvio: true, cupo };
      reserva = await consumirEscaneos(u, archivo.paginas);
      if (reserva.error) return { sinCupo: true };
      const lectura = await leerTicket(base64, tipo);
      await registrarConsumoIA(reserva, lectura.consumo);
      return lectura;
    }));
  if (r?.ocupado) return { ocupado: true, error: 'La lectura de tickets está ocupada. Espera unos segundos y prueba de nuevo.', status: 429 };
  if (r.sinCupo) return { sinCupo: true, error: reserva.error, cupo: reserva.cupo, status: 429 };
  if (r.sinEnvio) return { error: r.error, cupo: r.cupo, status: r.status };
  if (r.error) return { error: r.error, cupo: reserva.cupo, status: 502 };
  return { gasto: limpiarTicket(r.datos, hoy()), cupo: reserva.cupo, paginas: archivo.paginas };
}
