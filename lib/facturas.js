// Alta de facturas: la usan la pantalla de facturas y la de presupuestos (al facturar la señal o el resto).
import { createHash } from 'node:crypto';
import { leer, leerUno, guardar, redis, clave } from './redis.js';
import { conCerrojo } from './cerrojo.js';
import { actualizarFactura, cerrojoFactura } from './actualizarFactura.js';
import { errorSimplificada, paisValido, sinNifEspana, validarFactura, validarNif } from './validacion.js';
import { TIPOS_OPERACION } from './operaciones.js';
import { modoDe, registroAlta, registroAnulacion, TIPOS_RECTIFICATIVA } from './verifactu.js';
import { enviarLuego } from './verifactuEnvio.js';
import { COMPENSACION, MARGEN, baseLinea, desglose, enRecc, fechaDevengo, importes, leerImporte, limpiarLineas, numeroFactura, pctValido, pendienteDe, r2, siguienteNumero, vencimiento } from './calculos.js';
import { actividadesDe, actividadValida, fiscalDe, limiteSimplificada, reccDe, serieDeActividad, serieSimplificada } from './empresa.js';
import { serieCaja } from './caja.js';
import { limpiarProyecto } from './proyectos.js';
import { opsSecundarios, procesarLuego, secundarios } from './trabajos.js';
import { guardarCliente, revisarRiesgo } from './tercerosServidor.js';
import { soltarEnlaces } from './enlacesBanco.js';
import { fechaCorta } from './formato.js';
import { avisarEvento } from './eventos.js';
import { aEuros, idiomaValido, monedaValida } from './idiomas.js';
import { cierresDe, comprobarCierre, fechaEnCierre } from './cierres.js';

// { moneda, cambio, fecha?, fuente? } de la factura: null en euros; { error } si el tipo de cambio no vale.
// cambio: cuántas unidades de la moneda vale 1 € (como lo publica el BCE).
export function limpiarDivisa(d) {
  if (!d || !monedaValida(d.moneda) || d.moneda === 'EUR') return null;
  const cambio = Number(String(d.cambio ?? '').replace(',', '.'));
  if (!Number.isFinite(cambio) || cambio <= 0 || cambio > 1e6) return { error: 'Pon el tipo de cambio: cuántas unidades de la moneda vale 1 €' };
  return { moneda: d.moneda, cambio: Math.round(cambio * 1e6) / 1e6, ...(/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') ? { fecha: d.fecha } : {}), fuente: d.fuente === 'BCE' ? 'BCE' : 'manual' };
}

// rectificativa: admite importes negativos. Valida en el servidor (lib/validacion.js, auditoría F06): fechas que existen,
// tipos de IVA e IRPF admitidos, NIF con su control, líneas e importes; nunca recorta en silencio.
// conRecargo: la empresa puede cobrar recargo de equivalencia (régimen general de IVA; quien está en recargo o exento, no).
// reagp: la empresa está en el régimen especial de la agricultura (cobra la compensación en vez de IVA).
// limiteSimplificada: hasta dónde llega su factura sin NIF del cliente (lib/empresa.js limiteSimplificada; 400 € sin él).
export function limpiar(b, actividades, sociedad = false, { rectificativa = false, conRecargo = false, reagp = false, igic = false, presupuesto = false, limiteSimplificada: limite } = {}) {
  // Las líneas en blanco del formulario (sin concepto ni precio) no cuentan.
  if (Array.isArray(b.lineas)) b = { ...b, lineas: b.lineas.filter((l) => String(l?.concepto ?? '').trim() || String(l?.precio ?? '').trim()) };
  const v = validarFactura(b, { rectificativa, igic, presupuesto, limiteSimplificada: limite });
  if (!v.ok) return { error: v.error, errores: v.errores };
  if (b.recargo === true && !conRecargo) return { error: 'Solo se cobra recargo de equivalencia en el régimen general de IVA', errores: { recargo: 'No aplicable a tu régimen de IVA' } };
  // En otra moneda (lib/idiomas.js), los precios llegan en esa moneda: se guardan tal cual (precioDivisa, baseDivisa) y
  // en euros al tipo de cambio, que es con lo que se calcula todo lo fiscal.
  const divisa = limpiarDivisa(b.divisa);
  if (divisa?.error) return { error: divisa.error, errores: { 'divisa.cambio': divisa.error } };
  const leidas = limpiarLineas(b.lineas);
  // Régimen de margen (REBU, REAV: lib/calculos.js): con líneas, en euros y con el coste de cada una; la base guardada es
  // la venta sin el IVA de su margen, para que base + IVA sea el precio.
  const margen = MARGEN[b.margen] ? b.margen : null;
  if (margen && (!leidas || divisa || b.recargo === true || b.oss?.pais)) return { error: 'Una factura de bienes usados o de agencia de viajes va por líneas, en euros y sin recargo ni ventanilla única' };
  const lineas = divisa && leidas ? leidas.map(({ coste: _c, ...l }) => ({ ...l, precioDivisa: l.precio, precio: aEuros(l.precio, divisa.cambio) })) : margen ? leidas : leidas?.map(({ coste: _c, ...l }) => l);
  const baseEscrita = lineas ? null : r2(leerImporte(b.base));
  const base = lineas ? r2(margen ? desglose({ lineas, margen }).reduce((s, d) => s + d.base, 0) : lineas.reduce((s, l) => s + baseLinea(l), 0)) : divisa ? r2(baseEscrita / divisa.cambio) : baseEscrita;
  // Compensación del REAGP: solo quien está en ese régimen, sobre ventas sin IVA y a empresas (no a particulares).
  const compensacion = COMPENSACION.includes(Number(b.compensacion)) ? Number(b.compensacion) : null;
  if (compensacion && (!reagp || (lineas || [{ ivaPct: b.ivaPct }]).some((l) => Number(l.ivaPct) !== 0))) return { error: 'La compensación del 12 % o el 10,5 % es del régimen especial de la agricultura, sobre ventas sin IVA', errores: { compensacion: 'No aplicable' } };
  if (!base) return { error: 'Importe no válido' };
  if (lineas?.some((l) => !l.concepto)) return { error: 'Falta el concepto de alguna línea' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '')) return { error: 'Fecha no válida' };
  const c = b.cliente || {};
  if (!String(c.nombre || '').trim()) return { error: 'Falta el cliente' };
  const txt = (v, n = 120) => String(v || '').trim().slice(0, n);
  // El NIF-IVA de la UE escrito sin el prefijo de su país se guarda con él (así lo reconocen el 303, el 349 y Verifactu).
  const nifCliente = validarNif(c.nif, { pais: paisValido(c.pais) ? c.pais : undefined }).nif || c.nif;
  return {
    ...(igic ? { impuesto: 'igic' } : {}),
    fecha: b.fecha,
    actividad: actividadValida(actividades, b.actividad),
    cliente: { nombre: txt(c.nombre), nif: txt(nifCliente, 20), direccion: txt(c.direccion), ciudad: txt(c.ciudad), ...(c.email ? { email: txt(c.email).toLowerCase() } : {}), ...(paisValido(c.pais) && c.pais.trim().toUpperCase() !== 'ES' ? { pais: c.pais.trim().toUpperCase() } : {}) },
    // Con líneas, el concepto y el IVA principal resumen la factura para listados y exportaciones.
    concepto: lineas ? txt(lineas.length > 1 ? `${lineas[0].concepto} y ${lineas.length - 1} más` : lineas[0].concepto, 200) : txt(b.concepto, 200),
    base,
    ivaPct: lineas ? desglose({ lineas })[0].pct : pctValido(b.ivaPct),
    lineas: lineas || undefined,
    // A una sociedad no se le practica retención de IRPF.
    irpfPct: sociedad ? 0 : Math.min(100, Math.max(0, Number(b.irpfPct) || 0)),
    nota: txt(b.nota, 300),
    cobrada: Boolean(b.cobrada),
    // Cliente comerciante minorista en recargo de equivalencia (art. 154 LIVA): se le cobra el recargo con el IVA.
    ...(b.recargo === true ? { recargo: true } : {}),
    // Por qué va sin IVA la parte que no lo lleva (lib/operaciones.js); sin elegir, se deduce del cliente.
    ...(TIPOS_OPERACION[b.operacion] ? { operacion: b.operacion } : {}),
    // Venta que no es de la actividad habitual (art. 104.Tres LIVA): un bien de inversión ('inversion') o una operación
    // inmobiliaria o financiera no habitual ('inmueble'). No cuenta en la prorrata y se resta del volumen del 390 (107 y 106).
    ...(['inversion', 'inmueble'].includes(b.accesoria) ? { accesoria: b.accesoria } : {}),
    // El bien de inversión que se vende (id de su gasto): se da de baja ese día (lib/amortizaciones.js bajasBienes).
    ...(b.accesoria === 'inversion' && /^[\w-]{1,64}$/.test(String(b.bien || '')) ? { bien: String(b.bien) } : {}),
    // Proyecto, obra o centro de coste (lib/proyectos.js).
    ...(limpiarProyecto(b.proyecto) ? { proyecto: limpiarProyecto(b.proyecto) } : {}),
    // Idioma del documento (sin él, español) y moneda en que se factura (sin ella, euros).
    ...(idiomaValido(b.idioma) && b.idioma !== 'es' ? { idioma: b.idioma } : {}),
    ...(divisa ? { divisa, ...(lineas ? {} : { baseDivisa: baseEscrita }) } : {}),
    // Venta a un particular de otro país de la UE con el IVA de su país (ventanilla única, lib/oss.js; validada arriba).
    // bienes: entrega de bienes enviados desde España (apartado 4 del 369); sin él, prestación de servicios (apartado 3).
    ...(b.oss?.pais ? { oss: { pais: String(b.oss.pais).toUpperCase(), ...(b.oss.bienes === true ? { bienes: true } : {}) } } : {}),
    // Régimen de margen y, en el de las agencias de viajes con un cliente empresa, «cuotas de IVA incluidas en el precio».
    ...(margen ? { margen, ...(margen === 'reav' && b.cuotasIncluidas === true ? { cuotasIncluidas: true } : {}) } : {}),
    ...(compensacion ? { compensacion } : {}),
    ...(b.evento?.fecha || b.evento?.lugar ? { evento: { fecha: /^\d{4}-\d{2}-\d{2}$/.test(b.evento.fecha || '') ? b.evento.fecha : '', lugar: txt(b.evento.lugar) } } : {}),
  };
}

// Factura del criterio de caja (lib/calculos.js): lleva la mención «Régimen especial del criterio de caja» (art. 6.1.p del
// Reglamento de facturación). Lo es si la empresa estaba en el régimen en su fecha (una rectificativa, si lo estaba su
// original) y lleva algo con IVA español; las ventas de la ventanilla única y los cierres de caja, nunca.
export function marcaRecc(u, f, original) {
  if (f.oss || f.caja || !desglose(f).some((d) => d.pct)) return {};
  const recc = reccDe(fiscalDe(u));
  const si = original ? Boolean(original.recc) || enRecc(recc, original.fecha) : enRecc(recc, f.fecha);
  return si ? { recc: true } : {};
}

// Guarda los datos del cliente sin perder su ficha (lib/tercerosServidor.js).
export { guardarCliente };

// Riesgo máximo del cliente superado: la factura no se emite (lo detecta la emisión, bajo su cerrojo).
export class RiesgoSuperado extends Error {
  constructor(evaluacion) { super(evaluacion.error); this.riesgo = evaluacion; }
}

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
  return { emisor, marca: { ...(u.marca?.color ? { color: u.marca.color } : {}), ...(logo ? { logo } : {}) }, logo: logo ? { [logo]: u.marca.logo } : null, regimenIva: fiscalDe(u).iva };
}

// Siguiente número de una serie y año. Informe de capacidad E05: en operación normal basta el contador guardado (una
// lectura), sin cargar el histórico. La primera vez de cada empresa (contadores de antes, facturas importadas sin
// contador, datos restaurados sin la marca) se verifica una sola vez contra facturas y borradas: cada contador sube al
// máximo emitido y se guarda la marca «_verificado» en el mismo hash, en la misma transacción. Desde entonces lo
// mantienen la emisión, el borrado, la anulación y la importación. Solo dentro del cerrojo de emisión.
export const VERIFICADO = '_verificado';
export async function verificarNumeracion(u) {
  const kNum = clave(u, 'numeracion');
  if (await redis.hget(kNum, VERIFICADO)) return false;
  const [cont, facturas, borradas] = await Promise.all([redis.hgetall(kNum), leer(u, 'facturas'), leer(u, 'facturasBorradas')]);
  const max = {};
  for (const f of [...(facturas || []), ...(borradas || [])]) {
    if (!Number.isInteger(f?.numero) || !f.anio) continue;
    const k = campoNum(f.serie || '', f.anio);
    if (f.numero > (max[k] || 0)) max[k] = f.numero;
  }
  const subir = Object.fromEntries(Object.entries(max).filter(([k, n]) => n > (Number(cont?.[k]) || 0)));
  await redis.hset(kNum, { ...subir, [VERIFICADO]: new Date().toISOString() });
  return true;
}
// El número que llevará la siguiente factura de una serie (solo para enseñarlo; el de verdad lo da la emisión). Con el
// contador verificado basta leerlo; si aún no lo está (empresa que no ha emitido desde el cambio), como antes.
export async function numeroPrevisto(u, serie, anio) {
  const cont = (await redis.hmget(clave(u, 'numeracion'), VERIFICADO, campoNum(serie, anio))) || {};
  if (cont[VERIFICADO]) return (Number(cont[campoNum(serie, anio)]) || 0) + 1;
  const [facturas, borradas] = await Promise.all([leer(u, 'facturas'), leer(u, 'facturasBorradas')]);
  return Math.max(Number(cont[campoNum(serie, anio)]) || 0, siguienteNumero([...(facturas || []), ...(borradas || [])], anio, serie) - 1) + 1;
}
// Ajustes › Series y numeración: que la siguiente factura de una serie y año empiece en otro número (quien viene de otro
// programa a mitad de año). Solo hacia arriba, nunca hacia abajo, para no repetir números; bajo el cerrojo de emisión.
export async function saltarNumeracion(u, serie, anio, siguiente) {
  if (!Number.isInteger(siguiente) || siguiente < 1 || siguiente > 999999) return { error: 'El número no es válido' };
  return conCerrojo(`emision:${empresaDe(u)}`, async () => {
    await verificarNumeracion(u);
    const actual = (Number(await redis.hget(clave(u, 'numeracion'), campoNum(serie, anio))) || 0) + 1;
    if (siguiente < actual) return { error: `La siguiente factura ya es la ${actual}: la numeración no puede ir hacia atrás` };
    if (siguiente > actual) await redis.hset(clave(u, 'numeracion'), { [campoNum(serie, anio)]: siguiente - 1 });
    return { ok: true, siguiente };
  });
}
async function siguienteSeguro(u, serie, anio) {
  await verificarNumeracion(u);
  return (Number(await redis.hget(clave(u, 'numeracion'), campoNum(serie, anio))) || 0) + 1;
}

// Facturas importadas de otro programa (con su serie y número de origen): se guardan bajo el cerrojo de emisión y en la
// misma transacción que suben los contadores, para que la siguiente emisión nunca repita uno de sus números.
export async function guardarImportadas(u, nuevas) {
  if (!nuevas.length) return 0;
  // Un trimestre cerrado por la gestoría (lib/cierres.js) no recibe facturas nuevas.
  const cerrado = fechaEnCierre(await cierresDe(u), ...nuevas.flatMap((f) => [f.fecha, fechaDevengo(f)]));
  if (cerrado) throw new RiesgoSuperado({ error: cerrado });
  return conCerrojo(`emision:${empresaDe(u)}`, async () => {
    await verificarNumeracion(u);
    const kNum = clave(u, 'numeracion');
    const cont = (await redis.hgetall(kNum)) || {};
    const max = {};
    for (const f of nuevas) { const k = campoNum(f.serie || '', f.anio); if (Number.isInteger(f.numero) && f.numero > (max[k] || 0)) max[k] = f.numero; }
    const subir = Object.fromEntries(Object.entries(max).filter(([k, n]) => n > (Number(cont[k]) || 0)));
    for (let i = 0; i < nuevas.length; i += 200) {
      const tx = redis.multi();
      tx.hset(clave(u, 'facturas'), Object.fromEntries(nuevas.slice(i, i + 200).map((x) => [x.id, x])));
      if (i === 0 && Object.keys(subir).length) tx.hset(kNum, subir);
      await tx.exec();
    }
    return nuevas.length;
  }, { caduca: 120000 });
}

// Dentro de una serie, los números y las fechas van en el mismo orden (numeración correlativa, art. 6.1.a del Reglamento
// de facturación): la factura N no debería llevar fecha anterior a la N−1 ni posterior a la N+1. Mira la vecina más
// cercana que exista (las borradas no cuentan) en cada sentido. Devuelve el aviso en texto o null.
// Es un aviso que se puede confirmar (forzarOrden en la API), no un bloqueo: una factura con fecha futura no puede
// impedir facturar hoy. Las emisiones automáticas (recurrentes, presupuestos, albaranes, caja) no lo miran.
export class FechaFueraDeOrden extends Error {}
const BUSCAR_VECINAS = 30;
export async function fechaFueraDeOrden(u, { serie = '', anio, numero, fecha }) {
  const ids = (paso) => Array.from({ length: BUSCAR_VECINAS }, (_, i) => numero + paso * (i + 1)).filter((n) => n > 0).map((n) => `${serie}${anio}-${n}`);
  const vecina = async (paso) => {
    const lista = ids(paso);
    if (!lista.length) return null;
    const docs = await redis.hmget(clave(u, 'facturas'), ...lista);
    const valores = Array.isArray(docs) ? docs : lista.map((id) => docs?.[id]);
    return valores.find((d) => d && d.fecha) || null;
  };
  const antes = await vecina(-1);
  if (antes && antes.fecha > fecha) return `La fecha no puede ser anterior a la de la factura ${numeroFactura(antes)} (${fechaCorta(antes.fecha)}): en una misma serie, las fechas van en el orden de los números. Pon el ${fechaCorta(antes.fecha)} o una fecha posterior.`;
  const despues = await vecina(1);
  if (despues && despues.fecha < fecha) return `La fecha no puede ser posterior a la de la factura ${numeroFactura(despues)} (${fechaCorta(despues.fecha)}): en una misma serie, las fechas van en el orden de los números.`;
  return null;
}

// construir(numero) → la factura completa. verifactu: si va a la cadena. Devuelve { factura, repetida }.
// ordenFechas: avisar si la fecha no sigue el orden de la serie (solo el formulario, y hasta que se confirme).
async function emitir(u, { serie, anio, idem, construir, verifactu, albaranes, ordenFechas = false }) {
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
    if (ordenFechas) {
      const fuera = await fechaFueraDeOrden(u, { serie, anio, numero, fecha: f.fecha });
      if (fuera) throw new FechaFueraDeOrden(fuera);
    }
    // Ficha del cliente: su riesgo máximo (no se emite si lo supera) y su plazo de cobro, que manda sobre el de Ajustes.
    // Solo suma riesgo lo que queda por cobrar: una rectificativa o una factura ya cobrada nunca se bloquean.
    const { ficha, bloqueo } = await revisarRiesgo(u, f.cliente, pendienteDe(f), { excluirAlbaranes: albaranes });
    if (bloqueo) throw new RiesgoSuperado(bloqueo);
    const plazo = Number.isInteger(ficha?.plazo) ? ficha.plazo : u.emisor?.plazo;
    const { emisor, marca, logo, regimenIva } = instantanea(u);
    // regimenIva: el del momento de emitir (el XML de Verifactu lo usa para la clave de régimen y las exenciones).
    f = { ...f, emisor, regimenIva, ...(Object.keys(marca).length ? { marca } : {}), vence: f.vence || vencimiento(f, plazo), emitida: new Date().toISOString() };
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
      tx.hset(clave(u, 'registros'), { [registro.Huella]: { id: registro.Huella, factura: f.id, modo: verifactu, ...registro } });
      tx.set(clave(u, 'verifactu'), registro.Huella);
      tx.set(`verifactu-pendiente:${empresaDe(u)}`, '1');
    }
    if (kIdem) tx.set(kIdem, f.id, { ex: DIAS_IDEM * 86400 });
    // Drive y Controla'T, como trabajos en la misma transacción (informe de capacidad E03): se responde sin esperarlos.
    opsSecundarios(tx, u, { facturas: [f.id], meses: [f.fecha] });
    await tx.exec();
    return { factura: f, repetida: false };
  });
}

// Facturas de antes de guardar la instantánea (migración de F05): se les congela la de ahora, antes de cambiar los
// datos del emisor, la marca o el plazo, para que no cambien después. Idempotente. Devuelve cuántas se han congelado.
// Informe P01: cada factura se congela bajo su cerrojo común (el de cobros, envíos y banco), releída en ese momento y
// añadiendo solo los campos de la instantánea: un cobro que llegue mientras tanto nunca se pierde. Orden de cerrojos:
// emisión → factura, como en subsanarVerifactu.
export async function congelarInstantaneas(u) {
  return conCerrojo(`emision:${empresaDe(u)}`, async () => {
    const sin = ((await leer(u, 'facturas')) || []).filter((f) => !f.emisor);
    if (!sin.length) return 0;
    const { emisor, marca, logo } = instantanea(u);
    if (logo) await redis.hset(clave(u, 'logos'), logo);
    const congelar = (id) => actualizarFactura(u, id, (f) => (f.emisor ? null : { nueva: { ...f, emisor, ...(Object.keys(marca).length ? { marca } : {}), vence: f.vence || vencimiento(f, u.emisor?.plazo), congelada: new Date().toISOString() } }));
    let n = 0;
    for (let i = 0; i < sin.length; i += 20) n += (await Promise.all(sin.slice(i, i + 20).map((f) => congelar(f.id)))).filter((r) => r.guardada).length;
    return n;
  }, { caduca: 120000 });
}

// Numera, registra en Verifactu (si la empresa lo tiene) y guarda. extra: campos que no vienen del formulario.
// idem: clave de idempotencia (doble clic, reintento tras una respuesta perdida, cron repetido): la misma clave
// devuelve la misma factura en vez de emitir otra.
// albaranes: los ids de los albaranes que esta factura sustituye (dejan de contar como riesgo del cliente).
export async function crearFactura(u, datos, { original, motivo, extra = {}, idem, albaranes, ordenFechas = false } = {}) {
  const cerrado = await comprobarCierre(u, datos.fecha, fechaDevengo(datos));
  if (cerrado) return { error: cerrado };
  // Las simplificadas (sin NIF del cliente) van en su propia serie (lib/empresa.js serieSimplificada).
  const serie = original ? 'R' : sinNifEspana(datos) ? serieSimplificada(actividadesDe(u)) : serieDeActividad(actividadesDe(u), datos.actividad);
  const anio = Number(datos.fecha.slice(0, 4));
  const modo = modoDe(u);
  if (modo) {
    if (!u.emisor?.nif) return { error: 'Rellena tu NIF en Ajustes' };
    // Una factura completa (F1) lleva siempre el NIF del cliente en el registro de Verifactu.
    if (!String(datos.cliente?.nif || '').trim()) return { error: 'Con Verifactu, la factura necesita el NIF del cliente' };
  }
  // Límite de la factura simplificada (art. 4 del Reglamento de facturación) también en lo que no pasa por el formulario:
  // la factura de un presupuesto (que se validó como presupuesto) y las recurrentes. Una rectificativa, sin límite.
  const t = importes(datos);
  const simplificada = !original && errorSimplificada(datos, r2(t.total + t.irpf), limiteSimplificada(fiscalDe(u)));
  if (simplificada) return { error: simplificada };
  const construir = (numero) => {
    const f = { id: `${serie}${anio}-${numero}`, numero, anio, ...datos, ...extra };
    if (serie) f.serie = serie;
    if (original) f.rectifica = { id: original.id, numero: numeroFactura(original), fecha: original.fecha, ...(TIPOS_RECTIFICATIVA[motivo] ? { motivo } : {}) };
    return Object.assign(f, marcaRecc(u, f, original));
  };
  let r;
  try { r = await emitir(u, { serie, anio, idem, construir, verifactu: modo, albaranes, ordenFechas }); } catch (e) { return { error: e.message || 'No se ha podido emitir la factura', ...(e instanceof RiesgoSuperado ? { riesgo: e.riesgo } : {}), ...(e instanceof FechaFueraDeOrden ? { ordenFechas: true } : {}) }; }
  const f = r.factura;
  if (r.repetida) return { factura: f, repetida: true };
  // Lo que va fuera de la transacción (avisos y copias): si falla, la factura ya está bien guardada.
  if (modo) enviarLuego(u);
  await guardarCliente(u, f.cliente).catch(() => {});
  procesarLuego(u);
  // Webhooks de la empresa (lib/eventos.js): la factura nueva y, si ya nace cobrada (un cierre de caja), su cobro.
  await avisarEvento(u, 'factura.creada', f);
  if (f.cobrada) await avisarEvento(u, 'factura.cobrada', f);
  return { factura: f };
}

// ---------- Verifactu: subsanación y anulación (auditoría F11) ----------
// Ambas son un registro nuevo en la misma cadena, con el mismo cerrojo y la misma transacción que una emisión.
async function encadenar(u, f, construir, { quedaMs }) {
  const anterior = (await redis.get(clave(u, 'verifactu'))) || '';
  const registro = construir(anterior);
  if (quedaMs() <= 0) throw new Error('La operación ha tardado demasiado: inténtalo de nuevo.');
  return registro;
}

// Subsanar un registro rechazado o aceptado con errores: se corrigen los datos del cliente (el error más habitual: su
// NIF o su nombre) y se envía otra vez como subsanación. No cambia importes ni conceptos: para eso, una rectificativa.
export async function subsanarVerifactu(u, id, { cliente } = {}) {
  return conCerrojo(`emision:${empresaDe(u)}`, (c) => conCerrojo(cerrojoFactura(u, id), async () => {
    const f = await leerUno(u, 'facturas', id);
    if (!f?.verifactu) return { error: 'Esa factura no está en Verifactu' };
    if (!['Incorrecto', 'AceptadoConErrores'].includes(f.verifactu.estado)) return { error: 'Solo se subsana un registro rechazado o aceptado con errores' };
    const cerrado = cliente && (await comprobarCierre(u, f.fecha, fechaDevengo(f)));
    if (cerrado) return { error: cerrado };
    const nuevo = cliente ? { ...f.cliente, nombre: String(cliente.nombre ?? f.cliente.nombre).trim().slice(0, 120), nif: String(cliente.nif ?? f.cliente.nif).trim().slice(0, 20) } : f.cliente;
    const v = validarNif(nuevo.nif, { pais: nuevo.pais });
    if (!nuevo.nombre || !v.ok || !v.tipo) return { error: v.ok ? 'El cliente necesita nombre y NIF' : v.error };
    const g = { ...f, cliente: nuevo };
    const r = await encadenar(u, g, (anterior) => registroAlta(g, f.emisor?.nif || u.emisor.nif, anterior, undefined, { subsanacion: true, rechazoPrevio: f.verifactu.estado === 'Incorrecto' ? 'X' : 'N' }), c);
    const nueva = { ...g, verifactu: { huella: r.Huella, fechaHora: r.FechaHoraHusoGenRegistro, modo: f.verifactu.modo, subsanaciones: (f.verifactu.subsanaciones || 0) + 1, anterior: f.verifactu.huella } };
    const tx = redis.multi();
    tx.hset(clave(u, 'facturas'), { [f.id]: nueva });
    tx.hset(clave(u, 'registros'), { [r.Huella]: { id: r.Huella, factura: f.id, modo: f.verifactu.modo, ...r } });
    tx.set(clave(u, 'verifactu'), r.Huella);
    tx.set(`verifactu-pendiente:${empresaDe(u)}`, '1');
    await tx.exec();
    return { factura: nueva };
  })).then((x) => { if (x.factura) enviarLuego(u); return x; });
}

// Anular el registro de una factura expedida por error (Orden HAC/1177/2024, art. 13). La factura sale de la lista y
// queda en «facturasBorradas» con su anulación; su número no se reutiliza. Si la factura existía de verdad y estaba mal,
// no se anula: se hace una rectificativa.
export async function anularVerifactu(u, id, { motivo = '' } = {}) {
  return conCerrojo(`emision:${empresaDe(u)}`, async (c) => {
    const f = await leerUno(u, 'facturas', id);
    if (!f?.verifactu) return { error: 'Esa factura no está en Verifactu' };
    const cerrado = await comprobarCierre(u, f.fecha, fechaDevengo(f));
    if (cerrado) return { error: cerrado };
    const r = await encadenar(u, f, (anterior) => registroAnulacion(f, f.emisor?.nif || u.emisor.nif, anterior), c);
    const anulada = { ...f, verifactu: { ...f.verifactu, anulacion: { huella: r.Huella, fecha: new Date().toISOString(), motivo: String(motivo).slice(0, 200) } }, borrada: { fecha: new Date().toISOString(), por: u.id, motivo: 'Anulada en Verifactu (expedida por error)' } };
    const campo = campoNum(f.serie || '', f.anio);
    const cont = Number(await redis.hget(clave(u, 'numeracion'), campo)) || 0;
    const tx = redis.multi();
    tx.hset(clave(u, 'facturasBorradas'), { [f.id]: anulada });
    tx.hdel(clave(u, 'facturas'), f.id);
    if (f.numero > cont) tx.hset(clave(u, 'numeracion'), { [campo]: f.numero });
    tx.hset(clave(u, 'registros'), { [r.Huella]: { id: r.Huella, factura: f.id, modo: f.verifactu.modo, ...r } });
    tx.set(clave(u, 'verifactu'), r.Huella);
    tx.set(`verifactu-pendiente:${empresaDe(u)}`, '1');
    await soltarEnlaces(u, tx, 'factura', f.id);
    await tx.exec();
    return { factura: anulada };
  }).then((x) => { if (x.factura) enviarLuego(u); return x; });
}

// Borrar una factura (solo si no está en Verifactu): su número no vuelve a usarse y queda constancia en
// «facturasBorradas» (quién y cuándo). Para corregir una factura ya enviada, mejor una rectificativa.
export async function borrarFactura(u, id, { por } = {}) {
  return conCerrojo(`emision:${empresaDe(u)}`, async () => {
    const f = await leerUno(u, 'facturas', id);
    if (!f) return { error: 'Esa factura ya no existe', status: 404 };
    if (f.verifactu) return { error: 'Esta factura ya está registrada en Verifactu: no se puede borrar, haz una rectificativa' };
    if (f.caja?.liquidacion) return { error: 'La tarjeta de este cierre ya está cuadrada con un ingreso del banco: deshaz ese cuadre antes de borrarlo', status: 409 };
    const cerrado = await comprobarCierre(u, f.fecha, fechaDevengo(f));
    if (cerrado) return { error: cerrado, status: 409 };
    const campo = campoNum(f.serie || '', f.anio);
    const cont = Number(await redis.hget(clave(u, 'numeracion'), campo)) || 0;
    const tx = redis.multi();
    tx.hset(clave(u, 'facturasBorradas'), { [f.id]: { ...f, borrada: { fecha: new Date().toISOString(), por: por || u.id } } });
    tx.hdel(clave(u, 'facturas'), f.id);
    if (!f.importada && f.numero > cont) tx.hset(clave(u, 'numeracion'), { [campo]: f.numero });
    // Los cobros del banco de esta factura vuelven a estar pendientes de emparejar.
    await soltarEnlaces(u, tx, 'factura', f.id);
    await tx.exec();
    return { factura: f };
  });
}

// Cierre de caja (lib/caja.js): serie Z, sin Verifactu (los tiques los registra el TPV). Con `antes`, lo corrige
// conservando su número.
export async function guardarCierre(u, datos, antes, { idem } = {}) {
  const anio = Number(datos.fecha.slice(0, 4));
  if (antes && anio !== antes.anio) return { error: `La fecha debe ser de ${antes.anio}` };
  const cerrado = await comprobarCierre(u, datos.fecha, fechaDevengo(datos), antes?.fecha, antes && fechaDevengo(antes));
  if (cerrado) return { error: cerrado };
  let f;
  if (antes) {
    // Corregir conserva el número y la instantánea del emisor de cuando se emitió.
    const r = await actualizarFactura(u, antes.id, (actual) => ({ nueva: { ...actual, unidades: undefined, resumen: undefined, proyecto: undefined, ...datos, id: antes.id, numero: antes.numero, anio, serie: antes.serie } }));
    if (r.error) return r;
    f = r.factura;
  } else {
    const serie = serieCaja(actividadesDe(u));
    try { f = (await emitir(u, { serie, anio, idem, construir: (numero) => ({ id: `${serie}${anio}-${numero}`, numero, anio, serie, ...datos }) })).factura; } catch (e) { return { error: e.message }; }
  }
  if (antes) await secundarios(u, { facturas: [f.id], meses: [f.fecha, antes.fecha] });
  else procesarLuego(u);
  return { factura: f };
}
