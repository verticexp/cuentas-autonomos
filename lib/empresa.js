// Cómo trabaja cada empresa o autónomo: sus actividades (con su serie de facturas) y su situación fiscal,
// de la que salen los modelos que tiene que presentar. Sin dependencias: se usa en el servidor, en el navegador y en las pruebas.

// Las cuentas de antes de poder elegir actividades eran DJ y Vértice: se mantienen tal cual (misma numeración).
export const ACTIVIDADES_ANTIGUAS = [
  { id: 'dj', nombre: 'DJ', serie: '', ivaPct: 21, irpfPct: 15 },
  { id: 'vertice', nombre: 'Vértice', serie: 'V', ivaPct: 21, irpfPct: 0 },
];
export const FISCAL_BASE = { tipo: 'autonomo', iva: 'general', retenidas: false, trabajadores: false, alquiler: false, intracom: false };

export const actividadesDe = (u) => (Array.isArray(u?.actividades) && u.actividades.length ? u.actividades : ACTIVIDADES_ANTIGUAS);
export const fiscalDe = (u) => ({ ...FISCAL_BASE, ...(u?.fiscal || {}) });
export const nombresActividad = (lista) => Object.fromEntries(lista.map((a) => [a.id, a.nombre]));
export const actividadValida = (lista, id) => (lista.some((a) => a.id === id) ? id : lista[0].id);
export const serieDeActividad = (lista, id) => lista.find((a) => a.id === id)?.serie ?? '';

// Qué se calcula en la app según la situación fiscal.
export const usa303 = (fiscal) => fiscal.iva === 'general';
export const usa130 = (fiscal) => fiscal.tipo === 'autonomo' && !fiscal.retenidas;

// Revisa lo que llega del cuestionario. Las series: la primera actividad sin letra, las demás con letras
// distintas; la R es de las rectificativas. Si la actividad ya tiene facturas, su serie no se puede cambiar.
export function limpiarActividades(lista, antes = [], conFacturas = new Set()) {
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
    if (usadas.has(serie)) {
      if (previa && conFacturas.has(previa.id)) return { error: `La serie «${serie || 'sin letra'}» ya la usa otra actividad` };
      serie = [...'ABCDEFGHIJKLMNOPQSTUVWXYZ'].find((l) => !usadas.has(l) && !lista.some((x) => String(x.serie || '').toUpperCase() === l));
    }
    usadas.add(serie);
    const ivaPct = [21, 10, 4, 0].includes(Number(a.ivaPct)) ? Number(a.ivaPct) : 21;
    const irpfPct = [15, 7, 0].includes(Number(a.irpfPct)) ? Number(a.irpfPct) : 0;
    out.push({ id: unico, nombre, serie, ivaPct, irpfPct });
  }
  for (const v of antes) if (conFacturas.has(v.id) && !out.some((x) => x.id === v.id)) return { error: `«${v.nombre}» tiene facturas: no se puede quitar` };
  return { actividades: out };
}

export function limpiarFiscal(f = {}) {
  const tipo = f.tipo === 'sociedad' ? 'sociedad' : 'autonomo';
  const iva = ['general', 'exento', 'recargo'].includes(f.iva) ? f.iva : 'general';
  return {
    tipo, iva: tipo === 'sociedad' && iva === 'recargo' ? 'general' : iva,
    retenidas: tipo === 'autonomo' && Boolean(f.retenidas),
    trabajadores: Boolean(f.trabajadores), alquiler: Boolean(f.alquiler), intracom: Boolean(f.intracom),
  };
}

// Modelos que le tocan, con cuándo se presentan. Orientativo: lo confirma su gestor.
export function modelosDe(fiscal) {
  const f = { ...FISCAL_BASE, ...fiscal };
  const trimestral = '1 al 20 de abril, julio y octubre, y 1 al 30 de enero';
  // Las retenciones (111 y 115) del cuarto trimestre se presentan antes: hasta el 20 de enero.
  const retenciones = '1 al 20 de abril, julio, octubre y enero';
  const m = [];
  if (f.iva === 'general') {
    m.push({ id: '303', nombre: 'IVA trimestral', cuando: trimestral, calcula: true });
    m.push({ id: '390', nombre: 'Resumen anual del IVA', cuando: '1 al 30 de enero', calcula: true });
  }
  if (f.intracom) m.push({ id: '349', nombre: 'Operaciones con empresas de la UE', cuando: trimestral, calcula: true });
  if (f.tipo === 'autonomo' && !f.retenidas) m.push({ id: '130', nombre: 'Pago a cuenta del IRPF', cuando: trimestral, calcula: true });
  if (f.trabajadores) {
    m.push({ id: '111', nombre: 'Retenciones de trabajadores y profesionales', cuando: retenciones, calcula: true });
    m.push({ id: '190', nombre: 'Resumen anual de esas retenciones', cuando: '1 al 31 de enero', calcula: true });
  }
  if (f.alquiler) {
    m.push({ id: '115', nombre: 'Retenciones del alquiler del local', cuando: retenciones, calcula: true });
    m.push({ id: '180', nombre: 'Resumen anual del alquiler', cuando: '1 al 31 de enero', calcula: true });
  }
  m.push({ id: '347', nombre: 'Operaciones de más de 3.005,06 € con un mismo cliente o proveedor', cuando: 'febrero (solo si las hay)' });
  if (f.tipo === 'autonomo') m.push({ id: '100', nombre: 'Declaración de la renta', cuando: 'abril a junio', calcula: true });
  else {
    m.push({ id: '200', nombre: 'Impuesto sobre Sociedades', cuando: '1 al 25 de julio' });
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
