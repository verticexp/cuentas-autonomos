import { Bricolage_Grotesque, Geist } from 'next/font/google';

// Letra de la marca: toda la web pública.
export const fuente = Bricolage_Grotesque({ subsets: ['latin'], display: 'swap', variable: '--f-marca' });
// Títulos y cifras grandes de la app (app/v2.css): más sobria y legible en importes.
export const titulos = Geist({ subsets: ['latin'], display: 'swap', variable: '--f-titulos' });
