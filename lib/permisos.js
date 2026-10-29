import { soloDocumentos } from './perfilDocumentos.js';

// Qué puede hacer cada persona dentro de su empresa.
export const PERMISOS = [
  { id: 'resumen', nombre: 'Resumen e impuestos', detalle: 'Cifras del año, lo que va a Hacienda y los modelos 303 y 130. Con «Ver facturas» y «Ver gastos», también banco, contabilidad y el paquete de la gestoría' },
  { id: 'contabilidad', nombre: 'Contabilidad', detalle: 'Apuntar y borrar asientos, la memoria de las cuentas anuales, marcar modelos como presentados y los datos que deciden los impuestos (prorrata, rendimiento, cuota del Impuesto sobre Sociedades). Incluye ver el resumen, las facturas y los gastos' },
  { id: 'facturas', nombre: 'Ver facturas', detalle: 'Lista, detalle y PDF' },
  { id: 'facturar', nombre: 'Crear y editar facturas', detalle: 'Incluye rectificar, duplicar, borrar y marcar como cobradas' },
  { id: 'gastos', nombre: 'Ver gastos', detalle: 'Lista y detalle' },
  { id: 'gastar', nombre: 'Apuntar y editar gastos', detalle: 'Incluye la cuota de autónomos' },
  { id: 'empresa', nombre: 'Datos de la empresa', detalle: 'Datos de facturación, marca, Google Drive y Controla\'T' },
  { id: 'nominas', nombre: 'Empleados y nóminas', detalle: 'Sueldos del equipo, nóminas y retenciones (modelo 111)' },
  { id: 'usuarios', nombre: 'Usuarios', detalle: 'Cambiar permisos y quitar el acceso' },
];
const TODOS = PERMISOS.map((p) => p.id);

export const PERFILES = [
  { id: 'admin', nombre: 'Administrador', permisos: TODOS },
  { id: 'facturacion', nombre: 'Facturación', permisos: ['facturas', 'facturar'] },
  { id: 'gastos', nombre: 'Gastos', permisos: ['gastos', 'gastar'] },
  { id: 'gestoria', nombre: 'Gestoría', permisos: ['resumen', 'contabilidad', 'facturas', 'gastos', 'nominas'] },
];

// Editar implica ver; contabilizar, ver todo lo que entra en la contabilidad.
const IMPLICA = { facturar: ['facturas'], gastar: ['gastos'], contabilidad: ['resumen', 'facturas', 'gastos'] };
export function limpiarPermisos(lista) {
  const s = new Set((Array.isArray(lista) ? lista : []).filter((p) => TODOS.includes(p)));
  for (const [a, b] of Object.entries(IMPLICA)) if (s.has(a)) b.forEach((x) => s.add(x));
  return TODOS.filter((p) => s.has(p));
}

// Versión de los permisos guardados (pv). Antes de la 2 no existía «Contabilidad» y contabilizaba quien veía resumen,
// facturas y gastos (auditoría de octubre de 2026, Codex H3): quien tenía el perfil Gestoría lo conserva.
export const VERSION_PERMISOS = 2;
const GESTORIA_ANTES = ['resumen', 'facturas', 'gastos', 'nominas'];
function guardados(u) {
  const l = limpiarPermisos(u?.permisos);
  return (u?.pv || 1) < VERSION_PERMISOS && l.join() === limpiarPermisos(GESTORIA_ANTES).join() ? limpiarPermisos([...l, 'contabilidad']) : l;
}

export const permisosDe = (u) => (u?.rol === 'admin' ? TODOS : guardados(u));
export const puede = (u, p) => (Array.isArray(p) ? p.every((x) => permisosDe(u).includes(x)) : permisosDe(u).includes(p));
// Libros, contabilidad, banco y paquete de la gestoría enseñan cada factura y cada gasto: además del resumen, hay que
// poder verlos (informe de seguridad M4).
export const DETALLE = ['resumen', 'facturas', 'gastos'];

// Nombre del perfil que coincide con unos permisos, o «Personalizado».
export function perfilDe(u) {
  if (u.rol === 'admin') return 'Administrador';
  const p = permisosDe(u).join();
  return PERFILES.find((x) => x.id !== 'admin' && limpiarPermisos(x.permisos).join() === p)?.nombre || 'Personalizado';
}

// Primera pantalla a la que puede entrar (para no mandarle a una que no puede ver).
export function inicioDe(u) {
  if (soloDocumentos(u)) return '/documentos';
  // La gente de un despacho sin permisos en su empresa (los gestores) trabaja desde Mi despacho.
  if (u?.despacho && !u.viaDespacho && !permisosDe(u).length) return '/despacho';
  if (puede(u, 'resumen')) return '/';
  if (puede(u, 'facturas')) return '/facturas';
  if (puede(u, 'gastos')) return '/gastos';
  return '/ajustes';
}
