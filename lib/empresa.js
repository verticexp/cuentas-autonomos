import { TIPOS_IGIC } from './igic.js';
import { FORALES, TERRITORIOS, textoPlazos } from './territorios.js';

// Cómo trabaja cada empresa o autónomo: sus actividades (con su serie de facturas) y su situación fiscal,
// de la que salen los modelos que tiene que presentar. Se usa en el servidor, en el navegador y en las pruebas.

// Las cuentas de antes de poder elegir actividades eran DJ y Vértice: se mantienen tal cual (misma numeración).
export const ACTIVIDADES_ANTIGUAS = [
  { id: 'dj', nombre: 'DJ', serie: '', ivaPct: 21, irpfPct: 15 },
  { id: 'vertice', nombre: 'Vértice', serie: 'V', ivaPct: 21, irpfPct: 0 },
];
export const FISCAL_BASE = { tipo: 'autonomo', iva: 'general', retenidas: false, trabajadores: false, alquiler: false, intracom: false };

export const actividadesDe = (u) => (Array.isArray(u?.actividades) && u.actividades.length ? u.actividades : ACTIVIDADES_ANTIGUAS);
export const fiscalDe = (u) => ({ ...FISCAL_BASE, ...(u?.fiscal || {}) });
export const nombresActividad = (lista) => Object.fromEntries(lista.map((a) => [a.id, a.nombre]));
// Lo que toda factura necesita del emisor (art. 6.1 del Reglamento de facturación): nombre, NIF y domicilio. El IBAN no:
// sin él la factura sale sin «Transferencia» (se cobra por Bizum, en efectivo o como diga «Otra forma de pago»).
export const faltanDatosFactura = (e = {}) => [!String(e.nombre || '').trim() && 'nombre', !String(e.nif || '').trim() && 'NIF', !String(e.direccion || '').trim() && 'dirección'].filter(Boolean);
export const AVISO_DATOS_FACTURA = 'Completa tu nombre, NIF y dirección en Ajustes › Datos de la empresa: salen en cada factura';
export const actividadValida = (lista, id) => (lista.some((a) => a.id === id) ? id : lista[0].id);
export const serieDeActividad = (lista, id) => lista.find((a) => a.id === id)?.serie ?? '';

// Qué se calcula en la app según la situación fiscal. Un autónomo en módulos (estimación objetiva) presenta el 131 en vez
// del 130 y, en el régimen simplificado del IVA, su 303 sale de los módulos (lib/estimacionObjetiva.js), no de las facturas.
// En el régimen especial de la agricultura (REAGP) no repercute IVA ni presenta el 303: cobra la compensación.
export const usaIgic = (fiscal) => fiscal?.territorio === 'canarias';
export const usa303 = (fiscal) => fiscal.iva === 'general';
export const usaModulos = (fiscal) => fiscal.tipo === 'autonomo' && fiscal.irpf === 'modulos';
export const usa130 = (fiscal) => fiscal.tipo === 'autonomo' && !fiscal.retenidas && !usaModulos(fiscal);
export const usa131 = usaModulos;
export const usaSimplificado = (fiscal) => fiscal.tipo === 'autonomo' && fiscal.iva === 'simplificado';
// Hasta dónde llega su factura simplificada (art. 4 del Reglamento de facturación), IVA incluido: 400 €, o 3.000 € en los
// sectores del art. 4.1.c (comercio minorista, hostelería, transporte de personas, peluquería…), que marca en Ajustes ›
// Actividades e impuestos (minorista). Quien está en recargo de equivalencia es comerciante minorista: 3.000 € sin marcarlo.
export const limiteSimplificada = (fiscal) => (fiscal?.minorista || fiscal?.iva === 'recargo' ? 3000 : 400);

// Trimestre presentado, cada modelo por su cuenta. 130: hay importe (o 0) en pagos130. 303: su marca en pres303; los
// trimestres marcados antes de separarlos (sin marca propia) heredan la del 130, que entonces valía para los dos.
const hay = (v) => v !== undefined && v !== null;
export const hecho130 = (pagos130, y, t) => hay(pagos130?.[y]?.[t]);
export const hecho303 = (pres303, pagos130, y, t) => (hay(pres303?.[y]?.[t]) ? Boolean(pres303[y][t]) : hecho130(pagos130, y, t));
// 111 y 115 con su marca propia (pres111, pres115; Impuestos): true o false, o null sin marca (entonces cuentan como
// presentados con el 303 y el 130 del trimestre, como antes de tener marca).
export const marcaRet = (pres, y, t) => (hay(pres?.[y]?.[t]) ? Boolean(pres[y][t]) : null);
// Ajustes del IVA que cambian el 303 (lib/calculos.js): la prorrata provisional guardada por año, las marcas de
// presentado, donde el 4T puede llevar 'devolucion' (saldo a favor devuelto, no se compensa el año siguiente), y el
// criterio de caja (recc), solo con el régimen general.
export const reccDe = (fiscal) => (usa303(fiscal) && !usaIgic(fiscal) && fiscal.recc?.desde ? fiscal.recc : undefined);
export const ajustesIva = (u) => ({ prorrata: u?.prorrata || {}, pres303: u?.pres303 || {}, ...(reccDe(fiscalDe(u)) ? { recc: reccDe(fiscalDe(u)) } : {}), ...(u?.saldoIva ? { saldoInicial: u.saldoIva } : {}) });

// «Equipo» en el menú (components/secciones.js): si dijo que tiene trabajadores o ya ha dado de alta a alguien.
export const conEquipo = (u, empleados = []) => Boolean(fiscalDe(u).trabajadores) || empleados.length > 0;

// Revisa lo que llega del cuestionario. Las series: la primera actividad sin letra, las demás con letras
// distintas; la R es de las rectificativas. Si la actividad ya tiene facturas, su serie no se puede cambiar.
export function limpiarActividades(lista, antes = [], conFacturas = new Set(), { igic = false } = {}) {
  if (!Array.isArray(lista) || !lista.length) return { error: 'Añade al menos una actividad' };
  if (lista.length > 8) return { error: 'Como mucho 8 actividades' };
  const usadas = new Set();
  const out = [];
  for (const [i, a] of lista.entries()) {
    const nombre = String(a?.nombre || '').trim().slice(0, 40);
    if (!nombre) return { error: 'Cada actividad necesita un nombre' };
    const previa = antes.find((x) => x.id === a.id);
    const id = previa ? previa.id : (nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'actividad');
    let unico = id; let n = 2;
    while (out.some((x) => x.id === unico) || (!previa && antes.some((x) => x.id === unico))) unico = `${id}-${n++}`;
    let serie = previa && conFacturas.has(previa.id) ? previa.serie : String(a.serie ?? (i === 0 ? '' : '')).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (serie === 'R') return { error: 'La serie R está reservada para las facturas rectificativas' };
    // La Z es de los cierres de caja (lib/caja.js); quien ya la usaba con facturas, la conserva.
    if (serie === 'Z' && !(previa && conFacturas.has(previa.id) && previa.serie === 'Z')) return { error: 'La serie Z está reservada para los cierres de caja' };
    if (usadas.has(serie)) {
      if (previa && conFacturas.has(previa.id)) return { error: `La serie «${serie || 'sin letra'}» ya la usa otra actividad` };
      serie = [...'ABCDEFGHIJKLMNOPQSTUVWXY'].find((l) => !usadas.has(l) && !lista.some((x) => String(x.serie || '').toUpperCase() === l));
    }
    usadas.add(serie);
    if (igic && !TIPOS_IGIC.includes(Number(a.ivaPct))) return { error: 'El tipo de IGIC de la actividad no está permitido' };
    const ivaPct = (igic ? TIPOS_IGIC : [21, 10, 4, 0]).includes(Number(a.ivaPct)) ? Number(a.ivaPct) : 21;
    const irpfPct = [15, 7, 0].includes(Number(a.irpfPct)) ? Number(a.irpfPct) : 0;
    // Epígrafe del IAE (opcional): va en los libros registro de los autónomos.
    const iae = String(a.iae || '').replace(/[^\d.]/g, '').replace(/\./g, '').slice(0, 4);
    out.push({ id: unico, nombre, serie, ivaPct, irpfPct, ...(iae ? { iae } : {}) });
  }
  for (const v of antes) if (conFacturas.has(v.id) && !out.some((x) => x.id === v.id)) return { error: `«${v.nombre}» tiene facturas: no se puede quitar` };
  return { actividades: out };
}

export function limpiarFiscal(f = {}) {
  const igic = usaIgic(f);
  // Dónde presenta sus impuestos (lib/territorios.js); sin dato, territorio común.
  const territorio = f.territorio !== 'comun' && TERRITORIOS[f.territorio] ? f.territorio : undefined;
  const foral = FORALES[territorio];
  const tipo = f.tipo === 'sociedad' ? 'sociedad' : 'autonomo';
  // En territorio foral, Fisquo no lleva los módulos ni el régimen simplificado (sus reglas son de cada Hacienda).
  const iva = ['general', 'exento', 'recargo', 'simplificado', 'reagp'].includes(f.iva) && !(foral && f.iva === 'simplificado') ? f.iva : 'general';
  // El recargo, el simplificado y el de la agricultura son de personas físicas (y comunidades de bienes), no de sociedades.
  return {
    // El simplificado del IVA va con los módulos del IRPF (art. 122 de la Ley del IVA).
    ...(territorio ? { territorio } : {}),
    tipo, iva: (igic && !['general', 'exento'].includes(iva)) || (tipo === 'sociedad' && ['recargo', 'simplificado', 'reagp'].includes(iva)) || (iva === 'simplificado' && f.irpf !== 'modulos') ? 'general' : iva,
    // Sin pago fraccionado si casi todo lleva retención (el 70 %; en Gipuzkoa, el 50 %). En Navarra y Álava no hay exención.
    retenidas: tipo === 'autonomo' && Boolean(f.retenidas) && !['navarra', 'alava'].includes(territorio),
    // IRPF en estimación objetiva (módulos): modelo 131 en vez del 130.
    ...(tipo === 'autonomo' && f.irpf === 'modulos' && !foral ? { irpf: 'modulos' } : {}),
    // Estimación directa normal (art. 28 RIRPF; obligatoria con más de 600.000 € el año anterior): sin el 5 % de difícil
    // justificación (lib/calculos.js resumenAnual).
    ...(tipo === 'autonomo' && f.irpf === 'normal' && !foral ? { irpf: 'normal' } : {}),
    trabajadores: Boolean(f.trabajadores), alquiler: Boolean(f.alquiler), intracom: !igic && Boolean(f.intracom),
    // Vende productos y quiere controlar el stock (Inventario).
    ...(f.inventario ? { inventario: true } : {}),
    // Comercio minorista, hostelería u otro sector del art. 4.1.c del Reglamento de facturación: factura simplificada (sin
    // NIF del cliente) hasta 3.000 € en vez de 400 € (limiteSimplificada).
    ...(f.minorista ? { minorista: true } : {}),
    // Régimen especial del criterio de caja (lib/calculos.js), desde la fecha de la opción en el 036 y, si se renuncia o se
    // sale de él, hasta el último día en que se aplicó. Solo con el régimen general del IVA.
    ...(!igic && iva === 'general' && fechaValida(f.recc?.desde) ? { recc: { desde: f.recc.desde, ...(fechaValida(f.recc.hasta) && f.recc.hasta >= f.recc.desde ? { hasta: f.recc.hasta } : {}) } } : {}),
    // Ventanilla única (OSS, lib/oss.js): vende a consumidores de otros países de la UE con el IVA de su país (modelo 369).
    ...(!igic && iva === 'general' && f.oss ? { oss: true } : {}),
    // Regímenes especiales de margen que usa en algunas facturas (lib/calculos.js): bienes usados, arte y antigüedades
    // (REBU) y agencias de viajes (REAV).
    ...(!igic && f.rebu ? { rebu: true } : {}), ...(!igic && f.reav ? { reav: true } : {}),
    // Paga dividendos o intereses (a socios, a quien le prestó dinero): retención del 19 %, modelos 123 y 193.
    ...(f.capital ? { capital: true } : {}),
    // Fecha de constitución de la sociedad (AAAA-MM-DD): el 15 % de las entidades de nueva creación (lib/modelos.js).
    ...(tipo === 'sociedad' && fechaValida(f.constitucion) ? { constitucion: f.constitucion } : {}),
    // Datos personales para el borrador de la renta (lib/modelos.js borradorRenta), solo de autónomos.
    ...(tipo === 'autonomo' && limpiarRenta(f.renta) ? { renta: limpiarRenta(f.renta) } : {}),
  };
}
// Años de nacimiento escritos como lista («2015, 2019») o array.
const anios = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map(Number).filter((y) => Number.isInteger(y) && y >= 1900 && y <= 2100).slice(0, 12);
// Hijos: el año («2015») o el mes y el año («05/2024», para la deducción por maternidad), como lista o array. Con hijosMes
// (el mes de cada uno, 0 si no se sabe) ya guardado, cada año lleva su mes.
const hijosDe = (v, meses = []) => (Array.isArray(v) ? v.map((y, i) => [Number(y), Number(meses[i]) || 0]) : String(v || '').split(/[\s,;]+/).map((t) => { const m = /^(\d{1,2})[/-](\d{4})$/.exec(t); return m ? [Number(m[2]), Number(m[1])] : [Number(t), 0]; }))
  .filter(([y, m]) => Number.isInteger(y) && y >= 1900 && y <= 2100 && Number.isInteger(m) && m >= 0 && m <= 12).slice(0, 12);
const importeRenta = (v) => Math.round(Math.max(0, Math.min(1e7, Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0)) * 100) / 100;
// Comunidades de régimen común, Ceuta y Melilla (lib/modelos.js CCAA): la escala y los mínimos autonómicos de la renta.
export const COMUNIDADES_RENTA = [['andalucia', 'Andalucía'], ['aragon', 'Aragón'], ['asturias', 'Principado de Asturias'], ['baleares', 'Illes Balears'], ['canarias', 'Canarias'], ['cantabria', 'Cantabria'], ['castilla-la-mancha', 'Castilla-La Mancha'], ['castilla-y-leon', 'Castilla y León'], ['cataluna', 'Cataluña'], ['extremadura', 'Extremadura'], ['galicia', 'Galicia'], ['madrid', 'Comunidad de Madrid'], ['murcia', 'Región de Murcia'], ['la-rioja', 'La Rioja'], ['valencia', 'Comunitat Valenciana'], ['ceuta', 'Ceuta'], ['melilla', 'Melilla']];
export function limpiarRenta(r) {
  if (!r || typeof r !== 'object') return null;
  const nac = Number(r.nacimiento);
  const otras = importeRenta(r.otrasRentas);
  const H = hijosDe(r.hijos, r.hijosMes);
  const guarderia = importeRenta(r.guarderia);
  const out = {
    ...(Number.isInteger(nac) && nac >= 1900 && nac <= 2100 ? { nacimiento: nac } : {}),
    ...(H.length ? { hijos: H.map(([y]) => y), ...(H.some(([, m]) => m) ? { hijosMes: H.map(([, m]) => m) } : {}), compartidos: r.compartidos !== false } : {}),
    // Comunidad de residencia (escala y mínimos autonómicos) y deducción por maternidad (art. 81 LIRPF): la madre y lo pagado
    // a la guardería en el año.
    ...(COMUNIDADES_RENTA.some(([id]) => id === r.ccaa) ? { ccaa: r.ccaa } : {}),
    ...(H.length && r.madre ? { madre: true, ...(guarderia ? { guarderia } : {}) } : {}),
    ...(anios(r.ascendientes).length ? { ascendientes: anios(r.ascendientes) } : {}),
    ...(r.dependiente ? { dependiente: true } : {}),
    ...(otras ? { otrasRentas: otras } : {}),
    // Año de inicio de la actividad (reducción del 20 % del art. 32.3 LIRPF) y si más de la mitad de los ingresos vienen de
    // quien le pagó una nómina el año anterior (entonces no hay reducción).
    ...(Number.isInteger(Number(r.inicio)) && Number(r.inicio) >= 1950 && Number(r.inicio) <= 2100 ? { inicio: Number(r.inicio) } : {}),
    ...(r.exEmpleador ? { exEmpleador: true } : {}),
  };
  return Object.keys(out).length ? out : null;
}
const fechaValida = (v) => { const t = /^\d{4}-\d{2}-\d{2}$/.test(v || '') && v >= '1900-01-01' ? Date.parse(`${v}T00:00:00Z`) : NaN; return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v; };

// Modelos que le tocan, con cuándo se presentan. Orientativo: lo confirma su gestor.
export function modelosDe(fiscal) {
  const f = { ...FISCAL_BASE, ...fiscal };
  if (FORALES[f.territorio]) return modelosForales(f, FORALES[f.territorio]);
  const trimestral = '1 al 20 de abril, julio y octubre, y 1 al 30 de enero';
  // Las retenciones (111 y 115) del cuarto trimestre se presentan antes: hasta el 20 de enero.
  const retenciones = '1 al 20 de abril, julio, octubre y enero';
  const m = [];
  if (f.iva === 'general' || (f.iva === 'simplificado' && f.tipo === 'autonomo')) {
    if (usaIgic(f)) {
      m.push({ id: '420', nombre: 'IGIC trimestral', cuando: '1 al 20 de abril, julio y octubre, y 1 al 31 de enero', calcula: true });
      m.push({ id: '425', nombre: 'Resumen anual del IGIC', cuando: '1 al 31 de enero', calcula: true });
    } else {
      m.push({ id: '303', nombre: f.iva === 'simplificado' ? 'IVA trimestral (régimen simplificado)' : 'IVA trimestral', cuando: trimestral, calcula: true });
      // En el simplificado no se presenta el 390: el 303 del 4T lleva su información adicional (instrucciones del 303).
      if (f.iva === 'general') m.push({ id: '390', nombre: 'Resumen anual del IVA', cuando: '1 al 30 de enero', calcula: true });
    }
  }
  if (!usaIgic(f) && f.iva === 'general' && f.oss) m.push({ id: '369', nombre: 'IVA de la ventanilla única (ventas a particulares de la UE)', cuando: 'hasta el último día de abril, julio, octubre y enero', calcula: true });
  if (!usaIgic(f) && f.intracom) m.push({ id: '349', nombre: 'Ventas y compras con empresas de la UE', cuando: trimestral, calcula: true });
  if (usa130(f)) m.push({ id: '130', nombre: 'Pago a cuenta del IRPF', cuando: trimestral, calcula: true });
  if (usa131(f)) m.push({ id: '131', nombre: 'Pago a cuenta del IRPF en módulos', cuando: trimestral, calcula: true });
  if (f.trabajadores) {
    m.push({ id: '111', nombre: 'Retenciones de trabajadores y profesionales', cuando: retenciones, calcula: true });
    m.push({ id: '190', nombre: 'Resumen anual de esas retenciones', cuando: '1 al 31 de enero', calcula: true });
  }
  if (f.alquiler) {
    m.push({ id: '115', nombre: 'Retenciones del alquiler del local', cuando: retenciones, calcula: true });
    m.push({ id: '180', nombre: 'Resumen anual del alquiler', cuando: '1 al 31 de enero', calcula: true });
  }
  if (f.capital) {
    m.push({ id: '123', nombre: 'Retenciones de dividendos e intereses', cuando: retenciones, calcula: true });
    m.push({ id: '193', nombre: 'Resumen anual de dividendos e intereses', cuando: '1 al 31 de enero', calcula: true });
  }
  // Paga a quien no reside en España (gastos marcados «no residente», lib/noResidentes.js; noResidentes lo pone Impuestos
  // si los hay): retenciones del IRNR, 216 cada trimestre (mensual en las grandes empresas) y 296 en enero.
  if (f.noResidentes) {
    m.push({ id: '216', nombre: 'Retenciones de no residentes (alquiler, profesionales y otras rentas)', cuando: retenciones, calcula: true });
    m.push({ id: '296', nombre: 'Resumen anual de las retenciones de no residentes', cuando: '1 al 31 de enero', calcula: true });
  }
  m.push({ id: '347', nombre: 'Operaciones de más de 3.005,06 € con un mismo cliente o proveedor', cuando: 'febrero (solo si las hay)', calcula: true });
  // En Canarias, además, el 415 de la Agencia Tributaria Canaria con las mismas operaciones (IGIC incluido).
  if (usaIgic(f)) m.push({ id: '415', nombre: 'Operaciones de más de 3.005,06 € (Agencia Tributaria Canaria)', cuando: 'febrero (solo si las hay)', calcula: false });
  if (f.tipo === 'autonomo') m.push({ id: '100', nombre: 'Declaración de la renta', cuando: 'abril a junio', calcula: true });
  else {
    m.push({ id: '200', nombre: 'Impuesto sobre Sociedades', cuando: '1 al 25 de julio', calcula: true });
    m.push({ id: '202', nombre: 'Pagos a cuenta del Impuesto sobre Sociedades', cuando: '1 al 20 de abril, octubre y diciembre (desde el segundo año, si el anterior salió a pagar)', calcula: true });
    // No son de Hacienda, pero también tocan cada año (Registro Mercantil).
    m.push({ id: 'rm-libros', num: 'RM', nombre: 'Legalizar los libros (diario, inventarios y cuentas anuales, y actas)', cuando: 'hasta el 30 de abril' });
    m.push({ id: 'rm-cuentas', num: 'RM', nombre: 'Depositar las cuentas anuales', cuando: 'hasta el 30 de julio (un mes después de aprobarlas en junta, como tarde el 30 de junio)' });
  }
  return m;
}

// Gastos habituales que se suelen olvidar, para cualquier actividad (la lista de DJ queda para las cuentas antiguas).
export const DEDUCCIONES_GENERALES = [
  { t: 'Cuota de autónomos', d: 'Deducible al 100 % en el IRPF (sin IVA). Añádela con «Cuota de autónomos».', clave: ['cuota', 'autónomo', 'autonomo', 'reta', 'seguridad social'], soloAutonomo: true },
  { t: 'Gestoría y asesoría', d: 'Deducible al 100 %.', clave: ['gestor', 'asesor'] },
  { t: 'Teléfono e internet', d: 'La parte que usas para trabajar, con la factura a tu nombre.', clave: ['teléfono', 'telefono', 'movil', 'móvil', 'fibra', 'internet', 'movistar', 'vodafone', 'orange', 'digi'] },
  { t: 'Software y suscripciones', d: 'Programas y servicios que usas para tu actividad.', clave: ['software', 'suscrip', 'licencia', 'google', 'microsoft', 'adobe', 'apple'] },
  { t: 'Material y equipos', d: 'Si una pieza pasa de 300 €, tu gestor puede repartirla en varios años.', clave: ['material', 'equipo', 'ordenador', 'portátil', 'portatil', 'herramienta'] },
  { t: 'Seguros', d: 'Responsabilidad civil u otros seguros de la actividad.', clave: ['seguro'] },
  { t: 'Web y publicidad', d: 'Dominio, hosting, anuncios, diseño o fotos.', clave: ['dominio', 'hosting', 'web', 'publicidad', 'anuncio', 'instagram', 'meta', 'google ads'] },
  { t: 'Desplazamientos', d: 'Peajes, parking, tren o taxi con factura. El coche tiene límites: consúltalo con tu gestor.', clave: ['gasolina', 'peaje', 'parking', 'taxi', 'uber', 'cabify', 'tren', 'renfe', 'combustible'] },
  { t: 'Comisiones bancarias', d: 'De la cuenta con la que cobras.', clave: ['comisión', 'comision', 'banco', 'stripe', 'paypal'] },
  { t: 'Formación', d: 'Cursos relacionados con tu actividad.', clave: ['curso', 'formación', 'formacion', 'masterclass'] },
];

// Los modelos de una Hacienda foral (Navarra y País Vasco), con sus números y plazos. Los ids llevan «f-»: no son los de
// la AEAT (el glosario de Impuestos no los explica como tales).
function modelosForales(f, d) {
  const m = [];
  if (f.iva === 'general') {
    m.push({ id: 'f-iva', num: d.iva.num, nombre: 'IVA trimestral', cuando: `${textoPlazos(d.iva.plazos)}${d.iva.cuarto ? ' (el 4T va en el 390)' : ''}`, calcula: true });
    m.push(d.ivaAnual
      ? { id: 'f-390', num: d.ivaAnual.num, nombre: 'Autoliquidación final del IVA (con el 4T)', cuando: textoPlazos({ 4: d.ivaAnual.plazo }), calcula: true }
      : { id: 'f-iva-anual', num: d.iva.num, nombre: 'Resumen anual del IVA (va con la del 4T)', cuando: textoPlazos({ 4: d.iva.plazos[4] }), calcula: true });
  }
  if (f.iva === 'general' && f.oss) m.push({ id: '369', nombre: 'IVA de la ventanilla única (ventas a particulares de la UE)', cuando: 'hasta el último día de abril, julio, octubre y enero', calcula: true });
  if (f.intracom) m.push({ id: 'f-349', num: '349', nombre: 'Ventas y compras con empresas de la UE', cuando: 'cada trimestre, con el calendario de tu Hacienda', calcula: true });
  if (usa130(f)) m.push({ id: 'f-irpf', num: d.irpf.num, nombre: d.irpf.deOficio ? 'Pago fraccionado del IRPF (lo liquida la Diputación)' : 'Pago fraccionado del IRPF', cuando: textoPlazos(d.irpf.plazos), calcula: true });
  if (f.trabajadores) {
    m.push({ id: 'f-ret', num: d.ret.num, nombre: 'Retenciones de trabajadores y profesionales', cuando: textoPlazos(d.ret.plazos), calcula: true });
    m.push({ id: 'f-190', num: '190', nombre: 'Resumen anual de esas retenciones', cuando: 'en enero', calcula: true });
  }
  if (f.alquiler) {
    m.push({ id: 'f-alquiler', num: d.ret.alquiler, nombre: 'Retenciones del alquiler del local', cuando: textoPlazos(d.ret.plazos), calcula: true });
    m.push({ id: 'f-180', num: '180', nombre: 'Resumen anual del alquiler', cuando: 'en enero', calcula: true });
  }
  if (f.capital) m.push({ id: 'f-capital', num: '123', nombre: 'Retenciones de dividendos e intereses', cuando: 'cada trimestre, con el calendario de tu Hacienda', calcula: true });
  m.push({ id: 'f-347', num: '347', nombre: 'Operaciones de más de 3.005,06 € con un mismo cliente o proveedor', cuando: 'febrero (solo si las hay)', calcula: true });
  if (f.tipo === 'autonomo') m.push({ id: 'f-renta', num: d.renta, nombre: 'Declaración de la renta', cuando: 'en primavera, con el calendario de tu Hacienda', calcula: true });
  else {
    m.push({ id: 'f-is', num: d.is.num, nombre: 'Impuesto sobre Sociedades', cuando: 'en julio', calcula: true });
    m.push({ id: 'f-pago-is', num: d.is.pago.num, nombre: 'Pago fraccionado de Sociedades', cuando: `${textoPlazos({ 4: d.is.pago.plazo })}${d.is.pago.exentaPyme ? ' (no lo pagan las micro y pequeñas empresas)' : ''}`, calcula: true });
    m.push({ id: 'rm-libros', num: 'RM', nombre: 'Legalizar los libros (diario, inventarios y cuentas anuales, y actas)', cuando: 'hasta el 30 de abril' });
    m.push({ id: 'rm-cuentas', num: 'RM', nombre: 'Depositar las cuentas anuales', cuando: 'hasta el 30 de julio (un mes después de aprobarlas en junta, como tarde el 30 de junio)' });
  }
  return m;
}

