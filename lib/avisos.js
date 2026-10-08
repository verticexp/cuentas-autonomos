// Avisos en el móvil: qué toca avisar hoy a una empresa. Sin dependencias, para poder probarlo.
import { importes, numeroFactura, vencimiento } from './calculos.js';
import { FISCAL_BASE, usa130, usa303 } from './empresa.js';
import { modelo202 } from './modelos.js';
import { eur } from './formato.js';

const masDias = (fecha, n) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const lista = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l.at(-1)}` : l[0] || '');

// Todos los plazos de un año natural según cómo trabaja la empresa: [{ fecha, texto }], un día por elemento.
// cuotaIS (opcional): con ella, el 202 solo sale si ese pago toca (la cuota salió a pagar).
export function plazosFiscales(fiscal = {}, y, { cuotaIS } = {}) {
  if (!fiscal?.tipo) return []; // sin datos fiscales (o sin permiso para verlos), nada
  const f = { ...FISCAL_BASE, ...fiscal };
  const soc = f.tipo === 'sociedad';
  const trim = [usa303(f) && '303', usa130(f) && '130', f.intracom && '349'].filter(Boolean);
  const ret = [f.trabajadores && '111', f.alquiler && '115'].filter(Boolean);
  const pago202 = (p) => soc && (!cuotaIS || modelo202(cuotaIS, y)[p - 1].pago > 0);
  const dias = [
    [`${y}-01-20`, [ret.length && `${lista(ret)} del 4T`]],
    [`${y}-01-30`, [trim.length && `${lista(trim)} del 4T`, usa303(f) && '390']],
    [`${y}-01-31`, [lista([f.trabajadores && '190', f.alquiler && '180'].filter(Boolean))]],
    [new Date(Date.UTC(y, 2, 0)).toISOString().slice(0, 10), ['347 (si pasas de 3.005,06 € con alguien)']],
    ...[1, 2, 3].map((t) => [`${y}-${['04', '07', '10'][t - 1]}-20`, [[...trim, ...ret].length && `${lista([...trim, ...ret])} del ${t}T`, t !== 2 && pago202(t === 1 ? 1 : 2) && '202']]),
    [`${y}-04-30`, [soc && 'legalizar los libros en el Registro Mercantil']],
    [`${y}-06-30`, [!soc && 'la renta']],
    [`${y}-07-25`, [soc && '200 (Impuesto sobre Sociedades)']],
    [`${y}-07-30`, [soc && 'depositar las cuentas anuales']],
    [`${y}-12-20`, [pago202(3) && '202']],
  ];
  return dias.map(([fecha, l]) => ({ fecha, texto: lista(l.filter(Boolean)) })).filter((x) => x.texto);
}

// Plazos de Hacienda: 7 días antes, 1 día antes y el último día. Facturas: el día siguiente a vencer.
export function avisosDelDia({ facturas = [], plazo = 0, fiscal = {}, cuotaIS }, hoy) {
  const avisos = [];
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
    avisos.push({ tipo: 'vencida', titulo: `Factura vencida: ${f.cliente.nombre}`, cuerpo: `La ${numeroFactura(f)} por ${eur(importes(f).total)} venció ayer y sigue sin cobrar.`, url: `/facturas/${encodeURIComponent(f.id)}` });
  } else if (vencidas.length > 1) {
    const total = vencidas.reduce((s, f) => s + importes(f).total, 0);
    avisos.push({ tipo: 'vencida', titulo: `${vencidas.length} facturas vencidas`, cuerpo: `${eur(Math.round(total * 100) / 100)} sin cobrar: ${vencidas.map((f) => f.cliente.nombre).slice(0, 3).join(', ')}.`, url: '/facturas?estado=pendientes' });
  }
  return avisos;
}
