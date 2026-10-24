// Vista previa de una factura o un gasto (components/VistaDocumento.js): sus datos y su archivo (el PDF de la factura o
// el justificante del gasto), para verlos sin salir del chat o de la ficha del cliente. Lo usan el despacho (con el
// contexto del cliente, lib/panelDespacho.js contextoCliente) y el propio cliente (su sesión).
import { leerUno } from './redis.js';
import { importes, numeroFactura } from './calculos.js';
import { facturaPdf } from './pdf.js';
import { identidadDoc } from './documento.js';
import { faltanDatosFactura } from './empresa.js';
import { leerJustificante, nombreJustificante } from './justificantes.js';
import { nombreArchivoDoc } from './formato.js';

const COLECCION = { factura: 'facturas', gasto: 'gastos' };
export const tipoValido = (t) => Object.hasOwn(COLECCION, t);

async function leer(ctx, tipo, id) {
  if (!tipoValido(tipo) || !id) return null;
  return leerUno(ctx, COLECCION[tipo], String(id).slice(0, 80));
}

// Lo que se ve de un vistazo. null: no existe.
export async function resumenDocumento(ctx, tipo, id) {
  const x = await leer(ctx, tipo, id);
  if (!x) return null;
  const i = importes(x);
  const comun = { tipo, id: x.id, fecha: x.fecha, concepto: x.concepto || '', base: i.base, iva: i.iva, irpf: i.irpf, total: i.total };
  if (tipo === 'factura') {
    return {
      ...comun, numero: numeroFactura(x), titulo: `Factura ${numeroFactura(x)}`, contraparte: x.cliente?.nombre || '', nif: x.cliente?.nif || '',
      lineas: (x.lineas || []).slice(0, 40).map((l) => ({ concepto: l.concepto, cantidad: l.cantidad, precio: l.precio })),
      estado: x.cobrada ? 'Cobrada' : 'Pendiente de cobro', ...(x.vence ? { vence: x.vence } : {}),
      archivo: x.caja ? null : { tipo: 'application/pdf' },
    };
  }
  return {
    ...comun, numero: x.numero || '', titulo: x.proveedor || x.concepto || 'Gasto', contraparte: x.proveedor || '', nif: x.proveedorNif || '',
    estado: x.pendiente ? 'Pendiente de pago' : 'Pagado', ...(x.vence && x.pendiente ? { vence: x.vence } : {}),
    archivo: x.archivo?.clave ? { tipo: x.archivo.tipo } : null,
  };
}

// El archivo: { datos, tipo, nombre } o { error, status }.
export async function archivoDocumento(ctx, tipo, id) {
  const x = await leer(ctx, tipo, id);
  if (!x) return { error: 'Ese documento ya no existe', status: 404 };
  if (tipo === 'factura') {
    if (x.caja) return { error: 'Un cierre de caja no tiene PDF', status: 404 };
    const { emisor, marca } = await identidadDoc(ctx, x);
    if (faltanDatosFactura(emisor).length) return { error: 'A la empresa le faltan datos para hacer el PDF de sus facturas', status: 409 };
    return { datos: await facturaPdf(x, emisor, marca), tipo: 'application/pdf', nombre: `${nombreArchivoDoc(numeroFactura(x), x.cliente?.nombre || '')}.pdf` };
  }
  if (!x.archivo?.clave) return { error: 'Este gasto no tiene justificante', status: 404 };
  const datos = await leerJustificante(ctx, x.archivo);
  if (!datos) return { error: 'No se encuentra el justificante', status: 404 };
  return { datos, tipo: x.archivo.tipo, nombre: nombreJustificante(x) };
}

// La respuesta HTTP del archivo, siempre para verlo en la página (el XML de una factura electrónica, como descarga).
export function respuestaArchivo(a) {
  const nombre = encodeURIComponent(a.nombre);
  return new Response(a.datos, {
    headers: {
      'Content-Type': a.tipo,
      'Content-Disposition': `${a.tipo === 'application/xml' ? 'attachment' : 'inline'}; filename="${nombre}"; filename*=UTF-8''${nombre}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
