// Comparativas de la web pública (/comparativa). Regla: de otros programas solo se publica lo que se ha comprobado en su
// web pública de precios y con fecha. Nada de funciones, opiniones ni cifras que no estén aquí. Para actualizarlas, se
// vuelve a mirar su web, se cambian los datos y se sube FECHA_VERIFICACION. Lo de Fisquo (precios, planes) no se escriben
// aquí: salen de components/web/datos.js para que nunca contradigan la página de precios. Los textos llevan marcas que
// la página sustituye por esos precios: {min} y {max} (plan más barato y más caro), {aut} y {pym} (precio de entrada de
// Autónomos y de Pymes).

// Día en que se comprobaron los precios y las condiciones de los rivales en sus webs públicas.
export const FECHA_VERIFICACION = '2026-10-23';

export const RIVALES = [
  {
    slug: 'holded',
    nombre: 'Holded',
    web: 'https://www.holded.com',
    desde: 15,
    hasta: 199,
    // Lo único que se afirma de este rival (precios publicados el día de la verificación).
    publicado: [
      'Planes de 15 a 199 € al mes.',
      'El inventario, las nóminas, los usuarios y el SII van aparte: en planes superiores o como complementos.',
    ],
    titulo: 'Fisquo frente a Holded',
    descripcion: 'Fisquo y Holded comparados con sus precios publicados (verificados el 23 de octubre de 2026): cuánto cuesta cada uno y cuándo te conviene uno u otro.',
    intro: 'Holded publica planes de 15 a 199 € al mes. Fisquo tiene seis planes cerrados, de {min} a {max} € al mes. Aquí van los precios tal como están publicados y cuándo te conviene cada uno.',
    convieneRival: [
      ['Necesitas enviar facturas al SII.', 'Según su web de precios, Holded lo ofrece en planes superiores o como complemento. Fisquo no envía al SII.'],
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
      'Planes de 17 a 59 € al mes.',
      'Se centra en autónomos y gestorías.',
    ],
    titulo: 'Fisquo frente a Quipu',
    descripcion: 'Fisquo y Quipu comparados con sus precios publicados (verificados el 23 de octubre de 2026): cuánto cuesta cada uno y cuándo te conviene uno u otro.',
    intro: 'Quipu publica planes de 17 a 59 € al mes y se centra en autónomos y gestorías. Fisquo atiende a autónomos y pymes, con seis planes cerrados de {min} a {max} € al mes. Aquí van los precios tal como están publicados y cuándo te conviene cada uno.',
    convieneRival: [
      ['Eres autónomo o gestoría y quieres un programa centrado en ese público.', 'Es el enfoque que declara Quipu en su web.'],
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
];

export const rival = (slug) => RIVALES.find((r) => r.slug === slug);
