// «Hoy» en Mi despacho (app/despacho/hoy): lo que pide atención ahora en todos los clientes que ve esta persona, para
// empezar el día sin abrir cliente por cliente. Mensajes sin leer, documentos que han subido, lo que se les ha pedido y aún
// no han subido, trimestres por revisar y los plazos de los próximos días (o vencidos sin presentar).
// Solo lee lo que ya guarda cada cliente (cierres, mensajes, peticiones y sus marcas de presentado): nada de cálculos.
import { clientesVisibles } from './despachos.js';
import { conversaciones } from './mensajesDespacho.js';
import { contextoCliente, filasClientes } from './panelDespacho.js';
import { peticionesDe } from './peticionesDespacho.js';
import { plazosDespacho } from './plazosDespacho.js';
import { periodoDe } from './despachoApi.js';
import { esSoloDocumentos } from './perfilDocumentos.js';

const masDias = (fecha, n) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export async function datosHoy(d, u, dia) {
  const clientes = await clientesVisibles(d, u.id);
  const { anio, t } = periodoDe(undefined, undefined, dia);
  const [filas, conv, peticiones] = await Promise.all([
    filasClientes(clientes, anio, t, dia),
    conversaciones(d, u.id),
    Promise.all(clientes.map((c) => peticionesDe(c.id, { despacho: d.id, ctx: contextoCliente(u, d, c.empresa) }).catch(() => []))),
  ]);
  const nombre = Object.fromEntries(filas.map((f) => [f.id, f.nombre]));
  const hace7 = masDias(dia, -7);
  const recibidos = [], esperando = [];
  clientes.forEach((c, i) => {
    for (const p of peticiones[i]) {
      if (p.estado === 'entregada' && String(p.entrega?.fecha || '').slice(0, 10) >= hace7) recibidos.push({ ...p, cliente: c.id, clienteNombre: nombre[c.id] });
      if (p.estado === 'pendiente') esperando.push({ ...p, cliente: c.id, clienteNombre: nombre[c.id] });
    }
  });
  const datosPlazos = clientes.map(({ id, empresa: e }) => ({ id, nombre: e.nombre || e.emisor?.nombre, fiscal: e.fiscal || {}, pres: { pres303: e.pres303, pagos130: e.pagos130, pres111: e.pres111, pres115: e.pres115, pres123: e.pres123 } }));
  const plazos = plazosDespacho(datosPlazos, { hoy: dia, dias: 10, atraso: 30 })
    .map((p) => ({ ...p, faltan: p.clientes.filter((c) => c.presentado === false) }))
    .filter((p) => p.vencido || p.faltan.length || p.clientes.some((c) => c.presentado === null));
  return {
    anio, t, clientes: clientes.length,
    mensajes: conv.filter((c) => c.noLeidos > 0),
    recibidos: recibidos.sort((a, b) => String(b.entrega?.fecha).localeCompare(String(a.entrega?.fecha))),
    esperando: esperando.sort((a, b) => String(a.creada).localeCompare(String(b.creada))),
    // Los «solo documentos» no cierran trimestres en Fisquo: se revisan en su ficha, documento a documento.
    porRevisar: filas.filter((f) => f.estado === 'listo' && !esSoloDocumentos(clientes.find((c) => c.id === f.id)?.empresa)).sort((a, b) => String(a.limite).localeCompare(String(b.limite))),
    plazos,
  };
}
