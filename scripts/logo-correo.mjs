// Genera el icono de Netto para los correos (public/correo/): los clientes de correo no muestran SVG.
// Uso: node scripts/logo-correo.mjs (volver a ejecutarlo si cambia el logo de components/Logo.js).
import { writeFile } from 'node:fs/promises';
import React from 'react';
import { ImageResponse } from 'next/og.js';
import { readFile } from 'node:fs/promises';

// components/Logo.js lleva JSX: se leen sus constantes como texto.
const fuente = await readFile(new URL('../components/Logo.js', import.meta.url), 'utf8');
const cte = (n) => fuente.match(new RegExp(`const ${n} = '([^']+)'`))[1];
const [G, N_VISTA, N_TRAZO] = ['G', 'N_VISTA', 'N_TRAZO'].map(cte);

const h = React.createElement;
const png = async (ruta, el, width, height) => {
  const r = new ImageResponse(el, { width, height });
  await writeFile(new URL(`../public/correo/${ruta}`, import.meta.url), Buffer.from(await r.arrayBuffer()));
  console.log(ruta, width, height);
};

// Icono: la N sobre el cuadrado oscuro con esquinas redondeadas (como el de la app), a 3x de 40×40.
await png('netto-icono.png', h('div', { style: { width: 120, height: 120, background: '#0F1F1B', borderRadius: 27, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
  h('svg', { width: 68, height: 68, viewBox: N_VISTA }, h('g', { transform: G, fill: '#FAFAF8' }, h('path', { d: N_TRAZO })))), 120, 120);
