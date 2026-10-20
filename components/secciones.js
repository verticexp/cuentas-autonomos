// Las pantallas que no caben en la barra: en el ordenador, la barra lateral por grupos; en el móvil, la pestaña «Más» (app/mas).
// Módulo sin 'use client': lo leen la barra (cliente) y la página /mas (servidor).
// Agrupadas por lo que se quiere hacer (vender, cobrar y pagar, Hacienda, equipo), no por áreas contables. Cada pantalla sale
// una sola vez: Ajustes, Usuarios e Importar viven en Ajustes; «Pregunta a Netto», en el buscador de «Más» (y en la barra lateral).
// tono: el color del grupo (app/mas.css). detalle: la línea de debajo en «Más». palabras: lo que también la encuentra en el buscador.
import { PARA_AUTONOMO, esSociedad } from '@/lib/modulos';
import { DETALLE } from '@/lib/permisos';
export const EXTRA = [
  { titulo: 'Vender', tono: 'verde', enlaces: [
    { href: '/clientes', permiso: 'facturas', nombre: 'Clientes', detalle: 'Fichas, riesgo y lo que te deben', palabras: 'contactos empresas', icono: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c1-4 4-6 7-6s6 2 7 6M17 3a4 4 0 0 1 0 8M22 21c-.5-2.5-2-4.5-4-5.5" /> },
    { href: '/presupuestos', permiso: 'facturas', nombre: 'Presupuestos', detalle: 'Ofertas que el cliente acepta', palabras: 'ofertas proformas', icono: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 14l1.6 1.6L15 12" /> },
    { href: '/facturas/recurrentes', permiso: 'facturas', nombre: 'Facturas recurrentes', detalle: 'Las que se emiten solas cada mes', palabras: 'cuotas suscripciones periodicas', icono: <path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4" /> },
    { href: '/facturas/caja', permiso: 'facturar', nombre: 'Caja', detalle: 'Cierre del día del TPV o el mostrador', palabras: 'tpv tickets mostrador cierre', icono: <><rect x="3" y="9" width="18" height="11" rx="2" /><path d="M7 9V5h10v4M7 14h4M15 14h2" /></> },
    { href: '/facturas/catalogo', permiso: 'facturas', nombre: 'Catálogo', detalle: 'Servicios y productos con su precio', palabras: 'tarifas precios servicios', icono: <path d="M3 12V4h8l10 10-8 8zM7.5 7.5h.01" /> },
    { href: '/inventario', permiso: 'facturas', inventario: true, nombre: 'Inventario', detalle: 'Stock, mínimos y valoración', palabras: 'stock almacen existencias productos', icono: <path d="M3 8l9-5 9 5v9l-9 5-9-5zM3 8l9 5 9-5M12 13v9" /> },
    { href: '/albaranes', permiso: 'facturar', inventario: true, nombre: 'Pedidos y albaranes', detalle: 'Entregas a clientes y pedidos', palabras: 'entregas pedidos', icono: <path d="M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12h8M8 16h5" /> },
  ] },
  { titulo: 'Cobrar y pagar', tono: 'azul', enlaces: [
    { href: '/banco', permiso: DETALLE, nombre: 'Banco', detalle: 'Movimientos y conciliación', palabras: 'cuenta extracto conciliar movimientos', icono: <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /> },
    { href: '/cartera', permiso: 'facturas', nombre: 'Cartera de cobros', detalle: 'Lo que te deben y cuándo vence', palabras: 'cobros pendientes deudas vencidas morosos', icono: <><circle cx="12" cy="12" r="8.5" /><path d="M14.8 9.2A3 3 0 0 0 12 8c-1.7 0-3 .9-3 2s1.3 1.6 3 2 3 .9 3 2-1.3 2-3 2a3 3 0 0 1-2.8-1.2M12 6.5V8M12 16v1.5" /></> },
    { href: '/tesoreria', permiso: 'resumen', nombre: 'Tesorería', detalle: 'Previsión de caja y remesas', palabras: 'prevision saldo remesas sepa liquidez', icono: <path d="M3 17l5-5 4 4 8-8M15 8h5v5" /> },
    { href: '/gastos/proveedores', permiso: 'gastos', nombre: 'Proveedores', detalle: 'Fichas y pagos pendientes', palabras: 'acreedores compras', icono: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /> },
  ] },
  { titulo: 'Hacienda y números', tono: 'ambar', enlaces: [
    { href: '/modelos', permiso: 'resumen', nombre: 'Impuestos', detalle: 'Modelos, plazos y lo que toca pagar', palabras: 'hacienda aeat modelos 303 130 111 115 iva irpf', icono: <><path d="M4 20h16M5 20V10h14v10M3 10l9-6 9 6" /><path d="M9.5 17l5-5M9.6 12.2h.01M14.4 16.8h.01" /></> },
    { href: '/contabilidad', permiso: DETALLE, nombre: 'Contabilidad', detalle: 'Libro diario, mayor y cuentas anuales', palabras: 'asientos diario mayor balance cuentas anuales', icono: <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6" /> },
    { href: '/analisis', permiso: 'resumen', nombre: 'Análisis', detalle: 'Ventas, gastos y márgenes', palabras: 'graficas informes estadisticas margen', icono: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
    { href: '/proyectos', permiso: 'resumen', nombre: 'Proyectos', detalle: 'Rentabilidad de cada trabajo', palabras: 'trabajos obras encargos', icono: <path d="M3 7h18v13H3zM8 7V4h8v3M3 12h18" /> },
  ] },
  { titulo: 'Equipo', tono: 'violeta', enlaces: [
    { href: '/nominas', permiso: 'nominas', nombre: 'Equipo y nóminas', detalle: 'Empleados, nóminas y modelo 111', palabras: 'empleados trabajadores sueldos', icono: <><rect x="3" y="6" width="18" height="13" rx="2" /><circle cx="9" cy="12" r="2.2" /><path d="M5.8 16.5c.5-1.3 1.7-2 3.2-2s2.7.7 3.2 2M15 11h3M15 14h2" /></> },
    { href: '/jornada', permiso: 'nominas', nombre: 'Registro de jornada', detalle: 'Fichajes y horas del equipo', palabras: 'fichar fichajes horas', icono: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> },
  ] },
];

// «Pregunta a Netto»: en el ordenador, al principio de la barra lateral; en el móvil, en el buscador de «Más».
export const ASISTENTE = { href: '/asistente', nombre: 'Pregunta a Netto', icono: <path d="M4 5h16v11H9l-5 4zM8 10h8M8 13h5" /> };

const TODAS = [...EXTRA.flatMap((g) => g.enlaces), ASISTENTE];
// La pantalla extra en la que se está (la más concreta), para marcarla.
export const extraDe = (path) => TODAS.filter((e) => path === e.href || path.startsWith(`${e.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

// Los grupos con solo lo que esta persona puede ver (permisos) y lo que esta empresa usa (inventario). Con la forma de la
// empresa (fiscal), las pantallas del autónomo llevan su nombre (lib/modulos.js PARA_AUTONOMO: «Libros registro»…); faltan: { href: plan } de lib/modulos.js, el plan
// que incluye cada pantalla que el suyo no tiene (se enseña al lado del nombre).
export const gruposVisibles = (permisos = [], inventario = false, { fiscal, faltan = {} } = {}) => EXTRA
  .map((g) => ({ ...g, enlaces: g.enlaces
    .filter((e) => (!e.permiso || [].concat(e.permiso).every((p) => permisos.includes(p))) && (!e.inventario || inventario))
    .map((e) => ({ ...e, ...(fiscal?.tipo && !esSociedad(fiscal) ? PARA_AUTONOMO[e.href] : {}), ...(faltan[e.href] ? { plan: faltan[e.href] } : {}) })) }))
  .filter((g) => g.enlaces.length > 0);
