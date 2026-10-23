// Libros registro del IVA y del IRPF con el formato electrónico común de la AEAT (Orden HAC/773/2019 y la plantilla
// «libros unificados» de la sede): facturas expedidas y ventas e ingresos, facturas recibidas y compras y gastos, y bienes
// de inversión. Es lo que tiene que llevar un autónomo en estimación directa (y lo que pide Hacienda en un requerimiento).
// Cada libro va en su .xlsx, con el nombre «ejercicio + NIF + tipo de libro + nombre» y la hoja con el nombre oficial.
import { bienInversionIva, desglose, gastoEnCaja, importes, ivaGasto, nifUE, numeroFactura, operacionesCaja, origenGasto, pagosDe, r2, trimestre } from './calculos.js';
import { reccDe } from './empresa.js';
import { conIva, partirIva, tipoAutoliquidado } from './ivaDeducible.js';
import { TIPOS_OPERACION, operacionDe } from './operaciones.js';
import { tipoFactura } from './verifactu.js';
import { categoriaDe } from './categorias.js';
import { calculoNomina } from './nominas.js';
import { RET_ALQUILER } from './modelos.js';
import { bienes, coeficiente, cuotaEntre, acumulada, valorBien, LIMITE_LIBERTAD } from './amortizaciones.js';
import { xlsx } from './xlsx.js';
import { valorInventario } from './inventario.js';

// Importes con coma decimal y sin miles; fechas dd/mm/aaaa (lo que pide la AEAT, como texto).
const d2 = (n) => (n === '' || n === null || n === undefined ? '' : r2(n).toFixed(2).replace('.', ','));
const fecha = (f) => (f ? f.split('-').reverse().join('/') : '');
const periodo = (f) => `${trimestre(f)}T`;
const COL = (s) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
// Una fila con valores en sus columnas: { A: 2026, K: 'F1', ... }.
const fila = (n, v) => { const f = Array(n).fill(''); for (const [c, x] of Object.entries(v)) f[COL(c)] = x; return f; };

// Cabeceras de la plantilla oficial: grupo, subcampo y tipo de dato (las tres primeras filas de cada hoja).
const CAB = {
  ingresos: { n: 36, filas: [
    { A: 'Autoliquidación', C: 'Actividad', F: 'Tipo de Factura', G: 'Concepto de Ingreso', H: 'Ingreso Computable', I: 'Fecha Expedición', J: 'Fecha Operación', K: 'Identificación de la Factura', N: 'NIF Destinatario', Q: 'Nombre Destinatario', R: 'Clave de Operación', S: 'Calificación de la Operación', T: 'Operación Exenta', U: 'Total Factura', V: 'Base Imponible', W: 'Tipo de IVA', X: 'Cuota IVA Repercutida', Y: 'Tipo de Recargo Eq.', Z: 'Cuota Recargo Eq.', AA: 'Cobro (Operación Criterio de Caja de IVA y/o artículo 7.2.1º de Reglamento del IRPF)', AE: 'Tipo Retención del IRPF', AF: 'Importe Retenido del IRPF', AG: 'Registro Acuerdo Facturación', AH: 'Inmueble', AJ: 'Referencia Externa' },
    { A: 'Ejercicio', B: 'Periodo', C: 'Código', D: 'Tipo', E: 'Grupo o Epígrafe del IAE', K: 'Serie', L: 'Número', M: 'Número-Final', N: 'Tipo', O: 'Código País', P: 'Identificación', AA: 'Fecha', AB: 'Importe', AC: 'Medio Utilizado', AD: 'Identificación Medio Utilizado', AH: 'Situación', AI: 'Referencia Catastral' },
    { A: 'Decimal (4,0)', B: 'Alfanumérico (2)', C: 'Alfanumérico (1)', D: 'Alfanumérico (2)', E: 'Alfanumérico (4)', F: 'Alfanumérico (2)', G: 'Alfanumérico (3)', H: 'Decimal(12,2)', I: 'Fecha(dd/mm/yyyy)', J: 'Fecha(dd/mm/yyyy)', K: 'Alfanumérico (20)', L: 'Alfanumérico (20)', M: 'Alfanumérico (20)', N: 'Alfanumérico (2)', O: 'Alfanumérico (2)', P: 'Alfanumérico (20)', Q: 'Alfanumérico (40)', R: 'Alfanumérico (2)', S: 'Alfanumérico (2)', T: 'Alfanumérico (2)', U: 'Decimal(12,2)', V: 'Decimal(12,2)', W: 'Decimal(4,2)', X: 'Decimal(12,2)', Y: 'Decimal(4,2)', Z: 'Decimal(12,2)', AA: 'Fecha(dd/mm/yyyy)', AB: 'Decimal(12,2)', AC: 'Alfanumérico (2)', AD: 'Alfanumérico (34)', AE: 'Decimal(4,2)', AF: 'Decimal(12,2)', AG: 'Alfanumérico (15)', AH: 'Alfanumérico (1)', AI: 'Alfanumérico (20)', AJ: 'Alfanumérico (40)' },
  ] },
  gastos: { n: 42, filas: [
    { A: 'Autoliquidación', C: 'Actividad', F: 'Tipo de Factura', G: 'Concepto de Gasto', H: 'Gasto Deducible', I: 'Fecha Expedición', J: 'Fecha Operación', K: 'Identificación Factura del Expedidor', M: 'Fecha Recepción', N: 'Número Recepción', O: 'Número Recepción Final', P: 'NIF Expedidor', S: 'Nombre Expedidor', T: 'Clave de Operación', U: 'Bien de Inversión', V: 'Inversión del Sujeto Pasivo', W: 'Deducible en Periodo Posterior', X: 'Periodo Deducción', Z: 'Total Factura', AA: 'Base Imponible', AB: 'Tipo de IVA', AC: 'Cuota IVA Soportado', AD: 'Cuota Deducible', AE: 'Tipo de Recargo Eq.', AF: 'Cuota Recargo Eq.', AG: 'Pago (Operación Criterio de Caja de IVA y/o artículo 7.2.1º de Reglamento del IRPF)', AK: 'Tipo Retención del IRPF', AL: 'Importe Retenido del IRPF', AM: 'Registro Acuerdo Facturación', AN: 'Inmueble', AP: 'Referencia Externa' },
    { A: 'Ejercicio', B: 'Periodo', C: 'Código', D: 'Tipo', E: 'Grupo o Epígrafe del IAE', K: '(Serie-Número)', L: 'Número-Final', P: 'Tipo', Q: 'Código País', R: 'Identificación', X: 'Ejercicio', Y: 'Periodo', AG: 'Fecha', AH: 'Importe', AI: 'Medio Utilizado', AJ: 'Identificación Medio Utilizado', AN: 'Situación', AO: 'Referencia Catastral' },
    { A: 'Decimal (4,0)', B: 'Alfanumérico (2)', C: 'Alfanumérico (1)', D: 'Alfanumérico (2)', E: 'Alfanumérico (4)', F: 'Alfanumérico (2)', G: 'Alfanumérico (3)', H: 'Decimal(12,2)', I: 'Fecha(dd/mm/yyyy)', J: 'Fecha(dd/mm/yyyy)', K: 'Alfanumérico (40)', L: 'Alfanumérico (20)', M: 'Fecha(dd/mm/yyyy)', N: 'Alfanumérico (20)', O: 'Alfanumérico (20)', P: 'Alfanumérico (2)', Q: 'Alfanumérico (2)', R: 'Alfanumérico (20)', S: 'Alfanumérico (40)', T: 'Alfanumérico (2)', U: 'Alfanumérico (1)', V: 'Alfanumérico (1)', W: 'Alfanumérico (1)', X: 'Decimal (4,0)', Y: 'Alfanumérico (2)', Z: 'Decimal(12,2)', AA: 'Decimal(12,2)', AB: 'Decimal(4,2)', AC: 'Decimal(12,2)', AD: 'Decimal(12,2)', AE: 'Decimal(4,2)', AF: 'Decimal(12,2)', AG: 'Fecha(dd/mm/yyyy)', AH: 'Decimal(12,2)', AI: 'Alfanumérico (2)', AJ: 'Alfanumérico (34)', AK: 'Decimal(4,2)', AL: 'Decimal(12,2)', AM: 'Alfanumérico (15)', AN: 'Alfanumérico (1)', AO: 'Alfanumérico (20)', AP: 'Alfanumérico (40)' },
  ] },
  bienes: { n: 42, filas: [
    { A: 'Autoliquidación', C: 'Actividad', F: 'Tipo de Bien', G: 'Descripción del Bien', I: 'Fecha Inicio Utilización', J: 'Valor Adquisición', K: 'Valor Amortizable', L: 'Método de Amortización', M: 'Porcentaje de Amortización', N: 'Amortización', R: 'Fecha Expedición', S: 'Identificación Factura del Expedidor', U: 'Número Recepción', V: 'Número Recepción Final', W: 'NIF Expedidor', Z: 'Nombre Expedidor', AA: 'Año de Inicio Utilización', AE: 'Regularización Anual', AH: 'Baja del Bien', AJ: 'Identificación de la Factura de Transmisión del Bien', AM: 'Registro Acuerdo Facturación', AN: 'Inmueble', AP: 'Referencia Externa' },
    { A: 'Ejercicio', B: 'Periodo', C: 'Código', D: 'Tipo', E: 'Grupo o Epígrafe del IAE', G: 'Identificador', H: 'Literal', N: 'Acumulada al Inicio', O: 'Cuota Resultante', P: 'Acumulada al final', Q: 'Pendiente', S: '(Serie-Número)', T: 'Número-Final', W: 'Tipo', X: 'Código País', Y: 'Identificación', AA: 'Base Imponible', AB: 'Tipo de IVA', AC: 'Prorrata Definitiva', AD: 'Cuota Deducible', AE: 'Prorrata Definitiva', AF: 'Cuota Deducible', AG: 'Cuota a Regularizar', AH: 'Fecha', AI: 'Causa', AJ: 'Serie', AK: 'Número', AL: 'Número-Final', AN: 'Situación', AO: 'Referencia Catastral' },
    { A: 'Decimal (4,0)', B: 'Alfanumérico (2)', C: 'Alfanumérico (1)', D: 'Alfanumérico (2)', E: 'Alfanumérico (4)', F: 'Alfanumérico (2)', G: 'Alfanumérico (40)', H: 'Alfanumérico (160)', I: 'Fecha(dd/mm/yyyy)', J: 'Decimal(12,2)', K: 'Decimal(12,2)', L: 'Alfanumérico (2)', M: 'Decimal (4,2)', N: 'Decimal(12,2)', O: 'Decimal(12,2)', P: 'Decimal(12,2)', Q: 'Decimal(12,2)', R: 'Fecha(dd/mm/yyyy)', S: 'Alfanumérico (40)', T: 'Alfanumérico (20)', U: 'Alfanumérico (20)', V: 'Alfanumérico (20)', W: 'Alfanumérico (2)', X: 'Alfanumérico (2)', Y: 'Alfanumérico (20)', Z: 'Alfanumérico (40)', AA: 'Decimal(12,2)', AB: 'Decimal(4,2)', AC: 'Decimal(5,2)', AD: 'Decimal(12,2)', AE: 'Decimal(5,2)', AF: 'Decimal(12,2)', AG: 'Decimal(12,2)', AH: 'Fecha(dd/mm/yyyy)', AI: 'Alfanumérico (2)', AJ: 'Alfanumérico (20)', AK: 'Alfanumérico (20)', AL: 'Alfanumérico (20)', AM: 'Alfanumérico (15)', AN: 'Alfanumérico (1)', AO: 'Alfanumérico (20)', AP: 'Alfanumérico (40)' },
  ] },
};

// NIF de la contraparte: español en «Identificación»; de otro país de la UE, tipo 02 con su código de país.
function nifDe(nif) {
  const n = String(nif || '').toUpperCase().replace(/[\s.\-/]/g, '');
  if (!n) return {};
  const ue = nifUE(n);
  return ue ? { tipo: '02', pais: ue.slice(0, 2), id: ue.slice(2) } : { id: n.slice(0, 20) };
}

// Concepto de gasto del IRPF a partir de la categoría del plan contable (y del concepto, para los suministros).
function conceptoGasto(g, autonomo) {
  const c = categoriaDe(g);
  const t = String(g.concepto || '').toLowerCase();
  if (c === '628') return /luz|electric/.test(t) ? 'G14' : /agua/.test(t) ? 'G15' : /\bgas\b/.test(t) ? 'G16' : /tel[eé]fon|internet|fibra|m[oó]vil/.test(t) ? 'G17' : 'G18';
  return { 600: 'G01', 607: 'G03', 621: 'G12', 622: 'G13', 623: 'G19', 624: 'G22', 625: 'G20', 626: 'G22', 627: 'G22', 629: 'G22', 631: 'G26', 640: 'G04', 642: autonomo ? 'G45' : 'G05', 662: 'G23' }[c] || 'G22';
}
// Dotación de amortización (concepto de gasto) y tipo de bien de cada tipo de Fisquo (lib/amortizaciones.js).
const AMORT = { edificios: ['G27', '12'], instalaciones: ['G28', '25'], mobiliario: ['G28', '24'], maquinaria: ['G29', '21'], electronicos: ['G29', '21'], informatica: ['G31', '23'], software: ['G38', '33'], transporte: ['G30', '22'], utiles: ['G32', '28'], otros: ['G28', '29'] };

// datos: { facturas, gastos, nominas, fiscal, actividades, empresa: { nombre, nif } }. hoy: hasta dónde se cuenta.
export function librosRegistro({ facturas = [], gastos = [], nominas = [], fiscal = {}, actividades = [], empresa = {}, productos = [], ajustes = [], albaranes = [] }, anio, hoy) {
  const autonomo = fiscal.tipo !== 'sociedad';
  const c303 = fiscal.iva === 'general';
  const delAnio = (x) => x.fecha.startsWith(`${anio}-`) && x.fecha <= hoy;
  // Actividad (solo autónomos): A + 05 profesional (con retención) o 03 empresarial; el epígrafe del IAE, si se ha puesto.
  const act = (id) => {
    if (!autonomo) return {};
    const a = actividades.find((x) => x.id === id) || actividades[0] || {};
    return { C: 'A', D: Number(a.irpfPct) > 0 ? '05' : '03', E: String(a.iae || '').slice(0, 4) };
  };

  // Criterio de caja (lib/calculos.js): clave 07 y, en la primera línea, el cobro o el pago (art. 61 decies del Reglamento
  // del IVA): la fecha del último, lo cobrado o pagado hasta hoy y el medio (01 transferencia, 05 domiciliación, 04 otros;
  // 03 si no se ha cobrado ni pagado y el IVA se devengó el 31 de diciembre del año siguiente).
  const recc = reccDe(fiscal);
  const deCaja = new Set(operacionesCaja(facturas, recc).flatMap((g) => g.map((f) => f.id)));
  const limiteCaja = (fecha) => `${Number(fecha.slice(0, 4)) + 1}-12-31`;
  const medio = (p) => (p.banco || p.metodo === 'transferencia' ? '01' : p.metodo === 'domiciliacion' || p.metodo === 'remesa' ? '05' : '04');
  const cobroDe = (f) => {
    const ps = pagosDe(f).filter((p) => String(p.fecha || f.fecha).slice(0, 10) <= hoy);
    if (ps.length) { const u = ps.at(-1); return { AA: fecha(String(u.fecha || f.fecha).slice(0, 10)), AB: d2(ps.reduce((t, p) => t + p.importe, 0)), AC: medio(u) }; }
    return limiteCaja(f.fecha) <= hoy ? { AA: fecha(limiteCaja(f.fecha)), AB: d2(importes(f).total), AC: '03' } : {};
  };
  const pagoDe = (g) => (!g.pendiente ? { AG: fecha(g.pagado || g.fecha), AH: d2(importes(g).total), AI: g.banco ? '01' : '04' }
    : limiteCaja(g.fecha) <= hoy ? { AG: fecha(limiteCaja(g.fecha)), AH: d2(importes(g).total), AI: '03' } : {});

  // ---- Facturas expedidas e ingresos: una línea por tipo de IVA; la retención, solo en la primera.
  const ingresos = [];
  const T = { ingresos: 0, ivaRepercutido: 0, retenciones: 0, gastos: 0, ivaSoportado: 0, amortizacion: 0 };
  const sumar = (k, v) => { T[k] = r2(T[k] + (Number(v) || 0)); };
  for (const f of facturas.filter(delAnio).sort((a, b) => a.fecha.localeCompare(b.fecha) || numeroFactura(a).localeCompare(numeroFactura(b)))) {
    const n = nifDe(f.cliente?.nif);
    const ue = n.tipo === '02';
    const i = importes(f);
    sumar('retenciones', i.irpf);
    // Ventanilla única (lib/oss.js): clave 17, no sujeta en España (N2); el IVA del otro país no es cuota española.
    const oss = Boolean(f.oss?.pais), caja = deCaja.has(f.id);
    // Régimen de margen (lib/calculos.js): clave 03 (bienes usados) o 05 (agencias de viajes), una línea por tipo con la
    // base del margen; el ingreso computable y el total de la factura, enteros en la primera.
    const margen = f.margen === 'rebu' ? '03' : f.margen === 'reav' ? '05' : null;
    const lineasF = margen ? desglose(f).filter((d) => !d.fueraBase) : desglose(f);
    if (margen && !lineasF.length) lineasF.push({ pct: 0, base: 0, iva: 0 });
    if (margen) sumar('ingresos', i.base);
    lineasF.forEach((d, k) => {
      if (!margen) sumar('ingresos', d.base);
      if (!oss) sumar('ivaRepercutido', d.iva);
      // Al 0 %, la calificación o la causa de exención de su operación (lib/operaciones.js, auditoría F10). Las rectificativas,
      // con la clave de su motivo como en Verifactu (R1-R4); la exportación, con la clave de régimen 02.
      const op = TIPOS_OPERACION[operacionDe(f)];
      const calif = oss ? { S: 'N2' } : d.pct > 0 ? { S: 'S1' } : op?.calificacion ? { S: op.calificacion } : { T: op?.exenta || 'E6' };
      ingresos.push(fila(CAB.ingresos.n, {
        A: anio, B: periodo(f.fecha), ...act(f.actividad), F: f.rectifica || f.serie === 'R' ? tipoFactura(f) : f.resumen?.hasta ? 'F4' : n.id ? 'F1' : 'F2',
        ...(autonomo ? { G: 'I01', H: d2(margen ? (k === 0 ? i.base : 0) : d.base) } : {}), I: fecha(f.fecha), K: f.serie || '', L: (f.resumen?.desde || numeroFactura(f)).slice(0, 20), ...(f.resumen?.hasta ? { M: f.resumen.hasta.slice(0, 20) } : {}),
        N: n.tipo || '', O: n.pais || '', P: n.id || '', Q: String((!f.simplificada && f.cliente?.nombre) || (n.id ? '' : 'VENTAS A CONSUMIDOR FINAL')).slice(0, 40),
        R: oss ? '17' : margen || (operacionDe(f) === 'exportacion' ? '02' : caja ? '07' : '01'), ...calif, U: d2(margen ? (k === 0 ? i.total + i.irpf : 0) : d.base + d.iva + (d.recargo || 0)), V: d2(d.base), ...(oss ? {} : { W: d2(d.pct), X: d2(d.iva) }), ...(d.re ? { Y: d2(d.re), Z: d2(d.recargo) } : {}),
        ...(caja && k === 0 ? cobroDe(f) : {}),
        ...(autonomo && k === 0 && i.irpf ? { AE: d2(f.irpfPct), AF: d2(i.irpf) } : {}), AJ: String(f.id).slice(0, 40),
      }));
    });
  }

  // ---- Facturas recibidas y gastos (con número de recepción correlativo; los asientos sin factura, en su propia serie).
  const gastosL = [];
  const recepcion = {};
  let nF = 0, nSF = 0;
  const lineaGasto = (x) => gastosL.push(fila(CAB.gastos.n, x));
  const G = gastos.filter((g) => delAnio(g) && !g.nomina && !g.migrado).sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const g of G) {
    const i = importes(g);
    const n = nifDe(g.proveedorNif);
    const origen = origenGasto(g);
    const bien = g.inversion && g.base > 0;
    const sinFactura = !n.id && !g.proveedor && !conIva(g);
    const num = sinFactura ? ++nSF : ++nF;
    if (bien) recepcion[g.id] = num;
    // Con 303, la cuota deducible (AD) es la parte deducible del gasto y el resto es gasto (lib/ivaDeducible.js).
    const v = ivaGasto(g);
    const ret = g.alquiler ? r2((g.base * RET_ALQUILER) / 100) : i.irpf;
    // Una línea por tipo de IVA (como las expedidas), con el mismo número de recepción; el pago y la retención, en la
    // primera. La cuota deducible se reparte por tipos y la última se lleva el céntimo que falte, para que sumen lo mismo
    // que el 303 (que la redondea una vez por gasto).
    const lineas = origen ? [{ pct: tipoAutoliquidado(g), base: g.base, iva: r2(g.base * (tipoAutoliquidado(g) / 100)) }] : desglose(g);
    let dedAntes = 0;
    lineas.forEach((d, k) => {
      const ultima = k === lineas.length - 1;
      const cuotaDed = c303 ? (ultima ? r2(v.deducible - dedAntes) : partirIva(g, d.iva).deducible) : 0;
      dedAntes = r2(dedAntes + cuotaDed);
      const deducible = bien ? 0 : c303 ? r2(d.base + d.iva - cuotaDed) : r2(d.base + d.iva);
      sumar('gastos', deducible); sumar('ivaSoportado', cuotaDed);
      lineaGasto({
        A: anio, B: periodo(g.fecha), ...act(g.actividad), F: sinFactura ? 'SF' : n.id ? 'F1' : 'F2',
        ...(autonomo ? { G: bien ? '' : conceptoGasto(g, autonomo), H: d2(deducible) } : {}),
        I: fecha(g.fecha), K: String(g.numero || g.concepto || '').slice(0, 40), N: String(num),
        P: n.tipo || '', Q: n.pais || '', R: n.id || '', S: String(g.proveedor || g.concepto || '').slice(0, 40),
        T: origen ? '09' : g.alquiler ? '12' : c303 && gastoEnCaja(g, recc) ? '07' : '01', U: bienInversionIva(g) ? 'S' : 'N', V: origen ? 'S' : 'N',
        Z: d2(origen ? d.base : d.base + d.iva), AA: d2(d.base), AB: d2(d.pct), AC: d2(d.iva), AD: d2(cuotaDed),
        ...(k === 0 && c303 && gastoEnCaja(g, recc) ? pagoDe(g) : {}),
        ...(k === 0 && autonomo && ret ? { AK: d2(g.alquiler ? RET_ALQUILER : g.irpfPct), AL: d2(ret) } : {}), AP: String(g.id).slice(0, 40),
      });
    });
  }
  // Nóminas: sueldo (G04) y Seguridad Social de la empresa (G05), sin factura.
  for (const nm of nominas.filter((x) => x.mes?.startsWith(`${anio}-`)).sort((a, b) => a.mes.localeCompare(b.mes))) {
    const c = calculoNomina(nm);
    const f = new Date(Date.UTC(Number(nm.mes.slice(0, 4)), Number(nm.mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
    if (f > hoy) continue;
    for (const [concepto, importe, texto] of [['G04', c.bruto, 'Nómina'], ['G05', c.ssEmpresa, 'Seguridad Social de la nómina']]) {
      if (!importe) continue;
      sumar('gastos', importe);
      lineaGasto({ A: anio, B: periodo(f), ...act(), F: 'SF', ...(autonomo ? { G: concepto, H: d2(importe) } : {}), I: fecha(f), K: `${texto} ${nm.mes}`.slice(0, 40), N: String(++nSF),
        S: String(nm.empleadoNombre || 'Empleado').slice(0, 40), T: '01', U: 'N', V: 'N', Z: d2(importe), AA: d2(importe), AB: d2(0), AC: d2(0), AD: d2(0), ...(autonomo && concepto === 'G04' && c.irpf ? { AK: d2(nm.irpfPct), AL: d2(c.irpf) } : {}) });
    }
  }
  // Amortizaciones del año, por tipo de bien, como gasto sin factura a 31 de diciembre (o a hoy si el año sigue abierto).
  const op = { regimen: autonomo ? 'autonomo' : 'sociedad', ivaCoste: !c303 };
  const finAnio = `${anio}-12-31` < hoy ? `${anio}-12-31` : hoy;
  const B = bienes(gastos).filter((g) => g.fecha <= finAnio);
  if (autonomo) {
    const porConcepto = {};
    for (const g of B) { const k = AMORT[g.inversion.tipo]?.[0] || 'G28'; porConcepto[k] = r2((porConcepto[k] || 0) + cuotaEntre(g, `${anio}-01-01`, finAnio, op)); }
    for (const v of Object.values(porConcepto)) { sumar('gastos', v); sumar('amortizacion', v); }
    for (const [k, v] of Object.entries(porConcepto)) if (v > 0) lineaGasto({ A: anio, B: periodo(finAnio), ...act(), F: 'SF', G: k, H: d2(v), I: fecha(finAnio), K: 'Amortización del ejercicio', N: String(++nSF), S: 'Amortización', T: '01', U: 'N', V: 'N', Z: d2(v), AA: d2(v), AB: d2(0), AC: d2(0), AD: d2(0) });
  }

  // Variación de existencias del año cerrado (inventario): si baja, gasto G02; si sube, ingreso I06. Sin factura.
  if (autonomo && `${anio}-12-31` < hoy && productos.some((p) => !p.servicio)) {
    const datosInv = { productos, facturas, gastos, ajustes, albaranes };
    const dif = r2(valorInventario(datosInv, `${anio}-12-31`) - valorInventario(datosInv, `${anio - 1}-12-31`));
    const f = `${anio}-12-31`;
    if (dif < 0) { sumar('gastos', -dif); lineaGasto({ A: anio, B: '4T', ...act(), F: 'SF', G: 'G02', H: d2(-dif), I: fecha(f), K: 'Variación de existencias', N: String(++nSF), S: 'Existencias', T: '01', U: 'N', V: 'N', Z: d2(-dif), AA: d2(-dif), AB: d2(0), AC: d2(0), AD: d2(0) }); }
    if (dif > 0) { sumar('ingresos', dif); ingresos.push(fila(CAB.ingresos.n, { A: anio, B: '4T', ...act(), F: 'SF', G: 'I06', H: d2(dif), I: fecha(f), Q: 'Existencias', U: d2(dif), V: d2(dif), W: d2(0), X: d2(0) })); }
  }

  // ---- Bienes de inversión: cada bien con lo amortizado al inicio, en el año, al final y lo pendiente.
  const bienesL = B.map((g) => {
    const valor = valorBien(g, op);
    const libertad = valor <= LIMITE_LIBERTAD && g.inversion.acumulada === undefined;
    const ini = acumulada(g, `${anio - 1}-12-31`, op), fin = acumulada(g, finAnio, op);
    const n = nifDe(g.proveedorNif);
    return fila(CAB.bienes.n, {
      A: anio, B: '4T', ...act(g.actividad), F: AMORT[g.inversion.tipo]?.[1] || '29', G: String(g.id).slice(0, 40), H: String(g.concepto || '').slice(0, 160),
      I: fecha(g.fecha), J: d2(valor), K: d2(valor),
      L: libertad ? '06' : '01', M: d2(libertad ? 100 : coeficiente(g, op.regimen)), N: d2(ini), O: d2(r2(fin - ini)), P: d2(fin), Q: d2(r2(valor - fin)),
      ...(g.migrado ? {} : { R: fecha(g.fecha), S: String(g.numero || g.concepto || '').slice(0, 40), U: recepcion[g.id] ? String(recepcion[g.id]) : '', W: n.tipo || '', X: n.pais || '', Y: n.id || '', Z: String(g.proveedor || '').slice(0, 40),
        AA: d2(g.base), AB: d2(g.ivaPct), AD: d2(c303 ? ivaGasto(g).deducible : 0) }),
    });
  });

  const nombre = String(empresa.nombre || '').replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
  const nif = String(empresa.nif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Formato de la AEAT (Formatos de los Libros Registro de IVA e IRPF, 2025-2026, apartados 2 y 4): un solo .xlsx con un
  // libro por hoja, para que lo importen Renta WEB, el Pre303 y el modelo 130. T: libros unificados del IVA y del IRPF
  // (autónomos); C: solo los del IVA (sociedades). Los bienes de inversión, en su hoja si los hay.
  const [tipo, H] = autonomo ? ['T', ['EXPEDIDAS_INGRESOS', 'RECIBIDAS_GASTOS']] : ['C', ['EXPEDIDAS', 'RECIBIDAS']];
  return {
    fichero: `${anio}${nif}${tipo}${nombre}.xlsx`,
    resumen: { ingresos: ingresos.length, gastos: gastosL.length, bienes: bienesL.length }, totales: T,
    sinIae: autonomo && actividades.some((a) => !a.iae),
    hojas: [
      { hoja: H[0], cab: CAB.ingresos, filas: ingresos },
      { hoja: H[1], cab: CAB.gastos, filas: gastosL },
      ...(bienesL.length ? [{ hoja: 'BIENES-INVERSIÓN', cab: CAB.bienes, filas: bienesL }] : []),
    ],
  };
}

// El .xlsx de los libros: una hoja por libro, como la plantilla de la AEAT (tres filas de cabecera y luego los datos).
export function librosXlsx(l) {
  return xlsx(l.hojas.map((a) => ({ nombre: a.hoja, anchos: Array(a.cab.n).fill(14), filas: [...a.cab.filas.map((v) => fila(a.cab.n, v)), ...a.filas] })));
}
