import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { resumenAdmin } from '../lib/admin.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('next/dist/compiled/babel/core');
const modulo = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const dobles = {
  './Confirmar': modulo('export async function confirmar(){ throw new Error("Clasificar no cambia el plan"); }'),
  'next/navigation': modulo('export const useRouter = () => ({ refresh(){ globalThis.__adminUIRefrescos++; } });'),
  '@/components/Vacio': modulo('export default function Vacio(){ return null; }'),
  '@/components/web/datos': new URL('../components/web/datos.js', import.meta.url).href,
};
const opciones = { babelrc: false, configFile: false, presets: [[require('next/dist/compiled/babel/preset-react'), { runtime: 'automatic' }]] };
const fuente = await readFile(new URL('../components/AdminEmpresas.js', import.meta.url), 'utf8');
const { code } = transformSync(fuente, opciones);
const resuelto = code.replace(/from (["'])([^"']+)\1/g, (_, _comillas, ruta) => `from ${JSON.stringify(dobles[ruta] || (ruta.startsWith('@/lib/') ? new URL(`../lib/${ruta.slice(6)}.js`, import.meta.url).href : pathToFileURL(require.resolve(ruta)).href))}`);
const { default: AdminEmpresas } = await import(modulo(resuelto));

test('administración: filtro y marca reversible, demos protegidas y error de guardado visible', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="raiz"></div></body></html>', { url: 'https://fisquo.test/admin' });
  const anteriores = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT', 'fetch', '__adminUIRefrescos'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true, __adminUIRefrescos: 0 });
  const llamadas = [];
  globalThis.fetch = async (_url, opciones) => { llamadas.push(JSON.parse(opciones.body)); return Response.json({ ok: true }); };
  const root = createRoot(document.getElementById('raiz'));
  const plan = { tipo: 'aut', nombre: 'Pro', hasta: '2026-11-30' };
  const empresas = [{ id: 'real', nombre: 'Cliente real', plan }, { id: 'demo', nombre: 'Demo marcada', demo: true, plan }];
  const render = () => act(async () => root.render(React.createElement(AdminEmpresas, { filas: resumenAdmin({ empresas }).filas })));
  const boton = (texto) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(texto));
  const click = (b) => act(async () => b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  try {
    await render();
    assert.equal(llamadas.length, 0);
    assert.equal(document.querySelectorAll('.adm-tabla > li').length, 2);
    assert.match(document.body.textContent, /Interna\/demo · excluida/);
    await click(boton('Cliente real'));
    await click(boton('Marcar como interna/demo'));
    assert.deepEqual(llamadas, [{ empresa: 'real', accion: 'interna', interna: true }]);
    assert.equal(globalThis.__adminUIRefrescos, 1);
    empresas[0].interna = true;
    await render();
    assert.match(document.body.textContent, /Cuenta interna\/demo: excluida/);
    await click(boton('Incluir en las cifras'));
    assert.deepEqual(llamadas.at(-1), { empresa: 'real', accion: 'interna', interna: false });
    empresas[0].interna = false;
    await render();
    globalThis.fetch = async () => Response.json({ error: 'No se ha podido guardar la marca.' }, { status: 503 });
    await click(boton('Marcar como interna/demo'));
    assert.equal(document.querySelector('[role="status"]').textContent, 'No se ha podido guardar la marca.');
    assert.equal(globalThis.__adminUIRefrescos, 2, 'un fallo no se presenta como guardado');
    await click(boton('Demo marcada'));
    assert.match(document.body.textContent, /Cuenta de demostración: siempre se excluye/);
    assert.equal(boton('Incluir en las cifras'), undefined);
    assert.equal(boton('Marcar como interna/demo'), undefined);
    const filtro = document.querySelector('[aria-label="Filtrar por cuenta interna/demo"]');
    await act(async () => { filtro.value = 'internas'; filtro.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    assert.equal(document.querySelectorAll('.adm-tabla > li').length, 1);
    assert.equal(boton('Cliente real'), undefined);
    await act(async () => { filtro.value = 'comerciales'; filtro.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    assert.equal(document.querySelectorAll('.adm-tabla > li').length, 1);
    assert.equal(boton('Demo marcada'), undefined);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [k, descriptor] of Object.entries(anteriores)) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k]; }
  }
});

test('la página del panel compila con el recuento separado', async () => {
  const pagina = await readFile(new URL('../app/admin/page.js', import.meta.url), 'utf8');
  assert.ok(transformSync(pagina, opciones).code);
});
