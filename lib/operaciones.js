// Clasificación de las operaciones (auditoría F10): por qué una factura, o su parte sin IVA, no lleva IVA español.
// Se elige en la factura (`operacion`); si no, se deduce como hasta ahora por el NIF del cliente. De aquí salen el 303
// (casillas de 2026: 59, 60, 120 y 122), el 349, los libros registro y la clave de Verifactu.
// REVISAR con la asesoría (⚖): la matriz completa y los casos no cubiertos (ventanilla única, recargo, régimen agrario…).
import { nifUE } from './calculos.js';
import { NIF_ES } from './verifactuXml.js';

// calificacion: CalificacionOperacion de Verifactu (S1 sujeta, S2 inversión del sujeto pasivo, N2 no sujeta por
// localización); exenta: causa de exención (OperacionExenta). casilla303: dónde va su base. clave349: E bienes, S servicios.
export const TIPOS_OPERACION = {
  exenta: { nombre: 'Exenta (art. 20 de la Ley del IVA: sanidad, enseñanza, seguros, alquiler de vivienda…)', exenta: 'E1' },
  'servicios-ue': { nombre: 'Servicios a una empresa de otro país de la UE (no sujeta, la declara el cliente)', calificacion: 'N2', casilla303: '59', clave349: 'S', ue: true },
  intracomunitaria: { nombre: 'Entrega de bienes a una empresa de otro país de la UE (exenta, art. 25)', exenta: 'E5', casilla303: '59', clave349: 'E', ue: true },
  exportacion: { nombre: 'Exportación de bienes fuera de la UE (exenta, art. 21)', exenta: 'E2', casilla303: '60' },
  'servicios-fuera': { nombre: 'Servicios a un cliente de fuera de la UE (no sujeta por localización)', calificacion: 'N2', casilla303: '120' },
  isp: { nombre: 'Inversión del sujeto pasivo en España (art. 84.Uno.2º: obras, oro, residuos…): el IVA lo declara el cliente', calificacion: 'S2', casilla303: '122' },
};

const limpio = (nif) => String(nif || '').toUpperCase().replace(/[\s.-]/g, '').replace(/^ES(?=[0-9A-Z]{9}$)/, '');

// Operación de la parte sin IVA de una factura ('nacional' si no tiene líneas sin IVA).
export function operacionDe(f) {
  const lineas = f.lineas?.length ? f.lineas : [{ ivaPct: f.ivaPct }];
  if (!lineas.some((l) => Number(l.ivaPct) === 0)) return 'nacional';
  if (TIPOS_OPERACION[f.operacion]) return f.operacion;
  const nif = limpio(f.cliente?.nif);
  if (nifUE(nif)) return 'servicios-ue';
  if (nif && !NIF_ES.test(nif)) return 'servicios-fuera';
  return 'exenta';
}
export const tipoOperacion = (f) => TIPOS_OPERACION[operacionDe(f)] || null;

// Comprobación para la validación: { campo, error } o null.
export function errorOperacion(b) {
  if (b.operacion === undefined || b.operacion === '' || b.operacion === null) return null;
  const t = TIPOS_OPERACION[b.operacion];
  if (!t) return 'Operación no válida';
  const lineas = Array.isArray(b.lineas) && b.lineas.length ? b.lineas : [{ ivaPct: b.ivaPct }];
  if (!lineas.some((l) => Number(l.ivaPct) === 0)) return 'Solo se indica el motivo cuando hay conceptos sin IVA';
  if (t.ue && !nifUE(b.cliente?.nif)) return 'Pon el NIF-IVA del cliente de la UE (con el prefijo de su país, comprobado en VIES)';
  return null;
}
