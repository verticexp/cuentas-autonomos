// Avisos en el móvil: qué toca avisar hoy a una empresa. Sin dependencias, para poder probarlo.
import { habil, importes, numeroFactura, saldoDe, vencimiento } from './calculos.js';
import { FISCAL_BASE, usa130, usa131, usa303, usaSimplificado } from './empresa.js';
import { modelo202 } from './modelos.js';
import { eur } from './formato.js';
import { mesCubierto } from './banco.js';

const masDias = (fecha, n) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const lista = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l.at(-1)}` : l[0] || '');

// Todos los plazos de un año natural según cómo trabaja la empresa: [{ fecha, texto }], un día por elemento.
// cuotaIS (opcional): con ella, el 202 solo sale si ese pago toca (la cuota salió a pagar).
export function plazosFiscales(fiscal = {}, y, { cuotaIS } = {}) {
  if (!fiscal?.tipo) return []; // sin datos fiscales (o sin permiso para verlos), nada
  const f = { ...FISCAL_BASE, ...fiscal };
  const soc = f.tipo === 'sociedad';
  const trim = [(usa303(f) || usaSimplificado(f)) && '303', usa130(f) && '130', usa131(f) && '131', f.intracom && '349'].filter(Boolean);
  const ret = [f.trabajadores && '111', f.alquiler && '115', f.capital && '123'].filter(Boolean);
  const oss = usa303(f) && f.oss;
  const pago202 = (p) => soc && (!cuotaIS || modelo202(cuotaIS, y)[p - 1].pago > 0);
  const dias = [
    [`${y}-01-20`, [ret.length && `${lista(ret)} del 4T`]],
    [`${y}-01-30`, [trim.length && `${lista(trim)} del 4T`, (usa303(f) || usaSimplificado(f)) && '390']],
    [`${y}-01-31`, [lista([f.trabajadores && '190', f.alquiler && '180', f.capital && '193'].filter(Boolean))]],
    // Ventanilla única (369): hasta el último día del mes siguiente al trimestre, sin pasar al lunes (lib/oss.js).
    ...[[`${y}-01-31`, 4], [`${y}-04-30`, 1], [`${y}-07-31`, 2], [`${y}-10-31`, 3]].map(([d, t]) => [d, [oss && `369 del ${t}T`], true]),
    [new Date(Date.UTC(y, 2, 0)).toISOString().slice(0, 10), ['347 (si pasas de 3.005,06 € con alguien)']],
    ...[1, 2, 3].map((t) => [`${y}-${['04', '07', '10'][t - 1]}-20`, [[...trim, ...ret].length && `${lista([...trim, ...ret])} del ${t}T`, t !== 2 && pago202(t === 1 ? 1 : 2) && '202']]),
    [`${y}-04-30`, [soc && 'legalizar los libros en el Registro Mercantil'], true],
    [`${y}-06-30`, [!soc && 'la renta']],
    [`${y}-07-25`, [soc && '200 (Impuesto sobre Sociedades)']],
    [`${y}-07-30`, [soc && 'depositar las cuentas anuales'], true],
    [`${y}-12-20`, [pago202(3) && '202']],
  ];
  // Un plazo de Hacienda que acaba en sábado o domingo pasa al lunes (como en Impuestos); los del Registro Mercantil
  // (marcados) se avisan en su fecha, que nunca es más tarde de la real. El mismo día puede juntar varios.
  const out = new Map();
  for (const [dia, l, registro] of dias) {
    const fecha = registro ? dia : habil(dia), texto = lista(l.filter(Boolean));
    if (texto) out.set(fecha, out.has(fecha) ? `${out.get(fecha)}; ${texto}` : texto);
  }
  return [...out].map(([fecha, texto]) => ({ fecha, texto }));
}

// Próximo día de presentación de un modelo (los ids de modelosDe en lib/empresa.js), contando desde hoy: el de este año
// o, si ya pasó, el del siguiente. null si no toca (p. ej. el 202 sin cuota del año anterior).
const DEL_MODELO = { 100: /la renta/, 'rm-libros': /legalizar/, 'rm-cuentas': /depositar/ };
export function proximoPlazoDe(fiscal, id, hoy, { cuotaIS } = {}) {
  const re = DEL_MODELO[id] || new RegExp(`(^|[^0-9])${id}([^0-9]|$)`);
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
export function avisosDelDia({ facturas = [], plazo = 0, fiscal = {}, cuotaIS, banco = null, stockBajo = [], verifactu = null }, hoy) {
  const avisos = [];
  // Verifactu (auditoría F11): rechazos y envíos atascados, cada día que sigan (a quien gestiona la empresa).
  if (verifactu && (verifactu.rechazadas || verifactu.atascadas)) {
    const partes = [verifactu.rechazadas && `${verifactu.rechazadas} rechazada${verifactu.rechazadas === 1 ? '' : 's'} por la AEAT`, verifactu.atascadas && `${verifactu.atascadas} sin enviar desde hace más de un día`].filter(Boolean);
    avisos.push({ tipo: `verifactu-${verifactu.rechazadas}-${verifactu.atascadas}`, titulo: 'Verifactu: hay facturas que revisar', cuerpo: `${partes.join(' y ')}.`, url: '/ajustes/verifactu' });
  }
  if (stockBajo.length && new Date(`${hoy}T12:00:00Z`).getUTCDay() === 1) {
    avisos.push({ tipo: `stock-${hoy}`, titulo: stockBajo.length === 1 ? `${stockBajo[0]}: bajo mínimo` : `${stockBajo.length} productos bajo mínimo`, cuerpo: `${stockBajo.slice(0, 3).join(', ')}${stockBajo.length > 3 ? '…' : ''}. Mira qué pedir en Inventario.`, url: '/inventario?ver=pedir' });
  }
  if (banco && !banco.conectado && hoy.slice(8) === '03') {
    const d = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 2, 1));
    const mes = d.toISOString().slice(0, 7);
    const falta = banco.extractos?.length ? !banco.extractos.every((p) => mesCubierto(p, mes)) : (banco.ultimo || '') < `${mes}-25`;
    if (falta) avisos.push({ tipo: `extracto-${mes}`, titulo: `Sube el extracto de ${MESES[d.getUTCMonth()]}`, cuerpo: 'Fisquo lo compara con tus facturas y gastos y te dice qué falta.', url: '/banco' });
  }
  const y = Number(hoy.slice(0, 4));
  for (const p of [...plazosFiscales(fiscal, y, { cuotaIS }), ...plazosFiscales(fiscal, y + 1, { cuotaIS })]) {
    const dias = Math.round((Date.parse(`${p.fecha}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 864e5);
    if (![7, 1, 0].includes(dias)) continue;
    const cuando = dias === 0 ? 'Hoy es el último día' : dias === 1 ? 'Mañana acaba el plazo' : 'Queda una semana';
    // Un tipo por plazo: si dos caen el mismo día, salen los dos (el móvil agrupa por tipo).
    avisos.push({ tipo: `plazo-${p.fecha}`, titulo: `${cuando}: ${p.texto}`, cuerpo: 'Revisa los importes en Impuestos y márcalo como presentado.', url: '/modelos' });
  }
  const vencidas = facturas.filter((f) => !f.cobrada && importes(f).total > 0 && masDias(vencimiento(f, plazo), 1) === hoy);
  if (vencidas.length === 1) {
    const f = vencidas[0];
    avisos.push({ tipo: 'vencida', titulo: `Factura vencida: ${f.cliente.nombre}`, cuerpo: `La ${numeroFactura(f)} por ${eur(saldoDe(f))} venció ayer y sigue sin cobrar.`, url: `/facturas/${encodeURIComponent(f.id)}` });
  } else if (vencidas.length > 1) {
    const total = vencidas.reduce((s, f) => s + saldoDe(f), 0);
    avisos.push({ tipo: 'vencida', titulo: `${vencidas.length} facturas vencidas`, cuerpo: `${eur(Math.round(total * 100) / 100)} sin cobrar: ${vencidas.map((f) => f.cliente.nombre).slice(0, 3).join(', ')}.`, url: '/facturas?estado=pendientes' });
  }
  return avisos;
}
