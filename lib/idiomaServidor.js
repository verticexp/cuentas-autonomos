// El idioma de la app en el servidor (lib/i18n.js): la cookie de Ajustes o, si no, el del iPhone o el navegador.
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { idiomaDe, traductor } from './i18n.js';
import { diccionario } from './textos/index.js';

export const idiomaActual = cache(async () => idiomaDe({
  cookie: (await cookies()).get('idioma')?.value,
  aceptados: (await headers()).get('accept-language'),
}));

// const tr = await textos(); tr('Facturas') → «Factures» en catalán.
export const textos = cache(async () => traductor(diccionario(await idiomaActual())));
