// Código promocional del registro: vale el de una gestoría (lib/gestorias.js, 3 meses de prueba) o el de otra empresa
// que recomienda Netto (lib/recomendaciones.js, un mes más: 2 en total). Si coincide con los dos, gana la gestoría.
import { gestoriaPorCodigo, PRUEBA_GESTORIA_DIAS } from './gestorias.js';
import { empresaPorCodigo, normalizarRef, RECOMENDACION_DIAS } from './recomendaciones.js';
import { PRUEBA_DIAS } from './prueba.js';

export const NO_VALIDO = 'Ese código promocional no existe o ya no está activo.';

// { tipo: 'gestoria', gestoria, dias } · { tipo: 'recomendacion', codigo, empresa, dias } · null.
export async function resolverCodigo(c) {
  if (typeof c !== 'string' || !c.trim()) return null;
  const gestoria = await gestoriaPorCodigo(c);
  if (gestoria) return { tipo: 'gestoria', gestoria, dias: PRUEBA_GESTORIA_DIAS };
  const empresa = await empresaPorCodigo(c);
  if (empresa) return { tipo: 'recomendacion', codigo: normalizarRef(c), empresa, dias: PRUEBA_DIAS + RECOMENDACION_DIAS };
  return null;
}

// Lo que se enseña al escribirlo en el registro.
export function textoCodigo(r) {
  return r.tipo === 'gestoria'
    ? `Código de ${r.gestoria.nombre}: tienes 3 meses gratis.`
    : `Te recomienda ${r.empresa.nombre}: tienes 2 meses gratis en lugar de uno.`;
}
