// Avisos a los webhooks de la empresa (lib/webhooks.js) cuando pasa algo en Fisquo: una factura emitida, una factura que
// queda cobrada (a mano, por el banco, una remesa o Stripe: todo pasa por actualizarFactura) y un gasto apuntado. Se
// encolan después de guardar y nunca deshacen ni bloquean la operación que los provoca. Llevan solo la ficha pública
// (lib/apiPublicaDatos.js) y un id fijo por documento y evento: repetir la operación no duplica la entrega.
export async function avisarEvento(u, tipo, doc) {
  try {
    const [{ emitirEvento }, datos] = await Promise.all([import('./webhooks.js'), import('./apiPublicaDatos.js')]);
    const publico = tipo.startsWith('factura.') ? datos.facturaPublica(doc) : datos.gastoPublico(doc);
    const id = `${tipo}-${doc.id}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 100);
    await emitirEvento(u, tipo, publico, { id });
  } catch (e) {
    console.warn(`[webhooks] ${tipo} ${doc?.id}: ${e.message}`);
  }
}
