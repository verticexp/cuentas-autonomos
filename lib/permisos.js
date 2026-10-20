// Qué puede hacer cada persona dentro de su empresa.
export const PERMISOS = [
  { id: 'resumen', nombre: 'Resumen e impuestos', detalle: 'Cifras del año, lo que va a Hacienda y los modelos 303 y 130. Con «Ver facturas» y «Ver gastos», también banco, contabilidad y el paquete de la gestoría' },
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
  { id: 'gestoria', nombre: 'Gestoría', permisos: ['resumen', 'facturas', 'gastos', 'nominas'] },
];

// Editar implica ver.
const IMPLICA = { facturar: 'facturas', gastar: 'gastos' };
export function limpiarPermisos(lista) {
  const s = new Set((Array.isArray(lista) ? lista : []).filter((p) => TODOS.includes(p)));
  for (const [a, b] of Object.entries(IMPLICA)) if (s.has(a)) s.add(b);
  return TODOS.filter((p) => s.has(p));
}

export const permisosDe = (u) => (u?.rol === 'admin' ? TODOS : limpiarPermisos(u?.permisos));
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
  if (puede(u, 'resumen')) return '/';
  if (puede(u, 'facturas')) return '/facturas';
  if (puede(u, 'gastos')) return '/gastos';
  return '/ajustes';
}
