// Calendario de Mi despacho (app/despacho/plazos): los vencimientos de todos los clientes en los próximos días, agrupados
// por fecha, modelo y Hacienda, con lo que ya está marcado como presentado. Función pura, para el servidor y los tests.
import { FISCAL_BASE, hecho130, hecho303, marcaRet, modelosDe, usa130, usaIgic } from './empresa.js';
import { habil, limiteTrimestre } from './calculos.js';
import { foralDe, plazoForal, territorioDe, TERRITORIOS } from './territorios.js';
import { plazo420 } from './igic.js';

const ANUALES = {
  '390': '01-30', '190': '01-31', '180': '01-31', '193': '01-31',
  '425': '01-31', '100': '06-30', '200': '07-25',
  'rm-cuentas': '07-30', 'rm-libros': '04-30',
};
const finMes = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);

function presentadoDe(modelo, pres, anio, t) {
  if (modelo === '303' || modelo === '420') return hecho303(pres.pres303, pres.pagos130, anio, t);
  if (modelo === '130') return hecho130(pres.pagos130, anio, t);
  if (modelo === '111') return marcaRet(pres.pres111, anio, t);
  if (modelo === '115') return marcaRet(pres.pres115, anio, t);
  if (modelo === '123' && Object.hasOwn(pres.pres123?.[anio] || {}, t)) return Boolean(pres.pres123[anio][t]);
  return null;
}

// Calendario del despacho, sin modificar los clientes ni consultar datos externos.
export function plazosDespacho(clientes, { hoy, dias = 90 }) {
  const hasta = new Date(`${hoy}T00:00:00Z`);
  hasta.setUTCDate(hasta.getUTCDate() + dias);
  const fin = hasta.toISOString().slice(0, 10);
  const anioHoy = Number(hoy.slice(0, 4));
  const filas = new Map();

  for (const cliente of clientes) {
    const fiscal = { ...FISCAL_BASE, ...cliente.fiscal };
    const pres = cliente.pres || {};
    const modelos = modelosDe(fiscal);
    const territorio = territorioDe(fiscal);
    const foral = foralDe(fiscal);
    const haciendaDe = (modelo) => TERRITORIOS[foral ? territorio : usaIgic(fiscal) && ['420', '425', '415'].includes(modelo) ? 'canarias' : 'comun'].hacienda;
    const agregar = (fecha, modelo, nombre, periodo, presentado) => {
      if (fecha < hoy || fecha > fin) return;
      const hacienda = haciendaDe(modelo);
      const clave = JSON.stringify([fecha, modelo, periodo, hacienda]);
      if (!filas.has(clave)) filas.set(clave, { fecha, modelo, nombre, periodo, hacienda, clientes: [] });
      filas.get(clave).clientes.push({ id: cliente.id, nombre: cliente.nombre, presentado });
    };

    for (const anio of [anioHoy - 1, anioHoy, anioHoy + 1]) {
      if (foral) {
        // Las marcas guardadas conservan las claves de sus equivalentes comunes.
        const trimestrales = [
          fiscal.iva === 'general' && ['f-iva', 'iva', '303', foral.iva.num],
          usa130(fiscal) && !foral.irpf.deOficio && ['f-irpf', 'irpf', '130', foral.irpf.num],
          fiscal.trabajadores && ['f-ret', 'ret', '111', foral.ret.num],
          fiscal.alquiler && ['f-alquiler', 'ret', '115', foral.ret.alquiler || foral.ret.num],
        ].filter(Boolean);
        for (const [id, clave, comun, num] of trimestrales) {
          const modelo = modelos.find((m) => m.id === id);
          for (const t of [1, 2, 3, 4]) {
            if (clave === 'irpf' && foral.irpf.exonerados?.[anio]?.includes(t)) continue;
            const numero = clave === 'iva' && t === 4 ? foral.iva.cuarto || num : num;
            agregar(plazoForal(territorio, clave, t, anio), numero, modelo?.nombre || numero, `${t}T ${anio}`, presentadoDe(comun, pres, anio, t));
          }
        }
        continue;
      }

      for (const { id, nombre } of modelos) {
        if (['303', '130', '131', '349', '111', '115', '123', '369', '420'].includes(id)) {
          for (const t of [1, 2, 3, 4]) {
            let fecha;
            if (id === '420') fecha = plazo420(anio, t);
            else if (id === '369') fecha = habil(finMes(t === 4 ? anio + 1 : anio, t === 4 ? 1 : t * 3 + 1));
            else fecha = limiteTrimestre(t, anio, ['111', '115', '123'].includes(id) ? 20 : 30);
            agregar(fecha, id, nombre, `${t}T ${anio}`, presentadoDe(id, pres, anio, t));
          }
        } else if (id === '202') {
          for (const [i, mes] of ['04', '10', '12'].entries()) agregar(habil(`${anio}-${mes}-20`), id, nombre, `${i + 1}P ${anio}`, null);
        } else if (id === '347' || id === '415' || ANUALES[id]) {
          const fecha = id === '347' || id === '415' ? finMes(anio + 1, 2) : `${anio + 1}-${ANUALES[id]}`;
          agregar(habil(fecha), id, nombre, String(anio), null);
        }
      }
    }
  }

  for (const fila of filas.values()) fila.clientes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return [...filas.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.modelo.localeCompare(b.modelo) || a.periodo.localeCompare(b.periodo) || a.hacienda.localeCompare(b.hacienda, 'es'));
}
