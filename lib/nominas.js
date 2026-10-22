import { r2 } from './calculos.js';
import { puede } from './permisos.js';

// Nóminas de los empleados de la empresa. Los % de Seguridad Social son los generales de 2026 (contrato indefinido,
// régimen general): la gestoría puede afinarlos por empleado (el de accidentes de trabajo cambia según la actividad).
export const SS_TRABAJADOR = 6.5; // contingencias comunes 4,70 + desempleo 1,55 + formación 0,10 + MEI 0,15
export const SS_EMPRESA = 31.65; // contingencias comunes 23,60 + desempleo 5,50 + FOGASA 0,20 + formación 0,60 + MEI 0,75 + AT/EP ~1,00
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

// Todo lo de una nómina a partir del bruto y los porcentajes (o de sus importes, en las agrupadas de agruparNominas).
export function calculoNomina(n) {
  if (n.importes) {
    const { bruto, irpf, ssTrabajador, ssEmpresa } = n.importes;
    return { bruto, irpf, ssTrabajador, ssEmpresa, neto: r2(bruto - irpf - ssTrabajador), coste: r2(bruto + ssEmpresa), seguros: r2(ssTrabajador + ssEmpresa) };
  }
  const bruto = r2(Number(n.bruto) || 0);
  const irpf = r2((bruto * (Number(n.irpfPct) || 0)) / 100);
  const ssTrabajador = r2((bruto * (Number(n.ssTrabajadorPct) || 0)) / 100);
  const ssEmpresa = r2((bruto * (Number(n.ssEmpresaPct) || 0)) / 100);
  return { bruto, irpf, ssTrabajador, ssEmpresa, neto: r2(bruto - irpf - ssTrabajador), coste: r2(bruto + ssEmpresa), seguros: r2(ssTrabajador + ssEmpresa) };
}

const ultimoDia = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
export const fechaPagoNomina = (n) => n.pagado || ultimoDia(n.mes);
export const nominasPagadasEn = (nominas, anio, t) => nominas.filter((n) => {
  const fecha = fechaPagoNomina(n);
  return n.pagada !== false && fecha.startsWith(`${anio}-`) && (!t || Math.ceil(Number(fecha.slice(5, 7)) / 3) === t);
});

// El coste de la nómina (bruto + Seguridad Social de la empresa) entra como gasto deducible, sin IVA, el último día del mes.
export const gastoDeNomina = (n, actividad) => ({
  id: `nomina-${n.id}`,
  fecha: ultimoDia(n.mes),
  actividad,
  concepto: `Nómina ${n.empleadoNombre} · ${nombreMes(n.mes)}`.slice(0, 140),
  base: calculoNomina(n).coste,
  ivaPct: 0,
  nomina: n.id,
});

// Modelo 111 de un trimestre: perceptores, sueldos pagados y retenciones a ingresar.
export function modelo111(nominas, anio, t) {
  const del = nominasPagadasEn(nominas, anio, t);
  const c = del.map(calculoNomina);
  return {
    perceptores: new Set(del.flatMap((n) => n.empleados || [n.empleado])).size,
    percepciones: r2(c.reduce((s, x) => s + x.bruto, 0)),
    retenciones: r2(c.reduce((s, x) => s + x.irpf, 0)),
    seguros: r2(c.reduce((s, x) => s + x.seguros, 0)),
  };
}

// Sin el permiso «Nóminas» no se ve lo que cobra cada persona (auditoría de octubre de 2026, Codex H2): sus nóminas se
// juntan en una por mes y día de pago, «3 personas», con la suma de los importes; de quiénes, solo sus ids (para contar
// la plantilla media de las cuentas anuales y los perceptores del 111). Los totales no cambian.
export const veSueldos = (u) => puede(u, 'nominas');
export function agruparNominas(nominas = []) {
  const grupos = new Map();
  for (const n of nominas) {
    const k = [n.mes, fechaPagoNomina(n), n.pagada === false, Boolean(n.estimada)].join('|');
    const c = calculoNomina(n);
    let g = grupos.get(k);
    if (!g) {
      g = { id: `nominas-${n.mes}-${grupos.size + 1}`, mes: n.mes, ...(n.pagado ? { pagado: n.pagado } : {}), ...(n.pagada !== undefined ? { pagada: n.pagada } : {}), ...(n.estimada ? { estimada: true } : {}), agrupada: true, empleados: [], importes: { bruto: 0, irpf: 0, ssTrabajador: 0, ssEmpresa: 0 } };
      grupos.set(k, g);
    }
    for (const x of ['bruto', 'irpf', 'ssTrabajador', 'ssEmpresa']) g.importes[x] = r2(g.importes[x] + c[x]);
    if (!g.empleados.includes(n.empleado)) g.empleados.push(n.empleado);
  }
  return [...grupos.values()].map((g) => ({ ...g, empleadoNombre: `${g.empleados.length} ${g.empleados.length === 1 ? 'persona' : 'personas'}` }));
}
// Los gastos de las nóminas (gastoDeNomina), uno por mes y actividad, donde estaba el primero.
export function agruparGastosNomina(gastos = []) {
  const out = [], grupos = new Map();
  for (const g of gastos) {
    if (!g.nomina) { out.push(g); continue; }
    const k = `${g.fecha}|${g.actividad || ''}`;
    let x = grupos.get(k);
    if (!x) {
      x = { id: `nominas-${g.fecha}${g.actividad ? `-${g.actividad}` : ''}`, fecha: g.fecha, actividad: g.actividad, base: 0, ivaPct: 0, nomina: 'agrupada', agrupado: true, n: 0 };
      grupos.set(k, x);
      out.push(x);
    }
    x.base = r2(x.base + (Number(g.base) || 0));
    x.n += 1;
  }
  for (const x of grupos.values()) x.concepto = `Nóminas de ${nombreMes(x.fecha.slice(0, 7))} · ${x.n} ${x.n === 1 ? 'persona' : 'personas'}`;
  return out;
}
export const gastosQueVe = (u, gastos) => (veSueldos(u) ? gastos : agruparGastosNomina(gastos || []));
export const nominasQueVe = (u, nominas) => (veSueldos(u) ? nominas : agruparNominas(nominas || []));

