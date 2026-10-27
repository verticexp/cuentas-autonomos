import test from 'node:test';
import assert from 'node:assert/strict';
import { crearPasosHistorial } from '../lib/pasosHistorial.js';

class HistorialFalso extends EventTarget {
  constructor(estado = null) {
    super();
    this.entradas = [{ estado: { anterior: true }, url: '/anterior' }, { estado: structuredClone(estado), url: '/formulario' }];
    this.indice = 1;
    this.llamadas = [];
  }
  get state() { return this.entradas[this.indice].estado; }
  get length() { return this.entradas.length; }
  get url() { return this.entradas[this.indice].url; }
  pushState(estado, titulo, url) {
    this.llamadas.push({ metodo: 'pushState', argumentos: [...arguments] });
    const entrada = { estado: structuredClone(estado), url: url ?? this.url };
    this.entradas.splice(this.indice + 1, Infinity, entrada);
    this.indice++;
  }
  replaceState(estado, titulo, url) {
    this.llamadas.push({ metodo: 'replaceState', argumentos: [...arguments] });
    this.entradas[this.indice] = { estado: structuredClone(estado), url: url ?? this.url };
  }
  back() { this.go(-1); }
  go(delta) {
    this.llamadas.push({ metodo: 'go', argumentos: [delta] });
    const destino = this.indice + delta;
    if (!delta || destino < 0 || destino >= this.length) return;
    // La navegación entrega popstate después de que vuelva back()/go().
    queueMicrotask(() => {
      this.indice = destino;
      const evento = new Event('popstate');
      evento.state = this.state;
      this.dispatchEvent(evento);
    });
  }
}

function formulario({ base = 0, total = 5, estado = { __NA: true, arbol: ['registro'] } } = {}) {
  const history = new HistorialFalso(estado);
  let paso = base, bloqueado = false;
  const cambios = [];
  const pasos = crearPasosHistorial(history, {
    base, total,
    leerPaso: () => paso,
    cambiarPaso: (n) => { cambios.push(n); paso = n; },
    estaBloqueado: () => bloqueado,
  });
  pasos.iniciar();
  history.addEventListener('popstate', pasos.alVolver);
  return {
    history, pasos, cambios,
    get paso() { return paso; },
    bloquear(valor) { bloqueado = valor; },
  };
}

test('avanzar apila sin URL, conserva el estado de Next y después cambia el paso', () => {
  const f = formulario();
  const previo = structuredClone(f.history.state);
  f.pasos.avanzar(1);
  assert.equal(f.history.length, 3);
  assert.equal(f.history.url, '/formulario');
  assert.deepEqual(f.history.state, { ...previo, __paso: 1 });
  assert.deepEqual(f.history.entradas[1].estado, previo);
  assert.deepEqual(f.history.llamadas[0], { metodo: 'pushState', argumentos: [{ ...previo, __paso: 1 }, ''] });
  assert.equal(f.paso, 1);
  let estadoAlCambiar;
  const pasos = crearPasosHistorial(f.history, {
    base: 0, total: 5, leerPaso: () => 1,
    cambiarPaso: () => { estadoAlCambiar = f.history.state.__paso; },
  });
  pasos.avanzar(2);
  assert.equal(estadoAlCambiar, 2);
});

for (const base of [0, 1, 2]) {
  test(`back vuelve por popstate y una entrada sin __paso recupera la base ${base}`, async () => {
    const f = formulario({ base });
    f.pasos.avanzar(base + 1);
    f.pasos.avanzar(base + 2);
    f.pasos.atras();
    assert.equal(f.paso, base + 2);
    await Promise.resolve();
    assert.equal(f.paso, base + 1);
    f.pasos.atras();
    await Promise.resolve();
    assert.equal(f.paso, base);
    assert.equal(f.history.state.__paso, undefined);
  });
}

test('desde el primer paso, back sale sin tocar el paso ni crear entradas', async () => {
  const f = formulario();
  f.pasos.atras();
  await Promise.resolve();
  assert.equal(f.history.url, '/anterior');
  assert.equal(f.paso, 0);
  assert.deepEqual(f.cambios, []);
  assert.equal(f.history.length, 2);
});

test('el salto para corregir un error usa go y solo popstate cambia el paso', async () => {
  const f = formulario({ base: 1 });
  for (const n of [2, 3, 4]) f.pasos.avanzar(n);
  f.pasos.saltar(1);
  assert.deepEqual(f.history.llamadas.at(-1), { metodo: 'go', argumentos: [-3] });
  assert.equal(f.paso, 4);
  await Promise.resolve();
  assert.equal(f.paso, 1);
  assert.equal(f.history.length, 5);
});

test('sin marca de paso, el salto sustituye la entrada conservando el estado', () => {
  const f = formulario({ base: 1 });
  const previo = structuredClone(f.history.state);
  f.pasos.saltar(3);
  assert.equal(f.paso, 3);
  assert.equal(f.history.length, 2);
  assert.deepEqual(f.history.llamadas.at(-1), { metodo: 'replaceState', argumentos: [{ ...previo, __paso: 3 }, ''] });
});

test('corregir el paso actual no hace go(0), que recargaría la página', () => {
  const f = formulario({ base: 1 });
  f.pasos.avanzar(2);
  const llamadas = f.history.llamadas.length;
  f.pasos.saltar(2);
  assert.equal(f.history.llamadas.length, llamadas);
  assert.equal(f.paso, 2);
});

test('al montar se borra __paso, conservando el estado y empezando en la base', () => {
  const f = formulario({ base: 1, estado: { __NA: true, arbol: ['registro'], __paso: 3 } });
  assert.equal(f.paso, 1);
  assert.deepEqual(f.history.state, { __NA: true, arbol: ['registro'] });
  assert.equal(f.history.length, 2);
  assert.equal(f.history.llamadas[0].argumentos.length, 2);
  f.pasos.iniciar();
  assert.equal(f.history.llamadas.length, 1);
});

test('popstate durante el guardado vuelve a apilar el paso actual sin cambiarlo', async () => {
  const f = formulario();
  f.pasos.avanzar(1);
  f.pasos.avanzar(2);
  f.bloquear(true);
  f.pasos.atras();
  await Promise.resolve();
  assert.equal(f.paso, 2);
  assert.deepEqual(f.cambios, [1, 2]);
  assert.deepEqual(f.history.state, { __NA: true, arbol: ['registro'], __paso: 2 });
  assert.equal(f.history.llamadas.at(-1).metodo, 'pushState');
  assert.equal(f.history.llamadas.at(-1).argumentos.length, 2);
  f.bloquear(false);
  f.pasos.atras();
  await Promise.resolve();
  assert.equal(f.paso, 1);
});

test('popstate bloqueado en el primer paso también conserva su estado actual', async () => {
  const f = formulario({ base: 1 });
  f.bloquear(true);
  f.pasos.atras();
  await Promise.resolve();
  assert.equal(f.paso, 1);
  assert.deepEqual(f.cambios, []);
  assert.deepEqual(f.history.state, { anterior: true, __paso: 1 });
});

test('la entrada final permite volver al último paso aunque su número sea el mismo', async () => {
  const f = formulario({ total: 3 });
  f.pasos.avanzar(1);
  f.pasos.avanzar(2);
  f.pasos.avanzar(2);
  f.cambios.length = 0;
  f.pasos.atras();
  await Promise.resolve();
  assert.deepEqual(f.cambios, [2]);
});

test('el botón adelante del navegador recupera el paso de su entrada', async () => {
  const f = formulario();
  f.pasos.avanzar(1);
  f.pasos.atras();
  await Promise.resolve();
  f.history.go(1);
  await Promise.resolve();
  assert.equal(f.paso, 1);
});

test('popstate solo admite marcas enteras dentro del rango; el resto vuelve a la base', () => {
  for (const marcado of [undefined, null, '2', 1.5, -1, 0, 5, NaN]) {
    const f = formulario({ base: 1 });
    f.pasos.avanzar(3);
    f.history.replaceState({ ...f.history.state, __paso: marcado }, '');
    f.history.dispatchEvent(new Event('popstate'));
    assert.equal(f.paso, 1, `marca: ${String(marcado)}`);
  }
});

test('avanzar y saltar ignoran destinos inválidos', () => {
  const f = formulario({ base: 1 });
  for (const n of [0, 5, -1, 2.5, '2', null, undefined]) {
    f.pasos.avanzar(n);
    f.pasos.saltar(n);
  }
  assert.equal(f.history.length, 2);
  assert.deepEqual(f.history.llamadas, []);
  assert.deepEqual(f.cambios, []);
});

test('avanzar admite history.state nulo', () => {
  const f = formulario({ estado: null });
  f.pasos.avanzar(1);
  assert.deepEqual(f.history.state, { __paso: 1 });
});
