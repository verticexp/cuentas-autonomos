// «Qué hacer hoy» en la portada del móvil: las cosas que piden una acción, de la más urgente a la menos.
// Solo usa lo que el panel ya tiene calculado (lib/panelCache.js): no añade lecturas a la base de datos.
import { eur, fechaTexto } from './formato.js';

const DIAS_AVISO_HACIENDA = 15;
const plural = (n, uno, varios) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

// vencidas: { n, nombres }; hacienda: { dias, importe } (si hay algo que pagar en este plazo); teso: el mínimo previsto { fecha, saldo }.
export function accionesHoy({ vencidas = null, hacienda = null, teso = null } = {}) {
  const lista = [];
  if (hacienda && hacienda.importe > 0 && hacienda.dias <= DIAS_AVISO_HACIENDA) {
    const d = hacienda.dias;
    lista.push({
      id: 'hacienda', tono: d <= 3 ? 'rojo' : 'naranja', prioridad: d <= 3 ? 0 : 3, href: '/modelos', cta: 'Ver impuestos', icono: 'hacienda',
      titulo: d === 0 ? 'Hacienda: hoy es el último día' : d === 1 ? 'Hacienda: queda 1 día' : `Hacienda en ${d} días`,
      detalle: `${eur(hacienda.importe)} a pagar`,
    });
  }
  if (teso && teso.saldo < 0) {
    lista.push({
      id: 'tesoreria', tono: 'rojo', prioridad: 1, href: '/tesoreria', cta: 'Ver tesorería', icono: 'beneficio',
      // Es el punto más bajo de la previsión, no el día en que el saldo pasa a negativo: se dice como en Tesorería.
      titulo: `El ${fechaTexto(teso.fecha)} te quedarías en ${eur(teso.saldo)}`, detalle: 'Es el saldo más bajo previsto: adelanta cobros o retrasa pagos',
    });
  }
  if (vencidas && vencidas.n > 0) {
    lista.push({
      id: 'vencidas', tono: 'rojo', prioridad: 2, href: '/facturas?estado=vencidas', cta: 'Reclamar', icono: 'cobrar',
      titulo: plural(vencidas.n, 'factura vencida', 'facturas vencidas'), detalle: (vencidas.nombres || []).filter(Boolean).join(', '),
    });
  }
  return lista.sort((a, b) => a.prioridad - b.prioridad);
}
