import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearSinGuardar } from '../lib/sinGuardar.js';

// «¿Salir sin guardar?» (lib/sinGuardar.js) sobre un navegador de mentira con lib/transicion.js instalado de verdad: su espejo
// del historial, sus parches de pushState/replaceState y volverA/navegar. Los recorridos en el navegador están en
// tests/e2e/atras-movil.mjs.
let carga = 0;
async function pantalla({ entradas = ['/lista', '/formulario'], estados = [], respuestas = [], bloqueada = false } = {}) {
  // popstate como en el navegador: cada oyente en su orden y, entre uno y otro, toda la cola de microtareas (una promesa que
  // se resuelve en un oyente sigue antes del oyente siguiente).
  const vaciar = async () => { for (let k = 0; k < 30; k++) await null; };
  const oyentes = [];
  const ventana = {
    addEventListener(tipo, fn, opciones) { if (tipo === 'popstate') oyentes.push({ fn, una: Boolean(opciones?.once) }); },
    async popstate() {
      const evento = { type: 'popstate', state: lista[i].estado, url: lista[i].url };
      for (const o of [...oyentes]) {
        if (o.una) oyentes.splice(oyentes.indexOf(o), 1);
        o.fn(evento);
        await vaciar();
      }
    },
  };
  const lista = entradas.map((url, i) => ({ url, estado: { __NA: true, __idx: i, ...(estados[i] || {}) } }));
  let i = lista.length - 1;
  const origen = 'https://fisquo.test';
  const location = {
    get href() { return origen + lista[i].url; },
    get pathname() { return new URL(this.href).pathname; },
    get search() { return new URL(this.href).search; },
  };
  const direccion = (url) => { const x = new URL(url, location.href); return x.pathname + x.search; };
  const history = {
    get state() { return lista[i].estado; },
    get length() { return lista.length; },
    // La recolocación (scrollRestoration) va por entrada; la nueva copia la de la actual.
    get scrollRestoration() { return lista[i].modo || 'auto'; },
    set scrollRestoration(modo) { lista[i].modo = modo; },
    pushState(estado, _t, url) { lista.splice(i + 1, Infinity, { url: url == null ? lista[i].url : direccion(url), estado: structuredClone(estado), modo: lista[i].modo }); i++; },
    replaceState(estado, _t, url) { lista[i] = { url: url == null ? lista[i].url : direccion(url), estado: structuredClone(estado), modo: lista[i].modo }; },
    back() { this.go(-1); },
    forward() { this.go(1); },
    // Como en el navegador: popstate llega después, en otra tarea.
    go(d) {
      const destino = i + d;
      if (!d || destino < 0 || destino >= lista.length) return;
      setTimeout(() => { i = destino; ventana.popstate(); }, 1);
    },
  };
  const guardado = new Map([['fisquo-pila', JSON.stringify(entradas)]]);
  Object.assign(globalThis, {
    window: globalThis, history, location,
    sessionStorage: { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, String(v)) },
    addEventListener: (...a) => ventana.addEventListener(...a),
  });
  const t = await import(`../lib/transicion.js?carga=${++carga}`);
  t.instalarHistorial();
  const preguntas = [];
  const pendientes = [...respuestas];
  const cambios = [];
  let reloj = 1e6;
  // Next: lo que enseña (pantalla). Navegar lo cambia; al atender un popstate restaura la entrada a la que se llegó y, si
  // una navegación se le adelantó, la deshace (lo que pasaba en la app: «Crear ficha» se quedaba en el formulario).
  let enPantalla = lista[i].url;
  const router = {
    llamadas: [],
    back() { this.llamadas.push('back'); history.back(); },
    push(href) { this.llamadas.push(`push ${href}`); history.pushState({ __NA: true }, '', href); enPantalla = href; },
    replace(href) { this.llamadas.push(`replace ${href}`); history.replaceState({ __NA: true }, '', href); enPantalla = href; },
    refresh() { this.llamadas.push('refresh'); },
  };
  const gestor = crearSinGuardar({
    history, aqui: () => location.pathname + location.search,
    posicion: () => history.state.__idx, direccionEn: t.direccionEn, apilados: t.apilados,
    preguntar: (textos) => {
      preguntas.push(textos);
      const r = pendientes.shift();
      return typeof r === 'function' ? r() : Promise.resolve(Boolean(r));
    },
    salir: () => t.volverA(router, '/lista', 'atras'),
    bloqueada: () => bloqueada,
    alCambiar: (sucio) => cambios.push(sucio),
    ahora: () => reloj,
  });
  // Como en la app: GestoAtras instala el aviso antes de que el router de Next se ponga a escuchar.
  addEventListener('popstate', gestor.alVolver);
  addEventListener('popstate', (e) => { enPantalla = e.url; });
  t.alNavegar(gestor.antesDeNavegar);
  const fuente = gestor.registrar();
  return {
    t, history, router, gestor, fuente, preguntas, cambios,
    get pantalla() { return enPantalla; },
    pasar(ms) { reloj += ms; },
    get url() { return lista[i].url; },
    get indice() { return i; },
    get urls() { return lista.map((x) => x.url); },
    get modos() { return lista.map((x) => x.modo || 'auto'); },
    // Lo que hace una persona al escribir: una tecla (activación) y el formulario cambia.
    escribir() { gestor.tocar(); fuente.poner(true); },
    // El hook (components/useCambiosSinGuardar.js): guardado() y soltar().
    guardado() { fuente.poner(false); return gestor.soltar(); },
    soltar() { fuente.suspender(); return gestor.soltar(); },
  };
}
const calma = () => new Promise((r) => setTimeout(r, 30));

test('sin cambios, atrás sale sin preguntar y sin apilar nada', async () => {
  const p = await pantalla();
  p.gestor.tocar();
  p.fuente.poner(false);
  assert.equal(p.history.length, 2);
  p.history.back();
  await calma();
  assert.equal(p.url, '/lista');
  assert.deepEqual(p.preguntas, []);
});

test('al escribir se apila una entrada sin URL que conserva el estado de Next', async () => {
  const p = await pantalla();
  p.escribir();
  assert.deepEqual(p.urls, ['/lista', '/formulario', '/formulario']);
  assert.equal(p.indice, 2);
  assert.equal(p.history.state.__NA, true);
  assert.equal(p.history.state.__idx, 2);
  assert.ok(p.history.state.__sinGuardar);
  assert.equal(p.t.anterior(), '/formulario');
  assert.deepEqual(p.modos, ['auto', 'manual', 'manual'], 'el navegador no recoloca la pantalla al ir y venir entre las dos');
  // Más cambios no apilan más.
  p.escribir();
  assert.equal(p.history.length, 3);
  assert.deepEqual(p.cambios, [true]);
});

test('atrás con cambios pregunta; seguir editando vuelve a la entrada sin apilar otra', async () => {
  const p = await pantalla({ respuestas: [false] });
  p.escribir();
  const apilados = p.t.apilados();
  p.history.back();
  await calma();
  assert.equal(p.preguntas.length, 1);
  assert.equal(p.url, '/formulario');
  assert.equal(p.indice, 2, 'de vuelta en la entrada de aviso, con forward()');
  assert.equal(p.history.length, 3);
  assert.equal(p.t.apilados(), apilados, 'sin apilar otra: Chrome se saltaría el formulario');
  // Y el siguiente atrás vuelve a preguntar.
  p.history.back();
  await calma();
  assert.equal(p.preguntas.length, 2);
});

test('salir sin guardar sigue hacia atrás hasta la pantalla anterior y quita el aviso al recargar', async () => {
  const p = await pantalla({ respuestas: [true] });
  p.escribir();
  p.history.back();
  await calma();
  assert.equal(p.preguntas.length, 1);
  assert.equal(p.url, '/lista');
  assert.equal(p.pantalla, '/lista');
  assert.deepEqual(p.cambios, [true, false]);
  assert.deepEqual(p.router.llamadas, ['back']);
  assert.equal(p.modos[1], 'auto', 'el formulario vuelve a recolocarse al dejarlo');
});

test('abierto directamente (nada detrás), salir sin guardar lleva a la pantalla de su «‹ Atrás»', async () => {
  const p = await pantalla({ entradas: ['/formulario'], respuestas: [true] });
  p.escribir();
  p.history.back();
  await calma();
  assert.equal(p.preguntas.length, 1);
  assert.equal(p.url, '/lista');
  assert.equal(p.pantalla, '/lista', 'la sustitución va después de que Next atienda el atrás');
  assert.deepEqual(p.router.llamadas, ['replace /lista']);
});

test('sin un toque o una tecla desde la última entrada apilada, espera al siguiente para apilar', async () => {
  const p = await pantalla();
  p.fuente.poner(true); // cambió solo (una lectura que llega tarde, un autorrelleno) tras llegar a la pantalla
  assert.equal(p.history.length, 2);
  assert.deepEqual(p.cambios, [true], 'el aviso al recargar sí está desde ya');
  p.gestor.tocar();
  assert.equal(p.history.length, 3);
  assert.ok(p.history.state.__sinGuardar);
});

test('lo que cambia más de 8 s después del último toque (una lectura lenta) espera al siguiente para apilar', async () => {
  const p = await pantalla();
  p.gestor.tocar(); // «Escanear ticket»
  p.pasar(12000); // la lectura con IA tarda
  p.fuente.poner(true);
  assert.equal(p.history.length, 2, 'Safari se saltaría al volver una entrada apilada sin un toque reciente');
  p.gestor.tocar(); // toca un campo para revisarlo
  assert.equal(p.history.length, 3);
  assert.ok(p.history.state.__sinGuardar);
});

test('crear: guardar quita la entrada y la ficha nueva sustituye al formulario', async () => {
  const p = await pantalla();
  p.escribir();
  await p.guardado();
  assert.equal(p.indice, 1);
  assert.equal(p.history.scrollRestoration, 'auto');
  p.t.navegar(p.router, '/facturas/f1', 'fundido', undefined, true);
  assert.deepEqual(p.urls.slice(0, p.indice + 1), ['/lista', '/facturas/f1']);
  await calma();
  assert.equal(p.pantalla, '/facturas/f1', 'Next no deshace la navegación al atender la vuelta de la entrada de aviso');
  p.history.back();
  await calma();
  assert.equal(p.url, '/lista', 'atrás no vuelve al formulario ya enviado');
  assert.deepEqual(p.preguntas, []);
});

test('editar: guardar y volverA vuelve a la lista sin preguntar y refresca al llegar', async () => {
  const p = await pantalla();
  p.escribir();
  await p.guardado();
  p.t.volverA(p.router, '/lista', 'atras', true);
  await calma();
  assert.equal(p.url, '/lista');
  assert.deepEqual(p.router.llamadas, ['back', 'refresh']);
  assert.deepEqual(p.preguntas, []);
});

test('volverA o navegar con la entrada encima (borrar, descartar) la quitan antes sin preguntar', async () => {
  const p = await pantalla();
  p.escribir();
  p.t.volverA(p.router, '/lista', 'atras', true);
  assert.deepEqual(p.router.llamadas, [], 'espera a quitar la entrada de aviso');
  await calma();
  assert.equal(p.url, '/lista');
  assert.equal(p.pantalla, '/lista');
  assert.deepEqual(p.preguntas, []);
  assert.deepEqual(p.router.llamadas, ['back', 'refresh']);
  assert.deepEqual(p.cambios, [true, false]);
});

test('sin la entrada encima, volverA y navegar van en el momento', async () => {
  const p = await pantalla();
  p.t.volverA(p.router, '/lista');
  assert.deepEqual(p.router.llamadas, ['back']);
  await calma();
  p.t.navegar(p.router, '/gastos');
  assert.deepEqual(p.router.llamadas, ['back', 'push /gastos']);
});

test('un enlace desde la entrada de aviso la sustituye: detrás queda el formulario, como sin ella', async () => {
  const p = await pantalla();
  p.escribir();
  p.router.push('/gastos'); // un <Link> o router.push de Next: no pasa por navegar
  assert.deepEqual(p.urls, ['/lista', '/formulario', '/gastos']);
  p.fuente.quitar(); // el formulario se desmonta
  p.history.back();
  await calma();
  assert.equal(p.url, '/formulario');
  p.history.back();
  await calma();
  assert.equal(p.url, '/lista');
  assert.deepEqual(p.preguntas, []);
});

test('al refrescar, Next sustituye el estado pero la entrada sigue siendo de aviso', async () => {
  const p = await pantalla({ respuestas: [false] });
  p.escribir();
  p.history.replaceState({ __NA: true, arbol: 'refrescado' }, '', '/formulario');
  assert.ok(p.history.state.__sinGuardar);
  assert.equal(p.history.state.arbol, 'refrescado');
  p.history.back();
  await calma();
  assert.equal(p.preguntas.length, 1);
  // Con otra dirección (filtro, búsqueda) deja de serlo.
  p.history.replaceState({ __NA: true }, '', '/formulario?q=x');
  assert.equal(p.history.state.__sinGuardar, undefined);
});

test('«‹ Atrás» con cambios pregunta antes de tocar el historial; seguir editando lo deja igual', async () => {
  const p = await pantalla({ respuestas: [false] });
  p.escribir();
  let hecho = false;
  assert.equal(await p.gestor.salirSinGuardar(() => { hecho = true; }), false);
  await calma();
  assert.equal(hecho, false);
  assert.equal(p.indice, 2);
  assert.equal(p.preguntas.length, 1);
});

test('«‹ Atrás»: salir quita la entrada y vuelve una sola vez, con una sola pregunta', async () => {
  const p = await pantalla({ respuestas: [true] });
  p.escribir();
  assert.equal(await p.gestor.salirSinGuardar(() => p.t.volverA(p.router, '/lista')), true);
  await calma();
  assert.equal(p.url, '/lista');
  assert.equal(p.pantalla, '/lista');
  assert.equal(p.preguntas.length, 1);
  assert.deepEqual(p.cambios, [true, false]);
});

test('«‹ Atrás» sin cambios va en el momento; con la entrada encima pero sin cambios, la quita antes', async () => {
  const p = await pantalla();
  let veces = 0;
  p.gestor.salirSinGuardar(() => { veces++; });
  assert.equal(veces, 1);
  p.escribir();
  p.fuente.poner(false); // se borró lo escrito: la entrada sigue, sin nada que guardar
  await p.gestor.salirSinGuardar(() => { veces++; });
  assert.equal(veces, 2);
  assert.equal(p.indice, 1);
  assert.deepEqual(p.preguntas, []);
});

test('lo escrito y borrado deja la entrada: atrás la cruza sin preguntar', async () => {
  const p = await pantalla();
  p.escribir();
  p.fuente.poner(false);
  p.history.back();
  await calma();
  assert.equal(p.url, '/lista');
  assert.deepEqual(p.preguntas, []);
});

test('tras recargar con la entrada de aviso encima, atrás la cruza sin preguntar', async () => {
  const p = await pantalla({ entradas: ['/lista', '/formulario', '/formulario'], estados: [{}, {}, { __sinGuardar: 'de-antes' }] });
  assert.equal(p.gestor.encima(), true);
  p.history.back();
  await calma();
  assert.equal(p.url, '/lista');
  assert.deepEqual(p.preguntas, []);
});

test('si se sale de la pantalla con la pregunta abierta, no se fuerza adelante al cerrarla', async () => {
  let responder;
  const p = await pantalla({ respuestas: [() => new Promise((r) => { responder = r; })] });
  p.escribir();
  p.history.back();
  await calma();
  assert.equal(p.preguntas.length, 1);
  p.history.back(); // otro atrás con el diálogo abierto (Confirmar lo cancela al salir)
  await calma();
  responder(false);
  await calma();
  assert.equal(p.url, '/lista');
  assert.equal(p.indice, 0);
});

test('con la pantalla de bloqueo delante, atrás no pregunta y vuelve a la entrada de aviso', async () => {
  const p = await pantalla({ bloqueada: true });
  p.escribir();
  p.history.back();
  await calma();
  assert.deepEqual(p.preguntas, []);
  assert.equal(p.indice, 2);
});

test('guardar y vaciar (gasto nuevo): soltar deja de avisar hasta que el formulario vuelve a estar vacío', async () => {
  const p = await pantalla();
  p.escribir();
  await p.soltar();
  assert.equal(p.indice, 1);
  p.gestor.tocar();
  assert.equal(p.history.length, 3, 'sin apilar otra mientras sigue lo ya guardado');
  assert.equal(p.indice, 1);
  p.fuente.poner(false); // vaciado
  p.escribir(); // un gasto nuevo
  assert.equal(p.indice, 2);
  assert.ok(p.history.state.__sinGuardar);
});

test('la ficha guardada sin salir de la pantalla vuelve a avisar con los cambios siguientes', async () => {
  const p = await pantalla({ respuestas: [false] });
  p.escribir();
  await p.guardado();
  assert.equal(p.indice, 1);
  p.escribir();
  assert.equal(p.indice, 2);
  p.history.back();
  await calma();
  assert.equal(p.preguntas.length, 1);
});

// Cada formulario avisa, y al guardar quita la entrada de aviso antes de navegar o refrescar (si no, «atrás» volvería al
// formulario ya enviado o el refresco se adelantaría a la vuelta).
const leer = (ruta) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');
for (const [archivo, salidas] of Object.entries({
  'components/FormFactura.js': ['navegar(router, `/facturas/${d.factura.id}`'],
  'components/FormGasto.js': ['router.replace(`/gastos/bandeja/', "volverA(router, '/gastos', 'atras', true)", 'setG(vacio)'],
  'components/FormPresupuesto.js': ['router.replace(`/presupuestos/'],
  'components/FormDoc.js': ['navegar(router, `/albaranes/${d.doc.id}`'],
  'components/FichaCliente.js': ["volverA(router, lista, 'atras', true)", 'router.replace(`${lista}/'],
})) {
  test(`${archivo}: avisa de los cambios sin guardar y quita el aviso antes de salir tras guardar`, async () => {
    const fuente = await leer(archivo);
    assert.match(fuente, /useCambiosSinGuardar\(/);
    for (const salida of salidas) {
      const donde = fuente.indexOf(salida);
      assert.ok(donde > 0, `${archivo}: falta ${salida}`);
      // Entre la última llamada al servidor y la salida.
      const antes = fuente.slice(fuente.lastIndexOf('const enviar', donde), donde);
      const tras = antes.slice(Math.max(...['fetch(', 'llamar(', 'subir(', 'mandar('].map((x) => antes.lastIndexOf(x))));
      assert.match(tras, /await sinGuardar\.(guardado|soltar)\(\)/, `${archivo}: ${salida} sin quitar antes el aviso`);
    }
  });
}

test('«‹ Atrás», «Cancelar» y el gesto del iPhone preguntan igual', async () => {
  assert.match(await leer('components/Volver.js'), /salirSinGuardar\(\(\) => volverA\(router, href\)\)/);
  const gasto = await leer('components/FormGasto.js');
  assert.match(gasto, /salirSinGuardar\(\(\) => atras\(router, '\/gastos'\)\)/);
  assert.match(gasto, /salirSinGuardar\(\(\) => \{ setAbierto\(false\)/);
  const gesto = await leer('components/GestoAtras.js');
  assert.match(gesto, /hayCambiosSinGuardar\(\)/);
  assert.match(gesto, /salirSinGuardar\(\(\) => volverA\(router, href, 'atras'\)\)/);
});
