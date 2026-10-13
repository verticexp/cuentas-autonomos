// Envío a la AEAT (auditoría F11): solo los registros del modo actual, historial de cada intento, XML con la instantánea
// de la factura y estado para la pantalla y los avisos. La AEAT se simula (opciones.post): nada sale a la red.
import './apoyo/cargador.mjs';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, F, R, E, S;
before(async () => {
  srv = await arrancar();
  Object.assign(process.env, { KV_REST_API_URL: srv.url, KV_REST_API_TOKEN: 'pruebas' });
  F = await import('../lib/facturas.js');
  R = await import('../lib/redis.js');
  E = await import('../lib/verifactuEnvio.js');
  S = await import('../lib/verifactuEstado.js');
});
after(() => srv.cerrar());

let n = 0;
const empresa = (extra = {}) => ({ id: `u${++n}`, empresa: `v${n}`, emisor: { nombre: 'Emisora S.L.', nif: 'B12345674', plazo: 30 }, fiscal: { iva: 'general' },
  actividades: [{ id: 's', nombre: 'S', serie: '', ivaPct: 21, irpfPct: 0 }], ...extra });
const datos = (i, extra = {}) => ({ fecha: '2026-03-10', actividad: 's', cliente: { nombre: `C${i}`, nif: '12345678Z' }, concepto: 'X', base: 100 + i, ivaPct: 21, irpfPct: 0, nota: '', cobrada: false, ...extra });
// AEAT simulada: responde a cada registro con el estado que diga `estado(numSerie)`; guarda lo enviado.
const aeat = (estado = () => ['Correcto', '']) => {
  const enviados = [];
  const post = async (_, xml) => {
    enviados.push(xml);
    // Cada RegistroFactura: alta (IDFactura/NumSerieFactura) o anulación (NumSerieFacturaAnulada), como responde la AEAT.
    const regs = [...xml.matchAll(/<sum:RegistroFactura>([\s\S]*?)<\/sum:RegistroFactura>/g)].map(([, r]) => (r.includes('<sum1:RegistroAnulacion>')
      ? { num: /<sum1:NumSerieFacturaAnulada>([^<]+)</.exec(r)[1], op: 'Anulacion' }
      : { num: /<sum1:IDFactura>.*?<sum1:NumSerieFactura>([^<]+)</.exec(r)[1], op: 'Alta' }));
    const lineas = regs.map(({ num: x, op }) => { const [e, c] = estado(x); return `<RespuestaLinea><IDFactura><NumSerieFactura>${x}</NumSerieFactura></IDFactura><Operacion><TipoOperacion>${op}</TipoOperacion></Operacion><EstadoRegistro>${e}</EstadoRegistro>${c ? `<CodigoErrorRegistro>${c}</CodigoErrorRegistro><DescripcionErrorRegistro>Error ${c}</DescripcionErrorRegistro>` : ''}</RespuestaLinea>`; }).join('');
    return { status: 200, cuerpo: `<Envelope><Body><RespuestaRegFactuSistemaFacturacion><CSV>CSV123</CSV><EstadoEnvio>Correcto</EstadoEnvio><TiempoEsperaEnvio>1</TiempoEsperaEnvio>${lineas}</RespuestaRegFactuSistemaFacturacion></Body></Envelope>` };
  };
  return { post, enviados };
};

test('los registros de pruebas nunca se envían a la AEAT de verdad', async () => {
  const u = empresa({ verifactu: 'pruebas' });
  await F.crearFactura(u, datos(1));
  await F.crearFactura(u, datos(2));
  // Un registro antiguo, sin modo guardado, cuya factura era de pruebas.
  const regs = await R.leer(u, 'registros');
  await R.guardar(u, 'registros', { ...regs[0], modo: undefined });
  // Pasa a real: la cadena empieza de nuevo y se emite una factura de verdad.
  const real = { ...u, verifactu: 'real' };
  await R.redis.set(R.clave(u, 'verifactu'), '');
  const f3 = (await F.crearFactura(real, datos(3))).factura;
  const sim = aeat();
  const r = await E.enviarPendientes(real, { post: sim.post });
  assert.equal(r.enviados, 1);
  assert.equal(sim.enviados.length, 1);
  const { numeroFactura } = await import('../lib/calculos.js');
  assert.ok(sim.enviados[0].includes(`<sum1:NumSerieFactura>${numeroFactura(f3)}</sum1:NumSerieFactura>`));
  assert.equal((sim.enviados[0].match(/<sum1:RegistroAlta>/g) || []).length, 1);
  // Los de pruebas siguen pendientes (en pruebas se enviarán a la AEAT de pruebas).
  const est = S.estadoVerifactu(await R.leer(u, 'registros'), { modo: 'pruebas', facturas: Object.fromEntries((await R.leer(u, 'facturas')).map((f) => [f.id, f])) });
  assert.equal(est.pendientes, 2);
  assert.equal(est.otroModo, 1);
});

test('cada intento queda en el historial; un rechazo y un error de conexión no se pierden', async () => {
  const u = empresa({ verifactu: 'pruebas' });
  const f = (await F.crearFactura(u, datos(1))).factura;
  // 1.º: sin conexión.
  await E.enviarPendientes(u, { post: async () => { throw new Error('ECONNRESET'); } });
  await R.redis.del(`verifactu-espera:${u.empresa}`);
  // 2.º: rechazada.
  await E.enviarPendientes(u, { post: aeat(() => ['Incorrecto', '1104']).post });
  const [reg] = await R.leer(u, 'registros');
  assert.equal(reg.envios.length, 2);
  assert.match(reg.envios[0].descripcion, /ECONNRESET/);
  assert.equal(reg.envios[1].estado, 'Incorrecto');
  assert.equal(reg.envios[1].codigo, '1104');
  assert.equal(reg.envio.estado, 'Incorrecto');
  const fac = await R.leerUno(u, 'facturas', f.id);
  assert.equal(fac.verifactu.estado, 'Incorrecto');
  assert.equal(fac.verifactu.codigo, '1104');
  const est = S.estadoVerifactu(await R.leer(u, 'registros'), { modo: 'pruebas' });
  assert.equal(est.rechazadas, 1);
  assert.equal(est.incidencias[0].tipo, 'rechazada');
  // El cerrojo de envío se ha soltado (lo soltó su dueño).
  assert.equal(await R.redis.get(`cerrojo:verifactu:${u.empresa}`), null);
});

test('el XML sale de la instantánea: régimen de IVA y emisor de cuando se emitió', async () => {
  const u = empresa({ verifactu: 'pruebas', fiscal: { iva: 'recargo' } });
  await F.crearFactura(u, datos(1));
  const despues = { ...u, fiscal: { iva: 'general' }, emisor: { ...u.emisor, nombre: 'Otro Nombre S.L.' } };
  const sim = aeat();
  await E.enviarPendientes(despues, { post: sim.post });
  assert.match(sim.enviados[0], /<sum1:ClaveRegimen>18<\/sum1:ClaveRegimen>/, 'régimen de recargo de cuando se emitió');
  assert.match(sim.enviados[0], /<sum1:NombreRazonEmisor>Emisora S.L.<\/sum1:NombreRazonEmisor>/);
});

test('estado: atascadas (más de un día sin respuesta) y aceptadas con errores', () => {
  const ahora = new Date('2026-10-14T12:00:00Z');
  const regs = [
    { factura: 'a', NumSerieFactura: '1', FechaHoraHusoGenRegistro: '2026-10-12T10:00:00+02:00', modo: 'pruebas' },
    { factura: 'b', NumSerieFactura: '2', FechaHoraHusoGenRegistro: '2026-10-14T10:00:00+02:00', modo: 'pruebas' },
    { factura: 'c', NumSerieFactura: '3', FechaHoraHusoGenRegistro: '2026-10-10T10:00:00+02:00', modo: 'pruebas', envio: { estado: 'AceptadoConErrores', codigo: '2004' } },
  ];
  const e = S.estadoVerifactu(regs, { modo: 'pruebas', ahora });
  assert.deepEqual([e.pendientes, e.atascadas, e.hechas, e.conErrores], [2, 1, 1, 1]);
  assert.deepEqual(e.incidencias.map((i) => i.tipo).sort(), ['atascada', 'con-errores']);
});

test('aviso diario si hay rechazos o envíos atascados', async () => {
  const { avisosDelDia } = await import('../lib/avisos.js');
  const sin = avisosDelDia({ verifactu: { rechazadas: 0, atascadas: 0 } }, '2026-10-14');
  assert.ok(!sin.some((a) => a.tipo.startsWith('verifactu')));
  const con = avisosDelDia({ verifactu: { rechazadas: 2, atascadas: 1 } }, '2026-10-14').find((a) => a.tipo.startsWith('verifactu'));
  assert.match(con.cuerpo, /2 rechazadas por la AEAT y 1 sin enviar/);
  assert.equal(con.url, '/ajustes/verifactu');
});

test('subsanar un rechazo corrigiendo el NIF del cliente y anular una factura expedida por error', async () => {
  const { comprobarIntegridad } = await import('../lib/integridad.js');
  const u = empresa({ verifactu: 'pruebas' });
  const f = (await F.crearFactura(u, datos(1, { cliente: { nombre: 'Cliente', nif: '12345678Z' } }))).factura;
  const g = (await F.crearFactura(u, datos(2))).factura;
  await E.enviarPendientes(u, { post: aeat((num) => (num.startsWith('01') ? ['Incorrecto', '4104'] : ['Correcto', ''])).post });
  assert.equal((await R.leerUno(u, 'facturas', f.id)).verifactu.estado, 'Incorrecto');
  // No se subsana lo que está bien; ni con un NIF inválido.
  assert.match((await F.subsanarVerifactu(u, g.id)).error, /rechazado o aceptado con errores/);
  assert.match((await F.subsanarVerifactu(u, f.id, { cliente: { nif: '12345678A' } })).error, /no es válido/);
  const s = await F.subsanarVerifactu(u, f.id, { cliente: { nif: '87654321X' } });
  assert.equal(s.factura.cliente.nif, '87654321X');
  assert.equal(s.factura.verifactu.subsanaciones, 1);
  // Se anula la otra (expedida por error).
  const a = await F.anularVerifactu(u, g.id, { motivo: 'Duplicada' });
  assert.ok(a.factura.verifactu.anulacion.huella);
  assert.equal(await R.leerUno(u, 'facturas', g.id), null);
  await R.redis.del(`verifactu-espera:${u.empresa}`);
  const sim = aeat();
  await E.enviarPendientes(u, { post: sim.post });
  assert.match(sim.enviados[0], /<sum1:Subsanacion>S<\/sum1:Subsanacion><sum1:RechazoPrevio>X<\/sum1:RechazoPrevio>/);
  assert.match(sim.enviados[0], /<sum1:RegistroAnulacion>/);
  // Estados en la factura subsanada y en la anulada; la cadena sigue siendo una.
  assert.equal((await R.leerUno(u, 'facturas', f.id)).verifactu.estado, 'Correcto');
  assert.equal((await R.leerUno(u, 'facturasBorradas', g.id)).verifactu.anulacion.estado, 'Correcto');
  const inc = comprobarIntegridad({ facturas: await R.leer(u, 'facturas'), borradas: await R.leer(u, 'facturasBorradas'), registros: await R.leer(u, 'registros'), cabeza: await R.redis.get(R.clave(u, 'verifactu')), numeracion: await R.redis.hgetall(R.clave(u, 'numeracion')) });
  assert.deepEqual(inc, []);
  // Y el número de la anulada no se vuelve a usar.
  assert.equal((await F.crearFactura(u, datos(3))).factura.numero, 3);
});
