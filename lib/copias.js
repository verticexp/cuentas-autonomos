import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { comprobarIntegridad } from './integridad.js';
import { membresias, enEmpresa, conMembresia } from './membresias.js';
import { claves as clavesIndice, coleccionDe } from './fichas.js';

const PREFIJO = 'cuentas:';
// Los índices (ix…:, lib/fichas.js) se derivan de los documentos: no van en la copia y se reconstruyen solos. La cola de
// trabajos (lib/trabajos.js) tampoco: es un conjunto ordenado de lo que falta por hacer, no datos de la empresa.
const FUERA = /^cuentas:(sesion|intentos|desbloqueo|cerrojo|ix[pifnv]?:|cola-trabajos$|trabajo-uso:)/;
const CABECERA = Buffer.from('NETTOCOPIA2');
const GLOBALES = new Set(['cuentas:empresas', 'cuentas:usuarios', 'cuentas:emails']);
const TIPOS = new Set(['hash', 'set', 'list', 'string']);
const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const tiempo = (ahora = Date.now) => {
  const n = new Date(typeof ahora === 'function' ? ahora() : ahora).getTime();
  if (!Number.isFinite(n)) throw new Error('Fecha «ahora» inválida');
  return n;
};
const empresaDe = (k) => /^cuentas:[^:]+:([^:]+)$/.exec(k)?.[1];
const canonica = (v) => JSON.stringify(v, function (_, x) {
  return objeto(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x;
});
const huellaDe = (datos) => createHash('sha256').update(canonica(datos)).digest('hex');

function hash(v) {
  if (Array.isArray(v)) {
    if (v.length % 2 || v.some((x) => typeof x !== 'string')) throw new Error('Hash plano inválido');
    return Object.fromEntries(Array.from({ length: v.length / 2 }, (_, i) => [v[2 * i], v[2 * i + 1]]));
  }
  if (!objeto(v) || Object.values(v).some((x) => typeof x !== 'string')) throw new Error('Hash inválido: se necesitan valores crudos (strings)');
  return v;
}

function normalizar(datos) {
  if (!objeto(datos)) throw new Error('Datos de copia inválidos');
  return Object.fromEntries(Object.entries(datos).map(([k, d]) => {
    if (!k.startsWith(PREFIJO)) throw new Error(`Clave fuera de «cuentas:»: ${k}`);
    if (!objeto(d) || !TIPOS.has(d.tipo)) throw new Error(`Tipo inválido: ${k}`);
    let valor = d.valor;
    if (d.tipo === 'hash') valor = hash(valor);
    else if (d.tipo === 'string') {
      if (typeof valor !== 'string') throw new Error(`String inválido: ${k}`);
    } else if (!Array.isArray(valor) || valor.some((x) => typeof x !== 'string')) throw new Error(`Colección inválida: ${k}`);
    if (d.tipo === 'set' && new Set(valor).size !== valor.length) throw new Error(`Set con duplicados: ${k}`);
    if (d.caduca !== undefined && (typeof d.caduca !== 'number' || !Number.isFinite(d.caduca))) throw new Error(`Caducidad inválida: ${k}`);
    return [k, { ...d, valor }];
  }));
}

function empresasDe(datos) {
  return [...new Set([
    ...Object.keys(datos['cuentas:empresas']?.valor || {}),
    ...Object.keys(datos).map(empresaDe).filter(Boolean),
  ])].sort();
}

function resumir(datos) {
  const empresas = empresasDe(datos);
  const porTipo = {};
  for (const d of Object.values(datos)) porTipo[d.tipo] = (porTipo[d.tipo] || 0) + 1;
  const cuenta = (nombre) => Object.fromEntries(empresas.map((id) => [id, Object.keys(datos[`cuentas:${nombre}:${id}`]?.valor || {}).length]));
  return { claves: Object.keys(datos).length, porTipo, empresas, facturas: cuenta('facturas'), registros: cuenta('registros') };
}

// Permite preparar una copia parcial conservando el mismo formato y la misma huella.
export function copiaDeDatos(datos, { ahora, inconsistentes = [] } = {}) {
  datos = normalizar(datos);
  const resumen = resumir(datos);
  if (inconsistentes.length) resumen.inconsistentes = [...new Set(inconsistentes)].sort();
  return { version: 2, fecha: new Date(tiempo(ahora)).toISOString(), datos, resumen, huella: huellaDe(datos) };
}

async function escanear(r) {
  const claves = new Set();
  let cursor = '0';
  do {
    const [c, ks] = await r.scan(cursor, { match: 'cuentas:*', count: 500 });
    cursor = String(c);
    for (const k of ks) if (k.startsWith(PREFIJO) && !FUERA.test(k)) claves.add(k);
  } while (cursor !== '0');
  return [...claves].sort();
}

async function leerClave(r, k, ahora) {
  const tipo = await r.type(k);
  if (tipo === 'none') return null;
  if (!TIPOS.has(tipo)) throw new Error(`Tipo Redis no soportado (${tipo}): ${k}`);
  const inicio = tiempo(ahora);
  const ms = await r.pttl(k);
  if (ms === -2 || ms === 0) return null;
  let valor;
  if (tipo === 'hash') valor = hash((await r.hgetall(k)) || {});
  if (tipo === 'set') valor = (await r.smembers(k)).sort();
  if (tipo === 'list') valor = await r.lrange(k, 0, -1);
  if (tipo === 'string') valor = await r.get(k);
  if (valor === null || await r.type(k) === 'none') return null;
  return { tipo, valor, ...(ms >= 0 ? { caduca: inicio + ms } : {}) };
}

function firma(datos) {
  // PTTL varía entre lecturas: la firma compara claves, tipos y valores crudos.
  return huellaDe(Object.fromEntries(Object.entries(datos).map(([k, { tipo, valor }]) => [k, { tipo, valor }])));
}

async function leerEmpresa(r, id, ahora) {
  const datos = Object.create(null);
  // Se repite SCAN: las escrituras pueden crear o eliminar claves.
  for (const k of (await escanear(r)).filter((k) => empresaDe(k) === id)) {
    const d = await leerClave(r, k, ahora);
    if (d) datos[k] = d;
  }
  return datos;
}

export async function hacerCopia(r, { ahora } = {}) {
  const fecha = tiempo(ahora);
  const datos = Object.create(null);
  const claves = await escanear(r);
  for (const k of claves.filter((k) => !empresaDe(k))) {
    const d = await leerClave(r, k, ahora);
    if (d) datos[k] = d;
  }
  if (claves.some(empresaDe) && datos['cuentas:empresas']?.tipo !== 'hash') throw new Error('Falta «cuentas:empresas» aunque existen claves de empresa');
  const empresas = [...new Set([...Object.keys(datos['cuentas:empresas']?.valor || {}), ...claves.map(empresaDe).filter(Boolean)])].sort();
  for (const id of empresas) {
    let estable = false;
    for (let intento = 0; intento < 3; intento++) {
      const antes = firma(await leerEmpresa(r, id, ahora));
      const parcial = await leerEmpresa(r, id, ahora);
      const despues = firma(await leerEmpresa(r, id, ahora));
      if (antes === firma(parcial) && antes === despues) {
        Object.assign(datos, parcial);
        estable = true;
        break;
      }
    }
    if (!estable) throw new Error(`No se pudo obtener una copia estable de la empresa ${id} tras 3 intentos: cambios durante la lectura`);
  }
  return copiaDeDatos(datos, { ahora: fecha });
}

function claveDe(base64) {
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(base64)) throw new Error('COPIA_CLAVE debe ser una clave de 32 bytes en base64');
  const clave = Buffer.from(base64, 'base64');
  if (clave.length !== 32 || clave.toString('base64') !== base64) throw new Error('COPIA_CLAVE debe ser una clave de 32 bytes en base64');
  return clave;
}

export function cifrar(copia, claveBase64) {
  const clave = claveDe(claveBase64), iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', clave, iv);
  const contenido = Buffer.concat([cifrador.update(gzipSync(JSON.stringify(copia))), cifrador.final()]);
  return Buffer.concat([CABECERA, iv, cifrador.getAuthTag(), contenido]);
}

export function descifrar(buffer, claveBase64) {
  const clave = claveDe(claveBase64);
  buffer = Buffer.from(buffer);
  if (buffer.length <= CABECERA.length + 28 || !buffer.subarray(0, CABECERA.length).equals(CABECERA)) throw new Error('Formato de copia cifrada inválido o manipulado');
  const p = CABECERA.length;
  const descifrador = createDecipheriv('aes-256-gcm', clave, buffer.subarray(p, p + 12));
  descifrador.setAuthTag(buffer.subarray(p + 12, p + 28));
  let comprimido;
  try { comprimido = Buffer.concat([descifrador.update(buffer.subarray(p + 28)), descifrador.final()]); }
  catch { throw new Error('Copia manipulada o COPIA_CLAVE incorrecta (autenticación AES-GCM)'); }
  try { return JSON.parse(gunzipSync(comprimido).toString('utf8')); }
  catch { throw new Error('Contenido de copia cifrada inválido'); }
}

export function datosIntegridad(datos, id) {
  const lista = (nombre) => Object.values(hash(datos[`cuentas:${nombre}:${id}`]?.valor || {})).map((v) => {
    const d = JSON.parse(v);
    if (!objeto(d)) throw new Error(`Registro JSON inválido: ${nombre}:${id}`);
    return d;
  });
  return { facturas: lista('facturas'), borradas: lista('facturasBorradas'), registros: lista('registros'),
    cabeza: datos[`cuentas:verifactu:${id}`]?.valor || '', numeracion: hash(datos[`cuentas:numeracion:${id}`]?.valor || {}) };
}

// Coherencia entre banco, facturas y gastos con el modelo real (lib/bancoServidor.js): un movimiento emparejado lleva
// enlace { tipo, id }; la factura cobrada por él, cobro.banco; el gasto pagado por él, banco. Los cobros y pagos
// manuales (sin referencia al banco) siguen siendo válidos.
function coherenciaBancaria(datos, empresa) {
  const documentos = (nombre) => Object.fromEntries(Object.entries(hash(datos[`cuentas:${nombre}:${empresa}`]?.valor || {})).map(([id, v]) => {
    const d = JSON.parse(v);
    if (!objeto(d)) throw new Error(`Registro JSON inválido: ${nombre}:${empresa}:${id}`);
    return [id, d];
  }));
  const facturas = documentos('facturas'), gastos = documentos('gastos'), banco = documentos('banco');
  const errores = [];
  const avisar = (texto) => errores.push(`${empresa}: conciliacion-bancaria: ${texto}`);
  const emparejadoCon = (m, tipo, id) => m.estado === 'emparejado' && m.enlace?.tipo === tipo && m.enlace?.id === id;
  // Desde el informe R01 cada movimiento es un pago de la factura (pagos[].banco); las de antes, cobro.banco.
  const movimientosDe = (f) => new Set([f.cobro?.banco, ...(f.pagos || []).map((p) => p.banco)].filter(Boolean));
  for (const [id, f] of Object.entries(facturas)) {
    if (f.cobro?.banco && !f.cobrada) avisar(`factura ${id}: referencia bancaria ${f.cobro.banco} sin estar cobrada`);
    for (const mid of movimientosDe(f)) {
      const m = banco[mid];
      if (!m) avisar(`factura ${id}: movimiento ${mid} inexistente`);
      else if (!emparejadoCon(m, 'factura', id)) avisar(`factura ${id}: movimiento ${mid} no conciliado con ese documento`);
    }
  }
  for (const [id, g] of Object.entries(gastos)) {
    const mid = g.banco;
    if (!mid) continue;
    const m = banco[mid];
    if (g.pendiente) avisar(`gasto ${id}: referencia bancaria ${mid} sin estar pagado`);
    if (!m) avisar(`gasto ${id}: movimiento ${mid} inexistente`);
    else if (!emparejadoCon(m, 'gasto', id)) avisar(`gasto ${id}: movimiento ${mid} no conciliado con ese documento`);
  }
  for (const [mid, m] of Object.entries(banco)) {
    if (m.estado !== 'emparejado' || !['factura', 'gasto'].includes(m.enlace?.tipo)) continue;
    const { tipo, id } = m.enlace;
    const d = (tipo === 'factura' ? facturas : gastos)[id];
    if (!d) avisar(`movimiento ${mid}: ${tipo} ${id} inexistente`);
    else if (tipo === 'factura' ? !movimientosDe(d).has(mid) || (d.cobro?.banco === mid && !d.cobrada) : d.banco !== mid || d.pendiente) avisar(`movimiento ${mid}: ${tipo} ${id} sin referencia recíproca o sin cobro/pago`);
  }
  return errores;
}

export function verificarCopia(copia) {
  const errores = [], avisos = [];
  try {
    if (!objeto(copia) || (copia.version !== undefined && ![1, 2].includes(copia.version))) throw new Error('Versión de copia no soportada');
    if (typeof copia.fecha !== 'string' || !Number.isFinite(Date.parse(copia.fecha))) errores.push('Fecha de copia inválida');
    const datos = normalizar(copia.datos);
    for (const [k, d] of Object.entries(datos)) if (GLOBALES.has(k) && d.tipo !== 'hash') errores.push(`El hash global ${k} tiene tipo inválido`);
    for (const id of empresasDe(datos)) {
      for (const n of ['facturas', 'facturasBorradas', 'registros', 'numeracion', 'gastos', 'banco']) {
        const d = datos[`cuentas:${n}:${id}`];
        if (d && d.tipo !== 'hash') errores.push(`Tipo inválido para ${n}:${id}`);
      }
    }
    if (copia.version === 2) {
      if (copia.huella !== huellaDe(copia.datos)) errores.push('Huella SHA-256 incorrecta: datos manipulados');
      if (Object.keys(datos).some(empresaDe) && datos['cuentas:empresas']?.tipo !== 'hash') errores.push('Falta «cuentas:empresas»');
      const esperado = resumir(datos);
      for (const k of Object.keys(esperado)) if (canonica(copia.resumen?.[k]) !== canonica(esperado[k])) errores.push(`Resumen incoherente: ${k}`);
      const inc = copia.resumen?.inconsistentes;
      if (inc !== undefined && (!Array.isArray(inc) || new Set(inc).size !== inc.length || inc.some((id) => !esperado.empresas.includes(id)))) errores.push('Resumen incoherente: inconsistentes');
      else if (inc?.length) {
        const mensaje = `Empresas con cambios durante la copia: ${inc.join(', ')}`;
        avisos.push(mensaje);
        errores.push(mensaje);
      }
    } else avisos.push('Copia v1: no contiene huella ni garantía de consistencia');
    for (const id of empresasDe(datos)) {
      try {
        // Los avisos se agrupan por tipo (una línea por empresa, no una por factura); los errores van uno a uno.
        const porTipo = {};
        for (const inc of comprobarIntegridad(datosIntegridad(datos, id))) {
          if (['sin-instantanea', 'contador-atrasado'].includes(inc.tipo)) (porTipo[inc.tipo] ||= []).push(inc.detalle);
          else errores.push(`${id}: ${inc.tipo}: ${inc.detalle}`);
        }
        for (const [tipo, xs] of Object.entries(porTipo)) avisos.push(`${id}: ${tipo}: ${xs.length} (${xs.slice(0, 3).join(', ')}${xs.length > 3 ? '…' : ''})`);
        const bancarios = coherenciaBancaria(datos, id);
        errores.push(...bancarios);
        avisos.push(...bancarios);
      } catch (e) { errores.push(`${id}: ${e.message}`); }
    }
  } catch (e) { errores.push(e.message); }
  return { ok: errores.length === 0, errores, avisos };
}

function pertenece(usuario, empresa) {
  return enEmpresa(usuario, empresa) || Object.hasOwn(membresiasAntiguas(usuario), empresa);
}

function membresiasAntiguas(usuario) {
  const m = usuario.membresias;
  const entradas = Array.isArray(m) ? m.map((x) => [typeof x === 'string' ? x : x?.empresa || x?.empresaId || x?.id, x])
    : objeto(m) ? Object.entries(m) : [];
  return Object.fromEntries(entradas.filter(([id]) => id).map(([id, x]) => [id,
    objeto(x) ? { rol: x.rol || 'miembro', permisos: x.permisos || [] } : { rol: typeof x === 'string' && !Array.isArray(m) ? x : 'miembro' },
  ]));
}

function todasMembresias(usuario) {
  return { ...membresiasAntiguas(usuario), ...membresias(usuario) };
}

function restaurarMembresia(destino, origen, empresa) {
  // Solo el papel en esta empresa viene de la copia; principal y demás papeles vienen del destino.
  const usuario = { ...destino, ...origen, empresa: destino.empresa || destino.id, empresas: todasMembresias(destino) };
  delete usuario.membresias;
  return conMembresia(usuario, empresa, origen ? todasMembresias(origen)[empresa] : null);
}

export function seleccionarDatos(copia, empresa) {
  const datos = normalizar(copia.datos);
  if (empresa === undefined) return datos;
  if (typeof empresa !== 'string' || !empresa || empresa.includes(':')) throw new Error('Id de empresa inválido');
  const usuarios = Object.fromEntries(Object.entries(datos['cuentas:usuarios']?.valor || {}).filter(([, v]) => pertenece(JSON.parse(v), empresa)));
  const ids = new Set(Object.keys(usuarios));
  const emails = Object.fromEntries(Object.entries(datos['cuentas:emails']?.valor || {}).filter(([, id]) => ids.has(id)));
  const seleccion = Object.fromEntries(Object.entries(datos).filter(([k]) => empresaDe(k) === empresa));
  const campos = { 'cuentas:empresas': Object.fromEntries(Object.entries(datos['cuentas:empresas']?.valor || {}).filter(([id]) => id === empresa)), 'cuentas:usuarios': usuarios, 'cuentas:emails': emails };
  if (!Object.keys(seleccion).length && Object.values(campos).every((v) => !Object.keys(v).length)) return {};
  for (const [k, valor] of Object.entries(campos)) if (datos[k]) seleccion[k] = { ...datos[k], valor };
  return seleccion;
}

export async function restaurar(r, copia, { empresa, sobrescribir = false, escribir = false, ahora } = {}) {
  const datos = seleccionarDatos(copia, empresa);
  // Se valida toda la selección antes de cualquier escritura, incluso con --forzar.
  const informe = { nuevas: 0, existen: 0, sobrescritas: 0, caducadas: 0, claves: [] };
  const globales = {};
  if (empresa !== undefined) {
    for (const k of GLOBALES) {
      const tipo = await r.type(k);
      if (!['none', 'hash'].includes(tipo)) throw new Error(`El destino ${k} no es un hash`);
      globales[k] = { tipo, valor: hash((await r.hgetall(k)) || {}) };
    }
  }
  const usuariosDestino = empresa === undefined ? [] : Object.entries(globales['cuentas:usuarios'].valor)
    .filter(([, v]) => pertenece(JSON.parse(v), empresa)).map(([id]) => id);
  const idsUsuarios = new Set([...usuariosDestino, ...Object.keys(datos['cuentas:usuarios']?.valor || {})]);
  const usuariosRestaurados = {};
  const compartidos = new Set();
  if (empresa !== undefined && sobrescribir) {
    for (const id of idsUsuarios) {
      const previo = globales['cuentas:usuarios'].valor[id];
      const origen = datos['cuentas:usuarios']?.valor[id];
      if (!previo) { if (origen) usuariosRestaurados[id] = origen; continue; }
      const destino = JSON.parse(previo);
      if (Object.keys(todasMembresias(destino)).some((id) => id !== empresa)) compartidos.add(id);
      const fusionado = restaurarMembresia(destino, origen ? JSON.parse(origen) : undefined, empresa);
      if (Object.keys(fusionado.empresas).length) usuariosRestaurados[id] = JSON.stringify(fusionado);
    }
  }
  for (const [k, d] of Object.entries(datos).sort(([a], [b]) => a.localeCompare(b))) {
    const entrada = { clave: k };
    informe.claves.push(entrada);
    if (d.caduca !== undefined && d.caduca <= tiempo(ahora)) { informe.caducadas++; entrada.accion = 'caducada'; continue; }
    const parcial = empresa !== undefined && GLOBALES.has(k);
    let valor = d.valor;
    let existe;
    let borrarCampos = [];
    if (parcial) {
      const anteriores = globales[k].valor;
      if (sobrescribir && k === 'cuentas:usuarios') valor = usuariosRestaurados;
      const campos = Object.keys(valor);
      entrada.campos = campos;
      const delAmbito = k === 'cuentas:empresas' ? [empresa] : k === 'cuentas:usuarios' ? usuariosDestino
        : Object.entries(anteriores).filter(([, id]) => idsUsuarios.has(id) && !compartidos.has(id)).map(([email]) => email);
      borrarCampos = [...new Set([...delAmbito, ...campos])].filter((f) => Object.hasOwn(anteriores, f));
      existe = borrarCampos.length > 0;
      entrada.camposBorrados = sobrescribir ? borrarCampos : [];
      if (!sobrescribir) valor = Object.fromEntries(Object.entries(valor).filter(([f]) => !Object.hasOwn(anteriores, f)));
      entrada.camposEscritos = Object.keys(valor);
      if (!entrada.camposEscritos.length && (!sobrescribir || !borrarCampos.length)) { informe.existen++; entrada.accion = 'existe'; continue; }
    } else existe = Boolean(await r.exists(k));
    if (existe && !sobrescribir && !parcial) { informe.existen++; entrada.accion = 'existe'; continue; }
    if (existe && sobrescribir) { informe.sobrescritas++; entrada.accion = 'sobrescribir'; }
    else { informe.nuevas++; entrada.accion = 'nueva'; if (existe) informe.existen++; }
    if (!escribir) continue;
    // Volver a calcular antes de borrar evita revivir una clave caducada durante la lectura.
    const ms = d.caduca === undefined ? null : d.caduca - tiempo(ahora);
    if (ms !== null && ms <= 0) {
      informe[entrada.accion === 'sobrescribir' ? 'sobrescritas' : 'nuevas']--;
      informe.caducadas++; entrada.accion = 'caducada'; continue;
    }
    if (sobrescribir) {
      if (parcial) { if (borrarCampos.length) await r.hdel(k, ...borrarCampos); }
      else await r.del(k);
    }
    if (d.tipo === 'hash' && Object.keys(valor).length) await r.hset(k, valor);
    if (d.tipo === 'set' && valor.length) await r.sadd(k, ...valor);
    if (d.tipo === 'list' && valor.length) await r.rpush(k, ...valor);
    if (d.tipo === 'string') await r.set(k, valor);
    // Una colección indexada restaurada invalida su índice: se reconstruye al leerla (lib/indices.js).
    const col = coleccionDe(k.slice(PREFIJO.length));
    if (col) await r.del(...Object.values(clavesIndice(col.col, col.emp)).map((x) => PREFIJO + x));
    // Una caducidad sobre un hash compartido afectaría a las otras empresas.
    if (ms !== null && (!parcial || globales[k].tipo === 'none')) await r.pexpire(k, Math.max(1, d.caduca - tiempo(ahora)));
  }
  return informe;
}
