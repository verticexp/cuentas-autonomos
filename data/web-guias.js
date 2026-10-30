import { GUIAS_PYMES } from './web-guias-pymes.js';

// Guías fiscales de la web pública (/guias). Contenido informativo y prudente: cada guía cita la norma en la que se apoya
// y lleva su fecha de revisión. Cuando cambie una norma o un plazo, se edita aquí y se sube REVISION_GUIAS.
//
// Cada guía: slug (URL), para (público: autonomos, pymes o todos), corto (nombre en menús y pie), titulo (h1), descripcion (SEO), resumen (índice), minutos de
// lectura, revision (opcional: su fecha si se revisó después de REVISION_GUIAS), normas (lo que se cita), secciones
// { id, t, bloques } y faqs. Bloques:
//   { p }  { ul: [] }  { ol: [] }  { pasos: [{ t, d }] }  { nota }  { tabla: { cab, filas } }
//   { ejemplo: { titulo, filas: [[etiqueta, valor, destacada]], pie } }
//   { plazos: [anios] }  { anuales: anio }  { calendarioSociedad: anio }   (tablas con fechas calculadas en lib/webCalendario.js)
// Dentro de un texto, **así** sale en negrita.

// Fecha en la que se contrastó el contenido con las normas citadas y con lo publicado hasta entonces.
export const REVISION_GUIAS = '2026-10-23';

const DISCLAIMER = 'Esta guía es informativa y no sustituye el asesoramiento de un profesional. Si tu caso tiene particularidades (otro régimen de IVA o de IRPF, operaciones con otros países, actividades exentas…), consúltalo con tu gestoría.';

const PLAZOS_TRIMESTRALES = {
  cab: ['Trimestre', 'Se presenta', 'Con domiciliación (aprox.)'],
  filas: [
    ['1.er trimestre', 'Del 1 al 20 de abril', 'Hasta el 15 de abril'],
    ['2.º trimestre', 'Del 1 al 20 de julio', 'Hasta el 15 de julio'],
    ['3.er trimestre', 'Del 1 al 20 de octubre', 'Hasta el 15 de octubre'],
    ['4.º trimestre', 'Del 1 al 30 de enero (del año siguiente)', 'Hasta el 25 de enero'],
  ],
};

export const GUIAS = [
  {
    slug: 'modelo-303',
    para: 'todos',
    corto: 'Modelo 303',
    titulo: 'Modelo 303 paso a paso',
    descripcion: 'Qué es el modelo 303, quién lo presenta, los plazos y cómo se rellena la declaración trimestral del IVA: IVA repercutido, IVA soportado y resultado.',
    resumen: 'Qué es, quién lo presenta, los plazos y cómo se rellena la declaración trimestral del IVA.',
    minutos: 7,
    normas: [
      'Ley 37/1992, del Impuesto sobre el Valor Añadido: arts. 92 y siguientes (deducciones), art. 99 (ejercicio de la deducción y compensación), art. 115 (devolución al final del ejercicio) y art. 164 (obligaciones del sujeto pasivo).',
      'Reglamento del IVA, Real Decreto 1624/1992: art. 71 (declaraciones-liquidaciones periódicas y plazos).',
      'Ley 39/2015, art. 30.5 (el plazo que acaba en día inhábil pasa al siguiente hábil).',
      'Instrucciones del modelo 303 en la sede electrónica de la AEAT.',
    ],
    secciones: [
      {
        id: 'que-es', t: 'Qué es el modelo 303 y quién lo presenta',
        bloques: [
          { p: 'El modelo 303 es la autoliquidación del IVA. En él restas el IVA que has pagado en tus compras y gastos (**IVA soportado**) del IVA que has cobrado a tus clientes (**IVA repercutido** o devengado) y pagas la diferencia a Hacienda; si sale a tu favor, se compensa o, en algunos casos, se devuelve.' },
          { p: 'Lo presentan los empresarios y profesionales con operaciones sujetas y no exentas de IVA, entre ellos la mayoría de autónomos y sociedades. Se presenta por internet en la sede electrónica de la AEAT.' },
          { p: 'Es **trimestral**, salvo que en el año anterior tu volumen de operaciones superara 6.010.121,04 € o estés inscrito en el REDEME: entonces es mensual. Esta guía trata el caso habitual: trimestral y en régimen general.' },
          { nota: 'Quedan fuera, por ejemplo, quienes solo hacen operaciones exentas del art. 20 de la ley (algunas actividades sanitarias o docentes) y los comerciantes minoristas en recargo de equivalencia. Si no sabes en qué caso estás, pregúntaselo a tu gestoría.' },
        ],
      },
      {
        id: 'plazos', t: 'Plazos: cuándo se presenta',
        bloques: [
          { tabla: PLAZOS_TRIMESTRALES },
          { p: 'Si el último día del plazo cae en sábado, domingo o festivo, pasa al siguiente día hábil. Por ejemplo, el 30 de enero de 2027 es sábado: el 4.º trimestre de 2026 se puede presentar hasta el lunes 1 de febrero de 2027.' },
          { p: 'Domiciliar el pago acorta el plazo: el banco carga el importe unos días después, pero tienes que presentar antes del día indicado.' },
        ],
      },
      {
        id: 'antes', t: 'Antes de empezar',
        bloques: [
          { p: 'Ten a mano, del trimestre completo:' },
          { ul: [
            'Las facturas emitidas, con su fecha, base e IVA.',
            'Las facturas recibidas (tus gastos), completas y con tu NIF, para poder deducir el IVA.',
            'Las facturas rectificativas, tanto emitidas como recibidas.',
            'Los libros registro de facturas expedidas y recibidas, si los llevas aparte, para cuadrar los totales.',
            'Las cuotas pendientes de compensar de trimestres anteriores, si las hay.',
          ] },
        ],
      },
      {
        id: 'pasos', t: 'Cómo se rellena, paso a paso',
        bloques: [
          { pasos: [
            { t: 'Suma el IVA repercutido', d: 'Agrupa tus facturas emitidas por tipo de IVA (4 %, 10 % y 21 %) y suma bases y cuotas. Van en las casillas 01 a 09: base, tipo y cuota de cada tipo. La suma de todas las cuotas devengadas, junto con recargos y otras operaciones, queda en la casilla 27.' },
            { t: 'Incluye lo que no se ve a simple vista', d: 'Las compras a otros países de la UE y las operaciones con inversión del sujeto pasivo se declaran en su propia casilla como IVA devengado y, si tienes derecho, también como deducible. Las rectificativas emitidas restan en el apartado de modificación de bases y cuotas.' },
            { t: 'Suma el IVA soportado deducible', d: 'Cuenta las cuotas de las facturas recibidas del trimestre que dan derecho a deducir: gastos de tu actividad con factura completa a tu nombre y con tu NIF. Las compras y gastos corrientes van en las casillas 28 y 29, y los bienes de inversión en las 30 y 31. El total de cuotas deducibles es la casilla 45.' },
            { t: 'Revisa lo que no puedes deducir', d: 'No todo el IVA se deduce: los gastos que no están afectos a la actividad, las atenciones a clientes y otros supuestos de los arts. 95 y 96 de la ley, o los tickets sin tus datos. Si además haces operaciones exentas, puede aplicarse la prorrata (arts. 102 a 106).' },
            { t: 'Calcula el resultado', d: 'Resultado del régimen general = IVA devengado (casilla 27) − IVA deducible (casilla 45): es la casilla 46. Si es positivo, hay que ingresarlo; si es negativo, el saldo es a tu favor.' },
            { t: 'Resta lo que tuvieras a compensar', d: 'Si de trimestres anteriores te quedaron cuotas pendientes de compensar, se restan del resultado a ingresar.' },
            { t: 'Presenta y paga', d: 'Presenta por internet en la sede electrónica de la AEAT, con certificado electrónico o con otro sistema de identificación que admita (por ejemplo, Cl@ve si eres persona física). Si hay que ingresar, domicilia el pago o págalo con el NRC. Guarda el justificante de la presentación.' },
          ] },
        ],
      },
      {
        id: 'ejemplo', t: 'Un ejemplo con números',
        bloques: [
          { ejemplo: {
            titulo: 'Ejemplo ficticio: un trimestre con IVA al 21 %',
            filas: [
              ['Base de las facturas emitidas', '12.000,00 €'],
              ['IVA repercutido (21 %)', '2.520,00 €'],
              ['Base de las facturas recibidas con IVA deducible', '4.000,00 €'],
              ['IVA soportado deducible (21 %)', '− 840,00 €'],
              ['Resultado a ingresar', '1.680,00 €', true],
            ],
            pie: 'Los importes son inventados para explicar el cálculo; no representan a ninguna empresa.',
          } },
        ],
      },
      {
        id: 'resultado', t: 'Qué pasa con el resultado',
        bloques: [
          { ul: [
            '**A ingresar**: lo pagas en el plazo, domiciliado o con NRC.',
            '**A compensar**: si sale negativo, el saldo se aplica en las declaraciones siguientes, durante los cuatro años posteriores (art. 99 de la ley).',
            '**A devolver**: solo puedes pedir la devolución del saldo a tu favor en la declaración del 4.º trimestre (art. 115), salvo que estés inscrito en el REDEME.',
          ] },
          { p: 'Si estás obligado a presentar y en el trimestre no has tenido operaciones, también hay que presentar la declaración, marcándola como «sin actividad».' },
        ],
      },
      {
        id: 'errores', t: 'Errores frecuentes',
        bloques: [
          { ul: [
            'Deducir el IVA de un ticket o de una factura simplificada sin tus datos. Para deducir el IVA suele hacer falta una factura completa a tu nombre.',
            'Deducir el 100 % de un gasto de uso mixto (vehículo, teléfono, parte de la vivienda). Solo se deduce la parte afecta a la actividad.',
            'Olvidar las facturas rectificativas (abonos), que restan base y cuota.',
            'Colocar una factura recibida en el trimestre equivocado. La ley permite deducir en periodos posteriores con un límite de cuatro años, pero conviene que cada trimestre refleje sus propias facturas.',
            'Presentar fuera de plazo: sin requerimiento previo se aplica un recargo que crece con el retraso (art. 27 de la Ley General Tributaria).',
          ] },
        ],
      },
      {
        id: 'fisquo', t: 'Cómo te ayuda Fisquo',
        bloques: [
          { p: 'Fisquo calcula las casillas del 303 con las facturas emitidas y los gastos que ya has apuntado, te avisa antes de cada plazo y te dice cuánto debes apartar. La presentación la haces tú o tu gestoría en la sede electrónica de la AEAT.' },
        ],
      },
    ],
    faqs: [
      ['¿Qué hago si en un trimestre no he facturado ni gastado nada?', 'Si estás obligado a presentar el 303, hay que presentarlo igualmente en el plazo, como «sin actividad». Si has cesado la actividad, lo que corresponde es la baja en el censo; habla con tu gestoría.'],
      ['¿Puedo presentar el 303 fuera de plazo?', 'Sí, pero con recargo si lo haces sin requerimiento previo de la Administración. El recargo aumenta cuanto más tardes (art. 27 de la Ley General Tributaria).'],
      ['¿El 303 y el 130 tienen los mismos plazos?', 'Sí: del 1 al 20 de abril, julio y octubre, y del 1 al 30 de enero. Por eso muchos autónomos presentan los dos a la vez.'],
    ],
    relacionadas: ['modelo-130', 'calendario-fiscal-sociedad-2026-2027', 'factura-simplificada'],
    cta: { titulo: 'Que tu 303 salga calculado', sub: 'Apunta tus facturas y gastos en Fisquo y ten las casillas listas cada trimestre. 30 días gratis, sin tarjeta.' },
    aviso: DISCLAIMER,
  },
  {
    slug: 'modelo-130',
    para: 'autonomos',
    corto: 'Modelo 130',
    titulo: 'Modelo 130: cómo se calcula el pago fraccionado',
    descripcion: 'Quién presenta el modelo 130, plazos y cómo se calcula el pago fraccionado del IRPF: 20 % del rendimiento neto acumulado, menos retenciones y pagos anteriores.',
    resumen: 'Quién lo presenta, los plazos y cómo se calcula el adelanto trimestral del IRPF, con un ejemplo.',
    minutos: 7,
    normas: [
      'Reglamento del IRPF, Real Decreto 439/2007: arts. 109 a 112 (pagos fraccionados; el art. 109.3 recoge la dispensa del 70 % de retenciones) y art. 30.2.4.ª (5 % de gastos de difícil justificación, con un máximo de 2.000 € anuales, en estimación directa simplificada).',
      'Ley 35/2006, del Impuesto sobre la Renta de las Personas Físicas: arts. 27 y siguientes (rendimientos de actividades económicas).',
      'Instrucciones del modelo 130 en la sede electrónica de la AEAT.',
    ],
    secciones: [
      {
        id: 'que-es', t: 'Qué es el modelo 130 y quién lo presenta',
        bloques: [
          { p: 'El modelo 130 es el **pago fraccionado del IRPF** de los autónomos en estimación directa (normal o simplificada). Es un adelanto de tu declaración de la renta: cada trimestre ingresas una parte del impuesto que saldrá en la renta del año.' },
          { p: 'Si tributas por módulos (estimación objetiva), el modelo es el 131, con otro cálculo. Las sociedades no presentan el 130: tienen su propio pago fraccionado del Impuesto sobre Sociedades (modelo 202).' },
          { nota: 'Si ejerces una actividad profesional (o agrícola, ganadera o forestal) y en el año anterior al menos el 70 % de tus ingresos de esa actividad tuvo retención o ingreso a cuenta, no estás obligado a presentar el 130 (art. 109.3 del Reglamento del IRPF). Es habitual en profesionales que facturan sobre todo a empresas.' },
        ],
      },
      {
        id: 'plazos', t: 'Plazos: cuándo se presenta',
        bloques: [
          { tabla: PLAZOS_TRIMESTRALES },
          { p: 'Si el último día del plazo cae en sábado, domingo o festivo, pasa al siguiente día hábil. Los plazos coinciden con los del modelo 303.' },
        ],
      },
      {
        id: 'calculo', t: 'Cómo se calcula',
        bloques: [
          { p: 'El cálculo es **acumulado**: cada trimestre se calcula desde el 1 de enero hasta el último día de ese trimestre, y se descuenta lo que ya has pagado.' },
          { pasos: [
            { t: 'Ingresos acumulados', d: 'Suma lo que has ingresado por tu actividad desde el 1 de enero, sin IVA.' },
            { t: 'Gastos deducibles acumulados', d: 'Suma los gastos de la actividad con su factura, también sin IVA (salvo el IVA que no puedas deducir, que forma parte del gasto). La cuota de autónomos de la Seguridad Social es gasto deducible.' },
            { t: 'Rendimiento neto', d: 'Es la diferencia entre ingresos y gastos. En estimación directa simplificada, se resta además el **5 % de gastos de difícil justificación** sobre esa diferencia, con un máximo de 2.000 € al año. En estimación directa normal no se aplica.' },
            { t: 'El 20 %', d: 'El pago previo es el 20 % del rendimiento neto acumulado, siempre que sea positivo.' },
            { t: 'Resta retenciones y pagos anteriores', d: 'Al 20 % le quitas las retenciones e ingresos a cuenta que te han practicado tus clientes en lo que va de año y los pagos fraccionados de los trimestres anteriores.' },
            { t: 'Resultado', d: 'Si es positivo, se ingresa. Si es cero o negativo, no ingresas nada y no hay devolución; como el cálculo es acumulado, el trimestre siguiente ya lo tiene en cuenta.' },
          ] },
          { p: 'Según tu caso puede haber minoraciones adicionales (por ejemplo, para rendimientos netos anuales bajos). Están explicadas en las instrucciones del modelo.' },
        ],
      },
      {
        id: 'ejemplo', t: 'Un ejemplo con números',
        bloques: [
          { ejemplo: {
            titulo: 'Ejemplo ficticio: 2.º trimestre en estimación directa simplificada',
            filas: [
              ['Ingresos acumulados (1 enero – 30 junio)', '20.000,00 €'],
              ['Gastos acumulados', '− 8.000,00 €'],
              ['Diferencia', '12.000,00 €'],
              ['Gastos de difícil justificación (5 % de 12.000)', '− 600,00 €'],
              ['Rendimiento neto', '11.400,00 €'],
              ['20 % del rendimiento neto', '2.280,00 €'],
              ['Retenciones soportadas en el año', '− 1.200,00 €'],
              ['Pago fraccionado del 1.er trimestre', '− 900,00 €'],
              ['Resultado a ingresar', '180,00 €', true],
            ],
            pie: 'Los importes son inventados para explicar el cálculo; no representan a ninguna persona.',
          } },
        ],
      },
      {
        id: 'gastos', t: 'Qué gastos cuentan',
        bloques: [
          { ul: [
            '**Cuentan**: los vinculados a la actividad, justificados con factura y anotados en tus libros, como los suministros del local, el alquiler, la cuota de autónomos, las amortizaciones, la gestoría o los seguros de la actividad.',
            '**No cuentan**: los gastos personales o sin justificante, las multas y sanciones y la parte de un gasto mixto que no esté afecta a la actividad.',
            '**Los bienes de inversión** (un ordenador, una furgoneta) no se deducen de golpe: se amortizan año a año según las tablas oficiales.',
          ] },
        ],
      },
      {
        id: 'errores', t: 'Errores frecuentes',
        bloques: [
          { ul: [
            'Calcular solo con las cifras del trimestre en vez de las acumuladas desde el 1 de enero.',
            'Olvidar restar las retenciones que figuran en tus facturas con IRPF.',
            'Meter el IVA dentro de los ingresos o de los gastos.',
            'Aplicar el 5 % de difícil justificación en estimación directa normal, o pasar de los 2.000 € al año.',
            'No presentar porque el resultado es cero o negativo: si estás obligado, hay que presentar igualmente.',
          ] },
        ],
      },
      {
        id: 'fisquo', t: 'Cómo te ayuda Fisquo',
        bloques: [
          { p: 'Fisquo lleva la cuenta de ingresos, gastos, retenciones y pagos anteriores, calcula el 130 con las cifras acumuladas y te dice cuánto apartar para el siguiente. La presentación la haces tú o tu gestoría en la sede electrónica de la AEAT.' },
        ],
      },
    ],
    faqs: [
      ['¿El modelo 130 y la declaración de la renta son lo mismo?', 'No. El 130 es un adelanto trimestral. En la renta (modelo 100) se calcula el impuesto del año completo y se descuentan los pagos del 130 y las retenciones.'],
      ['¿Qué pasa si en un trimestre tengo pérdidas?', 'Si el rendimiento acumulado es negativo, no ingresas nada. Como el cálculo es acumulado, el trimestre siguiente parte de esa situación.'],
      ['¿Puedo domiciliar el pago?', 'Sí. Hay que presentar antes: hasta el día 15 de abril, julio y octubre, y hasta el 25 de enero.'],
    ],
    relacionadas: ['modelo-303', 'calendario-fiscal-autonomo-2026-2027', 'factura-simplificada'],
    cta: { titulo: 'Sabe cuánto apartar para tu 130', sub: 'Fisquo acumula tus ingresos, gastos y retenciones y calcula el pago de cada trimestre. 30 días gratis, sin tarjeta.' },
    aviso: DISCLAIMER,
  },
  {
    slug: 'calendario-fiscal-autonomo-2026-2027',
    para: 'autonomos',
    corto: 'Calendario fiscal 2026-2027',
    titulo: 'Calendario fiscal del autónomo 2026-2027',
    descripcion: 'Fechas de 2026 y 2027 de los modelos 303, 130, 111, 115 y 349 y de los resúmenes anuales, con los días trasladados y las fechas de Verifactu.',
    resumen: 'Todas las fechas de presentación de 2026 y 2027, con los días hábiles ya ajustados, y qué pasa con Verifactu.',
    minutos: 6,
    normas: [
      'Reglamento del IVA, Real Decreto 1624/1992, art. 71 (plazos del 303) y Reglamento del IRPF, Real Decreto 439/2007, arts. 109 a 112 (plazos del 130).',
      'Ley 39/2015, art. 30.5: si el último día del plazo es inhábil, se entiende prorrogado al primer día hábil siguiente.',
      'Real Decreto 1007/2023 (Reglamento de sistemas de facturación) y Real Decreto-ley 15/2025 (nuevas fechas de Verifactu).',
      'Calendario del contribuyente de la AEAT, que publica cada año las fechas de la campaña de la Renta.',
    ],
    secciones: [
      {
        id: 'trimestrales', t: 'Declaraciones trimestrales',
        bloques: [
          { p: 'En cada plazo se presentan, según tu caso: el **303** (IVA), el **130** (IRPF; el **131** si tributas por módulos), el **111** (retenciones de trabajadores y profesionales), el **115** (retenciones por alquiler de un local) y el **349** (operaciones con otros países de la UE, si lo presentas trimestralmente).' },
          { plazos: [2026, 2027] },
          { p: 'La fecha de la columna «Se presenta» es el último día hábil. En la columna «Con domiciliación» está el último día para presentar si quieres que el banco cargue el pago.' },
          { nota: 'La tabla solo tiene en cuenta sábados, domingos y festivos nacionales. Si tu comunidad o tu municipio tiene un festivo en la fecha límite, comprueba el calendario del contribuyente de la AEAT.' },
        ],
      },
      {
        id: 'anuales', t: 'Resúmenes anuales de enero y febrero',
        bloques: [
          { p: 'Con el cierre del ejercicio 2026, estos modelos se presentan a comienzos de 2027, si estás obligado a ellos:' },
          { anuales: 2026 },
          { p: 'El **347** recoge las operaciones con una misma persona o empresa que superan 3.005,06 € al año. Los del ejercicio 2027 se presentan en enero y febrero de 2028 con el mismo calendario.' },
        ],
      },
      {
        id: 'renta', t: 'La declaración de la renta',
        bloques: [
          { p: 'La renta del ejercicio 2026 se presenta en 2027. La AEAT fija cada año las fechas de la campaña y las publica en su calendario del contribuyente; en las campañas recientes ha ido de abril a finales de junio. En cuanto las publique, son las que valen.' },
        ],
      },
      {
        id: 'verifactu', t: 'Verifactu: las fechas que vienen',
        bloques: [
          { p: 'El Real Decreto-ley 15/2025 retrasó la obligación de usar programas de facturación que cumplan el Reglamento de sistemas de facturación (Real Decreto 1007/2023). Según esa norma, será obligatoria el **1 de enero de 2027** para las sociedades y demás contribuyentes del Impuesto sobre Sociedades, y el **1 de julio de 2027** para el resto, incluidos los autónomos.' },
          { nota: 'El 5 de octubre de 2026 el Ministerio de Hacienda anunció un nuevo aplazamiento, hasta octubre de 2028. A 23 de octubre de 2026 todavía no estaba publicado en el BOE, así que no podemos darlo por hecho: hasta que lo esté, las fechas vigentes son las del Real Decreto-ley 15/2025. Comprueba el BOE antes de tomar decisiones.' },
        ],
      },
      {
        id: 'sociedades', t: 'Si tienes una sociedad',
        bloques: [
          { p: 'El calendario cambia: el pago fraccionado del Impuesto sobre Sociedades (**modelo 202**) se presenta del 1 al 20 de abril, octubre y diciembre, y el impuesto anual (**modelo 200**) en los 25 días naturales siguientes a los seis meses posteriores al cierre del ejercicio; si el ejercicio coincide con el año natural, del 1 al 25 de julio. La sociedad no presenta el 130. Todas sus fechas están en la guía del calendario fiscal de la sociedad.' },
        ],
      },
      {
        id: 'fisquo', t: 'Cómo te ayuda Fisquo',
        bloques: [
          { p: 'Fisquo te avisa antes de cada plazo de presentación y calcula los modelos con tus facturas y gastos, para que sepas cuánto apartar y no se te pase ninguna fecha.' },
        ],
      },
    ],
    faqs: [
      ['¿Qué pasa si el plazo acaba en sábado o domingo?', 'Pasa al siguiente día hábil. Por ejemplo, el 4.º trimestre de 2026 acaba el sábado 30 de enero de 2027, así que se puede presentar hasta el lunes 1 de febrero de 2027.'],
      ['¿Todos los autónomos presentan los mismos modelos?', 'No. Depende de tu régimen de IVA y de IRPF, de si tienes empleados o pagas alquiler con retención y de si compras o vendes a otros países de la UE. Tu gestoría puede decirte cuáles te tocan.'],
      ['¿Está confirmado el aplazamiento de Verifactu hasta 2028?', 'No. Hacienda lo anunció el 5 de octubre de 2026, pero a 23 de octubre de 2026 no estaba publicado en el BOE. Mientras tanto rigen las fechas del Real Decreto-ley 15/2025.'],
    ],
    relacionadas: ['modelo-303', 'modelo-111', 'verifactu'],
    cta: { titulo: 'Que no se te pase ningún plazo', sub: 'Fisquo te avisa antes de cada presentación y calcula tus modelos. 30 días gratis, sin tarjeta.' },
    aviso: DISCLAIMER,
  },
  {
    slug: 'factura-simplificada',
    para: 'todos',
    corto: 'Factura simplificada',
    titulo: 'Factura simplificada: cuándo puedes hacerla',
    descripcion: 'Cuándo se puede expedir una factura simplificada (400 € o 3.000 € según el sector), qué datos lleva, su serie propia y cuándo hace falta una completa.',
    resumen: 'Los límites de 400 € y 3.000 €, los datos que debe llevar y cuándo no te sirve.',
    minutos: 5,
    normas: [
      'Reglamento de facturación, Real Decreto 1619/2012: art. 4 (supuestos en los que se puede expedir factura simplificada, con el art. 4.1.a, b y c) y art. 7 (contenido; el art. 7.1.a, sobre la numeración y las series).',
      'Ley 37/1992, del IVA, art. 97 (requisitos formales para deducir el IVA).',
      'Manual práctico de IVA de la AEAT, apartado «Facturas simplificadas».',
      'Real Decreto 1007/2023 (Reglamento de sistemas de facturación).',
    ],
    secciones: [
      {
        id: 'que-es', t: 'Qué es una factura simplificada',
        bloques: [
          { p: 'Es una factura con menos datos que la completa. Sustituye al antiguo ticket y sirve para operaciones de poco importe o de venta al público, en las que pedir y escribir los datos del cliente sería un engorro.' },
        ],
      },
      {
        id: 'cuando', t: 'Cuándo puedes hacerla',
        bloques: [
          { ul: [
            '**Hasta 400 € con IVA incluido**, en cualquier actividad (art. 4.1.a).',
            '**Hasta 3.000 € con IVA incluido**, si la operación es de alguno de los sectores del art. 4.1.c: ventas al por menor (comercio minorista), hostelería y restauración, transporte de personas y sus equipajes o peluquería y salones de belleza, entre otros. El listado completo está en ese artículo.',
            '**Facturas rectificativas** de otra factura, sin límite de importe (art. 4.1.b).',
          ] },
          { nota: 'El límite se mide con el importe total, IVA incluido. Si lo superas y no estás en uno de esos sectores, la factura tiene que ser completa, con los datos del cliente.' },
        ],
      },
      {
        id: 'cuando-no', t: 'Cuándo no te sirve',
        bloques: [
          { ul: [
            'Si quien compra es un empresario o profesional y te pide una factura completa para poder deducir el IVA o ejercer otro derecho fiscal, tienes que dársela completa.',
            'Con una factura simplificada normalmente no se puede deducir el IVA: quien lo necesite debe tener una factura completa a su nombre, con su NIF y la cuota desglosada (art. 97 de la ley del IVA).',
            'Hay operaciones en las que no se admite, como las entregas intracomunitarias, y otras con reglas especiales. Si tu operación no es una venta corriente, mira el art. 4 o consúltalo con tu gestoría.',
          ] },
        ],
      },
      {
        id: 'datos', t: 'Qué datos debe llevar',
        bloques: [
          { p: 'Según el art. 7 del Reglamento de facturación, la factura simplificada incluye, como mínimo:' },
          { ul: [
            'Número y, en su caso, serie.',
            'Fecha de expedición y, si es distinta, fecha de la operación.',
            'NIF, nombre y apellidos o razón social de quien la expide.',
            'Identificación del tipo de bienes entregados o de servicios prestados.',
            'Tipo impositivo de IVA aplicado y, si quieres, la expresión «IVA incluido». Si hay varios tipos, la parte de base de cada uno por separado.',
            'Contraprestación total.',
          ] },
          { p: 'No hace falta identificar al cliente. Si el destinatario sí te da sus datos y los necesita, lo normal es expedir una factura completa.' },
        ],
      },
      {
        id: 'serie', t: 'Serie propia',
        bloques: [
          { p: 'Si en el mismo año expides facturas completas y simplificadas, numera las simplificadas en una **serie propia**, separada de la de las completas y sin saltos en la numeración (art. 7.1.a del Reglamento de facturación y Manual práctico de IVA de la AEAT). Por ejemplo, FS2026-001, FS2026-002…' },
        ],
      },
      {
        id: 'verifactu', t: 'Y con Verifactu',
        bloques: [
          { p: 'Las facturas simplificadas también son facturas a efectos del Reglamento de sistemas de facturación: se generan con el mismo sistema, con su registro de facturación y su código QR. La fecha en la que será obligatorio usar un programa que lo cumpla está en la guía del calendario fiscal.' },
        ],
      },
      {
        id: 'fisquo', t: 'Cómo lo hace Fisquo',
        bloques: [
          { p: 'En Fisquo, una factura sin NIF del cliente se emite como simplificada, en su propia serie (FS), y te avisa si superas el límite: 400 € o 3.000 € si has marcado en tu actividad que eres comercio minorista, hostelería u otro sector del art. 4.1.c. Si el cliente te da su NIF, la factura sale completa.' },
        ],
      },
    ],
    faqs: [
      ['¿Una factura simplificada es lo mismo que un ticket?', 'Casi. El ticket fue durante años el justificante de ventas al público; hoy se regula como factura simplificada. Si la emites con un programa de facturación, lleva su número, su serie y su registro como cualquier otra factura.'],
      ['¿Puedo partir una venta en varias simplificadas para no superar el límite?', 'No lo recomendamos. El importe que cuenta es el de la operación; si supera el límite, lo prudente es emitir una factura completa.'],
      ['¿Mi cliente puede deducirse el IVA con una factura simplificada?', 'En general no. Si necesita deducirlo, pídele su NIF y emite una factura completa.'],
    ],
    relacionadas: ['verifactu', 'modelo-303', 'modelo-130'],
    cta: { titulo: 'Factura sin pensar en el tipo de factura', sub: 'Fisquo elige la serie, controla el límite y genera el registro de cada factura. 30 días gratis, sin tarjeta.' },
    aviso: DISCLAIMER,
  },
  {
    slug: 'verifactu',
    para: 'todos',
    corto: 'Verifactu',
    titulo: 'Verifactu: qué es, a quién afecta y desde cuándo',
    descripcion: 'Qué es Verifactu, quién tiene que cumplirlo, las fechas vigentes (2027) y el aplazamiento anunciado, qué cambia en tus facturas y las sanciones.',
    resumen: 'Qué exige el reglamento de facturación, a quién afecta, las fechas que están en el BOE y qué cambia en tus facturas.',
    minutos: 8,
    revision: '2026-10-30',
    normas: [
      'Ley 58/2003, General Tributaria: art. 29.2.j (sistemas de facturación que garanticen la integridad de los registros) y art. 201 bis (sanciones), en la redacción de la Ley 11/2021, de medidas de prevención y lucha contra el fraude fiscal.',
      'Real Decreto 1007/2023, Reglamento de requisitos de los sistemas informáticos de facturación: arts. 3 (quién está obligado), 8 (requisitos), 13 (declaración responsable) y 16 (modalidad VERI*FACTU).',
      'Orden HAC/1177/2024, especificaciones técnicas (registros, huella, código QR y leyenda).',
      'Real Decreto-ley 15/2025 (fechas de obligado cumplimiento vigentes).',
    ],
    secciones: [
      {
        id: 'que-es', t: 'Qué es Verifactu',
        bloques: [
          { p: 'Verifactu es el nombre con el que se conoce el **Reglamento de requisitos de los sistemas informáticos de facturación** (Real Decreto 1007/2023). No es un programa de la AEAT ni un tipo de factura: es un conjunto de reglas que tiene que cumplir el programa con el que facturas.' },
          { p: 'La idea es que una factura, una vez emitida, no se pueda cambiar ni borrar sin dejar rastro. Para eso, cada vez que emites una factura el programa genera un **registro de facturación** con sus datos principales y una **huella** (un código calculado a partir de esos datos y de la huella del registro anterior). Si alguien tocara una factura antigua, la cadena dejaría de cuadrar.' },
          { p: 'Nace de la Ley 11/2021, contra el fraude fiscal, que prohibió el software de «doble uso»: programas que permiten llevar unas cuentas oficiales y otras ocultas, o borrar ventas sin dejar rastro.' },
        ],
      },
      {
        id: 'quien', t: 'A quién afecta (y a quién no)',
        bloques: [
          { p: 'Tienen que cumplirlo quienes **facturan con un programa informático** y son (art. 3 del reglamento):' },
          { ul: [
            'Sociedades y demás contribuyentes del Impuesto sobre Sociedades.',
            'Autónomos y profesionales que tributan en el IRPF por actividades económicas.',
            'No residentes con establecimiento permanente en España.',
            'Comunidades de bienes, sociedades civiles y demás entidades en atribución de rentas, por las facturas de su actividad.',
          ] },
          { p: 'Quedan fuera, entre otros:' },
          { ul: [
            'Quienes llevan los libros registro del IVA por el **SII** (Suministro Inmediato de Información), porque ya envían sus facturas a la AEAT casi en tiempo real.',
            'Quienes tienen su domicilio fiscal en el **País Vasco** o **Navarra**, que tienen sus propias normas (en el País Vasco, TicketBAI).',
            'Quien no usa ningún programa para facturar (por ejemplo, un talonario de facturas en papel).',
          ] },
          { nota: 'Si facturas con una hoja de cálculo o un procesador de texto, o con un programa hecho a medida, tu caso tiene matices. La AEAT los trata en sus preguntas frecuentes sobre sistemas informáticos de facturación; si no lo tienes claro, consúltalo con tu gestoría.' },
        ],
      },
      {
        id: 'fechas', t: 'Desde cuándo es obligatorio',
        bloques: [
          { p: 'El calendario ha cambiado varias veces. A 30 de octubre de 2026, el que está en el BOE es el del **Real Decreto-ley 15/2025**:' },
          { tabla: { cab: ['Quién', 'Desde'], filas: [
            ['Sociedades y demás contribuyentes del Impuesto sobre Sociedades', '1 de enero de 2027'],
            ['Resto de obligados, incluidos los autónomos', '1 de julio de 2027'],
          ] } },
          { nota: 'El 5 de octubre de 2026 el Ministerio de Hacienda anunció un nuevo aplazamiento, hasta octubre de 2028. A 30 de octubre de 2026 todavía no estaba publicado en el BOE, así que no podemos darlo por hecho: hasta que lo esté, las fechas vigentes son las del Real Decreto-ley 15/2025. Comprueba el BOE antes de tomar decisiones.' },
          { p: 'Los fabricantes de programas de facturación ya tienen que ofrecer versiones adaptadas. Si cambias de programa ahora, lo prudente es elegir uno que ya cumpla, aunque la fecha te quede lejos.' },
        ],
      },
      {
        id: 'modalidades', t: 'Las dos formas de cumplir',
        bloques: [
          { p: 'El reglamento deja elegir entre dos modalidades:' },
          { ul: [
            '**VERI*FACTU**: el programa envía cada registro de facturación a la AEAT en el momento, de forma automática. Es la opción más sencilla para el usuario: no hace falta firmar los registros ni guardar un registro de eventos.',
            '**Sin envío** (a veces llamada «no Verifactu»): el programa guarda los registros firmados electrónicamente y un registro de eventos (accesos, cortes, exportaciones…), y los pone a disposición de la AEAT si los pide en una comprobación.',
          ] },
          { p: 'La modalidad se elige al empezar a usar el sistema y, en general, se mantiene durante todo el año natural.' },
        ],
      },
      {
        id: 'facturas', t: 'Qué cambia en tus facturas',
        bloques: [
          { ul: [
            '**Un código QR** en cada factura, con tu NIF, el número, la fecha y el importe. Tu cliente puede escanearlo y comprobar en la sede de la AEAT que la factura existe.',
            'Si usas la modalidad VERI*FACTU, además la leyenda **«Factura verificable en la sede electrónica de la AEAT»** o **«VERI*FACTU»**.',
            '**No se puede borrar ni modificar** una factura emitida. Si te equivocas, se emite una **rectificativa**; y si una factura no debió emitirse nunca, se genera un **registro de anulación** que queda encadenado como los demás.',
            'La numeración sigue siendo correlativa dentro de cada serie, como hasta ahora.',
          ] },
          { p: 'Lo que no cambia: los datos obligatorios de una factura (Real Decreto 1619/2012), los tipos de IVA ni tus declaraciones. Verifactu tampoco es la factura electrónica entre empresas que exige la Ley Crea y Crece: es otra obligación, con su propio calendario.' },
        ],
      },
      {
        id: 'sanciones', t: 'Qué pasa si no se cumple',
        bloques: [
          { p: 'El art. 201 bis de la Ley General Tributaria fija multas de importe fijo:' },
          { ul: [
            '**50.000 € por cada ejercicio** a quien use un programa que no cumple, o que ha sido alterado.',
            '**150.000 € por ejercicio y por cada tipo de programa** a quien lo fabrique o comercialice.',
          ] },
          { p: 'Por eso conviene que el cumplimiento dependa del programa que eliges, y no de lo que hagas tú a mano.' },
        ],
      },
      {
        id: 'elegir', t: 'Cómo saber si tu programa cumple',
        bloques: [
          { pasos: [
            { t: 'Busca su declaración responsable', d: 'Todo fabricante tiene que firmar una declaración responsable de que su programa cumple el reglamento (art. 13) y tenerla a la vista de sus usuarios. Si no la encuentras, pregunta.' },
            { t: 'Mira qué modalidad ofrece', d: 'La declaración dice si el programa funciona solo como VERI*FACTU o también sin envío. Para un autónomo o una pyme, la modalidad VERI*FACTU suele ser la más cómoda.' },
            { t: 'Comprueba el QR de una factura de prueba', d: 'Una factura emitida con un programa adaptado lleva el código QR. Escanéalo: debe abrir la página de cotejo de la AEAT.' },
            { t: 'Pregunta cómo se corrige un error', d: 'Un programa que cumple no te deja borrar ni editar una factura emitida: te lleva a rectificarla o anularla.' },
          ] },
        ],
      },
      {
        id: 'fisquo', t: 'Cómo te ayuda Fisquo',
        bloques: [
          { p: 'Fisquo funciona en la modalidad VERI*FACTU: cada factura que emites genera su registro con la huella encadenada a la anterior y su código QR, y los errores se corrigen con rectificativas o anulaciones, nunca borrando. Su declaración responsable está publicada en fisquo.com/declaracion-responsable.' },
        ],
      },
    ],
    faqs: [
      ['¿Está confirmado el aplazamiento de Verifactu hasta 2028?', 'No. Hacienda lo anunció el 5 de octubre de 2026, pero a 30 de octubre de 2026 no estaba publicado en el BOE. Mientras tanto rigen las fechas del Real Decreto-ley 15/2025: 1 de enero de 2027 para sociedades y 1 de julio de 2027 para el resto.'],
      ['¿Tengo que darme de alta en algún sitio para usar Verifactu?', 'No hay un alta específica. Lo que necesitas es facturar con un programa que cumpla el reglamento; en la modalidad VERI*FACTU, el programa envía los registros a la AEAT.'],
      ['¿Verifactu es lo mismo que la factura electrónica?', 'No. Verifactu regula el programa con el que facturas y el registro de cada factura. La factura electrónica entre empresas de la Ley Crea y Crece es otra obligación distinta, con su propio calendario.'],
      ['Facturo con Excel o con Word: ¿me afecta?', 'Tiene matices, y la AEAT los trata en sus preguntas frecuentes sobre sistemas informáticos de facturación. Lo más seguro, antes de las fechas, es pasar a un programa que ya cumpla.'],
    ],
    relacionadas: ['factura-simplificada', 'calendario-fiscal-autonomo-2026-2027', 'calendario-fiscal-sociedad-2026-2027'],
    cta: { titulo: 'Factura ya con Verifactu', sub: 'Cada factura de Fisquo lleva su huella encadenada y su código QR. 30 días gratis, sin tarjeta.' },
    aviso: DISCLAIMER,
  },
  {
    slug: 'modelo-111',
    para: 'todos',
    corto: 'Modelo 111',
    titulo: 'Modelo 111 paso a paso',
    descripcion: 'Qué es el modelo 111, quién lo presenta, los tipos de retención (nóminas, profesionales, administradores), los plazos y cómo se rellenan sus casillas.',
    resumen: 'Las retenciones de nóminas, profesionales y administradores: quién lo presenta, los plazos y cómo se rellena.',
    minutos: 8,
    revision: '2026-10-30',
    normas: [
      'Ley 35/2006, del IRPF: art. 99 (obligación de practicar retenciones) y art. 101 (importe de las retenciones).',
      'Reglamento del IRPF, Real Decreto 439/2007: art. 76 (obligados a retener), art. 78 (la obligación nace al pagar), art. 80 (retenciones del trabajo y de los administradores), art. 95 (actividades profesionales) y art. 108 (declaración trimestral y resumen anual).',
      'Ley 39/2015, art. 30.5 (el plazo que acaba en día inhábil pasa al siguiente hábil).',
      'Instrucciones del modelo 111 en la sede electrónica de la AEAT.',
    ],
    secciones: [
      {
        id: 'que-es', t: 'Qué es el modelo 111',
        bloques: [
          { p: 'El modelo 111 es la declaración en la que ingresas en Hacienda las **retenciones de IRPF** que has practicado al pagar nóminas, facturas de profesionales y retribuciones de administradores. Ese dinero no es tuyo: lo descuentas de lo que pagas y lo adelantas a Hacienda en nombre de quien cobra, que luego lo resta en su declaración de la renta.' },
          { p: 'Es **trimestral** para casi todos los autónomos y pymes. Solo las empresas que el año anterior superaron 6.010.121,04 € de volumen de operaciones lo presentan cada mes.' },
        ],
      },
      {
        id: 'quien', t: 'Quién lo presenta',
        bloques: [
          { p: 'Lo presenta cualquier empresa o autónomo que, en el trimestre, haya **pagado** alguna renta sujeta a retención de las que van en este modelo. En la práctica:' },
          { ul: [
            'Si tienes **trabajadores** en nómina.',
            'Si pagas facturas de **profesionales** que te aplican retención: tu gestoría, un abogado, un arquitecto, un diseñador o un formador autónomo.',
            'Si eres una sociedad y pagas a tus **administradores** por su cargo.',
          ] },
          { p: 'Un autónomo sin empleados que no paga facturas de profesionales con retención **no presenta el 111**. Tampoco hace falta presentarlo en un trimestre en el que no has pagado ninguna de estas rentas. Pero si las has pagado, se presenta aunque la retención haya sido cero (por ejemplo, una nómina tan baja que no lleva retención).' },
          { nota: 'Las retenciones del alquiler de un local van en otro modelo, el **115**; las de intereses y dividendos, en el **123**; y las de pagos a no residentes, en el **216**.' },
        ],
      },
      {
        id: 'tipos', t: 'Qué retenciones se declaran y a qué tipo',
        bloques: [
          { tabla: { cab: ['Qué pagas', 'Retención', 'Casillas'], filas: [
            ['Nóminas de trabajadores', 'Según el sueldo y la situación familiar que el trabajador te comunica en el modelo 145', '01 a 03'],
            ['Retribuciones en especie (coche, vivienda…)', 'Ingreso a cuenta calculado sobre su valor', '04 a 06'],
            ['Administradores y consejeros', '35 %, o 19 % si la sociedad facturó menos de 100.000 € el año anterior', '01 a 03'],
            ['Facturas de profesionales', '15 %, o 7 % en el año de inicio de su actividad y los dos siguientes', '07 a 09'],
          ] } },
          { p: 'El 7 % de los profesionales que empiezan solo se aplica si el profesional te lo comunica por escrito y no ha ejercido una actividad profesional en el año anterior al inicio. Si no te dice nada, se retiene el 15 %.' },
          { p: 'La retención se calcula sobre el importe **sin IVA**. En una factura de 1.000 € más IVA de un profesional, la retención es de 150 €: le pagas 1.000 + 210 − 150 = 1.060 €, y los 150 € los ingresas tú con el 111.' },
        ],
      },
      {
        id: 'plazos', t: 'Plazos: cuándo se presenta',
        bloques: [
          { tabla: { cab: ['Trimestre', 'Se presenta', 'Con domiciliación (aprox.)'], filas: [
            ['1.er trimestre', 'Del 1 al 20 de abril', 'Hasta el 15 de abril'],
            ['2.º trimestre', 'Del 1 al 20 de julio', 'Hasta el 15 de julio'],
            ['3.er trimestre', 'Del 1 al 20 de octubre', 'Hasta el 15 de octubre'],
            ['4.º trimestre', 'Del 1 al 20 de enero (del año siguiente)', 'Hasta el 15 de enero'],
          ] } },
          { p: 'Ojo con el 4.º trimestre: el 111 acaba el **20 de enero**, no el 30 como el 303 y el 130. El del 4.º trimestre de 2026 se presenta hasta el miércoles 20 de enero de 2027. Si el último día cae en sábado, domingo o festivo, el plazo pasa al siguiente día hábil.' },
        ],
      },
      {
        id: 'cuando', t: 'En qué trimestre va cada retención',
        bloques: [
          { p: 'Una retención se declara en el trimestre en que **pagas** la renta, no en el de la fecha de la factura: según el art. 78 del reglamento, la obligación de retener nace cuando se paga.' },
          { ejemplo: {
            titulo: 'Ejemplo ficticio: una factura de marzo que se paga en abril',
            filas: [
              ['Factura de la gestoría, fecha 28 de marzo', '300,00 € + IVA'],
              ['Retención (15 %)', '45,00 €'],
              ['Fecha de pago', '5 de abril'],
              ['Trimestre en que se declara', '2.º trimestre', true],
            ],
            pie: 'Los importes son inventados para explicar el cálculo; no representan a ninguna empresa.',
          } },
        ],
      },
      {
        id: 'pasos', t: 'Cómo se rellena, paso a paso',
        bloques: [
          { pasos: [
            { t: 'Reúne lo pagado en el trimestre', d: 'Las nóminas pagadas (con su retención), las facturas de profesionales con retención que has pagado y, si eres una sociedad, lo pagado a los administradores.' },
            { t: 'Rendimientos del trabajo: casillas 01 a 03', d: 'En la 01, el número de perceptores (trabajadores y administradores distintos); en la 02, el importe íntegro pagado; en la 03, la suma de las retenciones. Lo pagado en especie va en las casillas 04 a 06.' },
            { t: 'Actividades económicas: casillas 07 a 09', d: 'En la 07, el número de profesionales distintos a los que has pagado; en la 08, la suma de las bases de sus facturas (sin IVA); en la 09, la suma de las retenciones.' },
            { t: 'Suma las retenciones', d: 'La casilla 28 recoge el total de retenciones e ingresos a cuenta. Si es una declaración complementaria, en la 29 va lo ingresado en la anterior, y la 30 es lo que queda por ingresar.' },
            { t: 'Presenta y paga', d: 'Se presenta por internet en la sede electrónica de la AEAT, con certificado electrónico o con otro sistema de identificación que admita (por ejemplo, Cl@ve si eres persona física). Domicilia el pago o págalo con el NRC del banco, y guarda el justificante.' },
          ] },
        ],
      },
      {
        id: 'ejemplo', t: 'Un ejemplo con números',
        bloques: [
          { ejemplo: {
            titulo: 'Ejemplo ficticio: un autónomo con una trabajadora, 2.º trimestre',
            filas: [
              ['Nóminas pagadas (3 × 1.600 €), casilla 02', '4.800,00 €'],
              ['Retenciones de las nóminas, casilla 03', '384,00 €'],
              ['Facturas pagadas a la gestoría (3 × 100 €), casilla 08', '300,00 €'],
              ['Retenciones de la gestoría (15 %), casilla 09', '45,00 €'],
              ['Total a ingresar, casilla 28', '429,00 €', true],
            ],
            pie: 'Los importes son inventados para explicar el cálculo; no representan a ninguna empresa. La retención de cada nómina depende de la persona.',
          } },
        ],
      },
      {
        id: 'resumen', t: 'El resumen anual: modelo 190',
        bloques: [
          { p: 'En enero, además del 111 del 4.º trimestre, se presenta el **modelo 190**: el resumen del año con cada trabajador, administrador y profesional, lo que cobró y lo que se le retuvo. El plazo acaba el **31 de enero**, o el siguiente día hábil.' },
          { p: 'La suma de las retenciones del 190 tiene que coincidir con lo ingresado en los cuatro 111 del año. Si no cuadra, Hacienda puede pedirte explicaciones.' },
        ],
      },
      {
        id: 'errores', t: 'Errores frecuentes',
        bloques: [
          { ul: [
            'Declarar la retención en el trimestre de la factura y no en el del pago.',
            'Calcular la retención sobre el total con IVA, en lugar de sobre la base.',
            'Aplicar el 7 % a un profesional que no te lo ha comunicado por escrito.',
            'Olvidar las facturas de la propia gestoría o de un abogado, que también llevan retención.',
            'Presentar el del 4.º trimestre el 30 de enero, con el 303: el 111 acaba el 20.',
            'Presentar fuera de plazo: sin requerimiento previo se aplica un recargo que crece con el retraso (art. 27 de la Ley General Tributaria).',
          ] },
        ],
      },
      {
        id: 'fisquo', t: 'Cómo te ayuda Fisquo',
        bloques: [
          { p: 'Fisquo calcula las casillas del 111 con las nóminas y los gastos con retención que ya has apuntado, cuenta cada retención en el trimestre en que la pagaste, te avisa antes del día 20 y prepara el 190 de enero. La presentación la haces tú o tu gestoría en la sede electrónica de la AEAT.' },
        ],
      },
    ],
    faqs: [
      ['Soy autónomo sin empleados: ¿tengo que presentar el 111?', 'Solo si en el trimestre has pagado facturas con retención a profesionales (por ejemplo, a tu gestoría) u otras rentas de este modelo. Si no has pagado ninguna, no se presenta.'],
      ['¿Qué pasa si un trimestre no he pagado nada con retención?', 'Si no has pagado ninguna renta sujeta a retención, no hay que presentarlo. Si has pagado alguna, aunque la retención sea cero, sí.'],
      ['¿El 111 del 4.º trimestre se presenta con el 303?', 'No. El 303 y el 130 del 4.º trimestre acaban el 30 de enero, pero el 111 y el 115 acaban el 20 de enero.'],
      ['¿Se retiene sobre el IVA?', 'No. La retención se calcula sobre la base, sin el IVA.'],
    ],
    relacionadas: ['retenciones-111-115-190-180', 'modelo-130', 'calendario-fiscal-autonomo-2026-2027'],
    cta: { titulo: 'Tu 111 calculado cada trimestre', sub: 'Fisquo calcula las retenciones con tus nóminas y gastos y prepara el 190 de enero. 30 días gratis, sin tarjeta.' },
    aviso: DISCLAIMER,
  },
];

// Las de pymes y sociedades (data/web-guias-pymes.js) van detrás. para: 'autonomos', 'pymes' o 'todos' (índice de /guias).
GUIAS.push(...GUIAS_PYMES);
export const PUBLICOS = [['pymes', 'Para pymes y sociedades'], ['autonomos', 'Para autónomos'], ['todos', 'Para autónomos y pymes']];
export const guia = (slug) => GUIAS.find((g) => g.slug === slug);
export const revisionDe = (g) => g.revision || REVISION_GUIAS;
