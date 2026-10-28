// Avisos en el móvil: qué toca avisar hoy a una empresa. Sin dependencias, para poder probarlo.
import { habil, importes, numeroFactura, saldoDe, vencimiento } from './calculos.js';
import { FISCAL_BASE, usa130, usa131, usa303, usaSimplificado, usaIgic } from './empresa.js';
import { modelo202 } from './modelos.js';
import { eur } from './formato.js';
import { mesCubierto } from './banco.js';
import { aPagar, venceGasto } from './pagos.js';
import { foralDe, plazoForal, territorioDe } from './territorios.js';
import { conPagoDomiciliable, finDomiciliacion } from './domiciliacion.js';
import { traductor } from './i18n.js';

const masDias = (fecha, n) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const lista = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l.at(-1)}` : l[0] || '');

// Todos los plazos de un año natural según cómo trabaja la empresa: [{ fecha, texto }], un día por elemento.
// cuotaIS (opcional): con ella, el 202 solo sale si ese pago toca (la cuota salió a pagar).
export function plazosFiscales(fiscal = {}, y, { cuotaIS } = {}) {
  if (!fiscal?.tipo) return []; // sin datos fiscales (o sin permiso para verlos), nada
  const f = { ...FISCAL_BASE, ...fiscal };
  const igic = usaIgic(f);
  const foral = foralDe(f), territorio = territorioDe(f);
  const soc = f.tipo === 'sociedad';
  const trim = [(usa303(f) || usaSimplificado(f)) && (igic ? '420' : '303'), usa130(f) && '130', usa131(f) && '131', !igic && f.intracom && '349'].filter(Boolean);
  const ret = [f.trabajadores && '111', f.alquiler && '115', f.capital && '123'].filter(Boolean);
  const oss = !igic && usa303(f) && f.oss;
  const pago202 = (p) => soc && (!cuotaIS || modelo202(cuotaIS, y)[p - 1].pago > 0);
  const retForal = foral && lista([f.trabajadores && foral.ret.num, f.alquiler && foral.ret.alquiler, f.capital && '123'].filter(Boolean));
  const dias = foral ? [
    // El 4T se liquida en el año siguiente: su vencimiento puede pasar de enero a febrero.
    ...[4, 1, 2, 3].flatMap((t) => {
      const anio = t === 4 ? y - 1 : y;
      return [
        [plazoForal(territorio, 'iva', t, anio), [(usa303(f) || usaSimplificado(f)) && `${t === 4 && foral.iva.cuarto ? foral.iva.cuarto : foral.iva.num} del ${t}T`]],
        // Sin aviso si el trimestre está exonerado (1T de 2026 en el País Vasco).
        [plazoForal(territorio, 'irpf', t, anio), [usa130(f) && !foral.irpf.deOficio && !foral.irpf.exonerados?.[anio]?.includes(t) && `${foral.irpf.num} del ${t}T`]],
        [plazoForal(territorio, 'ret', t, anio), [retForal && `${retForal} del ${t}T`]],
      ];
    }),
    [`${y}-01-31`, [lista([f.trabajadores && '190', f.alquiler && '180', f.capital && '193'].filter(Boolean))]],
    [`${y}-${String(foral.is.pago.plazo[0]).padStart(2, '0')}-${String(foral.is.pago.plazo[1]).padStart(2, '0')}`, [soc && (foral.is.pago.sobre !== 'cuota' || !cuotaIS || Number(cuotaIS[y - 1]) > 0) && foral.is.pago.num]],
  ] : [
    [`${y}-01-20`, [ret.length && `${lista(ret)} del 4T`]],
    [`${y}-01-30`, [trim.filter((m) => m !== '420').length && `${lista(trim.filter((m) => m !== '420'))} del 4T`, !igic && (usa303(f) || usaSimplificado(f)) && '390']],
    [`${y}-01-31`, [igic && usa303(f) && '420 del 4T y 425']],
    [`${y}-01-31`, [lista([f.trabajadores && '190', f.alquiler && '180', f.capital && '193'].filter(Boolean))]],
    // Ventanilla única (369): hasta el último día del mes siguiente al trimestre, sin pasar al lunes (lib/oss.js).
    ...[[`${y}-01-31`, 4], [`${y}-04-30`, 1], [`${y}-07-31`, 2], [`${y}-10-31`, 3]].map(([d, t]) => [d, [oss && `369 del ${t}T`], true]),
    ...[1, 2, 3].map((t) => [`${y}-${['04', '07', '10'][t - 1]}-20`, [[...trim, ...ret].length && `${lista([...trim, ...ret])} del ${t}T`, t !== 2 && pago202(t === 1 ? 1 : 2) && '202']]),
    [`${y}-12-20`, [pago202(3) && '202']],
  ];
  dias.push(
    [new Date(Date.UTC(y, 2, 0)).toISOString().slice(0, 10), ['347 (si pasas de 3.005,06 € con alguien)']],
    [`${y}-04-30`, [soc && 'legalizar los libros en el Registro Mercantil'], true],
    [`${y}-06-30`, [!soc && 'la renta']],
    [`${y}-07-25`, [soc && `${foral?.is.num || '200'} (Impuesto sobre Sociedades)`]],
    [`${y}-07-30`, [soc && 'depositar las cuentas anuales'], true],
  );
  // Un plazo de Hacienda que acaba en sábado o domingo pasa al lunes (como en Impuestos); los del Registro Mercantil
  // (marcados) se avisan en su fecha, que nunca es más tarde de la real. El mismo día puede juntar varios.
  const out = new Map();
  for (const [dia, l, registro] of dias) {
    const fecha = registro ? dia : habil(dia), texto = lista(l.filter(Boolean));
    if (texto) out.set(fecha, out.has(fecha) ? `${out.get(fecha)}; ${texto}` : texto);
  }
  return [...out].map(([fecha, texto]) => ({ fecha, texto })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Próximo día de presentación de un modelo (los ids de modelosDe en lib/empresa.js), contando desde hoy: el de este año
// o, si ya pasó, el del siguiente. null si no toca (p. ej. el 202 sin cuota del año anterior).
const DEL_MODELO = { 100: /la renta/, 'rm-libros': /legalizar/, 'rm-cuentas': /depositar/ };
// Los modelos forales de modelosDe llevan ids «f-…» (lib/empresa.js): cada uno, con el modelo de la AEAT que hace su papel.
const DE_FORAL = { 'f-iva': '303', 'f-390': '390', 'f-iva-anual': '303', 'f-irpf': '130', 'f-ret': '111', 'f-alquiler': '115', 'f-190': '190', 'f-180': '180', 'f-347': '347', 'f-renta': '100', 'f-is': '200', 'f-pago-is': '202', 'f-capital': '123', 'f-349': '349' };
export function proximoPlazoDe(fiscal, idModelo, hoy, { cuotaIS } = {}) {
  const foral = foralDe(fiscal);
  const id = DE_FORAL[idModelo] || idModelo;
  const numero = foral ? ({ 303: foral.iva.num, 130: foral.irpf.num, 111: foral.ret.num, 115: foral.ret.alquiler, 202: foral.is.pago.num, 200: foral.is.num })[id] || id : id;
  const numeros = foral && id === '303' && foral.iva.cuarto ? `${numero}|${foral.iva.cuarto}` : numero;
  const re = DEL_MODELO[id] || new RegExp(`(^|[^0-9A-Z-])(${numeros})([^0-9A-Z-]|$)`);
  const y = Number(hoy.slice(0, 4));
  for (const anio of [y, y + 1]) {
    const p = plazosFiscales(fiscal, anio, { cuotaIS }).find((x) => x.fecha >= hoy && re.test(x.texto));
    if (p) return p.fecha;
  }
  return null;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Plazos de Hacienda: 7 días antes, 1 día antes y el último día. Facturas: el día siguiente a vencer.
// Extracto: el día 3 de cada mes, si el banco no está conectado y el mes pasado no está subido entero (banco: { conectado,
// ultimo, extractos }: los periodos de cada cuenta, lib/banco.js; sin ellos, si no hay movimientos desde el día 25).
// Stock: los lunes, si hay productos en su mínimo o por debajo (stockBajo: sus nombres).
// pagos: los gastos sin pagar (a quien ve los gastos): aviso el día que vence su pago (lib/pagos.js).
// importesPlazo (opcional): lo previsto de cada plazo, { fecha: [{ concepto, importe }] } (lib/tesoreria.js, en negativo),
// para decir cuánto toca pagar. Con la AEAT, el aviso dice también hasta cuándo se puede domiciliar (lib/domiciliacion.js).
// tr: el traductor del idioma de quien los recibe (lib/push.js); sin él, en castellano.
export function avisosDelDia({ facturas = [], plazo = 0, fiscal = {}, cuotaIS, banco = null, stockBajo = [], verifactu = null, pagos = [], importesPlazo = {} }, hoy, tr = traductor(null)) {
  const avisos = [];
  // Verifactu (auditoría F11): rechazos y envíos atascados, cada día que sigan (a quien gestiona la empresa).
  if (verifactu && (verifactu.rechazadas || verifactu.atascadas)) {
    const partes = [verifactu.rechazadas && (verifactu.rechazadas === 1 ? tr('1 rechazada por la AEAT') : tr('{n} rechazadas por la AEAT', { n: verifactu.rechazadas })), verifactu.atascadas && tr('{n} sin enviar desde hace más de un día', { n: verifactu.atascadas })].filter(Boolean);
    avisos.push({ tipo: `verifactu-${verifactu.rechazadas}-${verifactu.atascadas}`, titulo: tr('Verifactu: hay facturas que revisar'), cuerpo: `${partes.length === 2 ? tr('{a} y {b}', { a: partes[0], b: partes[1] }) : partes[0]}.`, url: '/ajustes/verifactu' });
  }
  if (stockBajo.length && new Date(`${hoy}T12:00:00Z`).getUTCDay() === 1) {
    avisos.push({ tipo: `stock-${hoy}`, titulo: stockBajo.length === 1 ? tr('{producto}: bajo mínimo', { producto: stockBajo[0] }) : tr('{n} productos bajo mínimo', { n: stockBajo.length }), cuerpo: tr('{productos}. Mira qué pedir en Inventario.', { productos: `${stockBajo.slice(0, 3).join(', ')}${stockBajo.length > 3 ? '…' : ''}` }), url: '/inventario?ver=pedir' });
  }
  if (banco && !banco.conectado && hoy.slice(8) === '03') {
    const d = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 2, 1));
    const mes = d.toISOString().slice(0, 7);
    const falta = banco.extractos?.length ? !banco.extractos.every((p) => mesCubierto(p, mes)) : (banco.ultimo || '') < `${mes}-25`;
    if (falta) avisos.push({ tipo: `extracto-${mes}`, titulo: tr('Sube el extracto de {mes}', { mes: tr(MESES[d.getUTCMonth()]) }), cuerpo: tr('Fisquo lo compara con tus facturas y gastos y te dice qué falta.'), url: '/banco' });
  }
  const y = Number(hoy.slice(0, 4));
  for (const p of [...plazosFiscales(fiscal, y, { cuotaIS }), ...plazosFiscales(fiscal, y + 1, { cuotaIS })]) {
    const dias = Math.round((Date.parse(`${p.fecha}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 864e5);
    if (![7, 1, 0].includes(dias)) continue;
    const cuando = tr(dias === 0 ? 'Hoy es el último día' : dias === 1 ? 'Mañana acaba el plazo' : 'Queda una semana');
    const previstos = (importesPlazo[p.fecha] || []).filter((x) => x.importe < 0);
    const total = Math.round(previstos.reduce((s, x) => s - x.importe, 0) * 100) / 100;
    const domiciliar = !foralDe(fiscal) && dias === 7 && conPagoDomiciliable(p.texto) && finDomiciliacion(p.fecha);
    const cuerpo = [total > 0 && tr('A pagar, más o menos, {importe}.', { importe: eur(total) }), domiciliar && domiciliar >= hoy && tr('Si lo domicilias, hasta el {fecha}.', { fecha: tr(`${Number(domiciliar.slice(8))} de ${MESES[Number(domiciliar.slice(5, 7)) - 1]}`) }),
      tr('Revisa los importes en Impuestos y márcalo como presentado.')].filter(Boolean).join(' ');
    // Un tipo por plazo: si dos caen el mismo día, salen los dos (el móvil agrupa por tipo).
    avisos.push({ tipo: `plazo-${p.fecha}`, titulo: `${cuando}: ${tr(p.texto)}`, cuerpo, url: '/modelos' });
  }
  const vencidas = facturas.filter((f) => !f.cobrada && importes(f).total > 0 && masDias(vencimiento(f, plazo), 1) === hoy);
  if (vencidas.length === 1) {
    const f = vencidas[0];
    avisos.push({ tipo: 'vencida', titulo: tr('Factura vencida: {cliente}', { cliente: f.cliente.nombre }), cuerpo: tr('La {numero} por {importe} venció ayer y sigue sin cobrar.', { numero: numeroFactura(f), importe: eur(saldoDe(f)) }), url: `/facturas/${encodeURIComponent(f.id)}` });
  } else if (vencidas.length > 1) {
    const total = vencidas.reduce((s, f) => s + saldoDe(f), 0);
    avisos.push({ tipo: 'vencida', titulo: tr('{n} facturas vencidas', { n: vencidas.length }), cuerpo: tr('{importe} sin cobrar: {clientes}.', { importe: eur(Math.round(total * 100) / 100), clientes: vencidas.map((f) => f.cliente.nombre).slice(0, 3).join(', ') }), url: '/facturas?estado=pendientes' });
  }
  const venceHoy = pagos.filter((g) => g.pendiente && !g.nomina && venceGasto(g) === hoy);
  if (venceHoy.length === 1) {
    const g = venceHoy[0];
    avisos.push({ tipo: 'pago-hoy', titulo: tr('Hoy vence el pago a {proveedor}', { proveedor: g.proveedor || g.concepto }), cuerpo: tr(g.numero ? '{importe} · factura {numero}. Márcalo como pagado cuando lo pagues.' : '{importe}. Márcalo como pagado cuando lo pagues.', { importe: eur(aPagar(g)), numero: g.numero }), url: `/gastos/${encodeURIComponent(g.id)}` });
  } else if (venceHoy.length > 1) {
    const total = venceHoy.reduce((s, g) => s + aPagar(g), 0);
    avisos.push({ tipo: 'pago-hoy', titulo: tr('Hoy vencen {n} pagos', { n: venceHoy.length }), cuerpo: `${eur(Math.round(total * 100) / 100)}: ${[...new Set(venceHoy.map((g) => g.proveedor || g.concepto))].slice(0, 3).join(', ')}.`, url: '/gastos?estado=sinpagar' });
  }
  return avisos;
}
