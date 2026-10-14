# Copias y recuperación de Netto

Requiere Node 22 o posterior y las dependencias ya instaladas. Los comandos se ejecutan desde el proyecto. `KV_REST_API_URL` y `KV_REST_API_TOKEN` identifican la base: para copiar, apunta al origen; para restaurar, al destino. Usa credenciales separadas para los simulacros.

## Contenido y límites

Se recorren con SCAN las claves `cuentas:*`. Se conservan hashes, sets, listas (con su orden), strings crudos y caducidades absolutas en milisegundos. Se excluyen `cuentas:sesion*`, `cuentas:intentos*`, `cuentas:desbloqueo*` y `cuentas:cerrojo*`. Una instalación sin facturas o totalmente vacía también se puede copiar. Si hay claves de empresa, debe existir el hash `cuentas:empresas`.

La copia v2 incluye versión, fecha, datos, resumen por tipos y empresas, cantidades de facturas/registros y una huella SHA-256 de los datos con claves ordenadas. Cada intento lee tres veces las claves de una empresa y exige que coincidan las huellas de sus claves, tipos y valores crudos, incluida la lectura que se guarda. Así se detectan también ediciones de documentos existentes, conciliaciones bancarias y claves nuevas o eliminadas. Se realizan como máximo tres intentos por empresa; si siguen los cambios, la copia falla con un error explícito y no devuelve una copia inestable. El formato v1/v2 se mantiene; las copias antiguas con `resumen.inconsistentes` siguen siendo legibles, pero su verificación devuelve `ok: false`.

Estas lecturas no son una instantánea atómica de Redis: las caducidades no entran en la firma de estabilidad (PTTL varía entre lecturas), los hashes globales se leen aparte y las empresas se copian sucesivamente. Para una recuperación fiable, detén emisiones, trabajos programados y otras escrituras durante la copia y la restauración.

## Cifrado y custodia

Genera una clave una sola vez, en un terminal privado:

```sh
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('base64'))"
```

Guarda el resultado en un gestor de secretos/contraseñas, separado de las copias, con una segunda custodia recuperable. Configúralo como `COPIA_CLAVE` en el entorno local y en el ejecutor de copias. No lo añadas al repositorio, a registros, al resumen ni al mismo almacenamiento que contiene las copias. Conserva las claves antiguas si cambias de clave.

```sh
node scripts/copia.mjs
```

Con `COPIA_CLAVE` se escribe únicamente `copia.json.enc` y `copia-resumen.json`. Se comprime el JSON con gzip y se cifra con AES-256-GCM: cabecera `NETTOCOPIA2`, IV aleatorio de 12 bytes, tag de 16 bytes y contenido cifrado. Una clave incorrecta o un byte alterado provoca un error de autenticación. Se verifica la copia antes de escribirla; un error produce código de salida distinto de cero.

Sin clave, el comando falla. `node scripts/copia.mjs --sin-cifrar` autoriza explícitamente escribir `copia.json` en claro; si existe `COPIA_CLAVE`, se sigue cifrando incluso con esa opción. Usa un directorio de trabajo protegido y archiva cada ejecución con su fecha fuera de la máquina/base de origen; los nombres habituales se reutilizan. Los archivos nuevos se crean con permisos `0600`. Un JSON en claro de una ejecución anterior no se elimina automáticamente: retíralo conforme a tu procedimiento de custodia.

El resumen contiene solo versión, fecha, huella, ids de empresas y cantidades; permite revisar volumen, fecha e inconsistencias sin descifrar. No demuestra por sí solo que el archivo cifrado esté íntegro: para eso hay que descifrar y verificar con la clave.

## Verificar y simular

```sh
node scripts/restaura.mjs copia.json.enc
```

Sin `--escribir` solo verifica y muestra el plan: claves nuevas, existentes, por sobrescribir y caducadas. No escribe ni genera una copia previa. Requiere acceso de lectura al destino para comprobar qué existe. La verificación valida versión, huella, prefijo, resumen e integridad de cada empresa. También comprueba las referencias recíprocas entre facturas cobradas/gastos pagados y sus movimientos bancarios: el movimiento debe existir y estar conciliado con ese documento. Las incoherencias bancarias producen avisos y errores (`ok: false`); los cobros/pagos manuales sin referencia bancaria siguen siendo válidos. `sin-instantanea` y `contador-atrasado` se imprimen como avisos; las demás incidencias de integridad son errores. Las empresas marcadas como inconsistentes en copias antiguas también producen avisos y errores.

Se aceptan copias v1 `{ fecha, datos }` con hashes como objeto o lista plana de pares. No tienen huella ni garantía de consistencia y se indica como aviso. `--forzar` permite continuar con errores de verificación después de revisarlos: no permite descifrar contenido manipulado ni restaurar claves fuera de `cuentas:` o estructuras inválidas.

## Recuperar una empresa

Apunta las variables KV al destino y detén sus escrituras. Primero revisa el plan:

```sh
node scripts/restaura.mjs copia.json.enc --empresa=EMPRESA_ID --sobrescribir
node scripts/restaura.mjs copia.json.enc --empresa=EMPRESA_ID --sobrescribir --escribir
```

La selección incluye solo `cuentas:<nombre>:EMPRESA_ID`, su campo en `cuentas:empresas`, usuarios cuyas membresías (`usuario.empresas`, con compatibilidad para el campo antiguo `membresias` y cuentas de una sola empresa) incluyan esa empresa, y emails que apunten a esos usuarios. Las otras empresas y sus usuarios se conservan. Al sobrescribir una identidad ya existente, se restaura únicamente su membresía en la empresa seleccionada y se conservan las demás membresías, su empresa principal y sus índices de correo compartidos.

Con sobrescritura, cada clave de empresa se elimina y se escribe de nuevo: desaparecen los campos o elementos sobrantes de esa clave. En los hashes globales se sustituyen solo los campos del ámbito seleccionado. Los usuarios sobrantes pierden su membresía en esa empresa; si aún pertenecen a otra, se conservan junto con sus correos. Solo se eliminan los usuarios/emails que dejan de pertenecer a ninguna empresa. Sin sobrescritura se saltan las claves existentes; para los hashes globales de una selección de empresa se añaden únicamente campos ausentes.

Las claves caducadas no se restauran; las demás conservan su fecha límite con PEXPIRE. Redis no admite caducidad por campo: al fusionar un hash global ya existente se conserva su caducidad actual para no modificar la de otras empresas. Un hash global nuevo sí recibe la caducidad de la copia.

Con `--sobrescribir --escribir` se exige `COPIA_CLAVE` y se guarda, antes de modificar Redis, `antes-de-restaurar-<fecha>.json.enc`. Contiene el estado previo completo del ámbito afectado: la empresa seleccionada y sus campos globales, o toda la base `cuentas:*` si no hay filtro. Se conserva el ámbito completo para poder verificar sus cadenas y revertir las claves sustituidas. El comando imprime el nombre. Si no puede cifrar/guardar la copia previa, o detecta cambios persistentes en ella, aborta sin restaurar.

Al terminar se vuelve a leer la facturación restaurada y se imprime el resultado de `comprobarIntegridad` por empresa. Las incidencias graves producen salida distinta de cero. Una restauración consta de varios comandos Redis: un corte puede dejarla a medias; mantén el servicio detenido, revisa el informe y repite desde una copia válida.

## Recuperar todo en una base nueva

Crea un destino vacío y configura sus variables KV. Verifica primero y escribe después:

```sh
node scripts/restaura.mjs copia.json.enc
node scripts/restaura.mjs copia.json.enc --escribir
```

Comprueba el número de claves, las empresas, facturas/registros y los informes de integridad. Las caducadas se omiten deliberadamente. Revisa la app y configura sus credenciales hacia la nueva base cuando el resultado esté validado.

## Revertir una sobrescritura

Con las escrituras detenidas, usa el archivo previo que imprimió el comando:

```sh
node scripts/restaura.mjs antes-de-restaurar-FECHA.json.enc --empresa=EMPRESA_ID --sobrescribir
node scripts/restaura.mjs antes-de-restaurar-FECHA.json.enc --empresa=EMPRESA_ID --sobrescribir --escribir
```

Para una recuperación completa, omite `--empresa`. La reversión también genera una copia previa cifrada. Si el estado anterior ya tenía errores de integridad, revísalos antes de decidir usar `--forzar`.

Esto recupera los valores anteriores de las claves presentes en esa copia; no elimina claves totalmente nuevas creadas por la restauración ni recupera datos cuya caducidad ya haya pasado. Si necesitas una vuelta exacta de toda la base, restaura la copia previa en una base nueva vacía y cambia la conexión tras verificarla.

## Simulacro

El workflow `simulacro.yml` se ejecuta los lunes a las 04:00 UTC y manualmente desde Actions. Busca la última ejecución correcta de `copia.yml` y descarga su artefacto `copia-<run_id>`; si ya caducó o no existe, falla. Las copias nocturnas se ejecutan a las 03:00 UTC, exigen el secreto `COPIA_CLAVE` y archivan únicamente `copia.json.enc` y `copia-resumen.json` durante 90 días.

Para ejecutarlo localmente, recupera la copia y la clave desde sus custodias separadas:

```sh
COPIA_CLAVE="<clave custodiada>" node scripts/simulacro.mjs copia.json.enc
node scripts/simulacro.mjs copia.json
```

El script arranca dos Upstash simulados en memoria por HTTP y los cierra al terminar. No utiliza credenciales KV del entorno y aborta si `KV_REST_API_URL` contiene un host distinto de `127.0.0.1` o `localhost`. El workflow no recibe credenciales de la base real. La copia descifrada permanece en memoria.

Comprueba autenticación del cifrado, huella y verificación de la copia; rechaza empresas marcadas como inconsistentes. Restaura toda la copia en el primer simulador vacío, vuelve a copiarla y compara claves y huella de los datos. Omite en ambos lados las claves originales que hayan caducado durante el proceso. Comprueba también las caducidades conservadas, con tolerancia de un segundo para las mediciones HTTP/PTTL; una vez validada esa tolerancia, normaliza la caducidad a la original para comparar la huella. Ejecuta `comprobarIntegridad` en cada empresa: cualquier error hace fallar el simulacro; los avisos históricos `sin-instantanea` y `contador-atrasado` se muestran en el informe.

Después restaura la primera empresa con facturas en el segundo simulador vacío y compara todo su ámbito: facturas, registros encadenados, cabeza Verifactu, numeración, datos de empresa y usuarios/emails seleccionados. Detecta claves ajenas o datos alterados y vuelve a comprobar la integridad. Si ninguna empresa tiene facturas, informa que la prueba parcial no es aplicable. Los hashes globales sin campos seleccionados no generan una clave Redis.

Imprime un informe JSON con fecha de la copia, resultados, avisos y duración en milisegundos de cada paso y del total. Cualquier discrepancia produce código de salida 1. Las duraciones miden la restauración en memoria; no incluyen descarga, puesta en marcha de una base real ni validación funcional de la app.

Si falla la copia nocturna o el simulacro, el workflow abre una issue con fecha y enlace a la ejecución, o comenta en una ya abierta con la etiqueta `copia-fallida` o `simulacro-fallido`. Revisa el informe y los registros de esa ejecución, comprueba disponibilidad de la clave y del artefacto, y distingue un fallo de infraestructura de una copia inválida. Conserva la copia afectada para investigar; selecciona otra copia válida si hay corrupción y repite el simulacro tras corregir la causa. Cierra la issue cuando una nueva ejecución correcta y la revisión del informe confirmen la recuperación.

Pruebas automatizadas, contra simuladores HTTP locales y clientes Upstash crudos:

```sh
node --test tests/simulacro.test.mjs
npm test
```

### Objetivos

Pendientes de decisión por el usuario:

- **RPO: [POR DECIDIR]**. Propuesta: **24 h**, acorde con la frecuencia diaria; comprobar la antigüedad de la última copia válida, porque los fallos nocturnos pueden ampliar la pérdida potencial.
- **RTO: [POR DECIDIR]**. Propuesta: **1 h**, incluyendo descarga, infraestructura, restauración, comprobaciones y vuelta al servicio. Usar las duraciones del simulacro como referencia parcial y medir un ensayo operativo completo antes de aceptar el objetivo.
