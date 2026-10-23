import { r2 } from './calculos.js';
import { puede } from './permisos.js';
import { nominaCotizacion } from './cotizacion.js';
import { limpiar145, retencionTrabajo } from './retencionIrpf.js';

// Nóminas de los empleados de la empresa. Los % de Seguridad Social son los generales de 2026 (contrato indefinido,
// régimen general): la gestoría puede afinarlos por empleado (el de accidentes de trabajo cambia según la actividad).
export const SS_TRABAJADOR = 6.5; // contingencias comunes 4,70 + desempleo 1,55 + formación 0,10 + MEI 0,15
export const SS_EMPRESA = 32.15; // contingencias comunes 23,60 + desempleo 5,50 + FOGASA 0,20 + formación 0,60 + MEI 0,75 + AT/EP 1,50
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

// ---- Nómina completa (2026): bases y cuotas de Seguridad Social por concepto (lib/cotizacion.js, Orden PJC/297/2026),
// cotización de solidaridad y retención del IRPF con el algoritmo de la AEAT y el modelo 145 (lib/retencionIrpf.js).
// Un empleado la usa cuando tiene sus datos de cotización (empleado.cotizacion); si además tiene los del 145
// (empleado.datos145), el tipo de IRPF sale solo; si no, el que se ponga a mano.
export const GRUPOS = {
  1: 'Ingenieros, licenciados y alta dirección', 2: 'Ingenieros técnicos, peritos y ayudantes titulados', 3: 'Jefes administrativos y de taller',
  4: 'Ayudantes no titulados', 5: 'Oficiales administrativos', 6: 'Subalternos', 7: 'Auxiliares administrativos',
  8: 'Oficiales de primera y segunda', 9: 'Oficiales de tercera y especialistas', 10: 'Peones', 11: 'Menores de 18 años',
};
const numeroOk = (v, min, max) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
// Datos de cotización del formulario del empleado: { grupo, temporal, pagas, prorrateadas, atPct } o { error }.
export function limpiarCotizacion(c) {
  if (!c) return null;
  const grupo = numeroOk(c.grupo, 1, 11), pagas = numeroOk(c.pagas ?? 2, 0, 4), atPct = numeroOk(c.atPct ?? 1.5, 0, 10);
  if (!Number.isInteger(grupo)) return { error: 'Elige el grupo de cotización (1 a 11)' };
  if (!Number.isInteger(pagas)) return { error: 'Las pagas extra van de 0 a 4 al año' };
  if (atPct === null) return { error: 'La tarifa de accidentes de trabajo va del 0 al 10 %' };
  return { grupo, temporal: Boolean(c.temporal), pagas, prorrateadas: c.prorrateadas !== false, atPct: Math.round(atPct * 100) / 100 };
}
// Datos del modelo 145 del formulario: se guardan solo si el cálculo de la AEAT los acepta (con una retribución de prueba).
export function limpiarDatos145(d, nif) {
  if (!d) return null;
  const r = limpiar145({ situacion: 'activo', contrato: 'general', situacionFamiliar: 3, ...d, nif, retribuciones: 1 });
  if (r.error) return { error: `Modelo 145: ${r.error}` };
  const { nif: _n, retribuciones: _r, ...datos } = r;
  return datos;
}

// Sueldo de un mes normal y lo que cobra en el año (para el tipo de IRPF): con las pagas prorrateadas, el sueldo del
// empleado ya las lleva; si no, cada paga extra es un sueldo más.
const pagasAnualesDe = (e) => (e.cotizacion.prorrateadas ? 0 : r2(e.cotizacion.pagas * e.bruto));
const mesActual = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 7);
// Meses naturales de alta en el año; en los incompletos, días de alta / días del mes (ambos extremos incluidos).
// Las pagas extra se prevén en la misma proporción, incluida su liquidación al causar baja.
const mesesDe = (e, anio) => {
  const desde = e.alta && e.alta > `${anio}-01-01` ? e.alta : `${anio}-01-01`;
  const hasta = e.baja && e.baja < `${anio}-12-31` ? e.baja : `${anio}-12-31`;
  let meses = 0;
  for (let m = 1; m <= 12; m++) {
    const mes = `${anio}-${String(m).padStart(2, '0')}`, dias = new Date(Date.UTC(anio, m, 0)).getUTCDate();
    const inicio = desde > `${mes}-01` ? desde : `${mes}-01`;
    const fin = hasta < `${mes}-${dias}` ? hasta : `${mes}-${dias}`;
    if (inicio <= fin) meses += (Number(fin.slice(8, 10)) - Number(inicio.slice(8, 10)) + 1) / dias;
  }
  return meses;
};
export const anualDe = (e, anio = Number(mesActual().slice(0, 4))) => r2((e.bruto * 12 + pagasAnualesDe(e)) * mesesDe(e, anio) / 12);
const parcialDe = (e) => Math.min(1, Math.max(0.01, (Number(e.horasSemana) || 40) / 40));

// Nómina completa de un mes. bruto: lo devengado en el mes (sueldo, horas extra y, si se paga ese mes, la paga extra);
// pagaExtra: la parte que es paga extra (no prorrateada: su prorrata ya cotiza cada mes); horasExtra: la parte que son
// horas extra; irpfPct: un tipo puesto a mano (si no, el del 145 o el del empleado).
// mes: periodo de la nómina (por defecto el actual); horas: las trabajadas ese mes según el registro de jornada, si las hay
// (a tiempo parcial, la base mínima es por hora trabajada).
export function nominaCompleta(e, { bruto, pagaExtra = 0, horasExtra = 0, irpfPct, mes = e.mes || mesActual(), horas } = {}) {
  const c = e.cotizacion;
  if (!c) return { error: 'El empleado no tiene datos de cotización' };
  const comun = { pagasExtraAnuales: pagasAnualesDe(e), prorrateadas: c.prorrateadas, grupo: c.grupo, dias: 30, parcial: parcialDe(e), temporal: c.temporal, atPct: c.atPct, horas };
  const cot = nominaCotizacion({ ...comun, bruto: r2(bruto - pagaExtra), horasExtra });
  if (cot.error) return cot;
  // Retribuciones y cuotas previstas solo durante los meses de alta del año de esta nómina.
  const normal = nominaCotizacion({ ...comun, bruto: e.bruto });
  const anio = Number(mes.slice(0, 4)), anual = anualDe(e, anio);
  const r = e.datos145 && !normal.error ? retencionTrabajo({ ...e.datos145, nif: e.nif, retribuciones: anual, cotizaciones: r2(normal.cuotas.trabajador.total * mesesDe(e, anio)) }) : null;
  const calculado = r && !r.error ? r.tipo : null;
  const manual = irpfPct !== undefined && irpfPct !== null && irpfPct !== '' && Number.isFinite(Number(irpfPct));
  const tipo = manual ? Math.min(100, Math.max(0, Number(irpfPct))) : calculado ?? (Number(e.irpfPct) || 0);
  const irpf = r2((bruto * tipo) / 100);
  const ssTrabajador = cot.cuotas.trabajador.total, ssEmpresa = cot.cuotas.empresa.total;
  const pct = (v) => (bruto ? Math.round((v / bruto) * 10000) / 100 : 0);
  return {
    importes: { bruto: r2(bruto), irpf, ssTrabajador, ssEmpresa },
    irpfPct: tipo, ssTrabajadorPct: pct(ssTrabajador), ssEmpresaPct: pct(ssEmpresa),
    detalle: {
      grupo: c.grupo, temporal: c.temporal, parcial: parcialDe(e), base: cot.base, baseAT: cot.baseAT, exceso: cot.exceso,
      ...(horas !== undefined ? { horas } : {}),
      pagas: c.pagas, prorrateadas: c.prorrateadas, atPct: c.atPct,
      prorrata: c.prorrateadas ? 0 : r2(pagasAnualesDe(e) / 12), horasExtra: r2(horasExtra), pagaExtra: r2(pagaExtra),
      cuotas: cot.cuotas, irpf: { tipo, calculado, manual, ...(r && !r.error ? { base: r.base, minimo: r.minimo.total, anual } : {}) },
    },
  };
}

// Parte del sueldo del mes que es prorrata de las pagas extra, cuando van prorrateadas en cada mes: con los datos
// guardados en la nómina (las anteriores a guardarlos, con los del empleado).
export function prorrateoDe(n, e) {
  const d = n.detalle;
  const prorrateadas = d?.prorrateadas ?? e?.cotizacion?.prorrateadas, pagas = d?.pagas ?? e?.cotizacion?.pagas ?? 0;
  if (!d || !prorrateadas || !pagas) return 0;
  return r2((r2(calculoNomina(n).bruto - d.horasExtra - d.pagaExtra) * pagas) / (12 + pagas));
}

// Conceptos retributivos del mes para RED (Tabla 84 de la TGSS, mensaje CRA): 0001 retribución no incluida en otros
// apartados (el sueldo y, si se paga ese mes, la paga extra), 0002 horas extraordinarias y 0004 prorrateo de las pagas
// extraordinarias (cuando van en el sueldo de cada mes).
export function conceptosRed(n, e) {
  const d = n.detalle;
  if (!d) return [];
  const prorrateo = prorrateoDe(n, e);
  const bruto = calculoNomina(n).bruto;
  const sueldo = r2(bruto - d.horasExtra - prorrateo);
  return [['0001', 'Retribución no incluida en otros apartados', sueldo], ['0002', 'Horas extraordinarias', d.horasExtra], ['0004', 'Prorrateo de las pagas extraordinarias', prorrateo]].filter(([, , v]) => v > 0);
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

