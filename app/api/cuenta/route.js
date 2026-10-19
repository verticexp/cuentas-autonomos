import { cookies } from 'next/headers';
import { congelarInstantaneas, saltarNumeracion } from '@/lib/facturas';
import { actualizarUsuario, cambiarPassword, desbloqueo, opcionesCookie, opcionesDesbloqueo } from '@/lib/auth';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { puede } from '@/lib/permisos';
import { colorValido, logoValido } from '@/lib/marca';
import { actividadesDe, limpiarActividades, limpiarFiscal } from '@/lib/empresa';
import { clave, leer, redis } from '@/lib/redis';
import { auditar } from '@/lib/auditoria';
import { leerImporte } from '@/lib/calculos';
import { hoy } from '@/lib/formato';
import { todasFichas } from '@/lib/indices';

const CAMPOS = ['nombre', 'nif', 'direccion', 'ciudad', 'iban'];
// Más datos del emisor (Ajustes): salen en la factura y se congelan con ella como los de arriba. [campo, largo máximo]
const CONTACTO = [['email', 120], ['telefono', 30], ['web', 120], ['registro', 200]];
const COBROS = [['bizum', 20], ['otroPago', 120]];
const DISENO = [['pie', 500], ['notaDefecto', 500]];
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const emailValido = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
// Solo los campos que llegan: lo demás del emisor se queda como estaba.
const recortar = (b, lista) => Object.fromEntries(lista.filter(([k]) => k in b).map(([k, max]) => [k, texto(b[k], max)]));
// En el registro de actividad: si cambia el IBAN (donde cobra la empresa), con sus 4 últimas cifras.
const cambioIban = (antes, ahora) => (String(antes || '') !== String(ahora || '') ? ` · IBAN cambiado a ${ahora ? `…${String(ahora).replace(/\s/g, '').slice(-4)}` : 'ninguno'}` : '');

// Cuándo se marcó cada 303/130 como pagado: Tesorería lo resta del saldo hasta que llegue un extracto posterior.
function marcarPagado(u, k, si) {
  const m = { ...(u.pagadosHacienda || {}) };
  if (!si) delete m[k];
  else if (!m[k]) m[k] = { fecha: hoy(), en: new Date().toISOString() };
  return m;
}

export async function PATCH(req) {
  const b = await cuerpo(req);
  // Solo estas ramas son personales; «nombre» aquí es la razón social de la empresa.
  const cuentaPersonal = b && ('bloqueoPantalla' in b || b.nueva !== undefined || b.perfil)
    && Object.keys(b).every((k) => ['bloqueoPantalla', 'actual', 'nueva', 'perfil'].includes(k));
  const { u, res } = await usuarioApi({ cuentaPersonal });
  if (res) return res;
  const sin = (p) => !puede(u, p) && error('No tienes permiso para esto. Pídeselo al administrador de tu empresa.', 403);
  // Bloqueo de pantalla opcional (Ajustes › Face ID y contraseña): personal, no de la empresa.
  if ('bloqueoPantalla' in b) {
    await actualizarUsuario(u, { bloqueoPantalla: Boolean(b.bloqueoPantalla) });
    return Response.json({ ok: true });
  }
  // Tu perfil: el nombre de la persona (no el de la empresa).
  if (b.perfil) {
    const nombre = texto(b.perfil.nombre, 80);
    if (!nombre) return error('Escribe tu nombre');
    await actualizarUsuario(u, { nombre });
    return Response.json({ ok: true });
  }
  if (b.presentado) {
    if (sin('resumen')) return sin('resumen');
    const { anio, t, importe } = b.presentado;
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100 || ![1, 2, 3, 4].includes(t)) return error('Trimestre no válido');
    const pagos = { ...(u.pagos130 || {}) };
    pagos[anio] = { ...(pagos[anio] || {}) };
    if (importe === null) delete pagos[anio][t];
    else pagos[anio][t] = Math.max(0, Number(importe) || 0);
    await actualizarUsuario(u, { pagos130: pagos, pagadosHacienda: marcarPagado(u, `${anio}-${t}-130`, importe !== null && Number(importe) > 0) });
    return Response.json({ ok: true });
  }
  if (b.presentado303) {
    if (sin('resumen')) return sin('resumen');
    const { anio, t, hecho } = b.presentado303;
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100 || ![1, 2, 3, 4].includes(t)) return error('Trimestre no válido');
    const pres = { ...(u.pres303 || {}) };
    pres[anio] = { ...(pres[anio] || {}), [t]: Boolean(hecho) };
    await actualizarUsuario(u, { pres303: pres, pagadosHacienda: marcarPagado(u, `${anio}-${t}-303`, Boolean(hecho)) });
    return Response.json({ ok: true });
  }
  // Verifactu: 'pruebas', 'real' o null (sin activar). Solo el administrador. En real se mantiene todo el año natural.
  if ('verifactu' in b) {
    if (sin('empresa')) return sin('empresa');
    if (u.rol !== 'admin') return error('Solo el administrador de la empresa puede activar Verifactu', 403);
    const modo = ['pruebas', 'real'].includes(b.verifactu) ? b.verifactu : null;
    if (u.verifactu === 'real' && modo !== 'real') return error('Verifactu ya está activo: se mantiene todo el año natural');
    if (modo && (!u.emisor?.nif || !u.emisor?.nombre)) return error('Rellena el nombre y el NIF de la empresa en Datos de facturación');
    // Al pasar a real empieza una cadena nueva: lo de pruebas no existe en la AEAT de verdad.
    if (modo === 'real' && u.verifactu !== 'real') await redis.set(clave(u, 'verifactu'), '');
    await actualizarUsuario(u, { verifactu: modo });
    await auditar(u, modo === 'real' ? 'Verifactu activado' : modo === 'pruebas' ? 'Verifactu en pruebas' : 'Verifactu desactivado (pruebas)');
    return Response.json({ ok: true, verifactu: modo });
  }
  // Pago del 202 de un periodo (1, 2 o 3) presentado y pagado; null lo vuelve a pendiente.
  if (b.presentado202) {
    if (sin('resumen')) return sin('resumen');
    const { anio, p, importe } = b.presentado202;
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100 || ![1, 2, 3].includes(p)) return error('Periodo no válido');
    const pagos = { ...(u.pagos202 || {}) };
    pagos[anio] = { ...(pagos[anio] || {}) };
    if (importe === null) delete pagos[anio][p]; else pagos[anio][p] = Math.max(0, Number(importe) || 0);
    await actualizarUsuario(u, { pagos202: pagos });
    return Response.json({ ok: true });
  }
  // Datos de un año que deciden otros modelos (null los quita): el rendimiento neto de la actividad (casilla 13 del 130
  // del año siguiente) y la cuota del Impuesto sobre Sociedades (base del 202).
  const porAnio = ['rend130', 'cuotaIS'].find((k) => b[k]);
  if (porAnio) {
    if (sin('resumen')) return sin('resumen');
    const { anio, importe } = b[porAnio];
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return error('Año no válido');
    const valor = importe === null || importe === '' ? null : leerImporte(String(importe));
    if (valor !== null && !Number.isFinite(valor)) return error('Importe no válido');
    const datos = { ...(u[porAnio] || {}) };
    if (valor === null) delete datos[anio]; else datos[anio] = valor;
    await actualizarUsuario(u, { [porAnio]: datos });
    await auditar(u, porAnio === 'rend130' ? `Rendimiento de ${anio} para el 130` : `Cuota del Impuesto sobre Sociedades de ${anio}`, valor === null ? 'quitado' : String(valor));
    return Response.json({ ok: true });
  }
  if (b.marca) {
    if (sin('empresa')) return sin('empresa');
    const color = b.marca.color ? colorValido(b.marca.color) : null;
    const logo = b.marca.logo ? logoValido(b.marca.logo) : null;
    if (b.marca.color && !color) return error('Color no válido');
    if (b.marca.logo && !logo) return error('El logo debe ser una imagen PNG o JPG de menos de 300 KB');
    await congelarInstantaneas(u); // las facturas ya emitidas conservan la marca de antes
    await actualizarUsuario(u, { marca: { color, logo } });
    return Response.json({ ok: true });
  }
  // Cuestionario: situación fiscal, actividades y datos de facturación.
  if (b.configuracion) {
    if (sin('empresa')) return sin('empresa');
    const c = b.configuracion;
    const conFacturas = new Set((await todasFichas(u, 'facturas')).map((f) => f.a));
    const antes = Array.isArray(u.actividades) && u.actividades.length ? u.actividades : (u.pendiente ? [] : actividadesDe(u));
    const a = limpiarActividades(c.actividades, antes, conFacturas);
    if (a.error) return error(a.error);
    const e = c.emisor || {};
    if (!String(e.nombre || '').trim()) return error('Falta el nombre o la razón social');
    const emisor = { ...(u.emisor || {}), ...Object.fromEntries(CAMPOS.map((k) => [k, String(e[k] || '').trim().slice(0, 120)])) };
    emisor.plazo = Math.max(0, Math.min(365, Number(e.plazo ?? emisor.plazo) || 30));
    await congelarInstantaneas(u); // las facturas ya emitidas conservan el emisor de antes
    await actualizarUsuario(u, { fiscal: limpiarFiscal(c.fiscal), actividades: a.actividades, emisor, pendiente: false });
    await auditar(u, 'Datos de la empresa cambiados', `Situación fiscal, actividades y facturación${cambioIban(u.emisor?.iban, emisor.iban)}`);
    const emp = await redis.hget('empresas', u.empresa);
    if (emp && emisor.nombre) await redis.hset('empresas', { [u.empresa]: { ...emp, nombre: emisor.nombre } });
    return Response.json({ ok: true, actividades: a.actividades });
  }
  if (b.drive) {
    if (sin('empresa')) return sin('empresa');
    const url = String(b.drive.url || '').trim();
    if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) return error('La URL debe ser la de la aplicación web de Apps Script (acaba en /exec)');
    await actualizarUsuario(u, { drive: url ? { url, token: String(b.drive.token || '').trim().slice(0, 100) } : null });
    await auditar(u, url ? 'Google Drive conectado' : 'Google Drive desconectado');
    return Response.json({ ok: true });
  }
  if (b.nueva !== undefined) {
    const r = await cambiarPassword(u, b.actual, b.nueva);
    if (r.error) return error(r.error);
    await auditar(u, 'Contraseña cambiada');
    (await cookies()).set('t', r.token, opcionesCookie);
    (await cookies()).set('d', await desbloqueo(r.token), opcionesDesbloqueo);
    return Response.json({ ok: true });
  }
  if (sin('empresa')) return sin('empresa');
  // Series y numeración: la letra de la serie de cada actividad (solo si aún no tiene facturas, lib/empresa.js).
  if (b.series) {
    const antes = actividadesDe(u);
    const conFacturas = new Set((await todasFichas(u, 'facturas')).map((f) => f.a));
    const lista = antes.map((a) => (typeof b.series[a.id] === 'string' ? { ...a, serie: b.series[a.id] } : a));
    const r = limpiarActividades(lista, antes, conFacturas);
    if (r.error) return error(r.error);
    await actualizarUsuario(u, { actividades: r.actividades });
    await auditar(u, 'Series cambiadas', r.actividades.map((a) => `${a.nombre}: ${a.serie || 'sin letra'}`).join(' · '));
    return Response.json({ ok: true, actividades: r.actividades });
  }
  // …y en qué número empieza la siguiente factura de una serie este año (solo hacia arriba).
  if (b.numeracion) {
    const { serie, anio, siguiente } = b.numeracion;
    const series = new Set(actividadesDe(u).map((a) => a.serie || ''));
    if (typeof serie !== 'string' || !series.has(serie)) return error('Serie no válida');
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return error('Año no válido');
    const r = await saltarNumeracion(u, serie, anio, Number(siguiente));
    if (r.error) return error(r.error);
    await auditar(u, 'Numeración cambiada', `Serie ${serie || 'sin letra'} de ${anio}: la siguiente será la ${r.siguiente}`);
    return Response.json(r);
  }
  // Cobros (Ajustes › Cobros): plazo, recordatorios y otras formas de pago que salen en la factura.
  if (b.cobros) {
    const c = b.cobros;
    const emisor = { ...(u.emisor || {}), ...recortar(c, COBROS) };
    if ('plazo' in c) emisor.plazo = Math.max(0, Math.min(365, Math.round(Number(c.plazo) || 0)));
    if ('recordatorios' in c) emisor.recordatorios = Math.max(0, Math.min(60, Math.round(Number(c.recordatorios) || 0)));
    if (emisor.bizum && !/^\+?[\d\s]{9,16}$/.test(emisor.bizum)) return error('El teléfono de Bizum no es válido');
    await congelarInstantaneas(u);
    await actualizarUsuario(u, { emisor });
    await auditar(u, 'Cobros cambiados', `Plazo ${emisor.plazo ?? 30} días`);
    return Response.json({ ok: true });
  }
  // Diseño de factura: el pie (textos legales) y la nota que llevan por defecto las facturas nuevas.
  if (b.diseno) {
    await congelarInstantaneas(u); // las facturas ya emitidas conservan el pie de antes
    await actualizarUsuario(u, { emisor: { ...(u.emisor || {}), ...recortar(b.diseno, DISENO) } });
    await auditar(u, 'Diseño de factura cambiado');
    return Response.json({ ok: true });
  }
  // Email de envío: asunto, mensaje y firma por defecto al mandar facturas y presupuestos.
  if (b.envio) {
    const envio = { asunto: texto(b.envio.asunto, 200), mensaje: texto(b.envio.mensaje, 2000), firma: texto(b.envio.firma, 500) };
    await actualizarUsuario(u, { envio });
    await auditar(u, 'Email de envío cambiado');
    return Response.json({ ok: true });
  }
  // Tu gestoría: a quién se manda el paquete trimestral y si se manda solo al acabar cada trimestre.
  if (b.gestoria) {
    const g = b.gestoria;
    const email = texto(g.email, 254).toLowerCase();
    if (!emailValido(email)) return error('El email de la gestoría no es válido');
    if (g.auto && !email) return error('Para mandar el paquete solo hace falta el email de la gestoría');
    await actualizarUsuario(u, { gestoria: email ? { nombre: texto(g.nombre, 120), email, auto: Boolean(g.auto) } : null });
    await auditar(u, email ? 'Gestoría cambiada' : 'Gestoría quitada', email || '');
    return Response.json({ ok: true });
  }
  // Datos de la empresa: los del emisor. Plazo, límite y recordatorios solo si llegan (antes iban en este mismo formulario).
  const emisor = { ...(u.emisor || {}), ...Object.fromEntries(CAMPOS.map((k) => [k, String(b[k] || '').trim().slice(0, 120)])), ...recortar(b, CONTACTO) };
  if (!emailValido(emisor.email)) return error('El email no es válido');
  if ('plazo' in b || !('plazo' in emisor)) emisor.plazo = Math.max(0, Math.min(365, Number(b.plazo) || 30));
  if ('limite' in b) emisor.limite = Math.max(0, Number(b.limite) || 0);
  if ('recordatorios' in b) emisor.recordatorios = Math.max(0, Math.min(60, Math.round(Number(b.recordatorios) || 0)));
  await congelarInstantaneas(u); // las facturas ya emitidas conservan el emisor de antes
  await actualizarUsuario(u, { emisor });
  await auditar(u, 'Datos de facturación cambiados', `${emisor.nombre}${cambioIban(u.emisor?.iban, emisor.iban)}`);
  return Response.json({ ok: true });
}
