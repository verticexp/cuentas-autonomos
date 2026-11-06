# Oficina Fisquo

Este repositorio también recibe cambios desde la oficina virtual de Fisquo. Cada cambio lo revisa el director antes de publicarse.

## Cuadro del lunes: cifras automáticas (6 de noviembre de 2026)

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
