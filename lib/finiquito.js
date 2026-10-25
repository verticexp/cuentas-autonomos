import { r2 } from './calculos.js';
import { diasDeAlta, fechaNominaValida, importeNominaValido, nominaCompleta } from './nominas.js';
import { baseMensual, cuotas, solidaridad } from './cotizacion.js';

export const CAUSAS_FINIQUITO = {
  temporal: 'Fin de contrato temporal', objetivo: 'Despido objetivo', improcedente: 'Despido improcedente reconocido',
  disciplinario: 'Despido disciplinario procedente', voluntaria: 'Baja voluntaria', prueba: 'No superación del periodo de prueba',
};
const dias = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1);
const fecha = (anio, mes, dia) => new Date(Date.UTC(anio, mes - 1, dia)).toISOString().slice(0, 10);

// ET, arts. 49.1.c, 53.1.b y 56.1: fracciones de antigüedad redondeadas al mes superior.
export function mesesIndemnizacion(alta, baja) {
  const fin = new Date(Date.parse(baja) + 864e5), inicio = new Date(alta);
  return (fin.getUTCFullYear() - inicio.getUTCFullYear()) * 12 + fin.getUTCMonth() - inicio.getUTCMonth() + (fin.getUTCDate() > inicio.getUTCDate() ? 1 : 0);
}

export function calcularFiniquito(e, { baja, causa, vacacionesDisfrutadas = 0, devengoPagas = 'semestral', conciliacion = false } = {}, nominas = []) {
  if (!fechaNominaValida(e.alta) || !fechaNominaValida(baja) || baja < e.alta) return { error: 'La fecha de baja debe ser válida e igual o posterior al alta' };
  if (typeof conciliacion !== 'boolean') return { error: 'Indica si hay conciliación o resolución judicial' };
  if (!Object.hasOwn(CAUSAS_FINIQUITO, causa)) return { error: 'Causa de baja no válida' };
  if (!importeNominaValido(vacacionesDisfrutadas, 366)) return { error: 'Las vacaciones disfrutadas deben estar entre 0 y 366 días' };
  if (!['semestral', 'anual'].includes(devengoPagas)) return { error: 'El devengo de las pagas debe ser semestral o anual' };
  if (!e.cotizacion || e.cotizacion.administrador) return { error: 'Completa la cotización de un trabajador por cuenta ajena antes de calcular el finiquito' };
  if (causa === 'temporal' && (!e.cotizacion.temporal || e.cotizacion.sustitucion)) return { error: 'La indemnización de 12 días corresponde al fin de un contrato temporal que no sea de sustitución (art. 49.1.c ET)' };
  if (!importeNominaValido(e.bruto) || !e.bruto) return { error: 'Salario del empleado no válido' };
  if (!e.cotizacion.prorrateadas && e.cotizacion.pagas !== 2 && e.cotizacion.pagas !== 0) return { error: 'El finiquito admite dos pagas sin prorratear (junio y diciembre), o ninguna; revisa otro calendario con la gestoría' };
  const mes = baja.slice(0, 7), anio = Number(baja.slice(0, 4));
  const historico = nominas.filter((n) => n.empleado === e.id && n.tipo !== 'finiquito' && n.mes <= mes);
  const delMes = historico.filter((n) => n.mes === mes);
  const ultima = [...historico].sort((a, b) => b.mes.localeCompare(a.mes))[0];
  const empleado = { ...e, baja }, altaMes = diasDeAlta(empleado, mes);
  const diasSalario = e.cotizacion.grupo >= 8 ? altaMes.dias : altaMes.entero ? 30 : Math.min(30, altaMes.dias);
  const salario = delMes.length ? 0 : r2(e.bruto * (e.cotizacion.grupo >= 8 ? altaMes.dias / altaMes.total : diasSalario / 30));
  const anual = e.bruto * (12 + (e.cotizacion.prorrateadas ? 0 : e.cotizacion.pagas));
  const diario = anual / 365;
  const diasAnio = dias(`${anio}-01-01`, `${anio}-12-31`);
  const vacacionesDevengadas = 30 * dias(e.alta > `${anio}-01-01` ? e.alta : `${anio}-01-01`, baja) / diasAnio;
  const vacacionesPendientes = Math.max(0, vacacionesDevengadas - vacacionesDisfrutadas);
  const vacaciones = r2(vacacionesPendientes * diario);
  const avisos = [];
  let pagas = 0;
  if (!e.cotizacion.prorrateadas && e.cotizacion.pagas) {
    // ET, art. 31: se presupone cada paga igual al sueldo mensual, calendario junio/diciembre.
    for (const m of [6, 12]) {
      let pago = fecha(anio, m + 1, 0);
      if (devengoPagas === 'anual' && pago < baja) pago = fecha(anio + 1, m + 1, 0);
      // Semestral: la paga que venció antes del mes de la baja se da por cobrada (la de junio en una baja de julio a
      // diciembre), esté o no su nómina en Fisquo; si no se pagó, hay que añadirla a mano.
      if (devengoPagas === 'semestral' && pago.slice(0, 7) < mes) continue;
      const y = Number(pago.slice(0, 4));
      let inicio = devengoPagas === 'semestral' ? fecha(y, m === 6 ? 1 : 7, 1) : fecha(m === 6 ? y - 1 : y, m === 6 ? 7 : 1, 1);
      let finDevengo = pago, hasta = baja < pago ? baja : pago;
      if (devengoPagas === 'anual') {
        const ultimaPagada = historico.filter((n) => n.pagada !== false && Number(n.mes.slice(5)) === m && n.detalle?.pagaExtra > 0 && (n.pagado || fecha(Number(n.mes.slice(0, 4)), m + 1, 0)) <= baja).sort((a, b) => b.mes.localeCompare(a.mes))[0];
        if (ultimaPagada) {
          const ultimoPago = ultimaPagada.pagado || fecha(Number(ultimaPagada.mes.slice(0, 4)), m + 1, 0);
          inicio = new Date(Date.parse(ultimoPago) + 864e5).toISOString().slice(0, 10);
          finDevengo = fecha(Number(ultimoPago.slice(0, 4)) + 1, Number(ultimoPago.slice(5, 7)), Number(ultimoPago.slice(8)));
          hasta = baja;
        }
      }
      const desde = e.alta > inicio ? e.alta : inicio;
      const devengada = e.bruto * dias(desde, hasta) / dias(inicio, finDevengo);
      // Una paga ya recogida en otra nómina se cobra allí, aunque siga pendiente de pago.
      const recogida = historico.filter((n) => `${n.mes}-01` >= inicio && n.mes <= pago.slice(0, 7) && Number(n.mes.slice(5)) === m).reduce((s, n) => s + (n.detalle?.pagaExtra || 0), 0);
      pagas += Math.max(0, devengada - recogida);
    }
    pagas = r2(pagas);
    avisos.push('Pagas extra: cada paga equivale a un sueldo mensual, con vencimiento en junio y diciembre. Se descuentan las ya incluidas en nóminas guardadas, y en devengo semestral la que venció antes del mes de la baja se da por cobrada: si no se pagó, añádela. En devengo anual se usa la última fecha de pago guardada de cada extra; si falta, su último vencimiento de calendario.');
  }
  const meses = mesesIndemnizacion(e.alta, baja), porAnio = { temporal: 12, objetivo: 20, improcedente: 33 }[causa] || 0;
  const tope = causa === 'objetivo' ? anual : causa === 'improcedente' ? anual * 2 : Infinity;
  const indemnizacion = r2(Math.min(diario * porAnio * meses / 12, tope));
  // Art. 7.e LIRPF: límite fiscal de 180.000 €; el fin de temporal no está exento (DGT V1504-23).
  // Art. 147.2.c LGSS: toda la indemnización obligatoria queda fuera de cotización.
  const exencionAplicable = causa === 'objetivo' || (causa === 'improcedente' && conciliacion);
  const indemnizacionExenta = exencionAplicable ? r2(Math.min(indemnizacion, 180000)) : 0;
  const indemnizacionSujeta = r2(indemnizacion - indemnizacionExenta);
  if (causa === 'improcedente' && e.alta < '2012-02-12') avisos.push('Contrato anterior al 12-02-2012: se ha aplicado solo la regla de 33 días. La parte anterior a 2012 va a 45 días; revisa el régimen transitorio con la gestoría.');
  if (causa === 'improcedente' && !conciliacion) avisos.push('Sin conciliación o resolución judicial acreditada, la indemnización se ha tratado como sujeta a IRPF (art. 7.e LIRPF); el mero reconocimiento de la empresa no basta.');
  if (causa === 'temporal') avisos.push('La indemnización por fin de contrato temporal está sujeta al IRPF (criterio DGT V1504-23 y TEAC); no cotiza hasta el importe obligatorio.');
  const normal = nominaCompleta(empleado, { bruto: e.bruto, mes });
  if (normal.error) return normal;
  const tipo = ultima ? Number(ultima.irpfPct ?? ultima.detalle?.irpf?.tipo) : normal.irpfPct;
  if (!importeNominaValido(tipo, 100)) return { error: 'El tipo de retención de la última nómina no es válido' };
  const sujeto = r2(salario + pagas + vacaciones + indemnizacionSujeta);
  // Provisión del finiquito: suma a las bases del mes, aplica topes y resta cuotas ya guardadas.
  const prevBase = delMes.reduce((s, n) => s + (n.detalle?.base || 0), 0), prevAT = delMes.reduce((s, n) => s + (n.detalle?.baseAT || 0), 0);
  if (delMes.some((n) => !n.detalle)) return { error: 'La nómina del último mes es simplificada: completa sus bases antes de liquidar el finiquito' };
  const remuneracion = r2(salario + pagas + vacaciones);
  let base = 0, baseAT = 0, exceso = 0;
  if (remuneracion > 0) {
    const opciones = { grupo: e.cotizacion.grupo, dias: diasSalario, entero: altaMes.entero, parcial: Math.min(1, (Number(e.horasSemana) || 40) / 40), prorrateadas: true };
    const cc = baseMensual({ ...opciones, remuneracion: r2(prevBase + remuneracion) });
    const at = baseMensual({ ...opciones, remuneracion: r2(prevAT + remuneracion) });
    if (cc.error || at.error) return cc.error ? cc : at;
    base = r2(Math.max(0, cc.base - prevBase)); baseAT = r2(Math.max(0, at.baseAT - prevAT)); exceso = at.exceso;
  }
  const cot = cuotas({ base, baseAT, exceso, temporal: Boolean(e.cotizacion.temporal), atPct: e.cotizacion.atPct, contratoCorto: !delMes.length && Boolean(normal.detalle.cuotas.empresa.contratoCorto) });
  if (cot.error) return cot;
  const excesoPrevio = delMes.reduce((s, n) => s + (n.detalle?.exceso || 0), 0);
  if (excesoPrevio && exceso) {
    const anterior = solidaridad(excesoPrevio), total = solidaridad(r2(excesoPrevio + exceso));
    for (const parte of ['trabajador', 'empresa']) {
      const incremento = r2(total[parte] - anterior[parte]);
      cot[parte].total = r2(cot[parte].total - cot[parte].solidaridad + incremento);
      cot[parte].solidaridad = incremento;
    }
  }
  avisos.push(`Vacaciones no disfrutadas: ${r2(vacacionesPendientes)} días (${Math.ceil(vacacionesPendientes)} días de alta asimilada a comunicar). La gestoría comunica la baja y las vacaciones en SILTRA y realiza su liquidación complementaria (arts. 147 y 166 LGSS; antiguo art. 125). Las cuotas de este recibo son una provisión con los topes del mes de baja.`);
  if (delMes.length) avisos.push('El salario del último mes ya figura en una nómina guardada y no se vuelve a incluir. Revisa que sus días e importes correspondan a la fecha de baja.');
  const lineas = [ ['Salario del último mes', salario], ['Pagas extra devengadas pendientes', pagas], ['Vacaciones no disfrutadas', vacaciones], ['Indemnización sujeta a IRPF', indemnizacionSujeta], ['Indemnización exenta', indemnizacionExenta] ].map(([concepto, importe]) => ({ concepto, importe }));
  return {
    tipo: 'finiquito', fiscal190: { clave: 'A', percepcion: sujeto, exenta: indemnizacionExenta, claveExenta: 'L', subclaveExenta: '05' }, mes, empleado: e.id, empleadoNombre: e.nombre, empleadoNif: e.nif, naf: e.naf, alta: e.alta, puesto: e.puesto, bruto: sujeto, completa: true, pagada: false, irpfPct: tipo,
    importes: { bruto: sujeto, indemnizacionExenta, irpf: r2(sujeto * tipo / 100), ssTrabajador: cot.trabajador.total, ssEmpresa: cot.empresa.total },
    ssTrabajadorPct: sujeto ? r2(cot.trabajador.total / sujeto * 100) : 0, ssEmpresaPct: sujeto ? r2(cot.empresa.total / sujeto * 100) : 0,
    finiquito: { baja, causa, vacacionesDisfrutadas, devengoPagas, conciliacion, salarioAnual: anual, salarioDiario: diario, mesesAntiguedad: meses, vacacionesDevengadas: r2(vacacionesDevengadas), vacacionesPendientes: r2(vacacionesPendientes), diasAltaVacaciones: Math.ceil(vacacionesPendientes), indemnizacion, indemnizacionExenta, indemnizacionSujeta, lineas, avisos },
    detalle: { ...normal.detalle, dias: delMes.length ? 0 : diasSalario, base, baseAT, exceso, prorrata: 0, pagaExtra: pagas, horasExtra: 0, cuotas: cot, irpf: { tipo, calculado: null, manual: false }, avisos },
  };
}
