// Alta de facturas: la usan la pantalla de facturas y la de presupuestos (al facturar la señal o el resto).
import { createHash } from 'node:crypto';
import { leer, leerUno, guardar, redis, clave } from './redis.js';
import { conCerrojo } from './cerrojo.js';
import { validarFactura } from './validacion.js';
import { modoDe, registroAlta } from './verifactu.js';
import { enviarLuego } from './verifactuEnvio.js';
import { subirFactura } from './drive.js';
import { enviarNomina } from './controlat.js';
import { baseLinea, desglose, leerImporte, limpiarLineas, numeroFactura, pctValido, r2, siguienteNumero, vencimiento } from './calculos.js';
import { actividadesDe, actividadValida, serieDeActividad } from './empresa.js';
import { serieCaja } from './caja.js';
import { limpiarProyecto } from './proyectos.js';

// rectificativa: admite importes negativos. Valida en el servidor (lib/validacion.js, auditoría F06): fechas que existen,
// tipos de IVA e IRPF admitidos, NIF con su control, líneas e importes; nunca recorta en silencio.
export function limpiar(b, actividades, sociedad = false, { rectificativa = false } = {}) {
  // Las líneas en blanco del formulario (sin concepto ni precio) no cuentan.
  if (Array.isArray(b.lineas)) b = { ...b, lineas: b.lineas.filter((l) => String(l?.concepto ?? '').trim() || String(l?.precio ?? '').trim()) };
  const v = validarFactura(b, { rectificativa });
  if (!v.ok) return { error: v.error, errores: v.errores };
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
    // Proyecto, obra o centro de coste (lib/proyectos.js).
    ...(limpiarProyecto(b.proyecto) ? { proyecto: limpiarProyecto(b.proyecto) } : {}),
    ...(b.evento?.fecha || b.evento?.lugar ? { evento: { fecha: /^\d{4}-\d{2}-\d{2}$/.test(b.evento.fecha || '') ? b.evento.fecha : '', lugar: txt(b.evento.lugar) } } : {}),
  };
}

export const guardarCliente = (u, c) => guardar(u, 'clientes', { id: c.nombre.toUpperCase(), ...c });

// ---------- Emisión ----------
// Auditoría de octubre de 2026 (F01–F03, F05): la emisión de cada empresa va en fila (cerrojo con propietario) y todo lo
// que la forma se escribe en una sola transacción: la factura, su número en el contador de su serie y año, el registro
// Verifactu y la nueva cabeza de la cadena, y la clave de idempotencia. O se guarda todo o nada: sin facturas pisadas,
// sin números repetidos ni reutilizados (el contador no baja al borrar) y sin bifurcaciones ni registros huérfanos.
const IDEM = /^[\w:.-]{6,80}$/;
const DIAS_IDEM = 40;
const campoNum = (serie, anio) => `${serie || '-'}|${anio}`;
const empresaDe = (u) => u.empresa || u.id;

// Datos del emisor y de la marca en el momento de emitir: la factura se vuelve a generar siempre igual aunque luego
// cambien los ajustes. El logo se guarda una vez por versión (hash «logos»), la factura solo apunta a él.
export function instantanea(u) {
  const e = u.emisor || {};
  const emisor = Object.fromEntries(['nombre', 'nif', 'direccion', 'ciudad', 'iban', 'bic'].filter((k) => e[k]).map((k) => [k, e[k]]));
  const logo = u.marca?.logo ? createHash('sha256').update(u.marca.logo).digest('hex').slice(0, 24) : '';
  return { emisor, marca: { ...(u.marca?.color ? { color: u.marca.color } : {}), ...(logo ? { logo } : {}) }, logo: logo ? { [logo]: u.marca.logo } : null };
}

// Siguiente número de una serie y año: el contador guardado, sin bajar nunca de lo que ya existe (facturas de antes del
// contador, importadas o borradas). Solo dentro del cerrojo de emisión.
async function siguienteSeguro(u, serie, anio) {
  const [cont, facturas, borradas] = await Promise.all([redis.hget(clave(u, 'numeracion'), campoNum(serie, anio)), leer(u, 'facturas'), leer(u, 'facturasBorradas')]);
  return Math.max(Number(cont) || 0, siguienteNumero([...(facturas || []), ...(borradas || [])], anio, serie) - 1) + 1;
}

// construir(numero) → la factura completa. verifactu: si va a la cadena. Devuelve { factura, repetida }.
async function emitir(u, { serie, anio, idem, construir, verifactu }) {
  const kIdem = idem && IDEM.test(idem) ? clave(u, `idem:${idem}`) : null;
  return conCerrojo(`emision:${empresaDe(u)}`, async ({ quedaMs }) => {
    if (kIdem) {
      const ya = await redis.get(kIdem);
      const previa = ya && (await leerUno(u, 'facturas', String(ya)));
      if (previa) return { factura: previa, repetida: true };
    }
    let numero = await siguienteSeguro(u, serie, anio);
    let f = construir(numero);
    while (await redis.hget(clave(u, 'facturas'), f.id)) f = construir(++numero); // un id que ya existe nunca se pisa
    const { emisor, marca, logo } = instantanea(u);
    f = { ...f, emisor, ...(Object.keys(marca).length ? { marca } : {}), vence: f.vence || vencimiento(f, u.emisor?.plazo), emitida: new Date().toISOString() };
    let registro = null;
    if (verifactu) {
      const anterior = (await redis.get(clave(u, 'verifactu'))) || '';
      registro = registroAlta(f, u.emisor.nif, anterior);
      f.verifactu = { huella: registro.Huella, fechaHora: registro.FechaHoraHusoGenRegistro, modo: verifactu };
    }
    if (quedaMs() <= 0) throw new Error('La emisión ha tardado demasiado: inténtalo de nuevo.');
    const tx = redis.multi();
    tx.hset(clave(u, 'facturas'), { [f.id]: f });
    tx.hset(clave(u, 'numeracion'), { [campoNum(serie, anio)]: numero });
    if (logo) tx.hset(clave(u, 'logos'), logo);
    if (registro) {
      tx.hset(clave(u, 'registros'), { [registro.Huella]: { id: registro.Huella, factura: f.id, ...registro } });
      tx.set(clave(u, 'verifactu'), registro.Huella);
      tx.set(`verifactu-pendiente:${empresaDe(u)}`, '1');
    }
    if (kIdem) tx.set(kIdem, f.id, { ex: DIAS_IDEM * 86400 });
    await tx.exec();
    return { factura: f, repetida: false };
  });
}

// Facturas de antes de guardar la instantánea (migración de F05): se les congela la de ahora, antes de cambiar los
// datos del emisor, la marca o el plazo, para que no cambien después. Idempotente. Devuelve cuántas se han congelado.
export async function congelarInstantaneas(u) {
  return conCerrojo(`emision:${empresaDe(u)}`, async () => {
    const sin = ((await leer(u, 'facturas')) || []).filter((f) => !f.emisor);
    if (!sin.length) return 0;
    const { emisor, marca, logo } = instantanea(u);
    for (let i = 0; i < sin.length; i += 200) {
      const tx = redis.multi();
      if (logo && i === 0) tx.hset(clave(u, 'logos'), logo);
      tx.hset(clave(u, 'facturas'), Object.fromEntries(sin.slice(i, i + 200).map((f) => [f.id, { ...f, emisor, ...(Object.keys(marca).length ? { marca } : {}), vence: f.vence || vencimiento(f, u.emisor?.plazo), congelada: new Date().toISOString() }])));
      await tx.exec();
    }
    return sin.length;
  });
}

// Numera, registra en Verifactu (si la empresa lo tiene) y guarda. extra: campos que no vienen del formulario.
// idem: clave de idempotencia (doble clic, reintento tras una respuesta perdida, cron repetido): la misma clave
// devuelve la misma factura en vez de emitir otra.
export async function crearFactura(u, datos, { original, extra = {}, idem } = {}) {
  const serie = original ? 'R' : serieDeActividad(actividadesDe(u), datos.actividad);
  const anio = Number(datos.fecha.slice(0, 4));
  const modo = modoDe(u);
  if (modo) {
    if (!u.emisor?.nif) return { error: 'Rellena tu NIF en Ajustes' };
    // Una factura completa (F1) lleva siempre el NIF del cliente en el registro de Verifactu.
    if (!String(datos.cliente?.nif || '').trim()) return { error: 'Con Verifactu, la factura necesita el NIF del cliente' };
  }
  const construir = (numero) => {
    const f = { id: `${serie}${anio}-${numero}`, numero, anio, ...datos, ...extra };
    if (serie) f.serie = serie;
    if (original) f.rectifica = { id: original.id, numero: numeroFactura(original), fecha: original.fecha };
    return f;
  };
  let r;
  try { r = await emitir(u, { serie, anio, idem, construir, verifactu: modo }); } catch (e) { return { error: e.message || 'No se pudo emitir la factura' }; }
  const f = r.factura;
  if (r.repetida) return { factura: f, repetida: true };
  // Lo que va fuera de la transacción (avisos y copias): si falla, la factura ya está bien guardada.
  if (modo) enviarLuego(u);
  await guardarCliente(u, f.cliente).catch(() => {});
  await Promise.all([subirFactura(u, f), enviarNomina(u, [f.fecha])]).catch(() => {});
  return { factura: f };
}

// Borrar una factura (solo si no está en Verifactu): su número no vuelve a usarse y queda constancia en
// «facturasBorradas» (quién y cuándo). Para corregir una factura ya enviada, mejor una rectificativa.
export async function borrarFactura(u, id, { por } = {}) {
  return conCerrojo(`emision:${empresaDe(u)}`, async () => {
    const f = await leerUno(u, 'facturas', id);
    if (!f) return { error: 'Esa factura ya no existe', status: 404 };
    if (f.verifactu) return { error: 'Esta factura ya está registrada en Verifactu: no se puede borrar, haz una rectificativa' };
    const campo = campoNum(f.serie || '', f.anio);
    const cont = Number(await redis.hget(clave(u, 'numeracion'), campo)) || 0;
    const tx = redis.multi();
    tx.hset(clave(u, 'facturasBorradas'), { [f.id]: { ...f, borrada: { fecha: new Date().toISOString(), por: por || u.id } } });
    tx.hdel(clave(u, 'facturas'), f.id);
    if (!f.importada && f.numero > cont) tx.hset(clave(u, 'numeracion'), { [campo]: f.numero });
    await tx.exec();
    return { factura: f };
  });
}

// Cierre de caja (lib/caja.js): serie Z, sin Verifactu (los tiques los registra el TPV). Con `antes`, lo corrige
// conservando su número.
export async function guardarCierre(u, datos, antes, { idem } = {}) {
  const anio = Number(datos.fecha.slice(0, 4));
  if (antes && anio !== antes.anio) return { error: `La fecha debe ser de ${antes.anio}` };
  let f;
  if (antes) {
    // Corregir conserva el número y la instantánea del emisor de cuando se emitió.
    f = { ...antes, unidades: undefined, resumen: undefined, proyecto: undefined, ...datos, id: antes.id, numero: antes.numero, anio, serie: antes.serie };
    await guardar(u, 'facturas', f);
  } else {
    const serie = serieCaja(actividadesDe(u));
    try { f = (await emitir(u, { serie, anio, idem, construir: (numero) => ({ id: `${serie}${anio}-${numero}`, numero, anio, serie, ...datos }) })).factura; } catch (e) { return { error: e.message }; }
  }
  await Promise.all([subirFactura(u, f), enviarNomina(u, [f.fecha, ...(antes ? [antes.fecha] : [])])]).catch(() => {});
  return { factura: f };
}
