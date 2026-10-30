// Diccionarios de la app (lib/i18n.js): un archivo por zona, con cada texto en castellano tal cual sale en el código y su
// traducción [catalán, inglés]. Traducciones pensadas en cada idioma, no palabra por palabra; los nombres oficiales
// (Modelo 303, IRPF, IVA, Verifactu) se quedan como son. Un hueco vacío ('') deja el castellano en ese idioma.
import { idiomaAppValido, traductor } from '../i18n.js';
import comun from './comun.js';
import navegacion from './navegacion.js';
import comunes from './comunes.js';
import entrada from './entrada.js';
import ajustes from './ajustes.js';
import gastos from './gastos.js';
import impuestos from './impuestos.js';
import equipo from './equipo.js';
import facturas from './facturas.js';
import despacho from './despacho.js';
import contabilidad from './contabilidad.js';
import cobros from './cobros.js';
import errores from './errores.js';
import web from './web.js';
import correos from './correos.js';
import documentos from './documentos.js';
import whatsapp from './whatsapp.js';

export const ZONAS = { comun, navegacion, comunes, entrada, ajustes, gastos, impuestos, equipo, facturas, despacho, contabilidad, cobros, errores, web, correos, documentos, whatsapp };

const DIC = { ca: {}, en: {} };
for (const zona of Object.values(ZONAS)) {
  for (const [es, [ca, en]] of Object.entries(zona)) {
    if (ca) DIC.ca[es] = ca;
    if (en) DIC.en[es] = en;
  }
}

// El diccionario de un idioma; en castellano, ninguno (el texto ya es el del código).
export const diccionario = (id) => DIC[id] || null;

// El traductor de un idioma guardado (el del perfil de una persona, para correos y avisos); si no es válido, castellano.
export const traductorDe = (idioma) => (idiomaAppValido(idioma) ? traductor(diccionario(idioma), idioma) : traductor(null));
