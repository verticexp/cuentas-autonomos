// Factura de ejemplo de la guía para Zapier, Make o n8n (components/AjustesApi.js): la prueba tests/api-ejemplo.test.mjs
// comprueba que pasa la validación de verdad (NIF con su control y domicilio del cliente empresa).
export const FACTURA_EJEMPLO = {
  fecha: '2026-10-22',
  cliente: { nombre: 'Cliente SL', nif: 'B12345674', direccion: 'Calle Mayor 1', ciudad: '28013 Madrid', email: 'cliente@ejemplo.es' },
  lineas: [{ concepto: 'Pedido 1001', cantidad: 1, precio: 50, ivaPct: 21 }],
  irpfPct: 0,
};
