// Mensajes guardados de un despacho (plantillas): lo que se escribe a menudo a los clientes, para ponerlo en el chat con un
// toque o mandarlo a varios a la vez. Van en el propio despacho (d.plantillas) y los usa todo el equipo. Sin guardar
// ninguna, se ofrecen unas de ejemplo (PLANTILLAS_INICIALES).
import { randomUUID } from 'node:crypto';
import { cambiarDespacho } from './despachos.js';

export const MAX_PLANTILLAS = 40;
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
export const PLANTILLAS_INICIALES = [
  { id: 'ini-tickets', titulo: 'Subir los tickets', texto: 'Hola, recuerda subir a Fisquo los tickets y facturas de gastos de este trimestre antes del día 10. Con una foto basta. ¡Gracias!' },
  { id: 'ini-presentado', titulo: 'Trimestre presentado', texto: 'Ya tenemos presentados los impuestos del trimestre. Te llegará el cargo en el banco el último día del plazo. Cualquier duda, me dices.' },
  { id: 'ini-cierre', titulo: 'Vamos a cerrar', texto: 'Esta semana cerramos tu trimestre. Si te falta apuntar alguna factura o gasto, hazlo antes del viernes, por favor.' },
  { id: 'ini-renta', titulo: 'Campaña de la Renta', texto: 'Empieza la campaña de la Renta. Para preparar tu declaración necesito tu número de referencia o tu Cl@ve, y los datos de otros ingresos que hayas tenido este año.' },
];
export const plantillasDe = (d) => (Array.isArray(d?.plantillas) ? d.plantillas : PLANTILLAS_INICIALES);

function limpia(b) {
  const titulo = texto(b.titulo, 60), cuerpo = texto(b.texto, 2000);
  if (!titulo) return { error: 'Ponle un nombre corto' };
  if (!cuerpo) return { error: 'Escribe el mensaje' };
  return { titulo, texto: cuerpo };
}

// Guardar (nueva, o cambiada con b.id) o borrar (borrar: true). → { plantillas } o { error }.
export function guardarPlantilla(despachoId, b = {}) {
  return cambiarDespacho(despachoId, (d) => {
    const lista = plantillasDe(d).map((p) => ({ ...p }));
    let nueva;
    if (b.borrar) nueva = lista.filter((p) => p.id !== b.id);
    else {
      const p = limpia(b);
      if (p.error) return p;
      if (b.id && lista.some((x) => x.id === b.id)) nueva = lista.map((x) => (x.id === b.id ? { ...x, ...p } : x));
      else {
        if (lista.length >= MAX_PLANTILLAS) return { error: `Como mucho ${MAX_PLANTILLAS} mensajes guardados: borra los que ya no uses`, status: 409 };
        nueva = [...lista, { id: randomUUID().slice(0, 8), ...p }];
      }
    }
    return { despacho: { ...d, plantillas: nueva }, plantillas: nueva };
  });
}
