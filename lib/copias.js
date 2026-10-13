import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { comprobarIntegridad } from './integridad.js';

const PREFIJO = 'cuentas:';
const FUERA = /^cuentas:(sesion|intentos|desbloqueo|cerrojo)/;
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

async function firma(r, id) {
  const cantidades = [];
  for (const n of ['facturas', 'facturasBorradas', 'registros', 'gastos']) cantidades.push(await r.hlen(`cuentas:${n}:${id}`));
  return canonica({ cantidades, cabeza: await r.get(`cuentas:verifactu:${id}`), numeracion: hash((await r.hgetall(`cuentas:numeracion:${id}`)) || {}) });
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
  const inconsistentes = [];
  for (const id of empresas) {
    let estable = false;
    for (let intento = 0; intento < 3; intento++) {
      const antes = await firma(r, id);
      const parcial = Object.create(null);
      // Se repite SCAN: una emisión puede crear claves que aún no existían.
      for (const k of (await escanear(r)).filter((k) => empresaDe(k) === id)) {
        const d = await leerClave(r, k, ahora);
        if (d) parcial[k] = d;
      }
      const despues = await firma(r, id);
      for (const k of Object.keys(datos).filter((k) => empresaDe(k) === id)) delete datos[k];
      Object.assign(datos, parcial);
      if (antes === despues) { estable = true; break; }
    }
    if (!estable) inconsistentes.push(id);
  }
  return copiaDeDatos(datos, { ahora: fecha, inconsistentes });
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

export function verificarCopia(copia) {
  const errores = [], avisos = [];
  try {
    if (!objeto(copia) || (copia.version !== undefined && ![1, 2].includes(copia.version))) throw new Error('Versión de copia no soportada');
    if (typeof copia.fecha !== 'string' || !Number.isFinite(Date.parse(copia.fecha))) errores.push('Fecha de copia inválida');
    const datos = normalizar(copia.datos);
    for (const [k, d] of Object.entries(datos)) if (GLOBALES.has(k) && d.tipo !== 'hash') errores.push(`El hash global ${k} tiene tipo inválido`);
    for (const id of empresasDe(datos)) {
      for (const n of ['facturas', 'facturasBorradas', 'registros', 'numeracion', 'gastos']) {
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
      else if (inc?.length) avisos.push(`Empresas con cambios durante la copia: ${inc.join(', ')}`);
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
      } catch (e) { errores.push(`${id}: ${e.message}`); }
    }
  } catch (e) { errores.push(e.message); }
  return { ok: errores.length === 0, errores, avisos };
}

function pertenece(usuario, empresa) {
  if (usuario.empresa === empresa) return true;
  const m = usuario.membresias;
  return Array.isArray(m) ? m.some((x) => x === empresa || x?.empresa === empresa || x?.empresaId === empresa || x?.id === empresa)
    : objeto(m) && Object.hasOwn(m, empresa);
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
      const campos = Object.keys(valor);
      entrada.campos = campos;
      const delAmbito = k === 'cuentas:empresas' ? [empresa] : k === 'cuentas:usuarios' ? usuariosDestino
        : Object.entries(anteriores).filter(([, id]) => idsUsuarios.has(id)).map(([email]) => email);
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
    // Una caducidad sobre un hash compartido afectaría a las otras empresas.
    if (ms !== null && (!parcial || globales[k].tipo === 'none')) await r.pexpire(k, Math.max(1, d.caduca - tiempo(ahora)));
  }
  return informe;
}
