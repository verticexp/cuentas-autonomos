// Lógica del formulario, sin estado de React ni campos nuevos en la factura enviada.
const nombre = (c) => String(c?.nombre || '').trim().toUpperCase();
const nif = (c) => String(c?.nif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Sin selección explícita, una factura histórica solo se enlaza por una identidad única.
// Si hay NIF, nunca se retrocede a buscar por nombre. Sin NIF en ambos se admite un nombre único.
// El ID actual de almacenamiento deriva del nombre: no permite guardar dos homónimos exactos.
export function resolverClienteFactura(clientes, cliente, idSeleccionado) {
  if (idSeleccionado === '') return null;
  const candidatas = clientes.filter((c) => (idSeleccionado === undefined || c.id === idSeleccionado)
    && (nif(cliente) ? nif(c) === nif(cliente) : !nif(c) && nombre(cliente) && nombre(c) === nombre(cliente)));
  return candidatas.length === 1 ? candidatas[0] : null;
}

export const etiquetaClienteFactura = (cliente) => `${cliente.nombre} · ${cliente.nif || 'Sin NIF'}`;

// Un precio escrito, incluso 0, o un producto sin descripción ya hacen que la línea tenga contenido.
export const lineaFacturaVacia = (linea) => [linea.concepto, linea.precio, linea.producto]
  .every((valor) => !String(valor ?? '').trim());

export function cambiarActividadFactura(factura, actividad, defecto, { nueva, rectificativa, irpfPersonalizado, ivasPersonalizados = [] } = {}) {
  if (!nueva || rectificativa) return { ...factura, actividad };
  return {
    ...factura,
    actividad,
    irpfPct: irpfPersonalizado ? factura.irpfPct : defecto.irpfPct,
    lineas: factura.lineas.map((linea, i) => lineaFacturaVacia(linea) && !ivasPersonalizados.includes(i) ? { ...linea, ivaPct: defecto.ivaPct } : linea),
  };
}
