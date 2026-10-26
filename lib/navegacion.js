// Atajos del «+» en el móvil: qué se puede crear y en qué orden, según los permisos y cómo trabaja la empresa.
// Sin lecturas a la base de datos: solo el perfil que ya viene con el usuario (lib/empresa.js).

export const ATAJOS = {
  ticket: { id: 'ticket', href: '/gastos?escanear=1', nombre: 'Escanear ticket', detalle: 'Foto de un ticket o factura de un gasto', permiso: 'gastar' },
  // Las facturas que ya tienes en el móvil (PDF del correo, fotos): van a «Por revisar» (lib/bandeja.js).
  facturas: { id: 'facturas', href: '/gastos?subir=1', nombre: 'Subir facturas', detalle: 'PDF o fotos de facturas de gasto, una o varias', permiso: 'gastar' },
  factura: { id: 'factura', href: '/facturas/nueva', nombre: 'Nueva factura', detalle: 'Para un cliente, con su IVA e IRPF', permiso: 'facturar' },
  cierre: { id: 'cierre', href: '/facturas/caja', nombre: 'Cierre de caja', detalle: 'Las ventas del día del TPV o la caja', permiso: 'facturar' },
  albaran: { id: 'albaran', href: '/albaranes/nuevo?tipo=albaran', nombre: 'Albarán', detalle: 'Entrega de productos a un cliente', permiso: 'facturar', inventario: true },
  presupuesto: { id: 'presupuesto', href: '/presupuestos/nuevo', nombre: 'Presupuesto', detalle: 'Una oferta que el cliente puede aceptar', permiso: 'facturar' },
};

// Lo que más hace cada tipo de empresa va arriba: la tienda, el cierre; el autónomo, el ticket; la sociedad, la factura.
const ORDEN = {
  tienda: ['cierre', 'ticket', 'facturas', 'factura', 'albaran', 'presupuesto'],
  autonomo: ['ticket', 'facturas', 'factura', 'presupuesto', 'cierre', 'albaran'],
  sociedad: ['factura', 'ticket', 'facturas', 'presupuesto', 'albaran', 'cierre'],
};

export function perfilAtajos(fiscal = {}) {
  if (fiscal.inventario || fiscal.iva === 'recargo') return 'tienda';
  return fiscal.tipo === 'sociedad' ? 'sociedad' : 'autonomo';
}

// En la pantalla de cada cosa, lo suyo va primero (es lo que el «+» creaba ahí): en Facturas, la factura aunque la empresa
// sea una tienda; en Gastos, el ticket. La caja va antes que /facturas porque cuelga de ella.
const PRIMERO = [['/presupuestos', 'presupuesto'], ['/facturas/caja', 'cierre'], ['/facturas', 'factura'], ['/gastos', 'ticket'], ['/albaranes', 'albaran']];

// permisos: los del usuario; fiscal: el perfil fiscal de la empresa; en: la pantalla en la que se está.
export function atajosDe({ permisos = [], fiscal = {}, inventario = Boolean(fiscal.inventario), en = '' } = {}) {
  const orden = [...ORDEN[perfilAtajos({ ...fiscal, inventario })]];
  const ruta = String(en).split('?')[0];
  const primero = PRIMERO.find(([r]) => ruta === r || ruta.startsWith(`${r}/`))?.[1];
  if (primero) orden.unshift(...orden.splice(orden.indexOf(primero), 1));
  return orden.map((id) => ATAJOS[id]).filter((a) => permisos.includes(a.permiso) && (!a.inventario || inventario));
}

// Buscador de «Más» (components/MasLista.js): sin acentos ni mayúsculas, cada palabra tiene que estar en el nombre, el
// detalle o las palabras clave de la pantalla.
export const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function buscar(enlaces, texto) {
  const q = normalizar(texto).split(/\s+/).filter(Boolean);
  if (!q.length) return enlaces;
  return enlaces.filter((e) => {
    const donde = normalizar(`${e.nombre} ${e.detalle || ''} ${e.palabras || ''}`);
    return q.every((p) => donde.includes(p));
  });
}
