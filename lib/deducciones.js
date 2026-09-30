// Gastos deducibles habituales para un autónomo DJ / organizador de eventos (estimación directa).
// clave: palabras que, si aparecen en el concepto de algún gasto, lo dan por cubierto.
export const DEDUCCIONES = [
  { t: 'Cuota de autónomos', d: 'Deducible al 100 % en el IRPF (sin IVA). Añádela arriba con «Cuota de autónomos».', clave: ['cuota', 'autónomo', 'autonomo', 'reta', 'seguridad social'] },
  { t: 'Equipo de DJ', d: 'Controladora, auriculares, altavoces, cables, pendrives. Si una pieza pasa de 300 €, tu gestor puede repartirla en varios años.', clave: ['controladora', 'auricular', 'airpod', 'altavo', 'pendrive', 'cable', 'mesa', 'cdj', 'pioneer'] },
  { t: 'Software y música', d: 'Rekordbox, Serato, Ableton, Beatport, Bandcamp, Tidal o Spotify si los usas para pinchar.', clave: ['rekordbox', 'serato', 'ableton', 'beatport', 'bandcamp', 'tidal', 'spotify', 'soundcloud', 'software', 'suscrip'] },
  { t: 'Teléfono e internet', d: 'La parte que usas para trabajar (lo habitual es un 50 %). Necesitas la factura a tu nombre.', clave: ['teléfono', 'telefono', 'movil', 'móvil', 'fibra', 'internet', 'movistar', 'vodafone', 'orange', 'digi'] },
  { t: 'Desplazamientos a bolos y eventos', d: 'Peajes, parking, tren, taxi o gasolina con factura. El coche tiene límites: consúltalo con tu gestor.', clave: ['gasolina', 'peaje', 'parking', 'taxi', 'uber', 'cabify', 'tren', 'renfe', 'combustible'] },
  { t: 'Gestoría y asesoría', d: 'Deducible al 100 %, IVA incluido.', clave: ['gestor', 'asesor'] },
  { t: 'Seguro de responsabilidad civil', d: 'Si tienes uno para tus actuaciones o eventos.', clave: ['seguro'] },
  { t: 'Web, dominio y publicidad', d: 'Dominio y hosting de verticexp.com, anuncios en Instagram o Google, diseño, fotos promocionales.', clave: ['dominio', 'hosting', 'web', 'vercel', 'publicidad', 'instagram', 'meta', 'google ads', 'anuncio'] },
  { t: 'Proveedores de Vértice', d: 'Armadores, catering, personal, decoración: todo lo que pagas para organizar un evento, con su factura.', clave: ['armador', 'charter', 'catering', 'barco', 'med travel', 'proveedor'] },
  { t: 'Comisiones bancarias', d: 'De la cuenta que usas para cobrar las facturas.', clave: ['comisión', 'comision', 'banco', 'bbva', 'stripe', 'paypal'] },
  { t: 'Formación', d: 'Cursos de producción, DJ o gestión de eventos relacionados con tu actividad.', clave: ['curso', 'formación', 'formacion', 'masterclass'] },
];

export const cubierta = (ded, gastos) => gastos.some((g) => ded.clave.some((c) => g.concepto.toLowerCase().includes(c)));
