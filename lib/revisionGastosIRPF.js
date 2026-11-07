import { faltaAfectacionIRPF } from './ivaDeducible.js';
import { noDeducibleIRPF } from './categorias.js';
import { amortizacionesAnio } from './amortizaciones.js';

// Diagnóstico sin escrituras. No hay fecha fiable de creación en los gastos antiguos: se busca el dato que falta,
// también en importaciones recientes. Incluye abonos y bienes de inversión; su afectación también cambia el IRPF.
// El llamante aporta exclusivamente los gastos de la empresa autorizada, sin depender de la paginación de la pantalla.
export function gastosSinAfectacion(gastos, anio) {
  return (gastos || []).filter((g) => !g.nomina && !g.agrupado && faltaAfectacionIRPF(g) && !noDeducibleIRPF(g)
    && (g.fecha?.startsWith(`${anio}-`) || (g.inversion && g.fecha < `${anio}-01-01`
      && amortizacionesAnio([g], Number(anio), { irpf: true }).some((a) => a.cuota > 0))))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.id).localeCompare(String(b.id)));
}
