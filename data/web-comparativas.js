// Comparativas de la web pública (/comparativa). Regla: de otros programas solo se publica lo que se ha comprobado en su
// web pública de precios y con fecha. Nada de funciones, opiniones ni cifras que no estén aquí. Para actualizarlas, se
// vuelve a mirar su web, se cambian los datos y se sube FECHA_VERIFICACION. Lo de Fisquo (precios, planes) no se escriben
// aquí: salen de components/web/datos.js para que nunca contradigan la página de precios. Los textos llevan marcas que
// la página sustituye por esos precios: {min} y {max} (plan más barato y más caro), {aut} y {pym} (precio de entrada de
// Autónomos y de Pymes).

// Día en que se comprobaron los precios y las condiciones de los rivales en sus webs públicas.
export const FECHA_VERIFICACION = '2026-10-30';

// Precio con coma decimal, como lo publican: 19.95 → «19,95».
export const euros = (n) => String(n).replace('.', ',');

export const RIVALES = [
  {
    slug: 'holded',
    nombre: 'Holded',
    web: 'https://www.holded.com',
    desde: 15,
    hasta: 199,
    // Lo único que se afirma de este rival (precios publicados el día de la verificación).
    publicado: [
      'Planes de 15 a 199 € al mes, sin IVA, con los tres primeros meses a mitad de precio.',
      'El inventario (25 € al mes) y las nóminas (5 € por empleado al mes) se contratan aparte, como complementos.',
    ],
    titulo: 'Fisquo frente a Holded',
    descripcion: 'Fisquo y Holded comparados con sus precios publicados (verificados el 30 de octubre de 2026): cuánto cuesta cada uno y cuándo te conviene uno u otro.',
    intro: 'Holded publica planes de 15 a 199 € al mes. Fisquo tiene seis planes cerrados, de {min} a {max} € al mes. Aquí van los precios tal como están publicados y cuándo te conviene cada uno.',
    convieneRival: [
      ['Quieres un CRM y gestión de proyectos en el mismo programa.', 'Holded los presenta en su web como parte de sus planes. Fisquo se centra en facturación, gastos, impuestos y contabilidad.'],
      ['Quieres una plataforma que pueda crecer con más módulos y usuarios, y asumes pagar aparte parte de ello.', 'Sus planes llegan hasta 199 € al mes.'],
      ['Ya trabajas con Holded y te encaja.', 'Cambiar de programa cuesta tiempo y solo compensa si algo te falla o te sobra.'],
    ],
    convieneFisquo: [
      ['Quieres saber el precio de antemano.', 'Los planes de Fisquo son cerrados: Autónomos desde {aut} € al mes y Pymes desde {pym} € (sin IVA). El inventario, las nóminas y el acceso de tu gestoría vienen dentro del plan que corresponda.'],
      ['Eres autónomo o una pyme y quieres facturar y leer tus tickets con IA en el mismo sitio.', 'Fisquo calcula también tus modelos (303, 130, 111…) con lo que ya has apuntado.'],
      ['Quieres traerte tus datos de Holded.', 'Fisquo importa clientes, facturas y gastos desde Holded o desde un Excel, y para la contabilidad, el balance de sumas y saldos y los bienes de inversión.'],
      ['Quieres que tu gestoría entre sin ocupar un usuario.', 'Cada suscripción incluye un acceso de gestoría aparte, que no consume usuarios del plan.'],
    ],
    faqs: [
      ['¿Puedo importar mis datos de Holded a Fisquo?', 'Sí. Fisquo importa clientes, facturas y gastos desde Holded o desde cualquier Excel, y para la contabilidad el balance de sumas y saldos y los bienes de inversión con lo ya amortizado.'],
      ['¿Por qué no comparáis más funciones?', 'Porque solo publicamos lo que hemos comprobado en su web pública de precios, con la fecha. Las funciones de Holded más allá de eso no las valoramos: míralas en su web antes de decidir.'],
    ],
  },
  {
    slug: 'quipu',
    nombre: 'Quipu',
    web: 'https://getquipu.com',
    desde: 17,
    hasta: 59,
    publicado: [
      'Planes de 17 a 59 € al mes, con un 50 % de descuento los tres primeros meses.',
      'Tiene planes para autónomos y empresas, y una solución aparte para asesorías.',
    ],
    titulo: 'Fisquo frente a Quipu',
    descripcion: 'Fisquo y Quipu comparados con sus precios publicados (verificados el 30 de octubre de 2026): cuánto cuesta cada uno y cuándo te conviene uno u otro.',
    intro: 'Quipu publica planes de 17 a 59 € al mes para autónomos y empresas. Fisquo tiene seis planes cerrados para autónomos y pymes, de {min} a {max} € al mes. Aquí van los precios tal como están publicados y cuándo te conviene cada uno.',
    convieneRival: [
      ['Quieres conexión bancaria y previsiones de tesorería desde su plan intermedio.', 'Según su web, la conexión y conciliación bancaria están desde su plan Solution, y el panel de tesorería en Premium.'],
      ['Buscas una cuota contenida.', 'Sus planes publicados van de 17 a 59 € al mes.'],
      ['Ya lo usas y te funciona.', 'Cambiar de programa cuesta tiempo y solo compensa si algo te falla o te sobra.'],
    ],
    convieneFisquo: [
      ['Tienes, o vas a tener, una sociedad o una pyme.', 'Fisquo Pymes lleva la contabilidad por partida doble, las cuentas anuales y el Impuesto sobre Sociedades. Si Quipu lo cubre, compruébalo en su web.'],
      ['Quieres lectura de tickets con IA, inventario, nóminas y previsión de caja en el mismo programa.', 'La lectura con IA está en todos los planes; el inventario y la previsión de caja, desde el plan Pro; las nóminas, desde Pymes Esencial y Autónomos Plus.'],
      ['Quieres el precio de entrada más bajo.', 'Fisquo Autónomos Esencial parte de {aut} € al mes; el plan más barato de Quipu parte de 17 €. No incluyen lo mismo: compara con lo que necesitas.'],
      ['Eres gestoría y quieres un panel con todos tus clientes.', 'Fisquo tiene un programa para gestorías, con el panel Mi despacho, gratis para la gestoría.'],
    ],
    faqs: [
      ['¿Puedo traer mis datos de Quipu a Fisquo?', 'Fisquo importa clientes, facturas y gastos desde un Excel. Si tu programa actual te deja exportar a Excel, súbelo y empareja las columnas. Si tienes dudas, escríbenos a corporate@fisquo.com y te echamos una mano.'],
      ['¿Por qué no comparáis más funciones?', 'Porque solo publicamos lo que hemos comprobado en su web pública de precios, con la fecha. Las funciones de Quipu más allá de eso no las valoramos: míralas en su web antes de decidir.'],
    ],
  },
  {
    slug: 'billin',
    nombre: 'TS Facturas (antes Billin)',
    web: 'https://www.billin.net/precios/',
    desde: 8,
    hasta: 28,
    publicado: [
      'Planes de 8 a 28 € al mes con pago mensual (de 6,6 a 23 € al mes con pago anual), sin IVA.',
      'Los planes limitan el número de clientes (hasta 5 en Básico y hasta 50 en Pro), de usuarios, de productos y de documentos digitalizados al mes.',
    ],
    titulo: 'Fisquo frente a TS Facturas (Billin)',
    descripcion: 'Fisquo y TS Facturas (antes Billin) comparados con sus precios publicados, verificados el 30 de octubre de 2026: cuánto cuesta cada uno y cuándo te conviene.',
    intro: 'Billin ahora se llama TS Facturas, de TeamSystem, y publica planes de 8 a 28 € al mes con pago mensual. Fisquo tiene seis planes cerrados para autónomos y pymes, de {min} a {max} € al mes. Aquí van los precios tal como están publicados y cuándo te conviene cada uno.',
    convieneRival: [
      ['Solo necesitas facturar y tienes muy pocos clientes.', 'Su plan Básico, para hasta 5 clientes, cuesta 8 € al mes con pago mensual.'],
      ['Facturas en el País Vasco con TicketBAI.', 'Su web de precios dice que incluye facturas TicketBAI. Fisquo todavía no emite TicketBAI.'],
      ['Ya lo usas y te funciona.', 'Cambiar de programa cuesta tiempo y solo compensa si algo te falla o te sobra.'],
    ],
    convieneFisquo: [
      ['No quieres un límite de clientes.', 'Los planes de Fisquo no limitan los clientes. Autónomos parte de {aut} € al mes y Pymes de {pym} € (sin IVA).'],
      ['Quieres que el programa te calcule los impuestos.', 'Fisquo calcula el 303, el 130, el 111, el 115 y el resto de tus modelos con lo que ya has apuntado, y te avisa de cada plazo.'],
      ['Quieres leer tus tickets y facturas de gasto con IA.', 'Todos los planes de Fisquo incluyen lectura con IA, desde 50 páginas al mes en Autónomos Esencial.'],
      ['Tienes una sociedad.', 'Fisquo Pymes lleva la contabilidad por partida doble, las cuentas anuales y el Impuesto sobre Sociedades.'],
    ],
    faqs: [
      ['¿Billin y TS Facturas son lo mismo?', 'Sí: en su web, billin.net, el programa aparece ahora como TS Facturas, de TeamSystem.'],
      ['¿Puedo traer mis datos a Fisquo?', 'Fisquo importa clientes, facturas y gastos desde un Excel. Si tu programa actual te deja exportar a Excel, súbelo y empareja las columnas. Si tienes dudas, escríbenos a corporate@fisquo.com.'],
      ['¿Por qué no comparáis más funciones?', 'Porque solo publicamos lo que hemos comprobado en su web pública de precios, con la fecha. Lo demás, míralo en su web antes de decidir.'],
    ],
  },
  {
    slug: 'contasimple',
    nombre: 'Contasimple',
    web: 'https://www.contasimple.com/precios/',
    desde: 0,
    hasta: 19.95,
    publicado: [
      'Planes de 0 a 19,95 € al mes, sin IVA: Básico gratis, Profesional a 10,95 € y Ultimate a 15,95 € con pago anual (12,95 € y 19,95 € con pago trimestral).',
      'Todos los planes son de un usuario. El plan gratuito permite 12 documentos al año; el OCR, la conexión bancaria, el TPV y el control de stock se contratan aparte.',
    ],
    titulo: 'Fisquo frente a Contasimple',
    descripcion: 'Fisquo y Contasimple comparados con sus precios publicados, verificados el 30 de octubre de 2026: cuánto cuesta cada uno y cuándo te conviene uno u otro.',
    intro: 'Contasimple publica planes de 0 a 19,95 € al mes, con un plan gratuito. Fisquo tiene seis planes cerrados para autónomos y pymes, de {min} a {max} € al mes. Aquí van los precios tal como están publicados y cuándo te conviene cada uno.',
    convieneRival: [
      ['Emites muy pocas facturas y no quieres pagar.', 'Su plan Básico es gratuito, con 12 documentos al año.'],
      ['Quieres la cuota más baja posible y te basta con un usuario.', 'Su plan Profesional cuesta 10,95 € al mes con pago anual.'],
      ['Ya lo usas y te funciona.', 'Cambiar de programa cuesta tiempo y solo compensa si algo te falla o te sobra.'],
    ],
    convieneFisquo: [
      ['Quieres la lectura de tickets con IA y el banco dentro del plan.', 'En Fisquo la lectura con IA y la subida de extractos del banco vienen en todos los planes, y la conciliación desde Autónomos Pro o Pymes Esencial; en Contasimple el OCR y la conexión bancaria se contratan aparte.'],
      ['Trabajas con alguien más.', 'Los planes de Contasimple son de un usuario. En Fisquo, tu gestoría entra gratis con su propio acceso, y los planes superiores añaden usuarios.'],
      ['Tienes una sociedad o vas a tenerla.', 'Fisquo Pymes, desde {pym} € al mes, lleva la contabilidad por partida doble, las cuentas anuales y el Impuesto sobre Sociedades.'],
      ['Quieres que el programa te avise y te diga cuánto apartar.', 'Fisquo calcula tus modelos con lo que apuntas y te dice cada trimestre cuánto apartar para Hacienda.'],
    ],
    faqs: [
      ['¿Puedo traer mis datos de Contasimple a Fisquo?', 'Fisquo importa clientes, facturas y gastos desde un Excel. Si puedes exportarlos a Excel, súbelo y empareja las columnas. Si tienes dudas, escríbenos a corporate@fisquo.com.'],
      ['¿Por qué no comparáis más funciones?', 'Porque solo publicamos lo que hemos comprobado en su web pública de precios, con la fecha. Lo demás, míralo en su web antes de decidir.'],
    ],
  },
  {
    slug: 'anfix',
    nombre: 'Anfix',
    web: 'https://www.anfix.com/precios',
    desde: 5.99,
    hasta: 99.99,
    publicado: [
      'Planes de 5,99 a 99,99 € al mes con pago mensual (de 4,99 a 83,33 € al mes con pago anual), sin IVA.',
      'Los planes limitan las facturas al año (60 en Básico, 300 en Avanzado) y los usuarios; el control de stock y los proyectos son módulos aparte.',
    ],
    titulo: 'Fisquo frente a Anfix',
    descripcion: 'Fisquo y Anfix comparados con sus precios publicados, verificados el 30 de octubre de 2026: cuánto cuesta cada uno y cuándo te conviene uno u otro.',
    intro: 'Anfix publica cinco planes de 5,99 a 99,99 € al mes con pago mensual. Fisquo tiene seis planes cerrados para autónomos y pymes, de {min} a {max} € al mes. Aquí van los precios tal como están publicados y cuándo te conviene cada uno.',
    convieneRival: [
      ['Emites pocas facturas y buscas el precio de entrada más bajo.', 'Su plan Básico cuesta 5,99 € al mes con pago mensual, con 60 facturas al año.'],
      ['Necesitas muchos usuarios o un plan sin límites de facturas.', 'Sus planes llegan hasta 99,99 € al mes, con facturas y usuarios ilimitados en Premium.'],
      ['Ya lo usas y te funciona.', 'Cambiar de programa cuesta tiempo y solo compensa si algo te falla o te sobra.'],
    ],
    convieneFisquo: [
      ['No quieres contar facturas.', 'Fisquo no limita las facturas que emites en ningún plan. Autónomos parte de {aut} € al mes y Pymes de {pym} € (sin IVA).'],
      ['Quieres el inventario dentro del plan.', 'En Fisquo el inventario viene desde el plan Pro; en Anfix, el control de stock es un módulo aparte.'],
      ['Quieres que tu gestoría entre sin ocupar un usuario.', 'Cada suscripción de Fisquo incluye un acceso de gestoría aparte, gratis.'],
      ['Quieres leer tus tickets con IA y saber cuánto apartar para Hacienda.', 'Fisquo lee los tickets en todos los planes y calcula tus modelos con lo que ya has apuntado.'],
    ],
    faqs: [
      ['¿Puedo traer mis datos de Anfix a Fisquo?', 'Fisquo importa clientes, facturas y gastos desde un Excel, y para la contabilidad el balance de sumas y saldos. Si tienes dudas, escríbenos a corporate@fisquo.com.'],
      ['¿Por qué no comparáis más funciones?', 'Porque solo publicamos lo que hemos comprobado en su web pública de precios, con la fecha. Lo demás, míralo en su web antes de decidir.'],
    ],
  },
];

export const rival = (slug) => RIVALES.find((r) => r.slug === slug);
