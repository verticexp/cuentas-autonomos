# Ficheros AEAT

Se usan los cálculos existentes de Modelos, sin cambiarlos. Los diseños de referencia son DR111e16v18, DR115e15v13, DR390e2025, DR_Mod_180_2023, DISENOS_LOGICOS_190_2025, 347 (2025) y DR_Anexo_349, facilitados en `dr-aeat/`. Esa carpeta no se versiona. La serialización y sus posiciones se comprueban localmente; no se ha verificado una importación o presentación real en la Sede.

| Modelo | Salida |
| --- | --- |
| 111 | Sobre AUX y página 01 de 1.000 posiciones: nóminas y rendimientos de actividades económicas, con sus perceptores, bases y retenciones. |
| 115 | Sobre AUX y página 01 de 500 posiciones: perceptores, bases, retenciones y resultado. |
| 180 | Tipo 1 y un tipo 2 por arrendador/inmueble calculado: modalidad dineraria, tipo 19 %, situación y referencia catastral disponible. |
| 190 | Tipo 1 y tipos 2 por perceptor/clave/subclave: A, E, G, H e I; datos 145 y Seguridad Social que devuelve el cálculo. |
| 347 | Tipo 1 y tipos 2 de declarado D: compras/ventas, NIF español o comunitario, país/provincia de no residentes, trimestres, caja, metálico e inversión del sujeto pasivo. |
| 349 | Tipo 1 y tipos 2 de operador y rectificación: bases nuevas y anteriores separadas; periodicidad y mes de corte de `periodos349`. El serializador admite E/S/I/A/T. |
| 390 | Sobre 0A y nueve páginas: 01, 02, 02B, 03, 04, 05, 06, 07 y 08. Las casillas históricas de la Nota 2 solo admiten cero; los avisos del cálculo bloquean la descarga. |

Todos los registros BOE son de 500 caracteres, separados por CRLF. La API entrega ISO-8859-1, mantiene el permiso `resumen` y exige además `nominas` cuando el 190 contiene trabajadores o administradores identificados. Los modelos nuevos se contrastan con `modelosDe` y con los datos que activan modelos en la página; los diseños estatales no se ofrecen como modelos forales. Teléfono y contacto proceden de `u.emisor.telefono` y `u.nombre`; el correo del 190 procede de `u.email`. El teléfono admite el prefijo español y debe acabar en nueve dígitos.

## Blancos y valores por defecto

- Declaraciones iniciales: complementaria y sustitutiva en blanco, declaración anterior a ceros. No se implementan segundas presentaciones. El identificativo BOE tiene 13 dígitos: modelo + ejercicio + código de periodo + `0001`. Los anuales usan `00`, los meses `01`…`12` y los trimestres `21`…`24`, para evitar colisiones. Una descarga del mismo periodo conserva el identificativo; no es el justificante de AEAT ni un contador persistido. El generador admite `yo.identificativo` explícito.
- Reservados de Administración, sellos y representantes sin información: blancos. Numéricos sin contenido: ceros, según la regla general de cada diseño. No se inventa el NIF de la entidad desarrolladora.
- 111/115: ingreso `I` o negativa `N`, sin domiciliación ni IBAN; resultados anteriores cero. Rendimientos en especie, premios y demás bloques no calculados del 111: cero.
- 180: provincia desconocida `00`; situación desconocida `0`, sin asumir que sea un inmueble sin referencia (situación 4). Dirección del inmueble vacía, con sus códigos numéricos a cero. Devengo anterior `0000` cuando no consta. Los reintegros negativos exigen ejercicio de devengo explícito.
- 190: provincia desconocida `00`, nacimiento desconocido `0000`, situación familiar no comunicada `3`. Contrato general `1`, el mismo valor por defecto que devuelve el cálculo. Subclave A `00`, como numérico sin contenido. Campos en especie, incapacidad, reducciones, pensiones, ascendientes, cómputo de los primeros tres hijos y otros datos no devueltos: cero, con signos vacíos y NIF del cónyuge vacío salvo situación 2. Para E, las retenciones van a Hacienda Estatal; los modelos forales están excluidos de esta API. Correo vacío si no consta. Los reintegros negativos exigen ejercicio de devengo explícito.
- 347: provincia del residente `00` cuando el cálculo no la conoce; país del residente vacío. No residentes: provincia `99` y país informado, sin convertir identificadores extranjeros en NIF españoles. Sin desglose trimestral en caja: signos vacíos e importes cero. No hay registros I de inmuebles porque el cálculo actual no los devuelve.
- 390: sin grupos de entidades ni devolución mensual. Marcas de caja obtenidas de las cabeceras calculadas de los cuatro 303 y marca del 347 obtenida de su cálculo. Actividades y epígrafes existentes se exportan; código de actividad, representantes y CNAE de la prorrata quedan vacíos si no se conocen. Página 05 (simplificado) y 08 (sectores diferenciados) a cero: `modelo390` calcula el régimen general. Apartado 8 (reparto entre administraciones) a cero. La prorrata agregada va en la primera fila de la página 07.

## Datos que faltan para una declaración completa

**Los ceros de provincia y de situación desconocida son campos sin información, no códigos geográficos válidos.** Hay que completarlos antes de presentar. La generación de un registro de la longitud correcta no garantiza que supere todas las validaciones de la Sede.

No se han modificado los cálculos ni los componentes. Para eliminar estas limitaciones harían falta los siguientes cambios de datos:

1. `modelo180`: devolver en cada arrendador `provincia` y la dirección desglosada del inmueble (posiciones 135-327: vía, numeración, municipio, código INE, provincia y código postal); conservar siempre `situacion` y `refCatastral`. Desglosar los atrasos/reintegros por `ejercicioDevengo` (110-113), además de arrendador e inmueble.
2. `modelo190`: devolver `provincia` de cada perceptor (76-77), `ejercicioDevengo` para atrasos/reintegros (148-151), y el detalle adicional del 145 que hoy no devuelve: pensiones, anualidades, ascendientes, discapacidad de familiares, cómputo individual de los tres primeros hijos y vivienda (197-254). Los pagos en especie o por incapacidad necesitarían sus bases y retenciones separadas (108-147 y 255-321).
3. `modelo347`: conservar la provincia fiscal del residente en `provincia` (77-78). Si se incorporan arrendamientos como arrendador, devolver una lista `inmuebles` con importe y dirección para los registros I, y totalizarla en el tipo 1.
4. `modelo349`: para operaciones triangulares reales, el origen de datos y el cálculo deben identificar y devolver `clave: 'T'`; hoy solo producen E/S/A/I. La serialización de T está implementada y probada, pero no se reclasifican operaciones automáticamente.
5. `modelo390`: para varias actividades con prorrata o sectores diferenciados, devolver el desglose por actividad/CNAE de los apartados 12 y 13, en lugar de una única prorrata agregada. Los ajustes de actividades necesitarían además el código estadístico B del apartado 3 y el CNAE de prorrata; el epígrafe IAE no equivale a esos códigos.

## Validación local

- `node --test tests/ficheros-aeat-modelos.test.mjs tests/fichero-aeat.test.mjs`: 23 pruebas en verde, incluyendo los 303/130 existentes y la ruta real con sesión/lecturas sustituidas. No se han cambiado las pruebas anteriores.
- `npm test`: ejecutado; las pruebas que abren puertos quedan esperando por `listen EPERM` en el sandbox. Repetición de la misma suite con los entornos Redis desactivados y `node --test --test-timeout=15000 tests/*.test.mjs`: 1.541 pasan y 302 fallan por apertura de puertos o esperas asociadas, en 41 ficheros. No hay fallos de aserción ajenos a esa restricción. La prueba adicional de marcas de cabecera del 390 se verificó después en la ejecución específica de 23 casos.
- Contraste adicional del 390 leyendo el diseño local: 467 campos numéricos con formato válido, 15 reservados vacíos y 57 casillas calculadas comprobadas por posición.
- `importe()` compartido rechaza valores no finitos y desbordamientos del negativo: la N ocupa una posición y no puede sustituir un dígito significativo. Los ficheros válidos anteriores conservan el mismo formato.
