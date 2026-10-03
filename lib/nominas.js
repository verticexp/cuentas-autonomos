import { r2 } from './calculos.js';

// Nóminas de los empleados de la empresa. Los % de Seguridad Social son los generales de 2026 (contrato indefinido,
// régimen general): la gestoría puede afinarlos por empleado (el de accidentes de trabajo cambia según la actividad).
export const SS_TRABAJADOR = 6.5; // contingencias comunes 4,70 + desempleo 1,55 + formación 0,10 + MEI 0,15
export const SS_EMPRESA = 31.65; // contingencias comunes 23,60 + desempleo 5,50 + FOGASA 0,20 + formación 0,60 + MEI 0,75 + AT/EP ~1,00
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

// Todo lo de una nómina a partir del bruto y los porcentajes.
export function calculoNomina(n) {
  const bruto = r2(Number(n.bruto) || 0);
  const irpf = r2((bruto * (Number(n.irpfPct) || 0)) / 100);
  const ssTrabajador = r2((bruto * (Number(n.ssTrabajadorPct) || 0)) / 100);
  const ssEmpresa = r2((bruto * (Number(n.ssEmpresaPct) || 0)) / 100);
  return { bruto, irpf, ssTrabajador, ssEmpresa, neto: r2(bruto - irpf - ssTrabajador), coste: r2(bruto + ssEmpresa), seguros: r2(ssTrabajador + ssEmpresa) };
}

const ultimoDia = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);

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
  const meses = [1, 2, 3].map((i) => `${anio}-${String((t - 1) * 3 + i).padStart(2, '0')}`);
  const del = nominas.filter((n) => meses.includes(n.mes));
  const c = del.map(calculoNomina);
  return {
    perceptores: new Set(del.map((n) => n.empleado)).size,
    percepciones: r2(c.reduce((s, x) => s + x.bruto, 0)),
    retenciones: r2(c.reduce((s, x) => s + x.irpf, 0)),
    seguros: r2(c.reduce((s, x) => s + x.seguros, 0)),
  };
}
