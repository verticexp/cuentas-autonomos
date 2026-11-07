# Oficina Fisquo

Este repositorio también recibe cambios desde la oficina virtual de Fisquo. Cada cambio lo revisa el director antes de publicarse.

## Cuadro del lunes: cifras automáticas (6 de noviembre de 2026)

### Cuentas internas y demos (7 de noviembre de 2026)

El panel y la consulta privada comparten la exclusión de empresas con `demo: true` o `interna: true`. Las filas activas siguen disponibles en administración, con aviso «Interna/demo · excluida» y filtro propio. El recuento `excluidas` aparece separado en el panel y en `GET /api/admin/cifras`: cuenta empresas distintas, incluidas las cerradas, sin devolver sus datos a la oficina.

La exclusión abarca estados, pruebas a punto de acabar, conversión y sus denominadores, altas del mes y semanales (también las anteriores a la marca), MRR/ARR, bajas mensuales/semanales y base de pago del día 1, planes, orígenes, recomendaciones y activación. También se filtran las empresas en la actividad y las personas cuya pertenencia conocida sea exclusivamente a cuentas excluidas. Una persona con acceso a una empresa real sigue contando: el historial de actividad guarda conjuntos separados de personas y empresas, sin atribución por sesión. No se reescribe ese historial.

Identificación comprobada en el código:

- Las demos de gestoría y Aurora ya guardan `demo: true`. La demo principal no lo guardaba por sí sola; se añade a sus futuras creaciones. No se ha ejecutado ningún generador ni rehecho ninguna cuenta existente.
- La demo pública es un recorrido en el navegador con datos de ejemplo, sin crear usuarios ni empresas. Registrarse después sigue siendo un alta normal.
- Correos del equipo, ser administrador, nombres que contengan «demo», tener una prueba comercial, usar VeriFactu de pruebas o un plan gratis no son una identificación fiable de cuenta interna. No se excluyen automáticamente por esos criterios.
- La nueva marca `interna` es independiente de `demo`, porque esta última también tiene consecuencias en la vinculación con despachos. «Marcar como interna/demo» e «Incluir en las cifras» solo cambian `interna`, con autorización de administrador y el mismo cerrojo que los cambios de suscripción. No cambian plan, acceso, facturas, datos fiscales ni historial de pagos. Una demo ya identificada no puede incluirse con este control. La operación admite cuentas cerradas para corregir el histórico.

**Pendiente de aplicación real:** Marc confirmó que las cinco empresas «en prueba» del 7-11 son demos nuestras, pero este encargo no incluye sus nombres o identificadores y aquí no se dispone de la lista real sin acceder a secretos. Se han solicitado los identificadores. No se ha marcado ninguna cuenta real ni se ha añadido una regla que convierta automáticamente todas las pruebas en internas: eso también excluiría clientes nuevos. Tras la revisión y publicación por la oficina, identificar esas cinco empresas concretas y marcar únicamente las que aún no tengan `demo: true`; comprobar el recuento separado, las pruebas comerciales restantes y la igualdad entre panel y consulta privada. La prueba con cinco empresas ficticias da cinco excluidas y cero pruebas comerciales; no es evidencia sobre las cuentas reales.

Validación de este cambio: pasan las 38 pruebas específicas de cálculo, autorización, privacidad, persistencia, concurrencia con Stripe e interacción del listado (marcar, desmarcar, filtrar, demos protegidas y error de guardado). Se comprueba el JSX de la página sin cargar configuración privada. No se ha hecho revisión visual en navegador ni se ha publicado. `npm test` se ejecutó tal cual, pero quedó bloqueado en pruebas que necesitan servidores locales. La comprobación directa de escucha en `127.0.0.1` devuelve `EPERM`; se detuvo la ejecución pendiente. La batería completa sigue pendiente en un entorno que permita dichos servidores.

El panel cuenta bajas de empresas que pagaban y pierden su suscripción o dan de baja la empresa. Una prueba que caduca sin pagar no es una baja. Pedir la cancelación al final del periodo tampoco es una baja todavía; se cuenta cuando se hace efectiva. Un reintento de cobro no cuenta mientras conserve el acceso. Los avisos repetidos y las reactivaciones no duplican una empresa dentro del mismo mes o semana. Si una cuenta que pagaba pasa a ser regalada, se conserva su baja de pago.

La fecha de inicio del seguimiento queda guardada una sola vez, al abrir el panel o al observar un cambio de plan o una baja. Se muestra en el panel y se entrega a la oficina. No se reconstruyen bajas anteriores sin historial. El mes inicial se marca como parcial y no muestra porcentaje si falta la base del día 1. El porcentaje usa solo los clientes que pagaban al comenzar el mes; el total también incluye clientes que empezaron a pagar y se marcharon en ese mismo mes.

Ya se calculan sin copiar a mano:

- Altas de prueba del mes y por semana: registros con plan, sin cuentas regaladas, Fundador ni licencias incluidas por un despacho. Cerrar una cuenta no borra su alta de esa semana.
- Bajas de pago del mes y por semana, con fecha de inicio y aviso de cobertura incompleta.
- Ingreso recurrente mensual sin IVA, con descuentos vigentes y planes anuales repartidos entre doce meses. Excluye cuentas gratis, pruebas y pagos fallidos. Es ingreso recurrente contratado, no el dinero efectivamente cobrado en el banco.
- También están disponibles empresas de pago, pruebas activas, conversión, actividad y procedencia de las altas. El marcador de ideas y la revisión de las apuestas siguen necesitando la valoración de la oficina.

### Uso por la oficina

La consulta de solo lectura es `GET /api/admin/cifras`, con `Authorization: Bearer <clave de oficina>`. La clave independiente se configura mediante `OFICINA_CIFRAS_TOKEN` y no debe incluirse en la hoja, documentos, registros ni mensajes. Sin configurar devuelve 404; con autorización incorrecta, 401; si falla la lectura, 503. Nunca se debe convertir uno de esos errores en cifras a cero. No da acceso al resto del panel ni devuelve nombres, NIF, correos, identificadores o suscripciones. No usa cookies, no inicia el seguimiento y no permite caché.

Campos para rellenar la hoja:

- `generado`: momento de la consulta. `mrr` y `arr`: euros sin IVA; el panel usa céntimos internamente.
- `altasMes` y `bajasMes`: mes en curso, desde su día 1 hasta la consulta. `bajasMesParcial` avisa de que el seguimiento no cubre todo el mes; `bajasDesde` indica desde qué día se observa. `bajasPct` es nulo cuando no hay una base mensual fiable.
- `altasSemanas`: doce semanas de registros, cada una con `desde` y `n`.
- `bajasSemanas`: las mismas doce semanas, con `desde`, `hasta`, `n` y `completa`. Una semana incompleta puede tener bajas observadas, pero no debe presentarse como un recuento completo.
- `pago`, `prueba` y `conversion`: situación en el momento de la consulta; no son fotografías históricas de semanas pasadas.

Los cortes de mes y semana mantienen el criterio UTC del panel. Cada semana empieza el lunes a las 00:00 UTC, incluido, y termina el lunes siguiente a las 00:00 UTC, excluido. En noviembre corresponde a la 01:00 peninsular. Para la hoja del lunes 16-11, se usa el registro semanal `desde: 2026-11-09`, `hasta: 2026-11-16`; si el seguimiento comenzó como tarde al iniciar esa semana y se consulta tras su cierre, `completa` será verdadero. El ingreso mensual y la conversión se toman en ese momento y la oficina debe guardar esa fotografía al rellenar la hoja.

### Estado de entrega y comprobaciones

Las 29 pruebas específicas del panel y la consulta de la oficina pasan. Cubren autorización, privacidad, ausencia de escrituras en la consulta, cancelaciones y reactivaciones, avisos concurrentes, exclusión de pruebas, regalos, descuentos e ingresos sin IVA, periodos exactos y la semana para la hoja del 16-11. También se ha comprobado la compilación del JSX del panel; no sustituye una revisión visual en navegador.

Se ha ejecutado `npm test` tal cual. La batería completa no ha podido terminar en este entorno: abrir un servidor local en 127.0.0.1 devuelve `EPERM` y las pruebas que usan la base simulada por HTTP quedan esperando. Se han detenido las ejecuciones atascadas. No se considera pasada la batería completa; falta ejecutarla en el entorno de revisión con servidores locales permitidos.

El cambio queda preparado para revisión, sin publicar. No se ha accedido a secretos ni a datos reales. La lectura y escritura programada de la hoja pertenecen a la oficina: este repositorio proporciona las cifras, pero no contiene la conexión a esa hoja. Para afirmar que el 16-11 se rellena sola, quedan por comprobar la configuración privada de la consulta y la ejecución programada que guarda las cifras en la hoja concreta. Después de publicarlo, hay que abrir el panel antes del inicio de la semana del 9-11 para garantizar su cobertura completa. Si la oficina no tiene ya esa conexión, Marc debe indicar qué hoja es y facilitar acceso por el canal privado habitual, sin pegar claves en el encargo.
