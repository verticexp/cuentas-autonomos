// El año del historial no afecta a las nóminas ni a los impuestos del mes actual.
export function historialNominas(nominas, actual, solicitado) {
  const anios = [...new Set([actual, ...nominas.map((n) => Number(n.mes.slice(0, 4)))])].sort((a, b) => b - a);
  const anio = typeof solicitado === 'string' && /^\d{4}$/.test(solicitado) && anios.includes(Number(solicitado)) ? Number(solicitado) : actual;
  const meses = [...new Set(nominas.filter((n) => n.mes.startsWith(`${anio}-`)).map((n) => n.mes))].sort((a, b) => b.localeCompare(a));
  return { anios, anio, meses };
}

export function equipoPorFecha(empleados, fecha) {
  return {
    actuales: empleados.filter((e) => e.alta <= fecha && (!e.baja || e.baja >= fecha)),
    futuras: empleados.filter((e) => e.alta > fecha),
    bajas: empleados.filter((e) => e.alta <= fecha && e.baja && e.baja < fecha),
  };
}
