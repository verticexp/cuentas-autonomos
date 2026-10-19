// Genera los PNG del logo de Netto para los correos (public/correo/): los clientes de correo no muestran SVG.
// Uso: node scripts/logo-correo.mjs (volver a ejecutarlo si cambia el logo de components/Logo.js).
import { writeFile } from 'node:fs/promises';
import React from 'react';
import { ImageResponse } from 'next/og.js';
import { readFile } from 'node:fs/promises';

// components/Logo.js lleva JSX: se leen sus constantes como texto.
const fuente = await readFile(new URL('../components/Logo.js', import.meta.url), 'utf8');
const cte = (n) => fuente.match(new RegExp(`const ${n} = '([^']+)'`))[1];
const [G, N_VISTA, N_TRAZO, N_EN_LOGO, DESPLAZA] = ['G', 'N_VISTA', 'N_TRAZO', 'N_EN_LOGO', 'DESPLAZA'].map(cte);
const LETRAS = [...fuente.match(/const LETRAS = \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

const h = React.createElement;
const png = async (ruta, el, width, height) => {
  const r = new ImageResponse(el, { width, height });
  await writeFile(new URL(`../public/correo/${ruta}`, import.meta.url), Buffer.from(await r.arrayBuffer()));
  console.log(ruta, width, height);
};
const palabra = (color, width, height) => h('div', { style: { width, height, display: 'flex' } },
  h('svg', { width, height, viewBox: '0 130 2440 615' },
    ...LETRAS.map((d, i) => h('g', { key: i, transform: `${DESPLAZA} ${G}`, fill: color }, h('path', { d }))),
    h('g', { transform: `${N_EN_LOGO} ${G}`, fill: color }, h('path', { d: N_TRAZO }))));

// Logotipo «Netto» en claro (sobre la cabecera oscura) y en oscuro, a 3x de 132×33.
await png('netto-logo-claro.png', palabra('#FAFAF8', 396, 100), 396, 100);
await png('netto-logo.png', palabra('#0F1F1B', 396, 100), 396, 100);
// Icono: la N sobre el cuadrado oscuro con esquinas redondeadas (como el de la app), a 3x de 28×28.
await png('netto-icono.png', h('div', { style: { width: 84, height: 84, background: '#0F1F1B', borderRadius: 19, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
  h('svg', { width: 48, height: 48, viewBox: N_VISTA }, h('g', { transform: G, fill: '#FAFAF8' }, h('path', { d: N_TRAZO })))), 84, 84);
