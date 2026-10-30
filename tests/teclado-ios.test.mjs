import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CAMPO_CON_TECLADO } from '../components/useTecladoFormulario.js';
import { SIN_BARRA } from '../lib/transicion.js';

const leer = (f) => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('teclado: la barra de pestañas se esconde con cualquier campo, en cualquier pantalla', async () => {
  // Antes solo en Gastos e Impuestos: en la ficha de un cliente la barra se subía encima del teclado.
  assert.doesNotMatch(await leer('components/TabBar.js'), /useTecladoFormulario\(movil &&/);
  assert.match(await leer('components/NavDespacho.js'), /data-teclado=\{teclado/);
  for (const c of ['textarea', 'select', 'input:not([type="checkbox"])']) assert.ok(CAMPO_CON_TECLADO.includes(c), c);
  assert.doesNotMatch(CAMPO_CON_TECLADO, /\.formulario/);
});

test('chat de ayuda: pantalla propia a pantalla completa, sin barra de pestañas en el móvil', async () => {
  assert.ok(SIN_BARRA.test('/ayuda'));
  assert.ok(!SIN_BARRA.test('/ayudas'));
  assert.match(await leer('components/AyudaChat.js'), /useTecladoChat\(lista, '\.desp-chat-pagina'/);
  assert.match(await leer('components/Ayuda.js'), /href="\/ayuda"/);
  assert.match(await leer('lib/soporteServidor.js'), /url: '\/ayuda'/);
});

test('sin conexión: animación de inicio, aviso en tres idiomas y vuelta sola al servidor de la app', async () => {
  const h = await leer('mobile/www/sin-conexion.html');
  assert.match(h, /class="logo-trazo"/);
  for (const t of ['Sin conexión a internet', 'Sense connexió a internet', 'No internet connection']) assert.ok(h.includes(t), t);
  assert.match(h, /window\.fisquoServidor/);
  assert.match(h, /addEventListener\('online'/);
  const vc = await leer('mobile/ios/App/App/FisquoViewController.swift');
  assert.match(vc, /NWPathMonitor/);
  assert.match(vc, /name: "conexion"/);
  // Una navegación cancelada no es falta de red.
  assert.match(await leer('mobile/ios/App/App/DelegadoWeb.swift'), /NSURLErrorCancelled/);
});
