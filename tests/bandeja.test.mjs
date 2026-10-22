import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { cuadra, caducado, ordenar, paraPantalla, propuestaDeEfactura, propuestaDeTicket, resumen, totalPropuesta } from '../lib/bandeja.js';
import { importes } from '../lib/calculos.js';
import { limpiarTicket } from '../lib/ticket.js';
import { facturae } from '../lib/facturae.js';

// ---------- Lo puro: de lo leído a la propuesta, cuándo cuadra, lo habitual del proveedor ----------

const leido = (extra = {}) => limpiarTicket({ proveedor: 'Telefónica de España', nif: 'A82018474', numero: 'Factura nº TA6C0123', fecha: '2026-10-05', concepto: 'Fibra y móvil',
  base: 50, ivaPct: 21, total: 60.5, desglose: [{ ivaPct: 21, base: 50, cuota: 10.5 }], irpf: null, irpfPct: 0, ...extra }, '2026-10-22');

test('la propuesta de un ticket leído: números, número de factura y retención sin leer como null', () => {
  const p = propuestaDeTicket(leido());
  assert.equal(p.base, 50); assert.equal(p.ivaPct, 21); assert.equal(p.numero, 'TA6C0123'); assert.equal(p.proveedorNif, 'A82018474');
  assert.equal(p.irpfPct, 0); assert.equal(p.cuadra, true); assert.deepEqual(p.avisos, []);
  assert.equal(propuestaDeTicket(leido({ irpfPct: null })).irpfPct, null, 'sin dato de retención: lo puede completar lo habitual');
  const varios = propuestaDeTicket(limpiarTicket({ proveedor: 'Bar Pepe', fecha: '2026-10-05', base: 30, ivaPct: 10, total: 34.1, desglose: [{ ivaPct: 10, base: 20, cuota: 2 }, { ivaPct: 21, base: 10, cuota: 2.1 }] }, '2026-10-22'));
  assert.deepEqual(varios.desglose, [{ ivaPct: 10, base: 20 }, { ivaPct: 21, base: 10 }]);
});

test('la factura electrónica cuadra siempre y queda sin pagar si vence más tarde', () => {
  const t = { formato: 'facturae', numero: 'A-7', fecha: '2026-10-02', vencimiento: '2026-11-02', proveedor: { nombre: 'Gestoría López', nif: 'b12345678' }, concepto: 'Asesoría', base: 100, ivaPct: 21, desglose: [{ pct: 21, base: 100, cuota: 21 }], irpfPct: 15 };
  const p = propuestaDeEfactura(t, '2026-10-22');
  assert.equal(p.efactura, 'facturae'); assert.equal(p.pendiente, true); assert.equal(p.irpfPct, 15); assert.equal(p.proveedorNif, 'B12345678');
  assert.equal(totalPropuesta(p), 106);
  assert.equal(propuestaDeEfactura({ ...t, vencimiento: '2026-10-10' }, '2026-10-22').pendiente, undefined);
});

test('solo cuadra lo leído, con importes que casan, fecha clara, sin avisos ni duplicados', () => {
  const d = { estado: 'revisar', propuesta: propuestaDeTicket(leido()) };
  assert.equal(cuadra(d), true);
  assert.equal(cuadra({ ...d, estado: 'error' }), false);
  assert.equal(cuadra({ ...d, duplicados: [{ id: 'g1', motivo: 'Mismo archivo' }] }), false);
  assert.equal(cuadra({ ...d, propuesta: { ...d.propuesta, fechaDudosa: true } }), false);
  assert.equal(cuadra({ ...d, propuesta: { ...d.propuesta, avisos: ['Los importes leídos no cuadran'] } }), false);
  assert.equal(cuadra({ ...d, propuesta: { ...d.propuesta, desglose: [{ ivaPct: 21, base: 40 }, { ivaPct: 10, base: 10 }] } }), true, 'con varios tipos también');
  assert.equal(cuadra({ ...d, propuesta: propuestaDeTicket(leido({ total: 70 })) }), false, 'el total no casa con base e IVA');
});

test('la lista: lo que necesita a alguien primero, sin datos internos, y los aprobados solos caducan al mes', () => {
  const docs = [
    { id: 'b1', estado: 'aprobado', recibido: '2026-10-21T10:00:00Z' }, { id: 'b2', estado: 'leyendo', recibido: '2026-10-21T10:00:00Z' },
    { id: 'b3', estado: 'revisar', recibido: '2026-10-20T10:00:00Z', propuesta: propuestaDeTicket(leido()), archivo: { clave: 'justificantes/e/b3.pdf', tipo: 'application/pdf', tamano: 9 } },
    { id: 'b4', estado: 'revisar', recibido: '2026-10-21T10:00:00Z' }, { id: 'b5', estado: 'cuarentena', recibido: '2026-10-21T10:00:00Z' },
  ];
  assert.deepEqual(ordenar(docs).map((d) => d.id), ['b4', 'b3', 'b5', 'b2', 'b1']);
  assert.deepEqual(resumen(docs), { revisar: 2, error: 0, cuarentena: 1, leyendo: 1, aprobado: 1, cuadran: 1, pendientes: 4 });
  const p = paraPantalla(docs[2]);
  assert.equal(p.tipo, 'application/pdf'); assert.equal(p.total, 60.5); assert.equal(p.cuadra, true);
  assert.ok(!JSON.stringify(p).includes('justificantes/'), 'la clave del archivo no sale a la pantalla');
  assert.equal(caducado({ estado: 'aprobado', recibido: '2026-09-01T00:00:00Z' }, Date.parse('2026-10-22')), true);
  assert.equal(caducado({ estado: 'revisar', recibido: '2026-01-01T00:00:00Z' }, Date.parse('2026-10-22')), false);
});

test('lo habitual del proveedor: su clasificación, y el concepto solo si se repite', async () => {
  // Se carga después de configurar Redis (lib/indices.js lo conecta al importarse).
  const { conLoHabitual, habitualDeGastos, mismoProveedor } = await import('../lib/proveedorHabitual.js');
  const g = (fecha, extra = {}) => ({ fecha, proveedor: 'Telefónica', concepto: 'Fibra oficina', categoria: '629', deduciblePct: 50, ...extra });
  const h = habitualDeGastos([g('2026-09-05'), g('2026-08-05')]);
  assert.deepEqual(h, { categoria: '629', deduciblePct: 50, proveedor: 'Telefónica', fecha: '2026-09-05', concepto: 'Fibra oficina' });
  assert.equal(habitualDeGastos([g('2026-09-05'), g('2026-08-05', { concepto: 'Móvil' })]).concepto, undefined);
  assert.equal(habitualDeGastos([]), null);
  // La factura manda en lo que dice; lo habitual, en cómo se clasifica. Un «sin retención» leído no se pisa.
  const p = conLoHabitual({ concepto: 'Fibra', irpfPct: 0, deduciblePct: undefined }, { deduciblePct: 50, irpfPct: 15, concepto: 'Fibra oficina' });
  assert.deepEqual(p, { concepto: 'Fibra oficina', irpfPct: 0, deduciblePct: 50 });
  assert.equal(conLoHabitual({ irpfPct: null }, { irpfPct: 15 }).irpfPct, 15);
  assert.equal(mismoProveedor({ proveedor: 'Telefónica de España', proveedorNif: 'A-82018474' }, { proveedor: 'Otro nombre', proveedorNif: 'a82018474' }), true);
  assert.equal(mismoProveedor({ proveedor: 'TELEFONICA', proveedorNif: 'A82018474' }, { proveedor: 'Telefónica' }), true, 'sin NIF en uno, por el nombre');
  assert.equal(mismoProveedor({ proveedor: 'Telefónica', proveedorNif: 'A82018474' }, { proveedor: 'Telefónica', proveedorNif: 'B11111111' }), false);
});

test('un gasto con varios tipos de IVA suma la cuota de cada tipo', () => {
  const g = { base: 150, ivaPct: 21, porTipo: [{ ivaPct: 21, base: 100 }, { ivaPct: 10, base: 50 }] };
  assert.deepEqual(importes(g), { base: 150, iva: 26, irpf: 0, total: 176 });
});

// ---------- El recorrido entero, con Redis y el almacén en memoria y la IA simulada ----------

let srv, J, R, B;
const fetchAntes = globalThis.fetch;
let respuestaIA;
before(async () => {
  srv = await arrancar();
  Object.assign(process.env, { KV_REST_API_URL: srv.url, KV_REST_API_TOKEN: 'pruebas', ANTHROPIC_API_KEY: 'x', ANTHROPIC_URL: 'http://ia.test/v1/messages', LIMITES: 'off' });
  globalThis.fetch = async (url, opciones) => {
    const u = String(url);
    if (u === 'http://ia.test/v1/messages/count_tokens') return Response.json({ input_tokens: 1200 });
    if (u === 'http://ia.test/v1/messages') return Response.json({ model: 'claude-haiku-5-5', usage: { input_tokens: 1200, output_tokens: 80 }, content: [{ type: 'text', text: JSON.stringify(respuestaIA) }] });
    return fetchAntes(url, opciones);
  };
  J = await import('../lib/justificantes.js');
  R = await import('../lib/redis.js');
  B = await import('../lib/bandejaServidor.js');
});
after(async () => { globalThis.fetch = fetchAntes; delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_URL; delete process.env.LIMITES; await srv?.cerrar(); });
let almacen;
beforeEach(() => {
  almacen = J.almacenMemoria(); J.ponerAlmacen(almacen);
  respuestaIA = { proveedor: 'Telefónica de España', nif: 'A82018474', numero: 'TA6C0123', fecha: '2026-10-05', concepto: 'Fibra y móvil', base: 50, ivaPct: 21, total: 60.5, desglose: [{ ivaPct: 21, base: 50, cuota: 10.5 }], irpf: null, irpfPct: 0, lineas: [] };
});

let n = 0;
// La empresa no está en el hash «empresas»: la cola, si se adelanta, no encuentra a quién leer y la prueba lee a mano.
const empresa = () => { n += 1; return { id: `u-band-${n}`, empresa: `e-band-${n}`, rol: 'admin', actividades: [{ id: 'servicios', nombre: 'Servicios' }], fiscal: { tipo: 'autonomo' } }; };
async function pdf(texto = 'factura') {
  const d = await PDFDocument.create();
  d.addPage().drawText(texto);
  return d.save();
}

test('subir, leer, completar con lo habitual y el banco, y aprobar con el mismo archivo', async () => {
  const u = empresa();
  await R.guardar(u, 'gastos', { id: 'g-ant', fecha: '2026-09-05', actividad: 'servicios', concepto: 'Fibra oficina', proveedor: 'Telefónica', proveedorNif: 'A82018474', base: 50, ivaPct: 21, categoria: '629', deduciblePct: 50 });
  await R.guardar(u, 'banco', { id: 'm1', fecha: '2026-10-07', importe: -60.5, concepto: 'RECIBO TELEFONICA DE ESPANA TA6C0123', estado: 'pendiente' });
  const bytes = await pdf();
  const { doc } = await B.recibirArchivo(u, bytes, { nombre: 'factura-octubre.pdf' });
  assert.equal(doc.estado, 'leyendo');
  assert.match(doc.archivo.clave, new RegExp(`^justificantes/${u.empresa}/${doc.id}-`));
  assert.deepEqual(await B.recibirArchivo(u, bytes, { nombre: 'otra vez.pdf' }).then((r) => [r.repetido, r.doc.id]), [true, doc.id], 'el mismo archivo no entra dos veces');
  assert.deepEqual(await B.leerDocumento(u, doc.id), { leido: true });
  const leidoDoc = await R.leerUno(u, 'bandeja', doc.id);
  assert.equal(leidoDoc.estado, 'revisar');
  assert.equal(leidoDoc.propuesta.categoria, '629', 'lo habitual del proveedor');
  assert.equal(leidoDoc.propuesta.deduciblePct, 50);
  assert.equal(leidoDoc.propuesta.numero, 'TA6C0123');
  assert.equal(leidoDoc.banco?.id, 'm1', 'casa con el cargo del banco');
  assert.equal(cuadra(leidoDoc), true);
  // Dos aprobaciones a la vez crean un solo gasto.
  const [a, b] = await Promise.all([B.aprobar(u, doc.id, B.datosDe(leidoDoc)), B.aprobar(u, doc.id, B.datosDe(leidoDoc))]);
  const bien = [a, b].filter((r) => r.gasto), mal = [a, b].filter((r) => r.error);
  assert.equal(bien.length, 1); assert.equal(mal.length, 1); assert.equal(mal[0].status, 409);
  const g = await R.leerUno(u, 'gastos', bien[0].gasto.id);
  assert.equal(g.archivo.clave, doc.archivo.clave, 'el gasto se queda con el archivo de la bandeja');
  assert.equal(g.categoria, '629'); assert.equal(g.numero, 'TA6C0123'); assert.equal(g.proveedorNif, 'A82018474');
  assert.equal(await R.leerUno(u, 'bandeja', doc.id), null);
  assert.equal((await R.leerUno(u, 'banco', 'm1')).estado, 'emparejado');
  assert.ok(almacen.datos.has(doc.archivo.clave));
});

test('lo que ya está apuntado no cuadra; descartar borra el archivo', async () => {
  const u = empresa();
  const bytes = await pdf('duplicada');
  const { doc } = await B.recibirArchivo(u, bytes, { nombre: 'a.pdf' });
  await B.leerDocumento(u, doc.id);
  const r = await B.aprobar(u, doc.id, B.datosDe(await R.leerUno(u, 'bandeja', doc.id)));
  assert.ok(r.gasto);
  // La misma factura, otra vez (otro archivo con el mismo número): posible duplicado.
  const otra = await B.recibirArchivo(u, await pdf('duplicada, otra copia'), { nombre: 'b.pdf' });
  await B.leerDocumento(u, otra.doc.id);
  const d = await R.leerUno(u, 'bandeja', otra.doc.id);
  assert.match(d.duplicados?.[0]?.motivo || '', /Misma factura/);
  assert.equal(cuadra(d), false);
  assert.deepEqual(await B.aprobarVarias(u, [otra.doc.id]), { hechas: [], fallidas: [] }, 'no se aprueba en bloque lo que no cuadra');
  const sinConfirmar = await B.aprobar(u, otra.doc.id, B.datosDe(d));
  assert.equal(sinConfirmar.status, 409); assert.ok(sinConfirmar.duplicados.length);
  assert.ok(await R.leerUno(u, 'bandeja', otra.doc.id), 'si avisa de duplicado, la factura vuelve a la bandeja');
  assert.deepEqual(await B.descartar(u, otra.doc.id), { ok: true });
  assert.ok(!almacen.datos.has(d.archivo.clave));
  assert.equal(await R.leerUno(u, 'bandeja', otra.doc.id), null);
});

test('una lectura cortada a medias no se repite sola; leer otra vez sí', async () => {
  const u = empresa();
  const { doc } = await B.recibirArchivo(u, await pdf('cortada'), { nombre: 'c.pdf' });
  await R.guardar(u, 'bandeja', { ...doc, leyendoDesde: new Date().toISOString() });
  assert.deepEqual(await B.leerDocumento(u, doc.id), { cortada: true });
  assert.equal((await R.leerUno(u, 'bandeja', doc.id)).estado, 'error');
  assert.deepEqual(await B.releer(u, doc.id), { ok: true });
  assert.deepEqual(await B.leerDocumento(u, doc.id), { leido: true });
  // Un fallo de la IA deja el documento con su error, sin reintentar solo.
  respuestaIA = 'esto no es JSON';
  const otro = await B.recibirArchivo(u, await pdf('ilegible'), { nombre: 'd.pdf' });
  assert.deepEqual(await B.leerDocumento(u, otro.doc.id), { error: true });
  assert.match((await R.leerUno(u, 'bandeja', otro.doc.id)).error, /No se entendió el ticket/);
});

test('la factura electrónica se lee al llegar, sin IA, y la de cuarentena no se lee', async () => {
  const u = empresa();
  const emisor = { nombre: 'Gestoría López SL', nif: 'B12345678', direccion: 'Calle Mayor 1', ciudad: '28013 Madrid', iban: 'ES91 2100 0418 4502 0005 1332' };
  const f = { id: 'f1', numero: 7, anio: 2026, serie: '', fecha: '2026-10-02', concepto: 'Asesoría fiscal', base: 100, ivaPct: 21, irpfPct: 15, cliente: { nombre: 'Marc', nif: '12345678Z', direccion: 'C/ Sol 2', ciudad: '28001 Madrid' } };
  const xml = Buffer.from(facturae(f, emisor, { sociedad: true }));
  const r = await B.recibirArchivo(u, xml, { nombre: 'factura.xml', origen: 'correo', correo: { de: 'facturas@gestorialopez.es', asunto: 'Factura' } });
  assert.equal(r.doc.estado, 'revisar');
  assert.equal(r.doc.archivo.tipo, 'application/xml');
  assert.equal(r.doc.propuesta.efactura, 'facturae'); assert.equal(r.doc.propuesta.irpfPct, 15); assert.equal(r.doc.propuesta.numero, '07-2026');
  assert.equal(cuadra(r.doc), true);
  const c = await B.recibirArchivo(u, await pdf('spam'), { nombre: 'x.pdf', origen: 'correo', cuarentena: true, correo: { de: 'desconocido@spam.test' } });
  assert.equal(c.doc.estado, 'cuarentena');
  assert.deepEqual(await B.leerDocumento(u, c.doc.id), { nada: true }, 'en cuarentena no se lee (no gasta lecturas)');
  const { hechas } = await B.aprobarVarias(u, [r.doc.id, c.doc.id]);
  assert.equal(hechas.length, 1);
  const g = await R.leerUno(u, 'gastos', hechas[0]);
  assert.equal(g.efactura, 'facturae'); assert.equal(g.irpfPct, 15); assert.equal(g.archivo.tipo, 'application/xml');
});
