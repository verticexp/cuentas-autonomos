// Las pantallas que no caben en la barra: en el ordenador, la barra lateral por grupos; en el móvil, la pestaña «Más» (app/mas).
// Módulo sin 'use client': lo leen la barra (cliente) y la página /mas (servidor).
export const EXTRA = [
  { titulo: 'Ventas', enlaces: [
    { href: '/presupuestos', permiso: 'facturas', nombre: 'Presupuestos', icono: <path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h3" /> },
    { href: '/facturas/recurrentes', permiso: 'facturas', nombre: 'Recurrentes', icono: <path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4" /> },
    { href: '/facturas/caja', permiso: 'facturar', nombre: 'Caja', icono: <><rect x="3" y="9" width="18" height="11" rx="2" /><path d="M7 9V5h10v4M7 14h4M15 14h2" /></> },
    { href: '/inventario', permiso: 'facturas', inventario: true, nombre: 'Inventario', icono: <path d="M3 8l9-5 9 5v9l-9 5-9-5zM3 8l9 5 9-5M12 13v9" /> },
    { href: '/albaranes', permiso: 'facturar', inventario: true, nombre: 'Pedidos y albaranes', icono: <path d="M7 3h10l3 3v15H4V3zM8 9h8M8 13h8M8 17h5" /> },
    { href: '/facturas/catalogo', permiso: 'facturas', nombre: 'Catálogo', icono: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /> },
  ] },
  { titulo: 'Finanzas', enlaces: [
    { href: '/asistente', nombre: 'Pregunta a Netto', icono: <path d="M4 5h16v11H9l-5 4zM8 10h8M8 13h5" /> },
    { href: '/tesoreria', permiso: 'resumen', nombre: 'Tesorería', icono: <path d="M3 17l5-5 4 4 8-8M15 8h5v5" /> },
    { href: '/banco', permiso: 'resumen', nombre: 'Banco', icono: <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /> },
    { href: '/proyectos', permiso: 'resumen', nombre: 'Proyectos', icono: <path d="M3 7h18v13H3zM8 7V4h8v3M3 12h18" /> },
    { href: '/contabilidad', permiso: 'resumen', nombre: 'Contabilidad', icono: <path d="M4 4h16v16H4zM4 9h16M4 14h16M10 9v11" /> },
    { href: '/modelos', permiso: 'resumen', nombre: 'Impuestos', icono: <path d="M4 21V9l8-6 8 6v12M9 21v-7h6v7" /> },
    { href: '/gastos/proveedores', permiso: 'gastos', nombre: 'Proveedores', icono: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /> },
    { href: '/nominas', permiso: 'nominas', nombre: 'Equipo y nóminas', icono: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c1-4 4-6 7-6s6 2 7 6M17 3a4 4 0 0 1 0 8M22 21c-.5-2.5-2-4.5-4-5.5" /> },
    { href: '/jornada', permiso: 'nominas', nombre: 'Registro de jornada', icono: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> },
  ] },
  { titulo: 'Empresa', enlaces: [
    { href: '/ajustes/importar', permiso: 'empresa', nombre: 'Importar datos', icono: <path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3" /> },
    { href: '/usuarios', permiso: 'usuarios', nombre: 'Usuarios', icono: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /> },
    { href: '/ajustes', nombre: 'Ajustes', icono: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></> },
  ] },
];
// La pantalla extra en la que se está (la más concreta), para marcarla.
export const extraDe = (path) => EXTRA.flatMap((g) => g.enlaces).filter((e) => path === e.href || path.startsWith(`${e.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;


// Los grupos con solo lo que esta persona puede ver (permisos) y lo que esta empresa usa (inventario).
export const gruposVisibles = (permisos = [], inventario = false) => EXTRA
  .map((g) => ({ ...g, enlaces: g.enlaces.filter((e) => (!e.permiso || permisos.includes(e.permiso)) && (!e.inventario || inventario)) }))
  .filter((g) => g.enlaces.length > 0);
