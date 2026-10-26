// Embudo de activación del panel del administrador de Fisquo (/admin): de las empresas que se dan de alta, cuántas llegan a
// cada paso (primera factura, primer gasto, banco, primer modelo presentado), con el porcentaje sobre el paso anterior y la
// mediana de días desde el alta. Sin React ni base de datos para poder probarlo; lib/embudoServidor.js reúne los hitos.
//
// hitos: { [idEmpresa]: { factura, gasto, banco, modelo } }. Cada uno es el día (AAAA-MM-DD) en que se alcanzó, '' si se
// alcanzó pero no se sabe el día, o falta si no se ha alcanzado. Sale de los índices y de la propia empresa, no de los
// documentos: ver embudoServidor.js.

export const PASOS = [
  { id: 'alta', nombre: 'Alta' },
  { id: 'factura', nombre: 'Primera factura' },
  { id: 'gasto', nombre: 'Primer gasto' },
  { id: 'banco', nombre: 'Banco' },
  { id: 'modelo', nombre: 'Primer modelo presentado' },
];

export const VENTANAS = [
  { id: '30', dias: 30, nombre: 'Altas de los últimos 30 días' },
  { id: '90', dias: 90, nombre: 'Altas de los últimos 90 días' },
  { id: 'todas', dias: null, nombre: 'Todas las altas' },
];

const DIA = 86400000;
const dia = (d) => (/^\d{4}-\d{2}-\d{2}/.test(d || '') ? Date.parse(`${d.slice(0, 10)}T12:00:00Z`) : NaN);

// Mediana de una lista de números (null si no hay). Con tamaño par, la media de los dos centrales.
export function mediana(lista) {
  const v = lista.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Un modelo marcado como presentado en la empresa (303/420, 130, 131, 111, 115, 123, 216, 369 o un pago del 202) y, si se
// sabe, desde cuándo: pagadosHacienda guarda el momento de cada marca (app/api/cuenta). Los cero del 130 o del 131 y el 202
// no lo guardan: cuentan como presentados, sin día.
export function modeloPresentado(e) {
  const tiene = (obj, f) => Object.values(obj || {}).some((porAnio) => Object.values(porAnio || {}).some(f));
  const hecho = tiene(e?.pres303, (v) => v === true || v === 'devolucion')
    || ['pres111', 'pres115', 'pres123', 'pres216', 'pres369'].some((k) => tiene(e?.[k], (v) => v === true))
    || ['pagos130', 'pagos131', 'pagos202'].some((k) => tiene(e?.[k], (v) => v !== undefined && v !== null));
  if (!hecho) return { hecho: false, fecha: '' };
  const dias = Object.values(e?.pagadosHacienda || {}).map((x) => String(x?.en || x?.fecha || '').slice(0, 10)).filter((d) => !Number.isNaN(dia(d))).sort();
  return { hecho: true, fecha: dias[0] || '' };
}

// empresas: filas del panel (lib/admin.js resumenAdmin: id, creada, registrada, regalo). Solo cuentan las que se registraron
// ellas mismas (ni Fundador regalado ni cuentas anteriores a los planes), como las altas del panel.
// El embudo es acumulado: una empresa cuenta en un paso si ha hecho también todos los anteriores, así el porcentaje sobre el
// paso anterior nunca pasa de 100. Los días son desde el alta; un hito anterior al alta (facturas con fecha antigua) cuenta 0.
export function calcularEmbudo({ empresas = [], hitos = {}, hoy = new Date() }) {
  const base = empresas.filter((e) => e.registrada && !e.regalo);
  const ahora = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate(), 12);
  return VENTANAS.map((v) => {
    const grupo = base.filter((e) => v.dias === null || (!Number.isNaN(dia(e.creada)) && ahora - dia(e.creada) <= v.dias * DIA));
    let anterior = grupo;
    const pasos = PASOS.map((p, i) => {
      const llegan = i === 0 ? grupo : anterior.filter((e) => hitos[e.id]?.[p.id] !== undefined);
      const dias = i === 0 ? [] : llegan.map((e) => {
        const fin = dia(hitos[e.id][p.id]), ini = dia(e.creada);
        return Number.isNaN(fin) || Number.isNaN(ini) ? NaN : Math.max(0, Math.round((fin - ini) / DIA));
      }).filter((d) => !Number.isNaN(d));
      const fila = {
        id: p.id, nombre: p.nombre, n: llegan.length,
        pctPrevio: i === 0 ? null : anterior.length ? Math.round((100 * llegan.length) / anterior.length) : null,
        pctAltas: grupo.length ? Math.round((100 * llegan.length) / grupo.length) : null,
        mediana: mediana(dias), conDia: dias.length,
      };
      anterior = llegan;
      return fila;
    });
    return { id: v.id, nombre: v.nombre, altas: grupo.length, pasos };
  });
}

// «3 días», «1 día», «el mismo día»; sin dato, «—».
export function textoDias(d) {
  if (d === null || d === undefined) return '—';
  if (d === 0) return 'el mismo día';
  const t = Number.isInteger(d) ? String(d) : d.toLocaleString('es-ES', { maximumFractionDigits: 1 });
  return `${t} ${d === 1 ? 'día' : 'días'}`;
}
