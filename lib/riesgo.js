// Riesgo de un cliente: lo que nos debe (facturas sin cobrar o cobradas solo en parte, con el saldo de las
// rectificativas sin liquidar) frente a su riesgo máximo. Lógica pura; la lectura de facturas está en lib/tercerosServidor.js.
import { pendienteDe, r2 } from './calculos.js';
import { eur } from './formato.js';

const cent = (x) => Math.round((Number(x) || 0) * 100);

// Lo que debe el cliente hoy: la suma de lo pendiente de sus facturas (una rectificativa sin liquidar resta). Nunca negativo.
export const riesgoDe = (facturas) => Math.max(0, r2((facturas || []).reduce((s, f) => s + pendienteDe(f), 0)));

// Hay límite si riesgoMax es un número (0 = nada a crédito); vacío o ausente, sin límite.
export const tieneLimite = (ficha) => ficha?.riesgoMax !== undefined && ficha?.riesgoMax !== null && ficha?.riesgoMax !== '' && Number.isFinite(Number(ficha.riesgoMax));

// ¿Cabe `incremento` más de riesgo? Lo que no suma riesgo (incremento <= 0: cobros, rectificativas, facturas ya cobradas)
// nunca se bloquea, aunque el cliente ya esté por encima de su límite. Todo en céntimos: sin errores de coma flotante.
export function evaluarRiesgo({ limite, riesgo, incremento, cliente = '' }) {
  const actual = r2(Number(riesgo) || 0);
  const mas = r2(Number(incremento) || 0);
  if (limite === undefined || limite === null || limite === '' || !Number.isFinite(Number(limite))) return { ok: true, limite: null, riesgo: actual, nuevo: r2(actual + mas), disponible: null, exceso: 0 };
  const tope = r2(Number(limite));
  const nuevo = r2(actual + mas);
  const disponible = Math.max(0, r2(tope - actual));
  const exceso = Math.max(0, r2(nuevo - tope));
  const ok = mas <= 0 || cent(nuevo) <= cent(tope);
  const base = { ok, limite: tope, riesgo: actual, nuevo, disponible, exceso: ok ? 0 : exceso };
  if (ok) return base;
  const de = cliente ? ` de ${cliente}` : '';
  return { ...base, error: `Se supera el riesgo máximo${de}: con ${eur(mas)} más pasaría a deber ${eur(nuevo)} y su límite es ${eur(tope)} (ahora debe ${eur(actual)}, le quedan ${eur(disponible)}). Cobra facturas pendientes o sube el límite en su ficha.` };
}
