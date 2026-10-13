// Estado de los registros Verifactu de una empresa (auditoría F11): qué está registrado, pendiente, rechazado o aceptado
// con errores, qué lleva atascado demasiado tiempo y de qué modo es cada uno. Pura, para la pantalla, los avisos y pruebas.
export const HECHO = ['Correcto', 'AceptadoConErrores'];
const HORAS_ATASCO = 24;

// Modo de un registro: el suyo; los de antes de guardarlo, el de su factura (o, si no se sabe, pruebas: nunca real
// por defecto, para no mandar a la AEAT de verdad algo que quizá era de pruebas).
export const modoRegistro = (r, factura) => r.modo || factura?.verifactu?.modo || 'pruebas';

// registros: los del hash; facturas: { id → factura } (para el modo de los antiguos); modo: el actual de la empresa.
export function estadoVerifactu(registros = [], { facturas = {}, modo, ahora = new Date() } = {}) {
  const limite = new Date(ahora.getTime() - HORAS_ATASCO * 3600e3).toISOString();
  const delModo = registros.filter((r) => !modo || modoRegistro(r, facturas[r.factura]) === modo);
  const e = { hechas: 0, pendientes: 0, rechazadas: 0, conErrores: 0, atascadas: 0, otroModo: registros.length - delModo.length, incidencias: [] };
  for (const r of delModo) {
    const estado = r.envio?.estado || 'Pendiente';
    if (HECHO.includes(estado)) e.hechas++;
    if (estado === 'AceptadoConErrores') { e.conErrores++; e.incidencias.push({ tipo: 'con-errores', factura: r.factura, numero: r.NumSerieFactura, codigo: r.envio.codigo, descripcion: r.envio.descripcion }); }
    if (estado === 'Incorrecto') { e.rechazadas++; e.incidencias.push({ tipo: 'rechazada', factura: r.factura, numero: r.NumSerieFactura, codigo: r.envio.codigo, descripcion: r.envio.descripcion }); }
    if (estado === 'Pendiente') {
      e.pendientes++;
      // Generado hace más de un día y sin respuesta: algo falla (certificado, conexión, AEAT).
      const desde = r.envios?.[0]?.fecha || r.FechaHoraHusoGenRegistro;
      if (new Date(r.FechaHoraHusoGenRegistro).toISOString() < limite) { e.atascadas++; e.incidencias.push({ tipo: 'atascada', factura: r.factura, numero: r.NumSerieFactura, desde, descripcion: r.envio?.descripcion || '' }); }
    }
  }
  return e;
}
