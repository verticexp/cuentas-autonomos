import test from 'node:test';
import assert from 'node:assert/strict';
import { observarTecladoFormulario } from '../components/useTecladoFormulario.js';

test('teclado: oculta navegación al editar y la recupera al cerrar, sin confundir zoom', () => {
  const vista = new EventTarget();
  Object.assign(vista, { scale: 1, height: 800 });
  const documento = new EventTarget();
  documento.activeElement = { matches: () => true };
  let abierto;
  const limpiar = observarTecladoFormulario({ visualViewport: vista, innerHeight: 800 }, documento, v => { abierto = v; });
  assert.equal(abierto, false, 'teclado físico no reduce la pantalla');
  vista.height = 460;
  vista.dispatchEvent(new Event('resize'));
  assert.equal(abierto, true);
  vista.height = 800;
  vista.dispatchEvent(new Event('resize'));
  assert.equal(abierto, false, 'cerrar teclado conserva el foco y recupera navegación');
  Object.assign(vista, { height: 400, scale: 2 });
  vista.dispatchEvent(new Event('resize'));
  assert.equal(abierto, false, 'hacer zoom no es abrir el teclado');
  vista.scale = 1;
  documento.activeElement = { matches: () => false };
  documento.dispatchEvent(new Event('focusin'));
  assert.equal(abierto, false, 'no oculta navegación fuera del formulario');
  documento.activeElement = { matches: () => true };
  documento.dispatchEvent(new Event('focusin'));
  assert.equal(abierto, true);
  limpiar();
  assert.equal(abierto, false);
  vista.dispatchEvent(new Event('resize'));
  assert.equal(abierto, false, 'desmontar elimina los listeners');
});

test('teclado: funciona sin VisualViewport', () => {
  assert.doesNotThrow(() => observarTecladoFormulario({}, {}, () => {})());
});

test('teclado: detecta también el resize nativo de Capacitor', () => {
  const vista = Object.assign(new EventTarget(), { scale: 1, height: 800 });
  const ventana = { visualViewport: vista, innerHeight: 800, innerWidth: 390 };
  const documento = Object.assign(new EventTarget(), { activeElement: { matches: () => true } });
  let abierto;
  const limpiar = observarTecladoFormulario(ventana, documento, v => { abierto = v; });
  ventana.innerHeight = vista.height = 460;
  vista.dispatchEvent(new Event('resize'));
  assert.equal(abierto, true);
  ventana.innerHeight = vista.height = 800;
  vista.dispatchEvent(new Event('resize'));
  assert.equal(abierto, false);
  limpiar();
});
