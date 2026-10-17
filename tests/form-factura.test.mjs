import test from 'node:test';
import assert from 'node:assert/strict';
import { cambiarActividadFactura, etiquetaClienteFactura, lineaFacturaVacia, resolverClienteFactura } from '../lib/formFactura.js';

const clientes = [
  { id: 'ana-1', nombre: 'Ana García', nif: '12345678Z', riesgoMax: 100, formaCobro: 'efectivo' },
  { id: 'ana-2', nombre: 'Ana García', nif: 'B12345674', riesgoMax: 5000, formaCobro: 'transferencia' },
];

test('histórica con homónimos: el NIF determina la ficha sin depender del orden', () => {
  const cliente = { nombre: 'Ana García', nif: ' b-1234567-4 ' };
  for (const lista of [clientes, [...clientes].reverse()]) {
    const ficha = resolverClienteFactura(lista, cliente);
    assert.equal(ficha, clientes[1]);
    assert.equal(ficha.riesgoMax, 5000);
    assert.equal(ficha.formaCobro, 'transferencia');
  }
  assert.equal(resolverClienteFactura(clientes, { nombre: 'Nombre anterior', nif: 'B12345674' }), clientes[1]);
});

test('un NIF histórico distinto o ausente nunca elige una ficha por la primera coincidencia de nombre', () => {
  const antes = structuredClone(clientes);
  for (const cliente of [{ nombre: 'Ana García', nif: '99999999R' }, { nombre: 'Ana García' }, { nombre: '' }]) {
    assert.equal(resolverClienteFactura(clientes, cliente), null);
  }
  assert.equal(resolverClienteFactura([clientes[0]], { nombre: 'Ana García', nif: 'B12345674' }), null,
    'el ID actual derivado del nombre puede corresponder a otro NIF después de una sobrescritura');
  assert.equal(resolverClienteFactura([clientes[0]], { nombre: 'Ana García' }), null,
    'sin NIF histórico no se puede verificar el NIF de la ficha actual');
  assert.deepEqual(clientes, antes);
});

test('sin NIF en ambos, solo un nombre único permite recuperar la selección histórica', () => {
  const sinNif = [{ id: 'uno', nombre: 'Ana García', nif: '' }, { id: 'dos', nombre: 'Ana García' }];
  const cliente = { nombre: ' ana garcía ' };
  assert.equal(resolverClienteFactura(sinNif, cliente), null);
  assert.equal(resolverClienteFactura([sinNif[0]], cliente), sinNif[0]);
  assert.equal(resolverClienteFactura(sinNif, cliente, 'dos'), sinNif[1], 'el ID explícito desambigua');
});

test('la selección explícita exige el ID elegido y el NIF; no salta a otra ficha', () => {
  assert.equal(resolverClienteFactura(clientes, clientes[1], 'ana-2'), clientes[1]);
  assert.equal(resolverClienteFactura(clientes, clientes[1], 'ana-1'), null);
  assert.equal(resolverClienteFactura(clientes, clientes[1], 'borrado'), null);
  assert.equal(resolverClienteFactura(clientes, clientes[1], ''), null, 'editar la identidad o elegir cliente nuevo desvincula la ficha');
  assert.equal(resolverClienteFactura([{ ...clientes[1], nif: '' }], clientes[1], 'ana-2'), null);
  assert.equal(resolverClienteFactura(clientes, { nombre: clientes[1].nombre, nif: '' }, 'ana-2'), null);
});

test('un NIF repetido necesita selección explícita y una identidad duplicada sigue sin resolverse', () => {
  const duplicados = [clientes[1], { ...clientes[1], id: 'otra-ficha', nombre: 'Otro nombre' }];
  assert.equal(resolverClienteFactura(duplicados, clientes[1]), null);
  assert.equal(resolverClienteFactura(duplicados, clientes[1], 'otra-ficha'), duplicados[1]);
  assert.equal(resolverClienteFactura([clientes[1], { ...clientes[1] }], clientes[1], 'ana-2'), null);
});

test('las etiquetas visibles distinguen NIF de homónimos y muestran su ausencia', () => {
  assert.equal(etiquetaClienteFactura(clientes[0]), 'Ana García · 12345678Z');
  assert.equal(etiquetaClienteFactura(clientes[1]), 'Ana García · B12345674');
  assert.equal(etiquetaClienteFactura({ nombre: 'Sin ficha' }), 'Sin ficha · Sin NIF');
});

const vacia = (extra = {}) => ({ concepto: '', precio: '', cantidad: '1', dto: '', ivaPct: 21, ...extra });
const borrador = (extra = {}) => ({ actividad: 'servicios', cliente: clientes[1], irpfPct: 15, lineas: [vacia()], ...extra });
const nueva = { nueva: true, rectificativa: false, irpfPersonalizado: false };

test('una nueva factura vacía sigue los valores por defecto de cada actividad sin mutar el origen', () => {
  const original = borrador();
  const antes = structuredClone(original);
  const primera = cambiarActividadFactura(original, 'venta', { ivaPct: 10, irpfPct: 0 }, nueva);
  assert.equal(primera.actividad, 'venta');
  assert.equal(primera.irpfPct, 0);
  assert.equal(primera.lineas[0].ivaPct, 10);
  const segunda = cambiarActividadFactura(primera, 'exenta', { ivaPct: 0, irpfPct: 7 }, nueva);
  assert.equal(segunda.irpfPct, 7);
  assert.equal(segunda.lineas[0].ivaPct, 0);
  assert.deepEqual(original, antes);
});

test('actividad con tipos mixtos: conserva concepto, precio y producto; solo rellena líneas vacías', () => {
  const original = borrador({ lineas: [
    vacia({ concepto: 'Servicio', ivaPct: 21 }),
    vacia({ precio: '100,50', ivaPct: 10 }),
    vacia({ producto: 'producto-4', ivaPct: 4 }),
    vacia({ precio: '0', ivaPct: 0 }),
    vacia({ precio: 0, ivaPct: 5 }),
    vacia({ concepto: 'Exento', precio: '-100', ivaPct: 0, albaran: 'a1' }),
    vacia(),
    vacia({ concepto: '  ', precio: '  ', ivaPct: 4 }),
  ] });
  const antes = structuredClone(original);
  const resultado = cambiarActividadFactura(original, 'venta', { ivaPct: 2, irpfPct: 0 }, nueva);
  assert.deepEqual(resultado.lineas.map((l) => l.ivaPct), [21, 10, 4, 0, 5, 0, 2, 2]);
  assert.deepEqual(resultado.lineas.slice(0, 6), original.lineas.slice(0, 6));
  assert.deepEqual(original, antes);
});

test('una línea con precio cero o producto conserva su IVA aunque el resto esté vacío', () => {
  assert.equal(lineaFacturaVacia(vacia()), true);
  assert.equal(lineaFacturaVacia(vacia({ precio: 0 })), false);
  assert.equal(lineaFacturaVacia(vacia({ producto: 'p' })), false);
  assert.equal(lineaFacturaVacia(vacia({ concepto: 'Servicio' })), false);
});

test('IRPF personalizado, incluso cero o igual al defecto previo, sobrevive a varios cambios de actividad', () => {
  for (const irpfPct of [0, 7, 15, 19]) {
    const opciones = { ...nueva, irpfPersonalizado: true };
    const original = borrador({ irpfPct });
    const primera = cambiarActividadFactura(original, 'venta', { ivaPct: 10, irpfPct: 0 }, opciones);
    const segunda = cambiarActividadFactura(primera, 'exenta', { ivaPct: 0, irpfPct: 7 }, opciones);
    assert.equal(primera.irpfPct, irpfPct);
    assert.equal(segunda.irpfPct, irpfPct);
    assert.equal(segunda.lineas[0].ivaPct, 0, 'personalizar IRPF no desactiva los valores por defecto de una línea vacía');
  }
});

test('edición y rectificativa solo cambian actividad, incluidos los tipos de las líneas vacías', () => {
  const original = borrador({ irpfPct: 19, lineas: [vacia({ concepto: 'Servicio', precio: '100' }), vacia({ ivaPct: 4 })] });
  const antes = structuredClone(original);
  for (const opciones of [{ ...nueva, nueva: false }, { ...nueva, rectificativa: true }, { ...nueva, nueva: false, rectificativa: true }]) {
    const resultado = cambiarActividadFactura(original, 'venta', { ivaPct: 10, irpfPct: 0 }, opciones);
    assert.deepEqual(resultado, { ...antes, actividad: 'venta' });
  }
  assert.deepEqual(original, antes);
});

test('el IVA elegido manualmente en una línea vacía se conserva, también si es cero o coincide con el defecto anterior', () => {
  for (const ivaPct of [0, 4, 10, 21]) {
    const original = borrador({ lineas: [vacia(), vacia({ ivaPct })] });
    const resultado = cambiarActividadFactura(original, 'exenta', { ivaPct: 0, irpfPct: 0 }, { ...nueva, ivasPersonalizados: [1] });
    assert.equal(resultado.lineas[0].ivaPct, 0);
    assert.equal(resultado.lineas[1].ivaPct, ivaPct);
  }
});
