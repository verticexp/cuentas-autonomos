// Alta de facturas: la usan la pantalla de facturas y la de presupuestos (al facturar la señal o el resto).
import { leer, guardar, redis, clave } from './redis.js';
import { modoDe, registroAlta } from './verifactu.js';
import { subirFactura } from './drive.js';
import { enviarNomina } from './controlat.js';
import { baseLinea, desglose, leerImporte, numeroFactura, r2, siguienteNumero } from './calculos.js';
import { actividadesDe, actividadValida, serieDeActividad } from './empresa.js';

const pctValido = (v) => Math.min(100, Math.max(0, Number(v) || 0));

function limpiarLineas(lineas) {
  if (!Array.isArray(lineas)) return null;
  const l = lineas.slice(0, 100).map((x) => ({
    concepto: String(x.concepto || '').trim().slice(0, 200),
    cantidad: Math.round((leerImporte(x.cantidad ?? 1) || 0) * 1000) / 1000,
    precio: r2(leerImporte(x.precio) || 0),
    dto: pctValido(x.dto),
    ivaPct: pctValido(x.ivaPct),
  })).filter((x) => x.concepto || x.precio);
  return l.length ? l : null;
}

export function limpiar(b, actividades, sociedad = false) {
  const lineas = limpiarLineas(b.lineas);
  const base = lineas ? r2(lineas.reduce((s, l) => s + baseLinea(l), 0)) : r2(leerImporte(b.base));
  if (!base) return { error: 'Importe no válido' };
  if (lineas?.some((l) => !l.concepto)) return { error: 'Falta el concepto de alguna línea' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) return { error: 'Fecha no válida' };
  const c = b.cliente || {};
  if (!String(c.nombre || '').trim()) return { error: 'Falta el cliente' };
  const txt = (v, n = 120) => String(v || '').trim().slice(0, n);
  return {
    fecha: b.fecha,
    actividad: actividadValida(actividades, b.actividad),
    cliente: { nombre: txt(c.nombre), nif: txt(c.nif, 20), direccion: txt(c.direccion), ciudad: txt(c.ciudad), ...(c.email ? { email: txt(c.email).toLowerCase() } : {}) },
    // Con líneas, el concepto y el IVA principal resumen la factura para listados y exportaciones.
    concepto: lineas ? txt(lineas.length > 1 ? `${lineas[0].concepto} y ${lineas.length - 1} más` : lineas[0].concepto, 200) : txt(b.concepto, 200),
    base,
    ivaPct: lineas ? desglose({ lineas })[0].pct : pctValido(b.ivaPct),
    lineas: lineas || undefined,
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
