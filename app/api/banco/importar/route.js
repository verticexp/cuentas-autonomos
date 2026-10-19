import { createHash } from 'node:crypto';
import { clave, guardar, leer, redis } from '@/lib/redis';
import { error, usuarioApi } from '@/lib/api';
import { puede } from '@/lib/permisos';
import { leerHoja } from '@/lib/hoja';
import { aCuenta, cuentaDeExtracto, esNorma43, leerNorma43, leerTablaBanco } from '@/lib/banco';
import { actualizarSaldo, autoconciliar, guardarMovimientos } from '@/lib/bancoServidor';
import { hoy } from '@/lib/formato';
import { MUCHOS, pasado, concurrencia, respuesta429 } from '@/lib/limite';
import { consumirEscaneos, cupoEscaneos, paginasIA, registrarConsumoIA, respuestaCupo } from '@/lib/cuotasIA';
import { iaLista, leerExtracto, validarEntradaIA } from '@/lib/ticket';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const MAX_MB = 5, MAX_MOV = 5000;

// Extracto del banco (Norma 43, CSV, Excel o PDF, este leído con IA) → movimientos. Los ya subidos no se repiten.
// «cuenta» (opcional): a qué cuenta va un CSV, Excel o PDF; 'nueva' con «nombre» la crea (lib/banco.js cuentaDeExtracto).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  // Escribe movimientos y cambia el saldo real (Tesorería): no basta con ver el resumen.
  if (!puede(u, 'facturar') && !puede(u, 'gastar')) return error('No tienes permiso para esto. Pídeselo al administrador de tu empresa.', 403);
  if (await pasado('importar', u.id, 30, 3600)) return error(MUCHOS, 429);
  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  if (!archivo || typeof archivo === 'string' || !archivo.size) return error('Elige el extracto (Norma 43, .csv, .xlsx o PDF)');
  if (archivo.size > MAX_MB * 1024 * 1024) return error(`El archivo pasa de ${MAX_MB} MB`);
  const buf = Buffer.from(await archivo.arrayBuffer());
  const texto = buf.toString('latin1');
  let r, cupo, filasPdf;
  // Un PDF ya leído con IA en los últimos 15 minutos (faltaba elegir bien la cuenta) no vuelve a gastar páginas.
  const kPdf = texto.startsWith('%PDF') ? clave(u, `extractoPdf-${createHash('sha256').update(buf).digest('hex').slice(0, 32)}`) : null;
  const leidoPdf = kPdf ? await redis.get(kPdf) : null;
  if (Array.isArray(leidoPdf)) r = leerTablaBanco(leidoPdf);
  else if (kPdf) {
    if (!iaLista()) return error('Para leer extractos en PDF hace falta la IA: descárgalo en Excel o Norma 43.');
    const archivoIA = await paginasIA(buf, 'application/pdf');
    if (archivoIA.error) return error(archivoIA.error);
    let reserva;
    try {
      const x = await concurrencia('ticket', u.empresa, 3, 30000, () => concurrencia('ia', 'global', 20, 60000, async () => {
        const cupo = await cupoEscaneos(u);
        if (archivoIA.paginas > cupo.restantes) { reserva = { error: 'No quedan suficientes páginas IA. Puedes subir el extracto en CSV, Excel o Norma 43 sin consumir páginas.', cupo }; return { sinCupo: true }; }
        const preparacion = await validarEntradaIA(buf.toString('base64'), 'application/pdf', archivoIA.paginas, true);
        if (preparacion.error) return { ...preparacion, sinEnvio: true, cupo };
        reserva = await consumirEscaneos(u, archivoIA.paginas);
        if (reserva.error) return { sinCupo: true };
        const lectura = await leerExtracto(buf.toString('base64'), archivoIA.paginas);
        await registrarConsumoIA(reserva, lectura.consumo);
        return lectura;
      }));
      if (x?.ocupado) return respuesta429(5, 'La lectura de PDF está ocupada. Espera unos segundos.');
      if (x.sinCupo) return respuestaCupo(reserva);
      if (x.sinEnvio) return Response.json({ error: x.error, cupo: x.cupo }, { status: x.status });
      cupo = reserva.cupo;
      if (x.error) return Response.json({ error: x.error, cupo }, { status: 502 });
      filasPdf = x.filas;
      r = leerTablaBanco(x.filas);
    } catch { return error('No se ha podido leer el PDF. Consulta tu consumo o sube el extracto en CSV, Excel o Norma 43.', 503); }
  } else {
    try { r = esNorma43(texto) ? leerNorma43(texto) : leerTablaBanco(leerHoja(buf)); } catch { return error('No se puede leer el archivo: descárgalo del banco en Norma 43, .csv, .xlsx o PDF'); }
  }
  if (r.error) return error(r.error);
  if (r.movimientos.length > MAX_MOV) return error(`Demasiados movimientos: como máximo ${MAX_MOV} por archivo`);
  const bancos = (await leer(u, 'bancos')) || [];
  let cuenta = null;
  if (!r.cuentas[0].id.startsWith('n43-')) {
    // Cuentas que ya tienen alguno de estos movimientos: volver a subir un extracto va a la misma sin preguntar.
    const muestra = r.movimientos.slice(0, 30);
    const propias = bancos.filter((c) => c.origen !== 'enable').slice(0, 20);
    const ids = propias.flatMap((c) => aCuenta({ movimientos: muestra }, c.id).map((m) => m.id));
    const hay = ids.length ? await redis.hmget(clave(u, 'banco'), ...ids) : null;
    const vistos = new Set(Object.entries(hay || {}).filter(([, v]) => v).map(([k]) => k));
    const solapan = new Set(propias.filter((c) => aCuenta({ movimientos: muestra }, c.id).some((m) => vistos.has(m.id))).map((c) => c.id));
    cuenta = cuentaDeExtracto({ iban: r.cuentas[0].iban, elegida: String(form.get('cuenta') || ''), nombre: String(form.get('nombre') || ''), cuentas: bancos, solapan });
    if (cuenta.error && filasPdf) await redis.set(kPdf, filasPdf, { ex: 900 });
    if (cuenta.error) return Response.json({ error: cuenta.error, ...(cuenta.elegir ? { elegir: true } : {}), ...(cupo ? { cupo } : {}) }, { status: cuenta.elegir ? 409 : 400 });
    r = { ...r, cuentas: [{ ...r.cuentas[0], id: cuenta.id, nombre: cuenta.nombre, iban: cuenta.iban }], movimientos: aCuenta(r, cuenta.id) };
  }
  const g = await guardarMovimientos(u, r.movimientos);
  // El saldo del extracto cuenta como saldo real de esa cuenta si es más reciente que el que había.
  const previas = Object.fromEntries(bancos.map((c) => [c.id, c]));
  let conSaldo = false;
  for (const c of r.cuentas) {
    const antes = previas[c.id];
    const nuevo = c.saldo !== null && (!antes?.fechaSaldo || (c.fechaSaldo || '') >= antes.fechaSaldo);
    if (nuevo) conSaldo = true;
    await guardar(u, 'bancos', { ...(antes || {}), id: c.id, nombre: antes?.nombre || c.nombre, origen: 'extracto', subido: hoy(),
      ...(c.iban && !antes?.iban ? { iban: c.iban } : {}),
      ...(nuevo ? { saldo: c.saldo, fechaSaldo: c.fechaSaldo } : {}) });
  }
  const saldo = conSaldo ? await actualizarSaldo(u) : null;
  let auto = 0;
  if (g.nuevos) { try { auto = (await autoconciliar(u)).hechos; } catch { /* El extracto ya se ha guardado. */ } }
  return Response.json({ ok: true, ...g, errores: r.errores || 0, saldo, auto, ...(cuenta ? { cuenta: { id: cuenta.id, nombre: previas[cuenta.id]?.nombre || cuenta.nombre } } : {}), ...(cupo ? { cupo } : {}) });
}
