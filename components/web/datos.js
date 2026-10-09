// Contenido de la web pública. Solo lo que Netto hace hoy; lo que viene va en PROXIMAMENTE.
export const CONTACTO = 'corporate@nettohq.com';
export const DESCUENTO = 30;

export const FUNCIONES = [
  {
    slug: 'facturacion', icono: 'factura', nombre: 'Facturación', corto: 'Facturas y presupuestos con tu marca',
    titulo: 'Facturas y presupuestos que se hacen solos',
    sub: 'Numeración correlativa, IVA e IRPF por actividad, tu logo y tu color. Envía, cobra y olvídate de las plantillas de Word.',
    demo: 'factura',
    puntos: [
      { t: 'Lista en segundos', d: 'Elige cliente y conceptos de tu catálogo. Netto calcula IVA, IRPF y total al momento.' },
      { t: 'Preparada para Verifactu', d: 'Cada factura lleva su huella encadenada y su código QR, como pide la AEAT.' },
      { t: 'Cobros bajo control', d: 'Estado cobrada o pendiente, plazo de cobro configurable y aviso de las vencidas.' },
    ],
    secciones: [
      { t: 'Presupuestos que tu cliente acepta con un clic', d: 'Crea presupuestos con varios conceptos y envíaselos con un enlace. Tu cliente lo acepta desde el móvil y lo conviertes en factura sin volver a teclear.', l: ['Varios conceptos y descuentos', 'Aceptación online desde un enlace', 'De presupuesto a factura en un paso'], visual: 'presupuesto' },
      { t: 'Portal del cliente', d: 'Cada cliente tiene su enlace privado para ver y descargar todas sus facturas y presupuestos. Sin cuentas, sin correos de «¿me reenvías la factura?».', l: ['Facturas y presupuestos en un solo enlace', 'Descarga en PDF', 'Sin que tu cliente tenga que registrarse'], visual: 'portal' },
      { t: 'Recurrentes y catálogo', d: 'Las cuotas mensuales se facturan solas en su fecha. Guarda tus productos y servicios con su precio e IVA y factúralos con dos toques.', l: ['Facturas recurrentes automáticas', 'Catálogo de productos y servicios', 'Clientes con sus datos fiscales'], visual: 'recurrentes' },
    ],
    faqs: [
      ['¿Puedo poner mi logo?', 'Sí. Subes tu logo y eliges tu color: se aplican a tus facturas y presupuestos.'],
      ['¿Qué es Verifactu?', 'Es el sistema de la AEAT que obliga a que cada factura lleve una huella encadenada con la anterior y un código QR. Netto los genera en cada factura.'],
      ['¿Puedo facturar con varias actividades?', 'Sí. Cada actividad (por ejemplo, consultoría y formación) tiene su propio IVA e IRPF por defecto.'],
    ],
  },
  {
    slug: 'gastos', icono: 'gasto', nombre: 'Gastos con IA', corto: 'Foto al ticket y listo',
    titulo: 'Haz una foto al ticket. Netto hace el resto',
    sub: 'La IA lee tus tickets y facturas de proveedor, en foto o PDF, y rellena proveedor, fecha, base e IVA. Tú solo confirmas.',
    demo: 'ticket',
    puntos: [
      { t: 'Foto o PDF', d: 'Desde el móvil o arrastrando el archivo. Netto lee los datos en segundos.' },
      { t: 'Proveedores ordenados', d: 'Cada gasto queda en la ficha de su proveedor, con su historial y lo pendiente de pagar.' },
      { t: 'Nada se te escapa', d: 'Un repaso de los gastos deducibles habituales te avisa de lo que aún no has apuntado.' },
    ],
    secciones: [
      { t: 'Dietas y kilometraje sin calculadora', d: 'Apunta tus desplazamientos y Netto aplica los límites exentos de manutención y el importe por kilómetro.', l: ['Manutención en España y en el extranjero', 'Con o sin pernocta', 'Kilometraje calculado'], visual: 'dietas' },
      { t: 'Pendiente o pagado, siempre claro', d: 'Cada gasto tiene su estado. Ves de un vistazo lo que debes a cada proveedor y cuándo vence.', l: ['Estado pendiente o pagado', 'Ficha de proveedor', 'Gastos recurrentes automáticos'], visual: 'proveedores' },
    ],
    faqs: [
      ['¿Cuántos tickets puedo escanear?', 'Hasta 100 al día por usuario, de sobra para el día a día de cualquier negocio.'],
      ['¿Y si la IA se equivoca?', 'Siempre revisas los datos antes de guardar. Puedes corregir cualquier campo.'],
    ],
  },
  {
    slug: 'impuestos', icono: 'impuestos', nombre: 'Impuestos y modelos', corto: '303, 130, 111, 115, 100…',
    titulo: 'Tus impuestos, calculados antes de que te los pidan',
    sub: 'Netto calcula tus modelos a partir de tus facturas y gastos. Sabes cuánto apartar cada trimestre, sin sustos en abril.',
    demo: 'calculadora',
    puntos: [
      { t: 'Modelos al día', d: '303 de IVA, 130 de pago fraccionado, 111 y 115 de retenciones y la renta (100), calculados con tus datos.' },
      { t: 'Cuánto apartar', d: 'El panel te dice cuánto dinero reservar para Hacienda este trimestre.' },
      { t: 'Recordatorios', d: 'Te avisamos antes de cada plazo de presentación para que no se te pase.' },
    ],
    secciones: [
      { t: 'El paquete para tu gestoría, en un clic', d: 'Descarga el trimestre entero (facturas, gastos e impuestos) en Excel o PDF y envíaselo a tu gestoría. O dale acceso directo con el perfil de gestoría.', l: ['Paquete trimestral en Excel y PDF', 'Acceso de gestoría con permisos', 'Exportación a CSV'], visual: 'paquete' },
      { t: 'Pago fraccionado sin errores', d: 'Netto lleva la cuenta de lo que ya has pagado en cada 130 y lo descuenta del siguiente.', l: ['Histórico de pagos fraccionados', 'Retenciones descontadas', 'Resumen anual para la renta'], visual: 'fraccionado' },
    ],
    faqs: [
      ['¿Netto presenta los modelos por mí?', 'Netto los calcula y te da las casillas. La presentación la haces tú o tu gestoría en la sede de la AEAT.'],
      ['¿Sustituye a mi gestor?', 'No. Le ahorra horas de trabajo y te ahorra a ti sorpresas, pero revisar y presentar sigue siendo cosa vuestra.'],
    ],
  },
  {
    slug: 'banco', icono: 'banco', nombre: 'Banco y conciliación', corto: 'Sube el extracto, Netto concilia',
    titulo: 'Sube tu extracto. Netto lo cuadra todo',
    sub: 'Importa los movimientos de tu banco en Norma 43, CSV o Excel. Netto empareja cada cobro con su factura y cada pago con su gasto.',
    demo: 'conciliacion',
    puntos: [
      { t: 'Cualquier banco', d: 'Norma 43, CSV o Excel. Netto reconoce las columnas solo y nunca duplica movimientos.' },
      { t: 'Emparejado automático', d: 'Por importe, número de factura o nombre del cliente o proveedor. Confirmas uno a uno o todos los seguros de golpe.' },
      { t: 'Saldo real', d: 'El saldo de todas tus cuentas en un solo número, punto de partida de tu previsión de caja.' },
    ],
    secciones: [
      { t: 'Cada cobro, en su factura', d: 'Al confirmar un emparejamiento, la factura queda cobrada y el gasto pagado, con la fecha del banco. ¿Te equivocaste? Se deshace con un toque.', l: ['Factura cobrada con fecha del banco', 'Deshacer en cualquier momento', 'Ignorar movimientos que no cuentan'], visual: 'emparejado' },
    ],
    proximamente: 'Conexión directa con tu banco: estamos trabajando en ello. Mientras tanto, subir el extracto lleva menos de un minuto.',
    faqs: [
      ['¿Qué formatos acepta?', 'Norma 43 (el formato estándar de la banca española), CSV y Excel. Todos los bancos permiten descargar al menos uno.'],
      ['¿Y si subo el mismo extracto dos veces?', 'No pasa nada: Netto detecta los movimientos repetidos y no los duplica.'],
      ['¿Se puede conectar el banco directamente?', 'Todavía no. Es una de las próximas funciones de Netto.'],
    ],
  },
  {
    slug: 'tesoreria', icono: 'tesoreria', nombre: 'Tesorería', corto: 'Previsión de caja a 12 meses',
    titulo: 'Sabe hoy cuánto dinero tendrás en seis meses',
    sub: 'La previsión de caja de Netto suma tus cobros pendientes, pagos, impuestos y nóminas, y te enseña mes a mes con cuánto cuentas.',
    demo: 'prevision',
    puntos: [
      { t: '3, 6 o 12 meses', d: 'Elige el horizonte y mira tu saldo previsto al final de cada mes.' },
      { t: 'Todo cuenta', d: 'Facturas pendientes, gastos, recurrentes, impuestos trimestrales y nóminas.' },
      { t: 'Desde tu saldo real', d: 'Parte del saldo de tus extractos, no de una estimación.' },
    ],
    secciones: [
      { t: 'Tu año de un vistazo', d: 'Facturado, gastado y beneficio mes a mes, con la curva del beneficio acumulado y la comparación con el año anterior.', l: ['Resumen anual y por trimestre', 'Clientes que más facturan', 'Exportación a CSV'], visual: 'resumen' },
    ],
    faqs: [['¿De dónde saca el saldo?', 'Del último extracto que hayas subido o del saldo que pongas a mano.']],
  },
  {
    slug: 'equipo', icono: 'equipo', nombre: 'Equipo y nóminas', corto: 'Nóminas, jornada y permisos',
    titulo: 'Tu equipo, tus nóminas y tus permisos, en orden',
    sub: 'Empleados, nóminas y registro de jornada en la misma herramienta que tus cuentas. Y cada persona ve solo lo que le toca.',
    demo: 'permisos',
    puntos: [
      { t: 'Nóminas', d: 'Empleados con su salario y retenciones. Las nóminas alimentan solas el 111 y la previsión de caja.' },
      { t: 'Registro de jornada', d: 'Fichaje de entrada y salida desde el móvil, como exige la ley.' },
      { t: 'Permisos por área', d: 'Resumen, facturar, gastos, nóminas, usuarios… Activa solo lo que cada uno necesita.' },
    ],
    secciones: [
      { t: 'Invita a tu equipo y a tu gestoría', d: 'Envía invitaciones por email desde Netto. Caducan a los 7 días y se pueden reenviar. Tu gestoría entra con su propio perfil: ve tus facturas y gastos sin tocarlos.', l: ['Roles de administrador y miembro', 'Perfil de gestoría sin poder marcar cobros', 'Invitaciones que caducan'], visual: 'invitaciones' },
      { t: 'Varias empresas, una sola cuenta', d: '¿Llevas más de una sociedad? Cambia de empresa con un toque, cada una con sus datos, su marca y su equipo.', l: ['Cambio de empresa al instante', 'Datos separados por empresa', 'Marca propia en cada una'], visual: 'empresas' },
    ],
    faqs: [['¿Cuántos usuarios puedo tener?', 'Depende del plan: desde 1 en Autónomos Esencial hasta ilimitados en Grandes empresas Plus.']],
  },
  {
    slug: 'asistente', icono: 'asistente', nombre: 'Asistente IA', corto: 'Pregunta a tus cuentas',
    titulo: 'Pregúntale a tus cuentas como a una persona',
    sub: 'El asistente de Netto responde con tus propias cifras: cuánto has facturado, quién te debe, cuánto IVA toca este trimestre.',
    demo: 'asistente',
    puntos: [
      { t: 'Con tus datos', d: 'Responde a partir de tus facturas, gastos e impuestos, no con generalidades.' },
      { t: 'En lenguaje normal', d: 'Pregunta como hablas: «¿quién me debe más?» o «¿cómo voy este trimestre?».' },
      { t: 'Siempre a mano', d: 'Desde cualquier pantalla de Netto, en el móvil o en el ordenador.' },
    ],
    secciones: [],
    faqs: [['¿El asistente sustituye a un asesor?', 'No. Te da respuestas rápidas con tus cifras, pero las decisiones fiscales importantes conviene revisarlas con tu gestor.']],
  },
];

export const funcion = (slug) => FUNCIONES.find((f) => f.slug === slug);

export const EXTRAS = [
  { icono: 'importar', t: 'Importa desde Holded', d: 'Trae tus clientes y facturas sin teclear.' },
  { icono: 'nube', t: 'Copia en Google Drive', d: 'Tus facturas, también en tu Drive.' },
  { icono: 'candado', t: 'Face ID y llaves de acceso', d: 'Abre Netto con tu cara o tu huella.' },
  { icono: 'campana', t: 'Avisos push', d: 'Cobros, vencimientos y plazos fiscales.' },
  { icono: 'movil', t: 'Se instala como app', d: 'En el móvil y en el ordenador.' },
  { icono: 'documento', t: 'Portal del cliente', d: 'Tus clientes descargan sus facturas.' },
];

export const PROXIMAMENTE = [
  { t: 'Conexión directa con tu banco', d: 'Movimientos al día sin subir extractos.' },
  { t: 'Cobros con tarjeta y Bizum', d: 'Que tus clientes paguen la factura desde el enlace.' },
  { t: 'App para iPhone', d: 'En la App Store.' },
  { t: 'Entrar con Google y Apple', d: 'Sin contraseñas que recordar.' },
];

export const SEGMENTOS = [
  {
    id: 'aut', ruta: '/autonomos', icono: 'persona', n: 'Autónomos', desde: 9,
    titulo: 'La gestión de un autónomo, sin perder tus tardes',
    sub: 'Factura en segundos, apunta gastos con una foto y sabe cada trimestre cuánto apartar para Hacienda. Desde 9 € al mes.',
    dolores: [
      ['Facturas en Word o Excel', 'Plantilla profesional, numeración correlativa y Verifactu en cada factura.'],
      ['Tickets perdidos en la cartera', 'Foto al ticket y la IA lo apunta por ti.'],
      ['Sustos con el IVA y el 130', 'Tus modelos calculados y lo que debes apartar, siempre a la vista.'],
      ['Mil correos con tu gestoría', 'Acceso para tu gestoría o el paquete trimestral en un clic.'],
    ],
    funciones: ['facturacion', 'gastos', 'impuestos', 'asistente'],
  },
  {
    id: 'pym', ruta: '/pymes', icono: 'tienda', n: 'Pymes', desde: 25,
    titulo: 'Facturas, equipo y caja de tu pyme en un solo sitio',
    sub: 'Usuarios con permisos, nóminas y registro de jornada, conciliación y previsión de caja. Todo conectado. Desde 25 € al mes.',
    dolores: [
      ['Cada uno con su Excel', 'Un solo Netto con permisos por área para cada persona.'],
      ['No sabes cuánta caja tendrás', 'Previsión a 3, 6 y 12 meses desde tu saldo real.'],
      ['Conciliar a mano cada mes', 'Sube el extracto y Netto empareja cobros y pagos.'],
      ['Nóminas y fichajes aparte', 'Nóminas y registro de jornada dentro de Netto.'],
    ],
    funciones: ['equipo', 'banco', 'tesoreria', 'facturacion'],
  },
  {
    id: 'gra', ruta: '/grandes-empresas', icono: 'edificio', n: 'Grandes empresas', desde: 45,
    titulo: 'Control financiero para grupos y equipos grandes',
    sub: 'Varias empresas, decenas de usuarios y cientos de empleados con roles y permisos claros. Desde 45 € al mes.',
    dolores: [
      ['Varias sociedades, varias herramientas', 'Todas tus empresas en una cuenta, cambiando con un toque.'],
      ['Accesos que nadie controla', 'Roles y permisos por área, e invitaciones que caducan.'],
      ['Auditorías y gestorías', 'Perfiles para gestorías y exportaciones completas.'],
      ['Implantaciones eternas', 'Incorporación guiada y migración de tus datos.'],
    ],
    funciones: ['equipo', 'tesoreria', 'impuestos', 'banco'],
  },
];

export const segmento = (id) => SEGMENTOS.find((s) => s.id === id);

// «Todo lo del plan anterior» va en `herencia`; cada plan lista solo lo que añade.
export const PLANES = {
  aut: [
    { n: 'Esencial', p: 9, para: 'Facturar y declarar sin sustos', l: ['Facturas y presupuestos ilimitados', 'Verifactu: huella encadenada y QR', 'Clientes, catálogo y recurrentes', 'Gastos y proveedores', 'Escaneo de tickets y PDF con IA', 'Modelos 303, 130 y 100 calculados', 'Extractos del banco y saldo', 'Importación desde Holded', '1 empresa · 1 usuario'] },
    { n: 'Pro', p: 12, para: 'Que tus cuentas cuadren solas', fuerte: true, herencia: 'Esencial', l: ['Conciliación automática de extractos', 'Previsión de caja a 3, 6 y 12 meses', 'Asistente IA con tus cifras', 'Varias actividades con su IVA e IRPF', 'Acceso para tu gestoría', 'Portal del cliente', 'Recordatorios y avisos push'] },
    { n: 'Plus', p: 20, para: 'Para quien lo lleva todo', herencia: 'Pro', l: ['Hasta 3 empresas', 'Hasta 3 usuarios con permisos', 'Nóminas y jornada (2 empleados)', 'Escaneos IA ampliados', 'Soporte prioritario'] },
  ],
  pym: [
    { n: 'Esencial', p: 25, para: 'Equipo pequeño, finanzas claras', l: ['Todo lo de Autónomos Pro', '1 empresa · 3 usuarios con permisos', 'Nóminas y jornada (hasta 5 empleados)', 'Conciliación y previsión de caja', 'Modelos 303, 130, 111, 115', 'Acceso para tu gestoría', 'Escaneo IA para todo el equipo', 'Soporte por email'] },
    { n: 'Pro', p: 35, para: 'Varias empresas, un solo panel', fuerte: true, herencia: 'Esencial', l: ['3 empresas · 8 usuarios', 'Nóminas y jornada (hasta 15 empleados)', 'Roles y permisos por área', 'Varias actividades por empresa', 'Escaneos IA ampliados', 'Soporte prioritario'] },
    { n: 'Plus', p: 55, para: 'Cuando el equipo ya es grande', herencia: 'Pro', l: ['5 empresas · 15 usuarios', 'Nóminas y jornada (hasta 30 empleados)', 'Incorporación guiada y migración'] },
  ],
  gra: [
    { n: 'Esencial', p: 45, para: 'Control para estructuras grandes', l: ['Todo lo de Pymes Plus', '5 empresas · 20 usuarios', 'Nóminas y jornada (hasta 50 empleados)', 'Roles y permisos por área', 'Acceso para gestorías y auditores', 'Soporte prioritario'] },
    { n: 'Pro', p: 75, para: 'Grupos de empresas', fuerte: true, herencia: 'Esencial', l: ['15 empresas · 50 usuarios', 'Nóminas y jornada (hasta 150 empleados)', 'Escaneos IA sin límite práctico', 'Incorporación guiada'] },
    { n: 'Plus', p: 110, para: 'Sin techos que te frenen', herencia: 'Pro', l: ['40 empresas · usuarios ilimitados', 'Nóminas y jornada (hasta 500 empleados)', 'Gestor de cuenta y soporte dedicado'] },
  ],
};

// Tabla comparativa: [fila, valores por plan (true = incluido, texto = límite)].
export const COMPARATIVA = {
  aut: [
    ['Facturación', [
      ['Facturas y presupuestos ilimitados', [true, true, true]], ['Verifactu', [true, true, true]], ['Recurrentes y catálogo', [true, true, true]], ['Portal del cliente', [false, true, true]],
    ]],
    ['Gastos e impuestos', [
      ['Escaneo con IA', ['Incluido', 'Incluido', 'Ampliado']], ['Modelos 303, 130 y 100', [true, true, true]], ['Varias actividades', [false, true, true]],
    ]],
    ['Banco y caja', [
      ['Extractos N43, CSV y Excel', [true, true, true]], ['Conciliación automática', [false, true, true]], ['Previsión de caja', [false, true, true]],
    ]],
    ['Equipo', [
      ['Empresas', ['1', '1', '3']], ['Usuarios', ['1', '1 + gestoría', '3']], ['Nóminas y jornada', [false, false, '2 empleados']],
    ]],
    ['Extras', [['Asistente IA', [false, true, true]], ['Soporte', ['Email', 'Email', 'Prioritario']]]],
  ],
  pym: [
    ['Cuenta', [['Empresas', ['1', '3', '5']], ['Usuarios', ['3', '8', '15']], ['Empleados en nómina', ['5', '15', '30']]]],
    ['Funciones', [
      ['Facturación, gastos e impuestos', [true, true, true]], ['Conciliación y previsión de caja', [true, true, true]], ['Roles y permisos por área', ['Básicos', true, true]], ['Varias actividades por empresa', [false, true, true]], ['Escaneo con IA', ['Incluido', 'Ampliado', 'Ampliado']],
    ]],
    ['Servicio', [['Soporte', ['Email', 'Prioritario', 'Prioritario']], ['Incorporación guiada', [false, false, true]]]],
  ],
  gra: [
    ['Cuenta', [['Empresas', ['5', '15', '40']], ['Usuarios', ['20', '50', 'Ilimitados']], ['Empleados en nómina', ['50', '150', '500']]]],
    ['Funciones', [['Todo Netto', [true, true, true]], ['Perfiles para gestorías y auditores', [true, true, true]], ['Escaneo con IA', ['Ampliado', 'Sin límite práctico', 'Sin límite práctico']]]],
    ['Servicio', [['Soporte', ['Prioritario', 'Prioritario', 'Dedicado']], ['Incorporación guiada', [false, true, true]], ['Gestor de cuenta', [false, false, true]]]],
  ],
};

export const PERSONALIZADO = ['Más empresas, usuarios o empleados', 'Plantillas de factura a tu medida', 'Migración completa de tus datos', 'Funciones e integraciones a medida'];

export const FAQ_GENERAL = [
  ['¿Puedo traer mis datos de otro programa?', 'Sí. Netto importa tus clientes y facturas desde Holded y desde archivos de otras plataformas, sin que tengas que volver a teclear nada.'],
  ['¿Qué pasa cuando acaba la prueba?', 'Nada se borra. Eliges plan o te llevas tus datos: puedes exportar tus facturas y registros en cualquier momento.'],
  ['¿Puede mi gestoría entrar?', 'Sí. La invitas por email con el perfil de gestoría: ve tus facturas, gastos e impuestos sin poder marcar cobros ni crear facturas, y lleva las nóminas de tu equipo si se las dejas.'],
  ['¿Funciona en el móvil?', 'Se instala como app desde el navegador, con barra de pestañas en el móvil y panel lateral en el ordenador. La app para iPhone está en preparación.'],
  ['¿Se conecta con mi banco?', 'De momento trabajas con extractos (Norma 43, CSV o Excel), que Netto concilia solo. La conexión directa con el banco está en camino.'],
];

export const FAQ_PRECIOS = [
  ['¿Los precios llevan IVA?', 'No. Todos los precios se muestran sin IVA.'],
  ['¿Necesito tarjeta para la prueba?', 'No. Pruebas Netto un mes entero sin dar ninguna tarjeta.'],
  ['¿Puedo cambiar de plan?', 'Cuando quieras. Subes o bajas de plan y se ajusta a partir del siguiente periodo.'],
  ['¿Qué es el precio de fundador?', 'Un precio especial para los primeros negocios que confían en Netto. Pregúntanos al pedir acceso.'],
  ['¿Y si necesito algo que no está en ningún plan?', 'Para eso está el plan personalizado: cuéntanos qué necesitas y te damos un precio cerrado.'],
];
