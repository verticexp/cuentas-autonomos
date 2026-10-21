const num = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
// Espacio no separable: el € nunca se queda solo en la línea de abajo.
export const eur = (n) => `${num.format(n)}\u00A0€`;
// El % va separado de la cifra, como en el resto de textos («21 %»), con espacio no separable.
export const pct = (n) => `${num.format(n)}\u00A0%`;
// 21 % o 12,5 %: para las columnas estrechas de las líneas de factura.
export const pctCorto = (n) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n)}\u00A0%`;
// 2026-10-15 → 15/10/2026 (como se escribe una fecha en España y en las facturas).
export const fechaCorta = (f) => f.split('-').reverse().join('/');
// Nombre de un documento para el archivo (PDF, adjunto, título de la pestaña): en mayúsculas, con sus acentos y eñes
// («FUNDACIÓ MÚSICA VIVA», «PEÑA») y sin signos que molesten en un nombre de archivo. Antes cada sitio lo limpiaba a su
// manera y en algunos «MÚSICA» salía «MSICA» y «PEÑA», «PEA».
export const nombreArchivoDoc = (numero, nombre, prefijo = '') => `${prefijo}${numero} ${String(nombre || '').toUpperCase().replace(/[^\p{L}\p{N} ]+/gu, '').replace(/\s+/g, ' ').trim()}`.trim();
export const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
export const eurSin = (n) => num.format(n);
export const fechaTexto = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
// Estado de un trimestre del 303/130 en texto (ver situacionTrimestre en calculos.js); `plazo` es la fecha límite
// en texto («20 de octubre») y `nota`, un añadido opcional («se marca en el 130»).
export function textoSituacion({ estado, dias }, plazo, nota) {
  const extra = nota ? ` · ${nota}` : '';
  if (estado === 'curso') return `En curso · se presenta hasta el ${plazo}`;
  if (estado === 'fuera') return `Fuera de plazo · venció el ${plazo}${extra}`;
  const hasta = dias === 0 ? `hasta hoy, ${plazo}` : dias === 1 ? `hasta mañana, ${plazo}` : `hasta el ${plazo}`;
  return `Listo para presentar · ${hasta}${extra}`;
}
// «Evento del 12-06-2026 en Hotel Arts»: para facturas y presupuestos de eventos.
export const textoEvento = (x) => (x.evento?.fecha || x.evento?.lugar ? `Evento${x.evento.fecha ? ` del ${fechaCorta(x.evento.fecha)}` : ''}${x.evento.lugar ? ` en ${x.evento.lugar}` : ''}` : '');

// Texto para copiar o compartir del trimestre que toca presentar: periodo, plazo e importes del 303 y el 130.
// `m303` y `m130` son { importe, compensar? } o null si la persona no presenta ese modelo. `otros`: el resto de modelos
// de la tarjeta ({ modelo, texto, plazo? }, lib/presentar.js), con su plazo si no es el mismo.
export function textoResumenModelos({ t, anio, plazo, m303, m130, otros = [] }) {
  const l = [`Fisquo · ${t}T ${anio} · se presenta hasta el ${plazo}`];
  // Igual que la tarjeta: «sin importe a ingresar» en vez de «0,00 €».
  const linea = (m) => (m.compensar ? `a compensar ${eur(m.compensar)}` : m.importe ? `a ingresar ${eur(m.importe)}` : 'sin importe a ingresar');
  if (m303) l.push(`303 (IVA): ${linea(m303)}`);
  if (m130) l.push(`130 (IRPF): ${linea(m130)}`);
  for (const m of otros) l.push(`${m.modelo}: ${m.texto.charAt(0).toLowerCase()}${m.texto.slice(1)}${m.plazo ? ` (hasta el ${m.plazo})` : ''}`);
  l.push('Orientativo: revísalo con tu gestor antes de presentar.');
  return l.join('\n');
}
