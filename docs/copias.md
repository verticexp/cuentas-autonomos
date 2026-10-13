# Copias y recuperación de Netto

Requiere Node 22 o posterior y las dependencias ya instaladas. Los comandos se ejecutan desde el proyecto. `KV_REST_API_URL` y `KV_REST_API_TOKEN` identifican la base: para copiar, apunta al origen; para restaurar, al destino. Usa credenciales separadas para los simulacros.

## Contenido y límites

Se recorren con SCAN las claves `cuentas:*`. Se conservan hashes, sets, listas (con su orden), strings crudos y caducidades absolutas en milisegundos. Se excluyen `cuentas:sesion*`, `cuentas:intentos*`, `cuentas:desbloqueo*` y `cuentas:cerrojo*`. Una instalación sin facturas o totalmente vacía también se puede copiar. Si hay claves de empresa, debe existir el hash `cuentas:empresas`.

La copia v2 incluye versión, fecha, datos, resumen por tipos y empresas, cantidades de facturas/registros y una huella SHA-256 de los datos con claves ordenadas. Antes y después de leer cada empresa se comparan HLEN de facturas, borradas, registros y gastos, la cabeza Verifactu y la numeración. Se realizan como máximo tres intentos; las empresas que siguen cambiando aparecen en `resumen.inconsistentes`. Esto detecta cambios relevantes, pero no sustituye una instantánea: una modificación que conserve esas firmas puede pasar inadvertida, y los hashes globales se leen aparte. Para una recuperación fiable, detén emisiones, trabajos programados y otras escrituras durante la copia y la restauración.

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

Sin `--escribir` solo verifica y muestra el plan: claves nuevas, existentes, por sobrescribir y caducadas. No escribe ni genera una copia previa. Requiere acceso de lectura al destino para comprobar qué existe. La verificación valida versión, huella, prefijo, resumen e integridad de cada empresa. `sin-instantanea` y `contador-atrasado` se imprimen como avisos; las demás incidencias de integridad son errores. También se avisa de empresas inconsistentes.

Se aceptan copias v1 `{ fecha, datos }` con hashes como objeto o lista plana de pares. No tienen huella ni garantía de consistencia y se indica como aviso. `--forzar` permite continuar con errores de verificación después de revisarlos: no permite descifrar contenido manipulado ni restaurar claves fuera de `cuentas:` o estructuras inválidas.

## Recuperar una empresa

Apunta las variables KV al destino y detén sus escrituras. Primero revisa el plan:

```sh
node scripts/restaura.mjs copia.json.enc --empresa=EMPRESA_ID --sobrescribir
node scripts/restaura.mjs copia.json.enc --empresa=EMPRESA_ID --sobrescribir --escribir
```

La selección incluye solo `cuentas:<nombre>:EMPRESA_ID`, su campo en `cuentas:empresas`, usuarios cuya empresa activa o membresías incluyan esa empresa, y emails que apunten a esos usuarios. Las otras empresas y sus usuarios se conservan. Una identidad compartida entre empresas se selecciona si pertenece a la empresa recuperada; revisa sus membresías al volver al servicio.

Con sobrescritura, cada clave de empresa se elimina y se escribe de nuevo: desaparecen los campos o elementos sobrantes de esa clave. En los hashes globales se sustituyen solo los campos del ámbito seleccionado, incluidos usuarios/emails sobrantes de esa empresa. Sin sobrescritura se saltan las claves existentes; para los hashes globales de una selección de empresa se añaden únicamente campos ausentes.

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

## Simulacro periódico

1. Recupera una copia archivada y su clave desde custodias separadas.
2. Usa una base de pruebas vacía, nunca las credenciales de producción.
3. Ejecuta verificación/simulación y después restauración completa.
4. Comprueba tipos, cantidades, integridad, caducidades y apertura de facturas de muestra.
5. Ensaya restauración por empresa y reversión con la copia previa, verificando que otra empresa permanece intacta.
6. Registra fecha, duración, fecha de la copia, resultados y responsables; elimina los datos personales del entorno de pruebas al cerrar el simulacro.

Pruebas automatizadas, contra dos simuladores HTTP locales y clientes Upstash crudos:

```sh
node --test tests/copias.test.mjs
npm test
```
