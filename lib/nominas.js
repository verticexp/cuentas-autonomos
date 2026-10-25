import { r2 } from './calculos.js';
import { puede } from './permisos.js';
import { nominaCotizacion, baseMensual, cuotas } from './cotizacion.js';
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
    const exenta = n.importes.indemnizacionExenta || 0, delegado = n.importes.pagoDelegado ?? n.detalle?.it?.pagoDelegado ?? 0;
    return { bruto, irpf, ssTrabajador, ssEmpresa, ...(exenta ? { indemnizacionExenta: exenta, totalDevengado: r2(bruto + exenta) } : {}), neto: r2(bruto + exenta - irpf - ssTrabajador), coste: r2(bruto + exenta + ssEmpresa - delegado), seguros: r2(ssTrabajador + ssEmpresa) };
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
// Consejeros y administradores (administrador): 'asimilado' cotiza en el régimen general sin desempleo, FOGASA ni
// formación (art. 136.2.c LGSS); 'autonomo' (con el control de la sociedad, art. 305.2.b) cotiza él en el RETA y la
// nómina no lleva Seguridad Social. Los dos llevan la retención de los administradores (art. 101.2 RIRPF): el 35 %, o el
// 19 % si la sociedad facturó menos de 100.000 € el año anterior (pequena).
export const ADMINISTRADOR = { asimilado: 'Consejero o administrador asimilado (régimen general)', autonomo: 'Administrador con el control de la sociedad (autónomo, RETA)' };
export const retencionAdministrador = (c) => (c?.pequena ? 19 : 35);
// Datos de cotización del formulario del empleado: { grupo, temporal, sustitucion, pagas, prorrateadas, atPct,
// administrador, pequena } o { error }.
export function limpiarCotizacion(c) {
  if (!c) return null;
  const administrador = ADMINISTRADOR[c.administrador] ? c.administrador : undefined;
  const grupo = administrador === 'autonomo' && !c.grupo ? 1 : numeroOk(c.grupo, 1, 11), pagas = numeroOk(c.pagas ?? 2, 0, 4), atPct = numeroOk(c.atPct ?? 1.5, 0, 10);
  if (!Number.isInteger(grupo)) return { error: 'Elige el grupo de cotización (1 a 11)' };
  if (!Number.isInteger(pagas)) return { error: 'Las pagas extra van de 0 a 4 al año' };
  if (atPct === null) return { error: 'La tarifa de accidentes de trabajo va del 0 al 10 %' };
  return { grupo, temporal: Boolean(c.temporal), ...(c.temporal && c.sustitucion ? { sustitucion: true } : {}), pagas, prorrateadas: c.prorrateadas !== false, atPct: Math.round(atPct * 100) / 100, ...(administrador ? { administrador, ...(c.pequena ? { pequena: true } : {}) } : {}) };
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
// Días de alta en un mes (AAAA-MM) y si es el mes entero.
export function diasDeAlta(e, mes) {
  const total = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
  const inicio = e.alta && e.alta > `${mes}-01` ? e.alta : `${mes}-01`;
  const fin = e.baja && e.baja < `${mes}-${total}` ? e.baja : `${mes}-${total}`;
  const dias = inicio <= fin && inicio.startsWith(mes) ? Number(fin.slice(8, 10)) - Number(inicio.slice(8, 10)) + 1 : 0;
  return { dias, total, entero: dias === total };
}
// Contrato temporal de menos de 30 días que acaba este mes (art. 151 LGSS): lleva la cotización adicional.
const contratoCortoEn = (e, mes) => Boolean(e.cotizacion?.temporal && !e.cotizacion.sustitucion && !e.cotizacion.administrador && e.alta && e.baja?.startsWith(mes) && (Date.parse(e.baja) - Date.parse(e.alta)) / 864e5 + 1 < 30);
export const anualDe = (e, anio = Number(mesActual().slice(0, 4))) => r2((e.bruto * 12 + pagasAnualesDe(e)) * mesesDe(e, anio) / 12);
const parcialDe = (e) => Math.min(1, Math.max(0.01, (Number(e.horasSemana) || 40) / 40));

// Nómina completa de un mes. bruto: lo devengado en el mes (sueldo, horas extra y, si se paga ese mes, la paga extra);
// pagaExtra: la parte que es paga extra (no prorrateada: su prorrata ya cotiza cada mes); horasExtra: la parte que son
// horas extra; irpfPct: un tipo puesto a mano (si no, el del 145 o el del empleado).
// mes: periodo de la nómina (por defecto el actual); horas: las trabajadas ese mes según el registro de jornada, si las hay
// (a tiempo parcial, la base mínima es por hora trabajada).
export function nominaCompleta(e, { bruto, pagaExtra = 0, horasExtra = 0, irpfPct, mes = e.mes || mesActual(), horas, it, atrasos, horasExtraFuerzaMayor = 0, numeroHorasExtra = 0, numeroHorasExtraFuerzaMayor = 0 } = {}) {
  const c = e.cotizacion;
  if (!c) return { error: 'El empleado no tiene datos de cotización' };
  if (!mesValido(mes)) return { error: 'Mes no válido' };
  for (const v of [bruto, pagaExtra, horasExtra, horasExtraFuerzaMayor]) if (!importeNominaValido(v)) return { error: 'Los importes deben ser números entre 0 y 1.000.000 €' };
  if (pagaExtra + horasExtra + horasExtraFuerzaMayor > bruto) return { error: 'Las pagas y horas extra deben estar incluidas en el bruto' };
  if (![numeroHorasExtra, numeroHorasExtraFuerzaMayor].every((v) => importeNominaValido(v, 744))) return { error: 'El número de horas extra debe estar entre 0 y 744' };
  const atraso = limpiarAtrasos(atrasos, mes);
  if (atraso?.error) return atraso;
  // Días cotizados: en los grupos 8 a 11, los naturales de alta en el mes; en los demás, 30 con el mes entero.
  const alta = diasDeAlta(e, mes);
  const diaria = c.grupo >= 8;
  const comun = { pagasExtraAnuales: pagasAnualesDe(e), prorrateadas: c.prorrateadas, grupo: c.grupo, dias: diaria ? alta.dias : alta.entero ? 30 : Math.min(30, alta.dias), entero: alta.entero, parcial: parcialDe(e), temporal: c.temporal, atPct: c.atPct, horas, asimilado: c.administrador === 'asimilado' };
  if (!comun.dias) return { error: 'El empleado no está de alta ese mes' };
  const incapacidad = it ? calculoIT(e, { ...it, mes, salario: r2(bruto - pagaExtra - horasExtra - horasExtraFuerzaMayor) }) : null;
  if (incapacidad?.error) return incapacidad;
  let remuneracion = r2(bruto - pagaExtra);
  if (incapacidad) {
    remuneracion = r2(incapacidad.salarioTrabajado + horasExtra + horasExtraFuerzaMayor);
    bruto = r2(remuneracion + pagaExtra + incapacidad.prestacion + incapacidad.complemento);
  }
  // Los atrasos se liquidan por sus meses de devengo (L03), sin consumir el tope del mes de cobro.
  bruto = r2(bruto + (atraso?.importe || 0));
  let cot = nominaCotizacion({ ...comun, bruto: remuneracion, horasExtra, horasExtraFuerzaMayor, contratoCorto: contratoCortoEn(e, mes) });
  if (incapacidad && !cot.error) {
    const factor = incapacidad.diasCotizacion / comun.dias;
    const prorrataTrabajo = c.prorrateadas ? 0 : pagasAnualesDe(e) / 12 * (comun.dias - incapacidad.diasCotizacion) / 30;
    const rawCC = remuneracion - horasExtra - horasExtraFuerzaMayor + prorrataTrabajo + incapacidad.baseCotizacion;
    const rawAT = remuneracion + prorrataTrabajo + incapacidad.baseCotizacionAT;
    const opciones = { ...comun, pagasExtraAnuales: 0, prorrateadas: true, horas: horas === undefined ? undefined : horas / Math.max(.01, 1 - factor) };
    const cc = baseMensual({ ...opciones, remuneracion: r2(rawCC) });
    const at = baseMensual({ ...opciones, remuneracion: r2(rawAT) });
    if (cc.error || at.error) return cc.error ? cc : at;
    cot = { ...cc, baseAT: at.baseAT, cuotas: cuotas({ ...comun, base: cc.base, baseAT: at.baseAT, exceso: at.exceso, horasExtra, horasExtraFuerzaMayor, contratoCorto: contratoCortoEn(e, mes) }) };
  }
  if (!cot.error && atraso?.importe) {
    const atras = cotizacionAtrasos(e, atraso);
    if (atras.error) return atras;
    atraso.liquidaciones = atras.liquidaciones;
    for (const parte of ['trabajador', 'empresa']) for (const [k, v] of Object.entries(atras.cuotas[parte])) cot.cuotas[parte][k] = r2((cot.cuotas[parte][k] || 0) + v);
  }
  if (cot.error) return cot;
  // El administrador autónomo cotiza por su cuenta en el RETA: la nómina no lleva Seguridad Social.
  if (c.administrador === 'autonomo') for (const parte of ['empresa', 'trabajador']) cot.cuotas[parte] = Object.fromEntries(Object.keys(cot.cuotas[parte]).map((k) => [k, 0]));
  // Retribuciones y cuotas previstas solo durante los meses de alta del año de esta nómina.
  const normal = nominaCotizacion({ ...comun, dias: 30, entero: true, bruto: e.bruto });
  const anio = Number(mes.slice(0, 4)), anual = anualDe(e, anio);
  // Los administradores no usan el algoritmo: retención fija del 35 o el 19 % (art. 101.2 RIRPF).
  const r = e.datos145 && !c.administrador && !normal.error ? retencionTrabajo({ ...e.datos145, nif: e.nif, retribuciones: anual, cotizaciones: r2(normal.cuotas.trabajador.total * mesesDe(e, anio)) }) : null;
  const calculado = c.administrador ? retencionAdministrador(c) : r && !r.error ? r.tipo : null;
  const manual = irpfPct !== undefined && irpfPct !== null && irpfPct !== '' && Number.isFinite(Number(irpfPct));
  // Un tipo puesto a mano solo puede subir el que toca, no bajarlo: el trabajador puede pedir más retención (art. 88.5
  // RIRPF) y la del administrador es fija (art. 101.2). Por debajo, se queda el calculado (bajoMinimo).
  const pedido = manual ? Math.min(100, Math.max(0, Number(irpfPct))) : null;
  const bajoMinimo = pedido !== null && calculado !== null && pedido < calculado;
  const tipo = pedido === null ? calculado ?? (Number(e.irpfPct) || 0) : bajoMinimo ? calculado : pedido;
  const irpf = r2((bruto * tipo) / 100);
  const ssTrabajador = cot.cuotas.trabajador.total, ssEmpresa = cot.cuotas.empresa.total;
  const pct = (v) => (bruto ? Math.round((v / bruto) * 10000) / 100 : 0);
  return {
    importes: { bruto: r2(bruto), irpf, ssTrabajador, ssEmpresa },
    irpfPct: tipo, ssTrabajadorPct: pct(ssTrabajador), ssEmpresaPct: pct(ssEmpresa),
    detalle: {
      grupo: c.grupo, temporal: c.temporal, parcial: parcialDe(e), dias: comun.dias, base: cot.base, baseAT: cot.baseAT, exceso: cot.exceso,
      ...(c.administrador ? { administrador: c.administrador } : {}),
      ...(horas !== undefined ? { horas } : {}),
      pagas: c.pagas, prorrateadas: c.prorrateadas, atPct: c.atPct,
      prorrata: c.prorrateadas ? 0 : r2((pagasAnualesDe(e) / 12) * (incapacidad ? (comun.dias - incapacidad.diasCotizacion) / 30 : alta.entero ? 1 : Math.min(comun.dias, 30) / 30)), horasExtra: r2(horasExtra + horasExtraFuerzaMayor), numeroHorasExtra, numeroHorasExtraFuerzaMayor, horasExtraResto: r2(horasExtra), horasExtraFuerzaMayor: r2(horasExtraFuerzaMayor), pagaExtra: r2(pagaExtra),
      ...(incapacidad ? { it: incapacidad } : {}), ...(atraso ? { atrasos: atraso } : {}),
      avisos: [...(incapacidad?.avisos || []), ...(atraso?.avisos || [])],
      cuotas: cot.cuotas, irpf: { tipo, calculado, manual: manual && !bajoMinimo, ...(bajoMinimo ? { bajoMinimo: pedido } : {}), ...(r && !r.error ? { base: r.base, minimo: r.minimo.total, anual } : {}) },
    },
  };
}

// Parte del sueldo del mes que es prorrata de las pagas extra, cuando van prorrateadas en cada mes: con los datos
// guardados en la nómina (las anteriores a guardarlos, con los del empleado).
export function prorrateoDe(n, e) {
  const d = n.detalle;
  if (n.tipo === 'finiquito') return 0;
  const prorrateadas = d?.prorrateadas ?? e?.cotizacion?.prorrateadas, pagas = d?.pagas ?? e?.cotizacion?.pagas ?? 0;
  if (!d || !prorrateadas || !pagas) return 0;
  return r2((r2(calculoNomina(n).bruto - d.horasExtra - d.pagaExtra - (d.atrasos?.importe || 0) - (d.it?.prestacion || 0) - (d.it?.complemento || 0)) * pagas) / (12 + pagas));
}

// Conceptos retributivos del mes para RED (Tabla 84 de la TGSS, mensaje CRA): 0001 retribución no incluida en otros
// apartados (el sueldo y, si se paga ese mes, la paga extra), 0002 horas extraordinarias y 0004 prorrateo de las pagas
// extraordinarias (cuando van en el sueldo de cada mes).
export function conceptosRed(n, e) {
  const d = n.detalle;
  if (!d) return [];
  const prorrateo = prorrateoDe(n, e);
  if (n.tipo === 'finiquito' || d.it || d.atrasos) return []; // La gestoría revisa estos conceptos especiales para el CRA.
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
  concepto: `${n.tipo === 'finiquito' ? 'Finiquito' : 'Nómina'} ${n.empleadoNombre} · ${nombreMes(n.mes)}`.slice(0, 140),
  base: calculoNomina(n).coste,
  ivaPct: 0,
  nomina: n.id,
  ...(n.tipo === 'finiquito' ? { indemnizacion: n.finiquito.indemnizacion, cuentaIndemnizacion: '641' } : {}),
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
    if (n.importes?.indemnizacionExenta) g.importes.indemnizacionExenta = r2((g.importes.indemnizacionExenta || 0) + n.importes.indemnizacionExenta);
    if (n.detalle?.it?.pagoDelegado) {
      g.importes.pagoDelegado = r2((g.importes.pagoDelegado || 0) + n.detalle.it.pagoDelegado);
    }
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


export const mesValido = (v) => typeof v === 'string' && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(v);
export const fechaNominaValida = (v) => typeof v === 'string' && /^(19|20)\d{2}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export const importeNominaValido = (v, max = 1000000) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;

// LGSS, arts. 169–173; RD 625/2014. El día del alta médica se incluye en la IT.
export function calculoIT(e, { mes, baja, alta = '', tipo, baseAnterior, baseATAnterior, horasExtraMesAnterior = 0, horasExtraAnteriores, complementoPct = 0, salario = e.bruto } = {}) {
  if (typeof alta !== 'string') return { error: 'El alta médica debe ser una fecha o quedar vacía si sigue de baja' };
  if (!mesValido(mes) || !fechaNominaValida(baja) || (alta && (!fechaNominaValida(alta) || alta < baja))) return { error: 'Fechas de IT no válidas: el alta médica no puede ser anterior a la baja' };
  if ((e.alta && baja < e.alta) || (e.baja && baja > e.baja)) return { error: 'La IT debe comenzar durante el alta del empleado' };
  if (!['comun', 'profesional'].includes(tipo)) return { error: 'Elige el tipo de IT' };
  for (const v of [baseAnterior, baseATAnterior ?? baseAnterior, horasExtraMesAnterior, salario]) if (!importeNominaValido(v)) return { error: 'Las bases e importes de IT deben ser números entre 0 y 1.000.000 €' };
  if (!(baseAnterior > 0) || !importeNominaValido(complementoPct, 100) || (horasExtraAnteriores !== undefined && !importeNominaValido(horasExtraAnteriores))) return { error: 'Base anterior o complemento de IT no válido' };
  if (tipo === 'profesional' && (!importeNominaValido(baseATAnterior) || baseATAnterior < horasExtraMesAnterior)) return { error: 'Indica la base AT/EP anterior, sin importes de horas extra superiores a la base' };
  const desde = [baja, `${mes}-01`, e.alta || '1900-01-01'].sort().at(-1);
  const hasta = [alta || '2099-12-31', ultimoDia(mes), e.baja || '2099-12-31'].sort()[0];
  if (desde > hasta) return { error: 'La IT no afecta al mes de la nómina' };
  const anterior = new Date(`${baja.slice(0, 7)}-01T00:00:00Z`); anterior.setUTCMonth(anterior.getUTCMonth() - 1);
  const diasAnterior = new Date(Date.UTC(anterior.getUTCFullYear(), anterior.getUTCMonth() + 1, 0)).getUTCDate();
  const diaria = e.cotizacion?.grupo >= 8, divisor = diaria ? diasAnterior : 30;
  const reguladora = tipo === 'comun' ? baseAnterior / divisor : (baseATAnterior - horasExtraMesAnterior) / divisor + (horasExtraAnteriores || 0) / 365;
  const tramos = { sinPrestacion: 0, al60: 0, al75: 0, salarioAccidente: 0 };
  let empresa = 0, delegado = 0;
  for (let i = diasEntre(baja, desde); i <= diasEntre(baja, hasta); i++) {
    if (tipo === 'profesional') {
      if (i === 1) tramos.salarioAccidente++;
      else { tramos.al75++; delegado += reguladora * .75; }
    } else if (i <= 3) tramos.sinPrestacion++;
    else if (i <= 20) { tramos.al60++; if (i <= 15) empresa += reguladora * .6; else delegado += reguladora * .6; }
    else { tramos.al75++; delegado += reguladora * .75; }
  }
  const dias = diasEntre(desde, hasta), altaMes = diasDeAlta(e, mes);
  const cotizados = diaria ? altaMes.dias : altaMes.entero ? 30 : Math.min(30, altaMes.dias);
  // Orden de cotización: mes mensual completo de 30 días; el día del accidente lleva salario.
  const sinSalario = Math.max(0, dias - tramos.salarioAccidente);
  const diasCotizacion = sinSalario === altaMes.dias ? cotizados : Math.min(cotizados - tramos.salarioAccidente, sinSalario);
  const salarioTrabajado = r2(salario * (1 - diasCotizacion / cotizados));
  const prestacion = r2(empresa + delegado);
  const complemento = r2(Math.max(0, salario * diasCotizacion / cotizados * complementoPct / 100 - prestacion));
  const avisos = [];
  if (tipo === 'profesional' && horasExtraAnteriores === undefined) avisos.push('No hay horas extra del año anterior: la base reguladora AT/EP solo incluye la base del mes anterior sin horas extra. Revísala con la gestoría.');
  if ((Number(e.horasSemana) || 40) < 40) avisos.push('IT a tiempo parcial: cálculo orientativo con el mes anterior; la gestoría debe revisar la base reguladora específica del art. 248 LGSS.');
  return { baja, alta, tipo, baseAnterior, baseATAnterior: baseATAnterior ?? baseAnterior, horasExtraMesAnterior, ...(horasExtraAnteriores !== undefined ? { horasExtraAnteriores } : {}), complementoPct, dias, diasCotizacion, tramos, baseReguladora: reguladora, salarioTrabajado, prestacion, empresa: r2(empresa), pagoDelegado: r2(delegado), complemento, baseCotizacion: r2(baseAnterior / divisor * diasCotizacion), baseCotizacionAT: r2((baseATAnterior ?? baseAnterior) / divisor * diasCotizacion), avisos };
}

export function limpiarAtrasos(a, mes) {
  if (!a || (a.importe === 0 && (!a.meses || a.meses.length === 0))) return null;
  if (!importeNominaValido(a.importe) || !a.importe || !Array.isArray(a.meses) || !a.meses.length || a.meses.length > 120 || a.meses.some((m) => !mesValido(m) || m >= mes) || new Set(a.meses).size !== a.meses.length) return { error: 'Indica un importe de atrasos positivo y meses anteriores al de cobro, sin repetir' };
  const otroAnio = a.meses.some((m) => m.slice(0, 4) !== mes.slice(0, 4));
  return { importe: r2(a.importe), meses: [...a.meses].sort(), otroAnio, avisos: [
    'Los atrasos cotizan por sus meses de devengo mediante una liquidación complementaria L03 que prepara la gestoría; las cuotas son una provisión con los tipos de 2026.',
    ...(otroAnio ? ['Atrasos de otro año: en el IRPF se imputan al año de devengo (art. 14.2.b LIRPF), mediante declaración complementaria sin recargo dentro del plazo legal.'] : []),
  ] };
}

function cotizacionAtrasos(e, atraso) {
  const liquidaciones = [], total = { trabajador: {}, empresa: {} };
  let repartido = 0;
  for (let i = 0; i < atraso.meses.length; i++) {
    const mes = atraso.meses[i], importe = i === atraso.meses.length - 1 ? r2(atraso.importe - repartido) : r2(atraso.importe / atraso.meses.length);
    repartido = r2(repartido + importe);
    const alta = diasDeAlta(e, mes);
    if (!alta.dias) return { error: 'Hay atrasos de un mes en que el empleado no estaba de alta' };
    // Provisión sobre las bases ordinarias; la gestoría aplica los topes históricos en la L03.
    const previa = nominaCotizacion({ bruto: e.bruto, pagasExtraAnuales: pagasAnualesDe(e), prorrateadas: e.cotizacion.prorrateadas, grupo: e.cotizacion.grupo, temporal: e.cotizacion.temporal, atPct: e.cotizacion.atPct });
    const nueva = nominaCotizacion({ bruto: r2(e.bruto + importe), pagasExtraAnuales: pagasAnualesDe(e), prorrateadas: e.cotizacion.prorrateadas, grupo: e.cotizacion.grupo, temporal: e.cotizacion.temporal, atPct: e.cotizacion.atPct });
    if (previa.error || nueva.error) return previa.error ? previa : nueva;
    liquidaciones.push({ mes, importe, base: r2(nueva.base - previa.base), baseAT: r2(nueva.baseAT - previa.baseAT) });
    for (const parte of ['trabajador', 'empresa']) for (const [k, v] of Object.entries(nueva.cuotas[parte])) total[parte][k] = r2((total[parte][k] || 0) + r2(v - previa.cuotas[parte][k]));
  }
  return { liquidaciones, cuotas: total };
}

// CSV de apoyo a la gestoría; no es un fichero de transmisión de SILTRA.
export function basesNominasCsv(nominas, empleados, mes) {
  if (!mesValido(mes)) throw new Error('Mes no válido');
  const cabecera = ['NAF', 'NIF', 'Nombre', 'Grupo de cotización', 'Contrato', 'Coeficiente de parcialidad', 'Días cotizados', 'Base contingencias comunes', 'Base AT/EP', 'Horas extra fuerza mayor', 'Horas extra resto', 'Base horas extra', 'Días IT', 'Tipo IT', 'Cuota trabajador', 'Cuota empresa', 'Pago delegado IT', 'Cuotas incluyen provisión L03'];
  const numero = (v) => Number(v || 0).toFixed(2).replace('.', ',');
  const celda = (v) => {
    let s = String(v ?? '');
    if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`;
    return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const grupos = new Map();
  for (const n of nominas.filter((n) => n.mes === mes)) {
    if (!n.detalle?.cuotas || !Number.isFinite(n.detalle.base)) throw new Error('Hay nóminas simplificadas sin bases: completa sus datos de cotización antes de exportar');
    let g = grupos.get(n.empleado);
    if (!g) { g = { n, base: 0, baseAT: 0, dias: 0, fm: 0, resto: 0, baseHorasExtra: 0, it: 0, tipos: new Set(), trabajador: 0, empresa: 0, delegado: 0, atrasos: false }; grupos.set(n.empleado, g); }
    const d = n.detalle;
    g.base = r2(g.base + d.base); g.baseAT = r2(g.baseAT + d.baseAT);
    g.dias = Math.max(g.dias, d.dias || 0);
    g.fm += d.numeroHorasExtraFuerzaMayor || 0; g.resto += d.numeroHorasExtra ?? ((n.horas?.extra || 0) / 60); g.baseHorasExtra += d.horasExtra || 0;
    g.it += d.it?.dias || 0; if (d.it) g.tipos.add(d.it.tipo);
    g.trabajador += n.importes.ssTrabajador; g.empresa += n.importes.ssEmpresa; g.delegado += d.it?.pagoDelegado || 0;
    g.atrasos ||= Boolean(d.atrasos);
  }
  const filas = [cabecera, ...[...grupos.values()].map((g) => {
    const e = empleados.find((e) => e.id === g.n.empleado) || {}, d = g.n.detalle;
    return [g.n.naf || e.naf || '', g.n.empleadoNif || e.nif || '', g.n.empleadoNombre, d.grupo, d.temporal ? 'temporal' : 'indefinido', numero(d.parcial), g.dias, numero(g.base), numero(g.baseAT), numero(g.fm), numero(g.resto), numero(g.baseHorasExtra), g.it, [...g.tipos].join(', '), numero(g.trabajador), numero(g.empresa), numero(g.delegado), g.atrasos ? 'Sí' : 'No'];
  })];
  return '\uFEFF' + filas.map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';
}
