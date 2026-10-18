// Filtros y páginas de la pantalla: las sugerencias se calculan aparte sobre todos los movimientos.
const texto = (v) => String(Array.isArray(v) ? v[0] ?? '' : v ?? '').trim();
const normal = (v) => texto(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fecha = (v) => {
  const f = texto(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(f) && Number.isFinite(Date.parse(`${f}T12:00:00Z`))
    && new Date(`${f}T12:00:00Z`).toISOString().slice(0, 10) === f ? f : '';
};
const paginaDe = (v, max) => { const p = Number(texto(v)); return Number.isSafeInteger(p) && p > 0 ? Math.min(p, max) : 1; };
const ESTADOS = { pendientes: 'pp', emparejados: 'pe', ignorados: 'pi' };

export function historialBanco(movimientos = [], consulta = {}) {
  const filtros = { q: texto(consulta.q).slice(0, 200), cuenta: texto(consulta.cuenta).slice(0, 200), desde: fecha(consulta.desde), hasta: fecha(consulta.hasta) };
  const q = normal(filtros.q);
  const lista = [...movimientos].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(a.id).localeCompare(String(b.id)));
  const filtrada = lista.filter((m) => (!q || normal([m.concepto, m.contraparte, m.referencia, m.id].filter(Boolean).join(' ')).includes(q))
    && (!filtros.cuenta || m.cuenta === filtros.cuenta) && (!filtros.desde || m.fecha >= filtros.desde) && (!filtros.hasta || m.fecha <= filtros.hasta));
  const grupos = {};
  for (const [estado, parametro] of Object.entries(ESTADOS)) {
    const items = filtrada.filter((m) => estado === 'pendientes' ? !m.estado || m.estado === 'pendiente' : m.estado === (estado === 'emparejados' ? 'emparejado' : 'ignorado'));
    const paginas = Math.max(1, Math.ceil(items.length / 50));
    const pagina = paginaDe(consulta[parametro], paginas);
    const inicio = (pagina - 1) * 50;
    grupos[estado] = { items: items.slice(inicio, inicio + 50), total: items.length, pagina, paginas, desde: items.length ? inicio + 1 : 0, hasta: Math.min(inicio + 50, items.length) };
  }
  const url = (estado, pagina) => {
    const valores = { ...filtros, ...Object.fromEntries(Object.entries(ESTADOS).map(([k, p]) => [p, grupos[k].pagina])), [ESTADOS[estado]]: pagina };
    const params = new URLSearchParams(Object.entries(valores).filter(([k, v]) => v && (!Object.values(ESTADOS).includes(k) || Number(v) > 1)));
    return `/banco${params.size ? `?${params}` : ''}#banco-${estado}`;
  };
  for (const [estado, grupo] of Object.entries(grupos)) {
    grupo.anterior = grupo.pagina > 1 ? url(estado, grupo.pagina - 1) : null;
    grupo.siguiente = grupo.pagina < grupo.paginas ? url(estado, grupo.pagina + 1) : null;
  }
  return { filtros, grupos, total: lista.length, encontrados: filtrada.length };
}
