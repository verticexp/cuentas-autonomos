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
      { t: 'Lista en segundos', d: 'Elige cliente y conceptos de tu catálogo. Kontix calcula IVA, IRPF y total al momento.' },
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
      ['¿Qué es Verifactu?', 'Es el sistema de la AEAT que obliga a que cada factura lleve una huella encadenada con la anterior y un código QR. Kontix los genera en cada factura.'],
      ['¿Puedo facturar con varias actividades?', 'Sí. Cada actividad (por ejemplo, consultoría y formación) tiene su propio IVA e IRPF por defecto.'],
    ],
  },
  {
    slug: 'gastos', icono: 'gasto', nombre: 'Gastos con IA', corto: 'Foto al ticket y listo',
    titulo: 'Haz una foto al ticket. Kontix hace el resto',
    sub: 'La IA lee tus tickets y facturas de proveedor, en foto o PDF, y rellena proveedor, fecha, base e IVA. Tú solo confirmas.',
    demo: 'ticket',
    puntos: [
      { t: 'Foto o PDF', d: 'Desde el móvil o arrastrando el archivo. Kontix lee los datos en segundos.' },
      { t: 'Proveedores ordenados', d: 'Cada gasto queda en la ficha de su proveedor, con su historial y lo pendiente de pagar.' },
      { t: 'Nada se te escapa', d: 'Un repaso de los gastos deducibles habituales te avisa de lo que aún no has apuntado.' },
    ],
    secciones: [
      { t: 'Dietas y kilometraje sin calculadora', d: 'Apunta tus desplazamientos y Kontix aplica los límites exentos de manutención y el importe por kilómetro.', l: ['Manutención en España y en el extranjero', 'Con o sin pernocta', 'Kilometraje calculado'], visual: 'dietas' },
      { t: 'Pendiente o pagado, siempre claro', d: 'Cada gasto tiene su estado. Ves de un vistazo lo que debes a cada proveedor y cuándo vence.', l: ['Estado pendiente o pagado', 'Ficha de proveedor', 'Gastos recurrentes automáticos'], visual: 'proveedores' },
    ],
    faqs: [
      ['¿Cuántas páginas de tickets puedo leer?', 'El cupo mensual depende del tipo de negocio y el plan: Autónomos tiene 50, 200 o 500 páginas; Pymes, 200, 600 o 1.500. Una imagen cuenta como una página y cada página del PDF también; se admiten hasta 10 páginas y 3 MB por PDF. Si vuelves a enviar una lectura, cuenta otra vez. El cupo es por empresa, lo comparte la gestoría, se renueva cada mes natural incluso con pago anual y no se acumula. Durante los 30 días de prueba hay 50 páginas en total; al empezar el periodo de pago se activa el cupo mensual del plan. Las lecturas enviadas a la IA cuentan aunque no guardes el gasto.'],
      ['¿Y si la IA se equivoca?', 'Siempre revisas los datos antes de guardar. Puedes corregir cualquier campo.'],
    ],
  },
  {
    slug: 'impuestos', icono: 'impuestos', nombre: 'Impuestos y modelos', corto: '303, 130, 111, 390, 347, Sociedades…',
    titulo: 'Tus impuestos, calculados antes de que te los pidan',
    sub: 'Kontix calcula tus modelos a partir de tus facturas y gastos. Sabes cuánto apartar cada trimestre, sin sustos en abril.',
    demo: 'calculadora',
    puntos: [
      { t: 'Modelos al día', d: 'IVA (303 y 390), pago fraccionado (130), retenciones (111, 115, 180 y 190), 347, 349, Sociedades (200 y 202) y la renta (100), calculados con tus datos.' },
      { t: 'Cuánto apartar', d: 'El panel te dice cuánto dinero reservar para Hacienda este trimestre.' },
      { t: 'Recordatorios', d: 'Te avisamos antes de cada plazo de presentación para que no se te pase.' },
    ],
    secciones: [
      { t: 'El paquete para tu gestoría, en un clic', d: 'Descarga el trimestre entero (facturas, gastos e impuestos) en Excel o PDF y envíaselo a tu gestoría. O dale acceso directo con el perfil de gestoría.', l: ['Paquete trimestral en Excel y PDF', 'Acceso de gestoría con permisos', 'Exportación a CSV'], visual: 'paquete' },
      { t: 'Pago fraccionado sin errores', d: 'Kontix lleva la cuenta de lo que ya has pagado en cada 130 y lo descuenta del siguiente.', l: ['Histórico de pagos fraccionados', 'Retenciones descontadas', 'Resumen anual para la renta'], visual: 'fraccionado' },
    ],
    faqs: [
      ['¿Kontix presenta los modelos por mí?', 'Kontix los calcula y te da las casillas. La presentación la haces tú o tu gestoría en la sede de la AEAT.'],
      ['¿Sustituye a mi gestor?', 'No. Le ahorra horas de trabajo y te ahorra a ti sorpresas, pero revisar y presentar sigue siendo cosa vuestra.'],
    ],
  },
  {
    slug: 'contabilidad', icono: 'contabilidad', nombre: 'Contabilidad', corto: 'Libros registro, balance y cuentas anuales',
    titulo: 'La contabilidad se hace sola mientras facturas',
    sub: 'Si eres autónomo, tus libros registro del IVA y del IRPF salen solos con el formato de Hacienda. Si eres sociedad, cada factura, gasto, cobro e impuesto genera su asiento: balance y cuentas anuales siempre al día.',
    demo: 'contabilidad',
    puntos: [
      { t: 'Libros registro para autónomos', d: 'Ingresos, gastos y bienes de inversión con el formato electrónico de la AEAT: lo que te piden en estimación directa.' },
      { t: 'Partida doble para sociedades', d: 'Libro diario, mayor y sumas y saldos a partir de lo que ya apuntas. Sin teclear asientos.' },
      { t: 'Amortizaciones solas', d: 'Marca un gasto como bien de inversión y Kontix lo amortiza con la tabla oficial, también en tus impuestos.' },
    ],
    secciones: [
      { t: 'Autónomo: tus libros registro, listos para Hacienda', d: 'En estimación directa la ley te pide los libros de ingresos, gastos y bienes de inversión, y los del IVA. Kontix los saca unificados con el formato electrónico de la AEAT, con tus amortizaciones y retenciones, para un requerimiento o para el Pre303.', l: ['Formato electrónico común de la AEAT', 'Un Excel por libro, con el nombre oficial', 'Resultados y balance de regalo, para ti o tu banco'], visual: 'libros' },
      { t: 'Cuentas anuales listas para el Registro', d: 'Balance, pérdidas y ganancias, cambios en el patrimonio neto y memoria con los modelos oficiales de pymes. Kontix te dice qué modelo te toca y te recuerda los plazos.', l: ['Memoria rellenada con tus cifras', 'Certificado de aprobación de la junta', 'PDF para firmar y depositar'], visual: 'anuales' },
      { t: 'Bienes de inversión sin hojas de cálculo', d: 'El ordenador, la furgoneta o la maquinaria se amortizan por días con el coeficiente oficial. El IVA se deduce entero y en el 130 o en Sociedades solo cuenta la amortización.', l: ['Libro registro de bienes de inversión', 'Tablas de autónomos y de sociedades', 'Hasta 300 €, gasto del año'], visual: 'amortizaciones' },
      { t: 'Cámbiate desde cualquier programa', d: 'Sube el balance de sumas y saldos y el inventario de bienes de Holded, A3, Sage o Contasol. Kontix crea la apertura y sigue donde lo dejaste, sin contar nada dos veces.', l: ['Saldos de apertura desde Excel', 'Amortizaciones que continúan', 'Facturas y gastos pendientes incluidos'], visual: 'migracion' },
    ],
    faqs: [
      ['¿Necesito saber contabilidad?', 'No. Kontix genera los asientos con lo que ya haces: facturar, apuntar gastos y conciliar el banco. Tu gestor puede añadir asientos de ajuste si los necesita.'],
      ['¿Puedo depositar las cuentas anuales con Kontix?', 'Kontix prepara las cuentas con los epígrafes oficiales, la memoria y el certificado. El depósito se hace en el Registro Mercantil con sus modelos (o tu gestor): solo tienes que copiar las cifras.'],
      ['¿Qué se descarga para mi gestor?', 'Un Excel con libro diario, mayor, sumas y saldos, pérdidas y ganancias, balance y bienes de inversión.'],
      ['Soy autónomo, ¿necesito balance?', 'No, salvo que tengas una actividad mercantil en estimación directa normal. En estimación directa simplificada solo te piden los libros registro del IVA y del IRPF y el de bienes de inversión, y Kontix te los da con el formato de Hacienda. Resultados y balance te enseñan tu beneficio real y te los puede pedir el banco. Las cuentas anuales solo las depositan las sociedades.'],
    ],
  },
  {
    slug: 'inventario', icono: 'inventario', nombre: 'Inventario', corto: 'Stock, mínimos y qué pedir',
    titulo: 'Tu almacén, al día sin contar a mano',
    sub: 'Cada factura resta del stock y cada compra lo suma. Kontix te avisa cuando algo llega al mínimo, te prepara el pedido y valora tu almacén a coste medio.',
    demo: 'inventario',
    puntos: [
      { t: 'Stock que se mueve solo', d: 'Al facturar un producto del catálogo baja su stock; una rectificativa lo devuelve; una compra con sus líneas lo sube. La IA lee las líneas de la factura del proveedor.' },
      { t: 'Avisos y qué pedir', d: 'Stock mínimo por producto, aviso al facturar más de lo que hay y la lista de qué pedir a cada proveedor, lista para copiar.' },
      { t: 'Valor y margen reales', d: 'Coste medio ponderado, margen por producto y lo que lleva meses parado. A fin de año, la variación de existencias entra sola en la contabilidad.' },
    ],
    secciones: [
      { t: 'Qué pedir, por proveedor', d: 'Lo que está en su mínimo, agrupado por proveedor y con la cantidad para llegar a tu stock ideal. Lo copias y lo mandas por correo o WhatsApp.', l: ['Stock mínimo y «pedir hasta»', 'Agrupado por proveedor', 'Aviso los lunes en el móvil'], visual: 'pedido' },
      { t: 'Recuentos, roturas y stock inicial', d: 'Cuenta lo que hay y Kontix apunta la diferencia. Las roturas y pérdidas salen a su coste. Cada movimiento enlaza con su factura o su compra.', l: ['Recuento en un paso', 'Historial de cada producto', 'Excel del inventario a cualquier fecha'], visual: 'margen' },
    ],
    faqs: [
      ['¿Lo necesito si vendo servicios?', 'No. El inventario se activa en Ajustes solo si vendes productos; los servicios del catálogo no llevan stock.'],
      ['¿Cómo valora el almacén?', 'A coste medio ponderado: cada compra recalcula el coste de lo que tienes. Es el método que admite Hacienda y el que va a tu balance.'],
      ['¿Lleva varios almacenes o lotes?', 'De momento, un solo almacén y sin lotes ni caducidades. Si los necesitas, cuéntanoslo.'],
    ],
  },
  {
    slug: 'banco', icono: 'banco', nombre: 'Banco y conciliación', corto: 'Sube el extracto, Kontix concilia',
    titulo: 'Sube tu extracto. Kontix lo cuadra todo',
    sub: 'Sube el extracto de tu banco en Norma 43, CSV, Excel o PDF. Kontix empareja cada cobro con su factura y cada pago con su gasto, y lo que falta te sale para revisar.',
    demo: 'conciliacion',
    puntos: [
      { t: 'Cualquier banco', d: 'Norma 43, CSV, Excel o el PDF del banco, que lee la IA. Kontix nunca duplica movimientos.' },
      { t: 'Emparejado automático', d: 'Por importe, número de factura o nombre del cliente o proveedor. Confirmas uno a uno o todos los seguros de golpe.' },
      { t: 'Nada se queda fuera', d: 'Los cargos sin gasto salen en revisión para añadirlos con su factura; comisiones, préstamos o pagos a Hacienda se apuntan con un toque.' },
    ],
    secciones: [
      { t: 'Cada cobro, en su factura', d: 'Al confirmar un emparejamiento, la factura queda cobrada y el gasto pagado, con la fecha del banco. ¿Te equivocaste? Se deshace con un toque.', l: ['Factura cobrada con fecha del banco', 'Deshacer en cualquier momento', 'Saldo real de todas tus cuentas'], visual: 'emparejado' },
      { t: 'Lo que está en el banco y no en Kontix, en revisión', d: 'Ese cargo de Amazon que nadie apuntó aparece en Gastos para añadirlo con su factura. Y Kontix reconoce comisiones, cuotas de autónomos, préstamos, nóminas o pagos a Hacienda y te propone qué hacer con cada uno.', l: ['Gastos sin factura, en revisión', 'Comisiones y cuotas apuntadas solas', 'Aviso cada mes para subir el extracto'], visual: 'revision' },
    ],
    proximamente: 'Conexión directa con tu banco: estamos trabajando en ello. Mientras tanto, subir el extracto lleva menos de un minuto.',
    faqs: [
      ['¿Qué formatos acepta?', 'Norma 43 (el formato estándar de la banca española), CSV, Excel y PDF. Todos los bancos permiten descargar al menos uno.'],
      ['¿Y si subo el mismo extracto dos veces?', 'No pasa nada: Kontix detecta los movimientos repetidos y no los duplica.'],
      ['¿Se puede conectar el banco directamente?', 'La conexión directa está prevista para más adelante. Ahora subes los extractos de tu banco y Kontix extrae los movimientos para conciliarlos con tus facturas y gastos.'],
    ],
  },
  {
    slug: 'tesoreria', icono: 'tesoreria', nombre: 'Tesorería', corto: 'Previsión de caja a 12 meses',
    titulo: 'Sabe hoy cuánto dinero tendrás en seis meses',
    sub: 'La previsión de caja de Kontix suma tus cobros pendientes, pagos, impuestos y nóminas, y te enseña mes a mes con cuánto cuentas.',
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
      { t: 'Invita a tu equipo y a tu gestoría', d: 'Envía invitaciones por email desde Kontix. Caducan a los 7 días y se pueden reenviar. Tu gestoría entra con su propio perfil: ve tus facturas y gastos sin tocarlos.', l: ['Roles de administrador y miembro', 'Perfil de gestoría sin poder marcar cobros', 'Invitaciones que caducan'], visual: 'invitaciones' },
      { t: 'Una suscripción por empresa', d: 'Los planes de Autónomos y Pymes incluyen una empresa. Para varias sociedades o equipos, Business permite acordar el alcance y un precio cerrado por contacto.', l: ['Datos separados por empresa', 'Equipos y accesos según acuerdo', 'Propuesta Business a medida'], visual: 'empresas' },
    ],
    faqs: [['¿Cuántos usuarios puedo tener?', 'Autónomos incluye 1 usuario interno en Esencial y Pro, y 3 en Plus. Pymes incluye 3, 8 o 15. Todos incluyen 1 acceso separado de gestoría sin consumir usuarios internos. Para otros equipos, consulta Business.']],
  },
  {
    slug: 'asistente', icono: 'asistente', nombre: 'Asistente IA', corto: 'Pregunta a tus cuentas',
    titulo: 'Pregúntale a tus cuentas como a una persona',
    sub: 'El asistente de Kontix responde con tus propias cifras: cuánto has facturado, quién te debe, cuánto IVA toca este trimestre.',
    demo: 'asistente',
    puntos: [
      { t: 'Con tus datos', d: 'Responde a partir de tus facturas, gastos e impuestos, no con generalidades.' },
      { t: 'En lenguaje normal', d: 'Pregunta como hablas: «¿quién me debe más?» o «¿cómo voy este trimestre?».' },
      { t: 'Siempre a mano', d: 'Desde cualquier pantalla de Kontix, en el móvil o en el ordenador.' },
    ],
    secciones: [],
    faqs: [['¿El asistente sustituye a un asesor?', 'No. Te da respuestas rápidas con tus cifras, pero las decisiones fiscales importantes conviene revisarlas con tu gestor.']],
  },
];

export const funcion = (slug) => FUNCIONES.find((f) => f.slug === slug);

export const EXTRAS = [
  { icono: 'importar', t: 'Cámbiate desde otro programa', d: 'Clientes, facturas, saldos contables y bienes de inversión desde Holded, A3, Sage o Contasol.' },
  { icono: 'nube', t: 'Copia en Google Drive', d: 'Conecta tu Drive y Kontix guarda ahí una copia de cada factura.' },
  { icono: 'candado', t: 'Face ID y llaves de acceso', d: 'Abre Kontix con tu cara o tu huella.' },
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
    sub: 'Factura en segundos, apunta gastos con una foto y sabe cada trimestre cuánto apartar para Hacienda. Desde 9 € al mes sin IVA.',
    dolores: [
      ['Facturas en Word o Excel', 'Plantilla profesional, numeración correlativa y Verifactu en cada factura.'],
      ['Tickets perdidos en la cartera', 'Foto al ticket y la IA lo apunta por ti.'],
      ['Sustos con el IVA y el 130', 'Tus modelos calculados y lo que debes apartar, siempre a la vista.'],
      ['Mil correos con tu gestoría', 'Acceso para tu gestoría o el paquete trimestral en un clic.'],
      ['Libros registro a mano', 'Tus libros de IVA e IRPF, con el formato de Hacienda y tus amortizaciones.'],
    ],
    funciones: ['facturacion', 'gastos', 'impuestos', 'banco'],
  },
  {
    id: 'pym', ruta: '/pymes', icono: 'tienda', n: 'Pymes', desde: 25,
    titulo: 'Facturas, contabilidad, equipo y caja de tu pyme en un solo sitio',
    sub: 'Facturación, contabilidad y cuentas anuales, conciliación, nóminas y jornada desde 25 € al mes sin IVA. Añade operaciones y previsión de caja con Pro.',
    dolores: [
      ['Cada uno con su Excel', 'Un solo Kontix con permisos por área para cada persona.'],
      ['No sabes cuánta caja tendrás', 'Previsión a 3, 6 y 12 meses desde tu saldo real.'],
      ['Conciliar a mano cada mes', 'Sube el extracto y Kontix empareja cobros y pagos.'],
      ['Nóminas y fichajes aparte', 'Nóminas y registro de jornada dentro de Kontix.'],
      ['La contabilidad, en otro programa', 'Diario, balance y cuentas anuales salen solos de tus facturas.'],
      ['El stock en una hoja de cálculo', 'Cada venta y cada compra mueven el stock; Kontix te dice qué pedir.'],
    ],
    funciones: ['contabilidad', 'banco', 'tesoreria', 'equipo'],
  },
  {
    id: 'business', ruta: '/business', icono: 'edificio', n: 'Business',
    titulo: 'Control financiero para grupos y equipos grandes',
    sub: 'Una propuesta a medida para varias sociedades o equipos: acordamos contigo el alcance, los accesos y un precio cerrado antes de empezar.',
    dolores: [
      ['Varias sociedades, varias herramientas', 'Un alcance acordado para tus sociedades, con datos separados y accesos definidos.'],
      ['Accesos que nadie controla', 'Roles y permisos por área, e invitaciones que caducan.'],
      ['Auditorías y gestorías', 'Perfiles para gestorías y exportaciones completas.'],
      ['Implantaciones eternas', 'Sube los saldos de tu programa actual y sigue donde lo dejaste.'],
    ],
    funciones: ['contabilidad', 'equipo', 'tesoreria', 'banco'],
  },
];

export const segmento = (id) => SEGMENTOS.find((s) => s.id === id);

// «Todo lo del plan anterior» va en `herencia`; cada plan lista solo lo que añade.
export const PLANES = {
  aut: [
    { n: 'Esencial', p: 9, para: 'Facturar y declarar sin sustos', l: ['Facturas, presupuestos y recurrentes', 'Gastos y escaneo IA · 50 páginas/mes', 'Modelos aplicables y libros registro', 'Bienes de inversión y amortizaciones', 'Extractos, saldo y resumen', '1 empresa · 1 usuario interno + gestoría'] },
    { n: 'Pro', p: 12, para: 'Más control por 3 € más al mes', fuerte: true, herencia: 'Esencial', l: ['Conciliación, revisión del banco y previsión', 'Inventario, pedidos y albaranes', 'Cartera de cobros', 'Análisis de ventas, gastos y margen', 'Asistente IA con tus cifras', 'Escaneo IA · 200 páginas/mes'] },
    { n: 'Plus', p: 20, para: 'Para crecer con un pequeño equipo', herencia: 'Pro', l: ['Rentabilidad por proyecto', '1 empresa · 2 usuarios internos + gestoría', 'Nóminas y jornada para 1 empleado', 'Atención prioritaria', 'Escaneo IA · 500 páginas/mes'] },
  ],
  pym: [
    { n: 'Esencial', p: 25, para: 'Lo que una sociedad necesita', l: ['Facturación, presupuestos y recurrentes', 'Gastos y lectura IA · 200 páginas/mes', 'Contabilidad, cuentas anuales e Impuesto sobre Sociedades', 'Extractos, conciliación y revisión del banco', '1 empresa · 2 usuarios internos + gestoría', 'Nóminas y jornada para 3 empleados'] },
    { n: 'Pro', p: 32, para: 'Todo el control por 7 € más al mes', fuerte: true, herencia: 'Esencial', l: ['Cartera de cobros y previsión de caja', 'Pedidos, albaranes e inventario', 'Remesas SEPA y análisis financiero con ratios', 'Rentabilidad por proyecto y asistente IA', '8 usuarios internos · 15 empleados', 'Escaneo IA · 600 páginas/mes · soporte prioritario'] },
    { n: 'Plus', p: 55, para: 'Más capacidad con las funciones de Pro', herencia: 'Pro', l: ['1 empresa · 15 usuarios internos + gestoría', 'Nóminas y jornada para 30 empleados', 'Incorporación guiada', 'Escaneo IA · 1.500 páginas/mes'] },
  ],
  gra: [
    { n: 'Esencial', p: 45, para: 'Control para estructuras grandes', l: ['Todo lo de Pymes Plus', '5 empresas · 20 usuarios', 'Nóminas y jornada (hasta 50 empleados)', 'Roles y permisos por área', 'Acceso para gestorías y auditores', 'Soporte prioritario'] },
    { n: 'Pro', p: 75, para: 'Grupos de empresas', fuerte: true, herencia: 'Esencial', l: ['15 empresas · 50 usuarios', 'Nóminas y jornada (hasta 150 empleados)', 'Escaneos IA sin límite práctico', 'Incorporación guiada'] },
    { n: 'Plus', p: 110, para: 'Sin techos que te frenen', herencia: 'Pro', l: ['40 empresas · usuarios ilimitados', 'Nóminas y jornada (hasta 500 empleados)', 'Gestor de cuenta y soporte dedicado'] },
  ],
};

// Tabla comparativa: [fila, valores por plan (true = incluido, texto = límite)].
const COMUNES = [
  ['Cuenta y servicios incluidos', [
    ['Empresas por suscripción', ['1', '1', '1']],
    ['Acceso separado de gestoría (no consume usuarios)', ['1', '1', '1']],
    ['Portal del cliente y avisos push', [true, true, true]],
    ['Exportación de datos y importación desde otro programa', [true, true, true]],
    ['Seguridad y copias de respaldo', [true, true, true]],
  ]],
];
const OPERACIONES = {
  aut: [
    ['Operaciones y análisis', [
      ['Inventario, pedidos y albaranes', [false, true, true]],
      ['Revisión de gastos del banco', [false, true, true]],
      ['Previsión de caja', [false, true, true]],
      ['Cartera de cobros', [false, true, true]],
      ['Análisis de ventas, gastos y margen', [false, true, true]],
      ['Asistente IA', [false, true, true]],
      ['Rentabilidad por proyecto', [false, false, true]],
    ]],
  ],
  pym: [
    ['Operaciones y análisis', [
      ['Revisión de gastos del banco', [true, true, true]],
      ['Inventario, pedidos y albaranes', [false, true, true]],
      ['Previsión de caja', [false, true, true]],
      ['Cartera de cobros y remesas SEPA', [false, true, true]],
      ['Análisis financiero y ratios', [false, true, true]],
      ['Rentabilidad por proyecto', [false, true, true]],
      ['Asistente IA', [false, true, true]],
    ]],
  ],
};
export const COMPARATIVA = {
  aut: [
    ...COMUNES,
    ['Lectura IA', [['Páginas al mes', ['50', '200', '500']]]],
    ['Facturación, gastos y fiscalidad', [
      ['Facturas y presupuestos ilimitados', [true, true, true]],
      ['Verifactu: huella y QR', [true, true, true]],
      ['Clientes, catálogo y recurrentes', [true, true, true]],
      ['Gastos y proveedores', [true, true, true]],
      ['Cálculo de modelos aplicables (presentas tú o tu gestoría)', [true, true, true]],
      ['Libros registro y amortizaciones', [true, true, true]],
      ['Varias actividades', [true, true, true]],
      ['Extractos N43, CSV, Excel y PDF, saldo y resumen', [true, true, true]],
      ['Conciliación bancaria', [false, true, true]],
    ]],
    ...OPERACIONES.aut,
    ['Equipo y atención', [
      ['Usuarios internos', ['1', '1', '2']],
      ['Nóminas y jornada', [false, false, '1 empleado']],
      ['Soporte', ['Email', 'Email', 'Prioritario']],
    ]],
  ],
  pym: [
    ...COMUNES,
    ['Lectura IA', [['Páginas al mes', ['200', '600', '1.500']]]],
    ['Facturación, contabilidad y banco', [
      ['Facturas, presupuestos, catálogo y recurrentes', [true, true, true]],
      ['Verifactu: huella y QR', [true, true, true]],
      ['Gastos y proveedores', [true, true, true]],
      ['Cálculo de modelos aplicables (presentas tú o tu gestoría)', [true, true, true]],
      ['Contabilidad, balance, cuentas anuales e Impuesto sobre Sociedades', [true, true, true]],
      ['Bienes de inversión y amortizaciones', [true, true, true]],
      ['Varias actividades', [true, true, true]],
      ['Extractos N43, CSV, Excel y PDF, saldo y resumen', [true, true, true]],
      ['Conciliación bancaria', [true, true, true]],
    ]],
    ...OPERACIONES.pym,
    ['Equipo y atención', [
      ['Usuarios internos con permisos', ['2', '8', '15']],
      ['Nóminas y jornada', ['3 empleados', '15 empleados', '30 empleados']],
      ['Soporte', ['Email', 'Prioritario', 'Prioritario']],
      ['Incorporación guiada', [false, false, true]],
    ]],
  ],
};

export const PERSONALIZADO = ['Alcance para varias sociedades o equipos', 'Usuarios y empleados según acuerdo', 'Implantación y servicios definidos contigo', 'Precio cerrado por contacto'];

export const FAQ_GENERAL = [
  ['¿Puedo traer mis datos de otro programa?', 'Sí. Kontix importa clientes, facturas y gastos desde Holded o cualquier Excel, y para la contabilidad, el balance de sumas y saldos y los bienes de inversión de Holded, A3, Sage o Contasol. Sigues donde lo dejaste.'],
  ['¿Controla el stock?', 'Sí, si vendes productos: cada factura resta y cada compra suma, con stock mínimo, qué pedir a cada proveedor, margen por producto y el valor del almacén a coste medio.'],
  ['¿Kontix lleva la contabilidad?', 'Sí, por partida doble y con el plan contable de pymes: libro diario, mayor, pérdidas y ganancias, balance, amortizaciones y cuentas anuales, generados con lo que ya apuntas.'],
  ['¿Qué pasa cuando acaba la prueba?', 'Nada se borra. Eliges plan o te llevas tus datos: puedes exportar tus facturas y registros en cualquier momento.'],
  ['¿Puede mi gestoría entrar?', 'Sí. La invitas por email con el perfil de gestoría: ve tus facturas, gastos e impuestos sin poder marcar cobros ni crear facturas, y lleva las nóminas de tu equipo si se las dejas.'],
  ['¿Funciona en el móvil?', 'Se instala como app desde el navegador, con barra de pestañas en el móvil y panel lateral en el ordenador. La app para iPhone está en preparación.'],
  ['¿Se conecta con mi banco?', 'Ahora subes el extracto de tu banco (Norma 43, CSV, Excel o PDF) y Kontix extrae los movimientos para conciliarlos con tus facturas y gastos. Lo que no coincide queda para revisar. La conexión directa está prevista para más adelante.'],
];

export const FAQ_PRECIOS = [
  ['¿Los precios llevan IVA y son por empresa?', 'Los precios no incluyen IVA y corresponden a una empresa por suscripción. Para varias sociedades, Business ofrece alcance y precio cerrado por contacto.'],
  ['¿Necesito tarjeta para la prueba?', 'No. Puedes probar Kontix durante 30 días sin tarjeta.'],
  ['¿Mi gestoría consume un usuario?', 'No. Los seis planes incluyen 1 acceso separado para tu gestoría, además de los usuarios internos del plan.'],
  ['¿Qué diferencia hay entre Pro, Plus y Business?', 'Pro añade operaciones, previsión y análisis a Esencial. Plus conserva las funciones de Pro y amplía el equipo; en Autónomos añade nóminas, jornada y rentabilidad por proyecto, y en Pymes incorporación guiada. Business es una oferta a medida para varias sociedades o equipos, con alcance y precio acordados por contacto.'],
  ['¿Cuántas páginas de lectura IA incluye cada plan?', 'Autónomos: 50 en Esencial, 200 en Pro y 500 en Plus. Pymes: 200 en Esencial, 600 en Pro y 1.500 en Plus. La cuota se comparte por empresa con la gestoría, se renueva cada mes natural también en pago anual y no se acumula. La prueba incluye 50 páginas en total; la cuota mensual del plan empieza con el periodo de pago. Una imagen cuenta una página y cada página del PDF una lectura, hasta 10 páginas y 3 MB por PDF. Volver a enviar una lectura consume otra página. Cuentan las lecturas enviadas a la IA aunque no guardes el gasto.'],
  ['¿Qué pasa al agotar las páginas?', 'Puedes seguir registrando gastos a mano y subiendo extractos en CSV, Excel o Norma 43. Puedes cambiar de plan o solicitar una ampliación por contacto: te confirmamos el precio y las condiciones antes de contratar, sin cargos automáticos. Los PDF bancarios comparten la bolsa de páginas con las facturas y tickets.'],
  ['¿Puedo cambiar de plan?', 'Puedes elegir otro plan desde tu suscripción. Antes de confirmar verás las condiciones y el importe del cambio.'],
  ['¿Cómo funciona el pago anual?', 'Ahorras un 30 % sobre las mensualidades. Mostramos el equivalente mensual y el importe total que se cobra al año, sin IVA.'],
  ['¿Presentáis los impuestos automáticamente?', 'No. Kontix calcula los modelos aplicables a tu situación; tú o tu gestoría los revisáis y presentáis.'],
];
