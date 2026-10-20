import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');
const modulo = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const react = pathToFileURL(require.resolve('react')).href;
const dobles = {
  './Confirmar': modulo('export async function confirmar(){throw new Error("No debe haber confirmaciones durante el render");}'),
  'next/navigation': modulo('export const useRouter = () => ({refresh(){}});'),
  'next/link': modulo(`import React from ${JSON.stringify(react)}; export default function Link(p){return React.createElement('a',p);}`),
  // Estos flujos prueban remesas con documentos; el estado vacío se resuelve como dependencia de presentación.
  '@/components/Vacio': modulo('export default function Vacio(){return null;}'),
  '@/components/Acciones': modulo('export async function llamar(){throw new Error("No debe haber escrituras durante el render");}'),
};
async function componente(nombre, extra = '') {
  const fuente = await readFile(new URL(`../components/${nombre}.js`, import.meta.url), 'utf8');
  const { code } = transformSync(fuente + extra, {
    babelrc: false, configFile: false,
    presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]],
  });
  const resuelto = code.replace(/from (["'])([^"']+)\1/g, (_, comillas, ruta) => {
    const url = dobles[ruta] || (ruta.startsWith('@/lib/')
      ? new URL(`../lib/${ruta.slice(6)}.js`, import.meta.url).href
      : pathToFileURL(require.resolve(ruta)).href);
    return `from ${JSON.stringify(url)}`;
  });
  return import(modulo(resuelto));
}

test('revisar una coincidencia bancaria ofrece editar sin proponer borrar el gasto ni su justificante', async () => {
  const { Cargo } = await componente('RevisionGastos', '\nexport { Cargo };');
  const html = renderToStaticMarkup(React.createElement(Cargo, {
    abierto: true, abrir() {}, x: {
      m: { id: 'm1', fecha: '2026-10-17', importe: -121, concepto: 'Material' },
      sugerencia: { id: 'g1', fecha: '2026-10-16', importe: 121, texto: 'Material', segura: false }, otras: [],
    },
  }));
  assert.doesNotMatch(html, /eliminar gasto|borrar|no se puede deshacer/i);
  assert.match(html, /href="\/gastos\/g1"[^>]*>Revisar gasto<\/a>/);
  assert.match(html, />Emparejar<\/button>/);
});

for (const tipo of ['cobros', 'pagos']) test(`remesa de ${tipo}: descargar no marca documentos por defecto`, async () => {
  const { default: Remesas } = await componente('Remesas');
  const documento = { id: 'd1', grupo: 'c1', nombre: 'Empresa', concepto: 'Servicio', fecha: '2026-10-01', importe: 121 };
  const cuenta = { id: 'c1', iban: 'ES9121000418450200051332', mandato: { referencia: 'M1', fecha: '2026-01-01' } };
  const html = renderToStaticMarkup(React.createElement(Remesas, {
    puedeCobrar: tipo === 'cobros', puedePagar: tipo === 'pagos',
    facturas: [documento], gastos: [documento], domiciliaciones: [cuenta], cuentasProv: [cuenta],
    historial: [], hoy: '2026-10-17', fechaCobro: '2026-10-20', emisorCobros: true, emisorPagos: true,
  }));
  assert.match(html, /Marcar como/);
  assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
  assert.match(html, /seguirán pendientes/);
});
