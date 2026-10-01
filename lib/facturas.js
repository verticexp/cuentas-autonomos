// Alta de facturas: la usan la pantalla de facturas y la de presupuestos (al facturar la señal o el resto).
import { leer, guardar, redis, clave } from './redis.js';
import { modoDe, registroAlta } from './verifactu.js';
import { subirFactura } from './drive.js';
import { enviarNomina } from './controlat.js';
import { leerImporte, numeroFactura, r2, siguienteNumero } from './calculos.js';
import { actividadesDe, actividadValida, serieDeActividad } from './empresa.js';

export function limpiar(b, actividades, sociedad = false) {
  const base = r2(leerImporte(b.base));
  if (!base) return { error: 'Importe no válido' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) return { error: 'Fecha no válida' };
  const c = b.cliente || {};
  if (!String(c.nombre || '').trim()) return { error: 'Falta el cliente' };
  const txt = (v, n = 120) => String(v || '').trim().slice(0, n);
  return {
    fecha: b.fecha,
    actividad: actividadValida(actividades, b.actividad),
    cliente: { nombre: txt(c.nombre), nif: txt(c.nif, 20), direccion: txt(c.direccion), ciudad: txt(c.ciudad) },
    concepto: txt(b.concepto, 200),
    base,
    ivaPct: Math.min(100, Math.max(0, Number(b.ivaPct) || 0)),
    // A una sociedad no se le practica retención de IRPF.
    irpfPct: sociedad ? 0 : Math.min(100, Math.max(0, Number(b.irpfPct) || 0)),
    nota: txt(b.nota, 300),
    cobrada: Boolean(b.cobrada),
    ...(b.evento?.fecha || b.evento?.lugar ? { evento: { fecha: /^\d{4}-\d{2}-\d{2}$/.test(b.evento.fecha || '') ? b.evento.fecha : '', lugar: txt(b.evento.lugar) } } : {}),
  };
}

export const guardarCliente = (u, c) => guardar(u, 'clientes', { id: c.nombre.toUpperCase(), ...c });

// Numera, registra en Verifactu (si la empresa lo tiene) y guarda. extra: campos que no vienen del formulario.
export async function crearFactura(u, datos, { original, extra = {} } = {}) {
  const serie = original ? 'R' : serieDeActividad(actividadesDe(u), datos.actividad);
  const anio = Number(datos.fecha.slice(0, 4));
  const numero = siguienteNumero(await leer(u, 'facturas'), anio, serie);
  const f = { id: `${serie}${anio}-${numero}`, numero, anio, ...datos, ...extra };
  if (serie) f.serie = serie;
  if (original) f.rectifica = { id: original.id, numero: numeroFactura(original), fecha: original.fecha };
  const modo = modoDe(u);
  if (modo) {
    const nif = u.emisor?.nif;
    if (!nif) return { error: 'Rellena tu NIF en Ajustes' };
    const r = registroAlta(f, nif, (await redis.get(clave(u, 'verifactu'))) || '');
    f.verifactu = { huella: r.Huella, fechaHora: r.FechaHoraHusoGenRegistro, modo };
    await guardar(u, 'registros', { id: r.Huella, factura: f.id, ...r });
    await redis.set(clave(u, 'verifactu'), r.Huella);
  }
  await guardar(u, 'facturas', f);
  await guardarCliente(u, f.cliente);
  await Promise.all([subirFactura(u, f), enviarNomina(u, [f.fecha])]);
  return { factura: f };
}
