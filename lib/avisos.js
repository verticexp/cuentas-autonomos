// Avisos en el móvil: qué toca avisar hoy a una empresa. Sin dependencias, para poder probarlo.
import { importes, numeroFactura, proximoPlazo, vencimiento } from './calculos.js';
import { usa130, usa303 } from './empresa.js';
import { eur } from './formato.js';

const masDias = (fecha, n) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// Plazos de Hacienda: 7 días antes, 1 día antes y el último día. Facturas: el día siguiente a vencer.
export function avisosDelDia({ facturas = [], plazo = 0, fiscal = {} }, hoy) {
  const avisos = [];
  const p = proximoPlazo(hoy);
  const modelos = [usa303(fiscal) && '303', usa130(fiscal) && '130'].filter(Boolean).join(' y ');
  if (modelos && [7, 1, 0].includes(p.dias)) {
    const cuando = p.dias === 0 ? 'Hoy es el último día' : p.dias === 1 ? 'Mañana acaba el plazo' : 'Queda una semana';
    avisos.push({ tipo: 'plazo', titulo: `${cuando}: ${modelos} del ${p.t}T`, cuerpo: 'Revisa los importes en Netto y márcalo como presentado.', url: '/' });
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
