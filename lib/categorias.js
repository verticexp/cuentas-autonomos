// Categorías de gasto del plan general contable de pymes (grupo 6). Sin dependencias: también se usa en el formulario.
// linea: la partida de la cuenta de pérdidas y ganancias (modelo abreviado) en la que suma.
// clave: palabras que, en el concepto o el proveedor, hacen que Fisquo la proponga (se mira en este orden).
export const CATEGORIAS = [
  { id: '640', nombre: 'Sueldos y salarios', linea: 'personal', clave: ['nómina', 'nomina', 'sueldo', 'salario', 'finiquito'] },
  { id: '642', nombre: 'Seguridad Social y cuota de autónomos', linea: 'personal', clave: ['seguridad social', 'cuota de autónomo', 'cuota de autonomo', 'cuota autónomo', 'cuota autonomo', 'reta', 'tgss'] },
  { id: '662', nombre: 'Intereses de préstamos', linea: 'financieros', clave: ['interés', 'interes', 'préstamo', 'prestamo', 'hipoteca', 'crédito', 'credito'] },
  { id: '631', nombre: 'Impuestos y tasas', linea: 'explotacion', clave: ['ibi', 'iae', 'tasa', 'impuesto', 'ivtm', 'basura', 'licencia municipal'] },
  { id: '626', nombre: 'Comisiones bancarias', linea: 'explotacion', clave: ['comisión', 'comision', 'banco', 'bancari', 'stripe', 'paypal', 'tpv', 'sumup', 'bbva', 'santander', 'caixa'] },
  { id: '625', nombre: 'Seguros', linea: 'explotacion', clave: ['seguro', 'póliza', 'poliza', 'mapfre', 'axa', 'allianz', 'mutua'] },
  { id: '623', nombre: 'Gestoría y profesionales', linea: 'explotacion', clave: ['gestor', 'asesor', 'abogad', 'notar', 'registro mercantil', 'auditor', 'consultor', 'diseñ', 'fotógraf', 'fotograf', 'traduc'] },
  { id: '627', nombre: 'Publicidad', linea: 'explotacion', clave: ['publicidad', 'anuncio', 'instagram', 'google ads', 'meta ads', 'facebook', 'marketing', 'folleto', 'promoci', 'patrocin'] },
  { id: '621', nombre: 'Alquileres y renting', linea: 'explotacion', clave: ['alquiler', 'arrendamiento', 'renting', 'coworking', 'inmobiliari', 'inmuebles', 'local', 'almacén', 'almacen', 'nave'] },
  { id: '628', nombre: 'Suministros (luz, agua, teléfono, combustible)', linea: 'explotacion', clave: ['luz', 'electricidad', 'agua', 'gas natural', 'teléfono', 'telefono', 'internet', 'fibra', 'móvil', 'movil', 'combustible', 'gasolina', 'gasoil', 'diésel', 'diesel', 'carburante', 'endesa', 'iberdrola', 'naturgy', 'movistar', 'vodafone', 'orange', 'digi'] },
  { id: '624', nombre: 'Transportes y mensajería', linea: 'explotacion', clave: ['transporte', 'mensajer', 'paquetería', 'paqueteria', 'seur', 'mrw', 'correos', 'dhl', 'ups', 'porte'] },
  { id: '622', nombre: 'Reparaciones y mantenimiento', linea: 'explotacion', clave: ['reparaci', 'mantenimiento', 'taller', 'arreglo', 'revisión', 'revision', 'itv'] },
  { id: '607', nombre: 'Trabajos de otras empresas', linea: 'aprovisionamientos', clave: ['subcontrat', 'colaborador', 'freelance', 'técnico externo', 'tecnico externo', 'armador', 'catering'] },
  { id: '600', nombre: 'Compras y material', linea: 'aprovisionamientos', clave: ['material', 'mercancía', 'mercancia', 'compra', 'consumible', 'stock', 'recambio', 'existencias', 'materia prima'] },
  { id: '629', nombre: 'Otros servicios (software, viajes, formación…)', linea: 'explotacion', clave: [] },
];
export const categoria = (id) => CATEGORIAS.find((c) => c.id === id) || CATEGORIAS.at(-1);

// Una clave encaja al principio de una palabra («soporte» no es «porte», ni «secretaria» «reta»); las cortas (siglas y
// palabras de hasta 4 letras: ups, luz, tasa…), solo como palabra entera, con o sin plural («tasación» no es «tasa»).
const LETRA = 'a-z0-9áéíóúüñ';
const REGLAS = new Map();
const encaja = (texto, k) => {
  if (!REGLAS.has(k)) REGLAS.set(k, new RegExp(`(^|[^${LETRA}])${k}${k.length <= 4 ? `s?(?![${LETRA}])` : ''}`));
  return REGLAS.get(k).test(texto);
};

// Otros servicios aunque lleven palabras de otra categoría: el «material de oficina» no es un alquiler ni el «software de
// diseño» un profesional (antes «oficina» y «diseñ» los mandaban a 621 y 623). Se miran antes que las demás.
const OTROS_SERVICIOS = ['material de oficina', 'papelería', 'papeleria', 'software'];

// La que se puso a mano o, si no, la que encaja por el concepto o el proveedor (las nóminas, siempre 640).
export function categoriaDe(g) {
  if (g.categoria && CATEGORIAS.some((c) => c.id === g.categoria)) return g.categoria;
  if (g.nomina) return '640';
  const texto = ` ${g.concepto || ''} ${g.proveedor || ''} `.toLowerCase();
  if (OTROS_SERVICIOS.some((k) => encaja(texto, k))) return '629';
  return CATEGORIAS.find((c) => c.clave.some((k) => encaja(texto, k)))?.id || '629';
}

// Gastos que no son deducibles en el Impuesto sobre Sociedades (art. 15 LIS): el propio impuesto y sus pagos a cuenta
// (15.b), las multas, sanciones y recargos del periodo ejecutivo o por presentar fuera de plazo (15.c) y los donativos
// (15.e). Lista cerrada y conservadora: solo gastos sin IVA ni retención (lo que se paga a Hacienda o se dona no lleva
// IVA; la gestoría que presenta el impuesto, sí) cuyo concepto o proveedor lo dice. noDeducibleIS en el gasto lo marca
// (true) o lo desmarca (false) a mano. Devuelve { motivo, marcado } o null.
const NO_DEDUCIBLES_IS = [
  ['el propio Impuesto sobre Sociedades o sus pagos a cuenta (art. 15.b LIS)', ['impuesto sobre sociedades', 'impuesto de sociedades', 'impuesto sociedades', 'modelo 200', 'modelo 202']],
  ['una multa o sanción (art. 15.c LIS)', ['multa', 'sanción', 'sancion']],
  ['un recargo de Hacienda (art. 15.c LIS)', ['recargo de apremio', 'recargo por apremio', 'recargo ejecutivo', 'recargo del periodo ejecutivo', 'recargo del período ejecutivo', 'recargo extemporáneo', 'recargo extemporaneo', 'recargo por extemporaneidad', 'recargo por presentación fuera de plazo', 'recargo por presentacion fuera de plazo']],
  ['un donativo (art. 15.e LIS)', ['donativo', 'donación', 'donacion']],
];
export function noDeducibleIS(g) {
  if (g?.noDeducibleIS === false) return null;
  if (g?.noDeducibleIS === true) return { motivo: 'marcado como no deducible', marcado: true };
  if (Number(g?.ivaPct) > 0 || g?.porTipo?.some((t) => Number(t.ivaPct) > 0) || Number(g?.irpfPct) > 0) return null;
  const texto = ` ${g?.concepto || ''} ${g?.proveedor || ''} `.toLowerCase();
  const r = NO_DEDUCIBLES_IS.find(([, claves]) => claves.some((k) => encaja(texto, k)));
  return r ? { motivo: r[0], marcado: false } : null;
}

// Un gasto que parece un bien de inversión (equipo que dura años) y pasa de 300 €: Fisquo lo sugiere.
const PARECE_BIEN = ['ordenador', 'portátil', 'portatil', 'macbook', 'imac', 'ipad', 'tablet', 'iphone', 'móvil nuevo', 'impresora', 'monitor', 'altavo', 'equipo de sonido', 'mesa de mezclas', 'proyector', 'cámara', 'camara', 'furgoneta', 'coche', 'vehículo', 'vehiculo', 'moto', 'maquinaria', 'máquina', 'maquina', 'mobiliario', 'mueble', 'reforma', 'instalación', 'instalacion', 'focos', 'pantalla led'];
export const pareceBien = (g) => !g.inversion && g.base > 300 && PARECE_BIEN.some((k) => ` ${g.concepto || ''} `.toLowerCase().includes(k));
