// Diccionarios de la app (lib/i18n.js): un archivo por zona, con cada texto en castellano tal cual sale en el código y su
// traducción [catalán, inglés]. Traducciones pensadas en cada idioma, no palabra por palabra; los nombres oficiales
// (Modelo 303, IRPF, IVA, Verifactu) se quedan como son. Un hueco vacío ('') deja el castellano en ese idioma.
import comun from './comun.js';
import navegacion from './navegacion.js';
import facturas from './facturas.js';

export const ZONAS = { comun, navegacion, facturas };

const DIC = { ca: {}, en: {} };
for (const zona of Object.values(ZONAS)) {
  for (const [es, [ca, en]] of Object.entries(zona)) {
    if (ca) DIC.ca[es] = ca;
    if (en) DIC.en[es] = en;
  }
}

// El diccionario de un idioma; en castellano, ninguno (el texto ya es el del código).
export const diccionario = (id) => DIC[id] || null;
