// Genera el icono de Fisquo para los correos (public/correo/) y el icono y la pantalla de carga de la app de iOS: los clientes de correo no muestran SVG.
// Uso: node scripts/logo-correo.mjs (volver a ejecutarlo si cambia el logo de components/Logo.js).
import { writeFile } from 'node:fs/promises';
import React from 'react';
import { ImageResponse } from 'next/og.js';
import { readFile } from 'node:fs/promises';

// components/Logo.js lleva JSX: se leen sus constantes como texto.
const fuente = await readFile(new URL('../components/Logo.js', import.meta.url), 'utf8');
const cte = (n) => fuente.match(new RegExp(`const ${n} = '([^']+)'`))[1];
const [F_VISTA, F_TRAZO] = ['F_VISTA', 'F_TRAZO'].map(cte);

const h = React.createElement;
const png = async (ruta, el, width, height) => {
  const r = new ImageResponse(el, { width, height });
  await writeFile(new URL(ruta.includes('/') ? `../${ruta}` : `../public/correo/${ruta}`, import.meta.url), Buffer.from(await r.arrayBuffer()));
  console.log(ruta, width, height);
};

const F = (px) => h('svg', { width: px, height: px, viewBox: F_VISTA }, h('path', { d: F_TRAZO, fill: '#FAFAF8' }));
const fondo = (lado, px, extra = {}) => h('div', { style: { width: lado, height: lado, background: '#0F1F1B', display: 'flex', alignItems: 'center', justifyContent: 'center', ...extra } }, F(px));

// Icono: la F sobre el cuadrado oscuro con esquinas redondeadas (como el de la app), a 3x de 40×40.
await png('fisquo-icono.png', fondo(120, 64, { borderRadius: 27 }), 120, 120);

// App de iOS: icono a sangre (iOS redondea las esquinas) y pantalla de lanzamiento solo en verde: la F la dibuja la
// animación de la web (components/Arranque.js) sobre el mismo verde, así no se ve dos veces ni hay corte.
const IOS = 'mobile/ios/App/App/Assets.xcassets';
await png(`${IOS}/AppIcon.appiconset/AppIcon-512@2x.png`, fondo(1024, 560), 1024, 1024);
for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  await png(`${IOS}/Splash.imageset/${n}`, h('div', { style: { width: 2732, height: 2732, background: '#0F1F1B', display: 'flex' } }), 2732, 2732);
