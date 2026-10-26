// Guías fiscales de la web pública para pymes y sociedades (/guias), con el mismo formato que data/web-guias.js. Las cifras
// (tipos del Impuesto sobre Sociedades, límites, plazos) son las mismas que usa la app: lib/modelos.js tiposIS y modelo202,
// lib/avisos.js plazosFiscales y lib/cuentasAnuales.js (modeloCuentas y plazosCuentas). Si cambian allí, se cambian aquí.

const DISCLAIMER = 'Esta guía es informativa y no sustituye el asesoramiento de un profesional. Si tu caso tiene particularidades (grupo de sociedades, actividad exenta, operaciones con otros países, territorio foral…), consúltalo con tu gestoría.';

export const GUIAS_PYMES = [
  {
    slug: 'calendario-fiscal-sociedad-2026-2027',
    para: 'pymes',
    corto: 'Calendario de la sociedad 2026-2027',
    titulo: 'Calendario fiscal de una sociedad (SL) 2026-2027',
    descripcion: 'Las fechas de una SL en 2026 y 2027: 303, 111, 115, 349, 202, resúmenes de enero, Impuesto sobre Sociedades (200) y cuentas anuales en el Registro.',
    resumen: 'Qué presenta una SL cada trimestre y cada año, con todas las fechas de 2026 y 2027 y el último día para domiciliar.',
    minutos: 8,
    normas: [
      'Reglamento del IVA, Real Decreto 1624/1992: art. 71 (303 y 390) y art. 81 (349).',
      'Reglamento del IRPF, Real Decreto 439/2007: art. 108 (111, 115 y sus resúmenes 190 y 180).',
      'Ley 27/2014, del Impuesto sobre Sociedades: art. 40 (pagos fraccionados, modelo 202) y art. 124 (declaración, modelo 200).',
      'Real Decreto 1065/2007: arts. 31 a 35 (modelo 347).',
      'Ley de Sociedades de Capital (Real Decreto Legislativo 1/2010): arts. 164, 253 y 279 (formulación, aprobación y depósito de las cuentas) y Ley 14/2013, art. 18 (legalización de libros).',
      'Ley 39/2015, art. 30.5 (el plazo que acaba en día inhábil pasa al siguiente hábil).',
    ],
    secciones: [
      {
        id: 'que-presenta', t: 'Qué presenta una sociedad',
        bloques: [
          { p: 'Una sociedad limitada en régimen general tiene más obligaciones que un autónomo: no presenta el 130 ni la renta, pero sí el **Impuesto sobre Sociedades** (modelo 200) con sus **pagos fraccionados** (modelo 202), y además tiene que llevar contabilidad, legalizar sus libros y depositar sus **cuentas anuales** en el Registro Mercantil.' },
          { tabla: { cab: ['Modelo', 'Qué es', 'Cuándo'], filas: [
            ['303', 'IVA del trimestre', 'Abril, julio, octubre y enero'],
            ['111', 'Retenciones de nóminas, administradores y profesionales', 'Abril, julio, octubre y enero'],
            ['115', 'Retenciones del alquiler del local', 'Abril, julio, octubre y enero'],
            ['349', 'Operaciones con empresas de la UE (si las hay)', 'Abril, julio, octubre y enero'],
            ['202', 'Pago fraccionado del Impuesto sobre Sociedades', 'Abril, octubre y diciembre'],
            ['390', 'Resumen anual del IVA', 'Enero'],
            ['190 y 180', 'Resúmenes anuales de retenciones', 'Enero'],
            ['347', 'Clientes y proveedores de más de 3.005,06 € al año', 'Febrero'],
            ['200', 'Impuesto sobre Sociedades del año anterior', 'Julio'],
            ['Registro Mercantil', 'Legalizar los libros y depositar las cuentas anuales', 'Abril y julio'],
          ] } },
          { nota: 'Solo presentas lo que te toca: sin trabajadores ni profesionales con retención no hay 111; sin local alquilado con retención, no hay 115; sin operaciones con la UE, no hay 349. Si en el año anterior facturaste más de 6.010.121,04 € o estás en el SII, el 303 y el 111 pasan a ser mensuales.' },
        ],
      },
      {
        id: 'calendario-2026', t: 'Calendario de 2026',
        bloques: [
          { calendarioSociedad: 2026 },
          { p: 'Las fechas ya están pasadas al siguiente día hábil cuando el plazo acaba en sábado, domingo o festivo nacional. Las del Registro Mercantil son las máximas si el año de la sociedad coincide con el natural.' },
        ],
      },
      {
        id: 'calendario-2027', t: 'Calendario de 2027',
        bloques: [
          { calendarioSociedad: 2027 },
        ],
      },
      {
        id: 'diferencias', t: 'Lo que cambia frente a un autónomo',
        bloques: [
          { ul: [
            'El **111 y el 115 del 4.º trimestre** se presentan hasta el **20 de enero**, diez días antes que el 303 del mismo trimestre.',
            'El **202** no tiene un pago en julio: se paga en abril, octubre y diciembre. Con la modalidad más habitual solo se presenta si sale algo a ingresar (lo explica la guía del Impuesto sobre Sociedades).',
            'El **200** se presenta en los 25 días naturales siguientes a los seis meses del cierre: del 1 al 25 de julio si el ejercicio acaba el 31 de diciembre.',
            'Las **cuentas anuales** se formulan en los tres meses siguientes al cierre, se aprueban en junta en los seis meses y se depositan en el mes siguiente a la aprobación.',
          ] },
        ],
      },
      {
        id: 'forales', t: 'Si la sociedad está en el País Vasco, Navarra o Canarias',
        bloques: [
          { p: 'Las haciendas forales tienen sus propios modelos y plazos (por ejemplo, el Impuesto sobre Sociedades foral y sus pagos fraccionados), y en Canarias el IVA se sustituye por el IGIC. Este calendario es el de la Agencia Tributaria para el territorio común.' },
        ],
      },
      {
        id: 'fisquo', t: 'Cómo te ayuda Fisquo',
        bloques: [
          { p: 'Fisquo enseña en Impuestos solo los modelos que te tocan según cómo trabaja tu sociedad, calcula sus casillas con las facturas, gastos y nóminas, te avisa antes de cada plazo (también en el calendario del móvil) y prepara el balance y la cuenta de pérdidas y ganancias para las cuentas anuales. Presentas tú o tu gestoría.' },
        ],
      },
    ],
    faqs: [
      ['¿Una sociedad sin actividad tiene que presentar algo?', 'Sí. Aunque no facture, presenta el Impuesto sobre Sociedades (modelo 200) y deposita sus cuentas anuales. El 303 depende de si sigue dada de alta en el IVA; consúltalo con tu gestoría.'],
      ['¿El 202 se presenta siempre?', 'No siempre. Con la modalidad que usa la mayoría de pymes (el 18 % de la cuota del último año declarado), si no sale nada a ingresar no hay que presentarlo. Las empresas que facturan más de 6 millones lo calculan sobre la base del año en curso y lo presentan siempre.'],
      ['¿Qué pasa si no deposito las cuentas anuales?', 'El Registro Mercantil cierra la hoja de la sociedad: no se puede inscribir casi nada hasta depositarlas, y puede haber una multa (arts. 282 y 283 de la Ley de Sociedades de Capital).'],
    ],
    relacionadas: ['impuesto-sociedades-200-202', 'retenciones-111-115-190-180', 'cuentas-anuales-sociedad'],
    cta: { titulo: 'Que no se le pase ningún plazo a tu sociedad', sub: 'Fisquo te avisa antes de cada presentación y calcula los modelos de tu sociedad. 30 días gratis, sin tarjeta.' },
    aviso: DISCLAIMER,
  },
  {
    slug: 'impuesto-sociedades-200-202',
    para: 'pymes',
    corto: 'Impuesto sobre Sociedades',
    titulo: 'Impuesto sobre Sociedades: modelos 200 y 202',
    descripcion: 'Impuesto sobre Sociedades de una pyme: tipos de 2025 a 2029, ajustes, reserva de capitalización, bases negativas, pagos del 202 y plazo del 200.',
    resumen: 'Los tipos que te tocan según lo que facturas, cómo se llega a la cuota y cómo funcionan los pagos fraccionados del 202.',
    minutos: 9,
    normas: [
      'Ley 27/2014, del Impuesto sobre Sociedades: art. 10 (base imponible), art. 15 (gastos no deducibles), art. 25 (reserva de capitalización), art. 26 (bases imponibles negativas), art. 29 (tipos de gravamen, con la Ley 7/2024), art. 40 (pagos fraccionados) y art. 101 (entidades de reducida dimensión).',
      'Manual práctico de Sociedades 2025 de la AEAT.',
      'Instrucciones de los modelos 200 y 202 en la sede electrónica de la AEAT.',
    ],
    secciones: [
      {
        id: 'que-es', t: 'Qué es y qué modelos lleva',
        bloques: [
          { p: 'El Impuesto sobre Sociedades grava el **beneficio de la sociedad**. Se declara una vez al año con el **modelo 200** y, durante el año, se adelanta con los **pagos fraccionados del modelo 202**. Es el equivalente, para una sociedad, de la renta y el 130 de un autónomo.' },
        ],
      },
      {
        id: 'tipos', t: 'Los tipos: dependen de lo que facturaste el año anterior',
        bloques: [
          { p: 'La Ley 7/2024 bajó los tipos de las empresas pequeñas de forma escalonada. El que te toca depende de la **cifra de negocios del año anterior**:' },
          { tabla: { cab: ['Ejercicio', 'Microempresa (menos de 1 M€): primeros 50.000 € / resto', 'Reducida dimensión (menos de 10 M€)', 'General'], filas: [
            ['2025', '21 % / 22 %', '24 %', '25 %'],
            ['2026', '19 % / 21 %', '23 %', '25 %'],
            ['2027', '17 % / 20 %', '22 %', '25 %'],
            ['2028', '17 % / 20 %', '21 %', '25 %'],
            ['Desde 2029', '17 % / 20 %', '20 %', '25 %'],
          ] } },
          { nota: '**Entidades de nueva creación**: tributan al 15 % en el primer año con base imponible positiva y en el siguiente (art. 29.1), salvo que les toque un tipo menor. No se aplica, entre otros casos, si la actividad ya la ejercía antes otra persona vinculada o si la sociedad es patrimonial.' },
        ],
      },
      {
        id: 'calculo', t: 'Cómo se llega a la cuota',
        bloques: [
          { pasos: [
            { t: 'Resultado contable', d: 'El beneficio o la pérdida de la cuenta de pérdidas y ganancias del año: ingresos menos gastos, amortizaciones incluidas.' },
            { t: 'Ajustes', d: 'Se suman los gastos que la ley no deja deducir (art. 15): el propio Impuesto sobre Sociedades, las multas y recargos, los donativos y las liberalidades, entre otros.' },
            { t: 'Reserva de capitalización', d: 'Desde 2025 puedes reducir la base en el 20 % del aumento de tus fondos propios si dotas una reserva indisponible durante cinco años (art. 25, con sus límites).' },
            { t: 'Bases negativas de años anteriores', d: 'Las pérdidas de años anteriores se compensan con el beneficio: hasta el 70 % de la base (con un mínimo de 1 millón) y sin ese límite en los tres primeros años con beneficio de una sociedad nueva (art. 26).' },
            { t: 'Cuota íntegra', d: 'La base imponible por el tipo que te toca. En la microempresa, los primeros 50.000 € a un tipo y el resto a otro.' },
            { t: 'Resultado', d: 'A la cuota se le restan las deducciones y bonificaciones, las retenciones que te hayan practicado (por ejemplo, de intereses) y los pagos fraccionados del 202. Si sale positivo, se ingresa; si sale negativo, Hacienda lo devuelve.' },
          ] },
        ],
      },
      {
        id: 'ejemplo', t: 'Un ejemplo con números',
        bloques: [
          { ejemplo: {
            titulo: 'Ejemplo ficticio: microempresa en 2026',
            filas: [
              ['Resultado contable', '78.000,00 €'],
              ['Ajuste: multa de tráfico (no deducible)', '+ 2.000,00 €'],
              ['Base imponible', '80.000,00 €'],
              ['Primeros 50.000 € al 19 %', '9.500,00 €'],
              ['Resto (30.000 €) al 21 %', '6.300,00 €'],
              ['Cuota íntegra', '15.800,00 €'],
              ['Pagos fraccionados del 202 en 2026', '− 3.600,00 €'],
              ['Resultado a ingresar en el 200 (julio de 2027)', '12.200,00 €', true],
            ],
            pie: 'Los importes son inventados para explicar el cálculo; no representan a ninguna sociedad.',
          } },
        ],
      },
      {
        id: 'pagos-202', t: 'El modelo 202: los pagos fraccionados',
        bloques: [
          { p: 'Se presenta del **1 al 20 de abril, de octubre y de diciembre**. Hay dos formas de calcularlo (art. 40):' },
          { ul: [
            '**Sobre la cuota (art. 40.2)**, la que usa la mayoría de pymes: el 18 % de la cuota a ingresar del último Impuesto sobre Sociedades presentado. En abril, el último presentado suele ser el de hace dos años; en octubre y diciembre, ya el del año anterior. Si esa cuota fue cero o negativa, no sale nada y no hay que presentar el 202.',
            '**Sobre la base (art. 40.3)**: se calcula con el beneficio del propio año hasta el último día del mes anterior. Es obligatoria si la cifra de negocios de los doce meses anteriores pasó de 6 millones; las demás pueden elegirla en el censo (modelo 036) en febrero.',
          ] },
        ],
      },
      {
        id: 'plazos-200', t: 'Cuándo se presenta el 200',
        bloques: [
          { p: 'En los **25 días naturales siguientes a los seis meses** posteriores al cierre del ejercicio. Si el ejercicio coincide con el año natural, **del 1 al 25 de julio** (si el 25 cae en fin de semana, pasa al lunes). Con domiciliación hay que presentarlo unos días antes.' },
          { nota: 'Aunque la sociedad haya tenido pérdidas o no haya tenido actividad, el 200 se presenta igual.' },
        ],
      },
      {
        id: 'errores', t: 'Errores frecuentes',
        bloques: [
          { ul: [
            'Aplicar el tipo general del 25 % a una pyme que tiene derecho a uno menor por su cifra de negocios.',
            'Olvidar los ajustes de los gastos no deducibles (el propio impuesto, las multas).',
            'No compensar las bases negativas de años anteriores o pasarse del límite.',
            'Presentar el 202 de abril con la cuota del año anterior cuando el último 200 presentado es el de hace dos años.',
            'No presentar el 200 porque hubo pérdidas.',
          ] },
        ],
      },
      {
        id: 'fisquo', t: 'Cómo te ayuda Fisquo',
        bloques: [
          { p: 'Fisquo prepara un borrador del Impuesto sobre Sociedades con lo que hay en tu contabilidad: el resultado, los gastos no deducibles, la reserva de capitalización, las bases negativas que apuntes y el tipo que te toca por tu cifra de negocios. También calcula los pagos del 202 y te avisa de cuándo toca cada uno. Es un borrador para revisar con tu gestoría.' },
        ],
      },
    ],
    faqs: [
      ['¿Qué es una empresa de reducida dimensión?', 'La que tuvo una cifra de negocios de menos de 10 millones de euros en el año anterior (art. 101 de la ley). Además de un tipo menor, tiene ventajas como la libertad de amortización de ciertos bienes o la amortización acelerada.'],
      ['¿Y una microempresa a efectos del impuesto?', 'La que facturó menos de 1 millón de euros en el año anterior. Tributa con dos tramos: los primeros 50.000 € de base a un tipo y el resto a otro.'],
      ['¿El 202 se puede domiciliar?', 'Sí, como el 200. Hay que presentarlo unos días antes del final del plazo.'],
    ],
    relacionadas: ['calendario-fiscal-sociedad-2026-2027', 'cuentas-anuales-sociedad', 'retenciones-111-115-190-180'],
    cta: { titulo: 'Sabe cuánto pagará tu sociedad', sub: 'Fisquo lleva la contabilidad y calcula el borrador del Impuesto sobre Sociedades y sus pagos. 30 días gratis, sin tarjeta.' },
    aviso: DISCLAIMER,
  },
  {
    slug: 'retenciones-111-115-190-180',
    para: 'todos',
    corto: 'Retenciones: 111, 115, 190 y 180',
    titulo: 'Retenciones: modelos 111, 115, 190 y 180',
    descripcion: 'Retenciones de nóminas, administradores y profesionales (111) y del alquiler del local (115), con sus resúmenes 190 y 180: tipos y plazos.',
    resumen: 'Las retenciones de nóminas, profesionales y alquiler que ingresas por otros, cuándo se presentan y sus resúmenes de enero.',
    minutos: 7,
    normas: [
      'Reglamento del IRPF, Real Decreto 439/2007: art. 80 (retenciones de los rendimientos del trabajo, con el 35 % y el 19 % de los administradores), art. 101 (actividades profesionales y arrendamientos), art. 108 (obligaciones del retenedor: 111, 115, 190 y 180).',
      'Ley 35/2006, del IRPF: art. 101.',
      'Instrucciones de los modelos 111, 115, 190 y 180 en la sede electrónica de la AEAT.',
    ],
    secciones: [
      {
        id: 'que-son', t: 'Qué son las retenciones que ingresas',
        bloques: [
          { p: 'Cuando pagas una nómina, la factura de un profesional o el alquiler de un local, te quedas una parte (la **retención**) y la ingresas en Hacienda en nombre de quien cobra. Ese dinero no es tuyo: lo adelantas por él, que luego lo descuenta en su renta. Lo hacen las sociedades y también los autónomos que tienen empleados, contratan a profesionales o alquilan un local.' },
        ],
      },
      {
        id: 'modelo-111', t: 'El modelo 111: nóminas, administradores y profesionales',
        bloques: [
          { ul: [
            '**Nóminas**: la retención de cada trabajador depende de su sueldo y su situación familiar (lo que comunica en el modelo 145).',
            '**Administradores y consejeros**: el 35 %, o el 19 % si la sociedad facturó menos de 100.000 € el año anterior.',
            '**Profesionales** que te facturan con IRPF (tu gestoría, un abogado, un diseñador autónomo): el 15 %, o el 7 % en sus tres primeros años de actividad.',
          ] },
          { p: 'Se presenta **del 1 al 20 de abril, julio y octubre** y el del 4.º trimestre **hasta el 20 de enero**. Las empresas que facturaron más de 6.010.121,04 € el año anterior lo presentan cada mes. Si has pagado nóminas o facturas con retención en el trimestre, se presenta aunque la retención haya sido cero.' },
        ],
      },
      {
        id: 'modelo-115', t: 'El modelo 115: el alquiler del local',
        bloques: [
          { p: 'Si alquilas un local, una oficina o una nave para tu actividad, en general retienes el **19 %** de la renta (sin el IVA) y lo ingresas con el 115, en los mismos plazos que el 111. No hay retención, entre otros casos, si el arrendador te acredita que está exonerado o si alquilas una vivienda para vivir en ella.' },
        ],
      },
      {
        id: 'resumenes', t: 'Los resúmenes de enero: 190 y 180',
        bloques: [
          { p: 'En enero se presentan los resúmenes del año anterior, **hasta el 31 de enero** (si cae en fin de semana, pasa al lunes): el **190** con cada trabajador, administrador y profesional (lo que cobró y lo que se le retuvo) y el **180** con cada arrendador. Lo que sumen tiene que coincidir con lo ingresado en los 111 y 115 del año.' },
          { nota: 'En el 190 y el 180 cada perceptor lleva su NIF y su provincia. Ten actualizadas las fichas de tus trabajadores y proveedores (con su código postal) antes de enero.' },
        ],
      },
      {
        id: 'ejemplo', t: 'Un ejemplo con números',
        bloques: [
          { ejemplo: {
            titulo: 'Ejemplo ficticio: una SL en el 2.º trimestre',
            filas: [
              ['Retenciones de las nóminas de dos trabajadores (3 meses)', '1.740,00 €'],
              ['Retención de la factura de la gestoría (15 % de 600 €)', '90,00 €'],
              ['Modelo 111 a ingresar', '1.830,00 €', true],
              ['Alquiler del local (3 × 1.200 € sin IVA): 19 %', '684,00 €'],
              ['Modelo 115 a ingresar', '684,00 €', true],
            ],
            pie: 'Los importes son inventados para explicar el cálculo; no representan a ninguna empresa.',
          } },
        ],
      },
      {
        id: 'fisquo', t: 'Cómo te ayuda Fisquo',
        bloques: [
          { p: 'Con las nóminas y los gastos con retención, Fisquo calcula el 111 y el 115 de cada trimestre, prepara el 190 y el 180 de enero (con su fichero para la sede de la AEAT) y te avisa de los plazos. Presentas tú o tu gestoría.' },
        ],
      },
    ],
    faqs: [
      ['Soy autónomo sin empleados: ¿presento el 111?', 'Solo si pagas facturas con retención a profesionales (por ejemplo, a tu gestoría) o tienes otros pagos sujetos a retención. Si no, no.'],
      ['¿La retención del alquiler se calcula con el IVA?', 'No. Se calcula sobre la renta sin el IVA.'],
      ['¿Qué pasa si no coinciden el 190 y los 111?', 'Hacienda puede pedirte explicaciones. Antes de presentar el 190, comprueba que la suma de las retenciones coincide con lo ingresado en los cuatro 111 del año.'],
    ],
    relacionadas: ['calendario-fiscal-sociedad-2026-2027', 'calendario-fiscal-autonomo-2026-2027', 'impuesto-sociedades-200-202'],
    cta: { titulo: 'Retenciones calculadas solas', sub: 'Fisquo calcula el 111 y el 115 con tus nóminas y gastos y prepara el 190 y el 180. 30 días gratis, sin tarjeta.' },
    aviso: DISCLAIMER,
  },
  {
    slug: 'cuentas-anuales-sociedad',
    para: 'pymes',
    corto: 'Cuentas anuales y libros',
    titulo: 'Cuentas anuales y libros de una sociedad',
    descripcion: 'Legalizar los libros y formular, aprobar y depositar las cuentas anuales de una SL: plazos, modelo de pymes o abreviado y qué pasa si no se hace.',
    resumen: 'Legalizar los libros, formular, aprobar y depositar las cuentas: plazos, modelos y qué pasa si no se hace.',
    minutos: 7,
    normas: [
      'Ley de Sociedades de Capital (Real Decreto Legislativo 1/2010): art. 164 (junta ordinaria), art. 253 (formulación), arts. 257 y 258 (balance y pérdidas y ganancias abreviados), art. 279 (depósito), arts. 282 y 283 (cierre registral y sanciones).',
      'Real Decreto 1515/2007 (Plan General de Contabilidad de Pymes) y Real Decreto 1514/2007 (Plan General de Contabilidad).',
      'Ley 14/2013, de apoyo a los emprendedores, art. 18 (legalización telemática de los libros).',
      'Código de Comercio, arts. 25 a 28 (libros obligatorios).',
    ],
    secciones: [
      {
        id: 'libros', t: 'Los libros que lleva una sociedad',
        bloques: [
          { p: 'Una sociedad tiene que llevar contabilidad por partida doble con el plan general contable. Los libros obligatorios son el **libro diario** y el de **inventarios y cuentas anuales** (art. 25 del Código de Comercio), además del libro de **actas** y el registro de **socios**.' },
          { p: 'Se **legalizan** cada año de forma telemática en el Registro Mercantil del domicilio, en los **cuatro meses siguientes al cierre**: hasta el 30 de abril si el ejercicio acaba el 31 de diciembre.' },
        ],
      },
      {
        id: 'pasos', t: 'Formular, aprobar y depositar',
        bloques: [
          { pasos: [
            { t: 'Formular (hasta el 31 de marzo)', d: 'Los administradores preparan y firman las cuentas anuales en los tres meses siguientes al cierre (art. 253).' },
            { t: 'Aprobar (hasta el 30 de junio)', d: 'La junta general de socios las aprueba en los seis meses siguientes al cierre, junto con la aplicación del resultado (qué se hace con el beneficio o cómo se cubre la pérdida).' },
            { t: 'Depositar (hasta el 30 de julio como máximo)', d: 'Se presentan en el Registro Mercantil en el mes siguiente a la aprobación (art. 279), casi siempre de forma telemática.' },
          ] },
          { p: 'Las fechas son las de un ejercicio que coincide con el año natural y la junta el último día posible; si la junta se celebra antes, el mes para depositar empieza antes.' },
        ],
      },
      {
        id: 'modelos', t: 'Qué modelo de cuentas te toca',
        bloques: [
          { p: 'Depende del tamaño. Se mira si durante **dos años seguidos** cumples al menos dos de estos tres límites:' },
          { tabla: { cab: ['Modelo', 'Activo', 'Cifra de negocios', 'Trabajadores (media)'], filas: [
            ['Pymes (con criterios de microempresa)', 'Hasta 1 M€', 'Hasta 2 M€', 'Hasta 10'],
            ['Pymes', 'Hasta 4 M€', 'Hasta 8 M€', 'Hasta 50'],
            ['Abreviado o normal', 'Más', 'Más', 'Más'],
          ] } },
          { p: 'El modelo de pymes lleva **balance, cuenta de pérdidas y ganancias, estado de cambios en el patrimonio neto y memoria**. Cada línea del balance y de la cuenta de pérdidas y ganancias tiene su código de casilla en el modelo oficial del Registro (por ejemplo, 10000 es el total del activo y 49500 el resultado del ejercicio).' },
        ],
      },
      {
        id: 'documentos', t: 'Qué se presenta en el Registro',
        bloques: [
          { ul: [
            'Las cuentas anuales firmadas por los administradores.',
            'El certificado del acuerdo de aprobación de la junta y de la aplicación del resultado.',
            'La hoja de datos generales de la sociedad y las declaraciones que pide el modelo (acciones propias, medioambiental y titular real).',
            'El informe de auditoría, solo si la sociedad está obligada a auditarse o se ha auditado.',
          ] },
          { nota: 'La auditoría solo es obligatoria por encima de ciertos límites de tamaño (art. 263 de la Ley de Sociedades de Capital) o si lo pide una minoría de socios. Consúltalo con tu gestoría.' },
        ],
      },
      {
        id: 'si-no', t: 'Qué pasa si no se depositan',
        bloques: [
          { p: 'El Registro **cierra la hoja de la sociedad**: hasta que se depositen, no se puede inscribir casi ningún acuerdo (cambio de administradores, de domicilio, de estatutos…). Además puede haber una **multa** del Instituto de Contabilidad y Auditoría de Cuentas (arts. 282 y 283).' },
        ],
      },
      {
        id: 'fisquo', t: 'Cómo te ayuda Fisquo',
        bloques: [
          { p: 'Fisquo lleva la contabilidad de tu sociedad sola a partir de facturas, gastos, nóminas y banco: libro diario con su cierre y su apertura, mayor, sumas y saldos y cuentas anuales del modelo de pymes con los códigos de casilla del Registro. Puedes descargar el balance y la cuenta de pérdidas y ganancias en CSV para pasarlos al programa de depósito o a tu gestoría, y un borrador de la memoria. Te avisa de los plazos de legalización y depósito. Fisquo no presenta nada en el Registro.' },
        ],
      },
    ],
    faqs: [
      ['¿Una sociedad sin actividad tiene que depositar las cuentas?', 'Sí. Mientras la sociedad exista, tiene que formular, aprobar y depositar sus cuentas cada año, aunque estén a cero.'],
      ['¿Los autónomos depositan cuentas?', 'No. El autónomo lleva sus libros registro (de ingresos, gastos y bienes de inversión) para Hacienda, pero no deposita cuentas en el Registro Mercantil.'],
      ['¿Puedo cambiar las cuentas después de depositarlas?', 'Solo en casos concretos y con un nuevo acuerdo. Por eso conviene revisarlas bien con tu gestoría antes de la junta.'],
    ],
    relacionadas: ['impuesto-sociedades-200-202', 'calendario-fiscal-sociedad-2026-2027', 'retenciones-111-115-190-180'],
    cta: { titulo: 'La contabilidad de tu sociedad, hecha sola', sub: 'Fisquo lleva el diario, el balance y las cuentas anuales con lo que ya apuntas. 30 días gratis, sin tarjeta.' },
    aviso: DISCLAIMER,
  },
];
