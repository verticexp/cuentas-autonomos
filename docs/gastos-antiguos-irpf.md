# Gastos antiguos pendientes de revisar para el modelo 130

> Actualización del 7 de noviembre: cambios recuperados sobre el main actual y dependencias instaladas. Pasan 50 pruebas dirigidas; la batería completa de gastos termina con 1.926 aprobadas y 381 fallidas por el bloqueo del simulador y sus errores derivados. Sigue bloqueado para publicar. Véanse el detalle y los pendientes en [la retoma de los dos arreglos](retoma-dos-arreglos.md). Lo que sigue documenta los intentos históricos del 5 de noviembre.

Fecha: 5 de noviembre de 2026. Base revisada: `82d664a6de33560fa71a5d6b01870b4032b4d753`.
Alcance: autónomos en estimación directa; afectación al IRPF de gastos con IVA parcial sin porcentaje de IRPF confirmado. Cambios locales, sin datos de producción ni publicación.

## Hallazgo y solución

El cálculo ya separaba IVA e IRPF. Los registros antiguos sin `afectoPct` conservan un 100 % implícito para no alterar datos sin conocer su uso real. El aviso de Impuestos enlazaba únicamente el primer gasto y no daba una lista completa. Además, `afectoPctDe(100)` devolvía `undefined`: confirmar expresamente un 100 % no quedaba guardado y no resolvía el aviso. La reproducción previa al cambio falló con `undefined !== 100`.

Se ha elegido revisión asistida, sin migración automática. El IVA deducible no determina por sí solo la afectación al IRPF. Se detecta el campo pendiente, sin inventar una fecha de creación a partir de la fecha de factura.

- `gastosSinAfectacion` diagnostica sin escribir. Incluye todos los candidatos del ejercicio, sin límite de tres nombres ni dependencia de la página de gastos, y bienes comprados antes que aún se amortizan. Excluye nóminas, agrupaciones y gastos que ya no restan en el IRPF.
- Gastos muestra un resumen plegable y la lista completa, con fecha, concepto, proveedor e importe base. El aviso de Impuestos abre esa lista en el ejercicio correspondiente; sigue disponible al revisar el ejercicio anterior después de cambiar de año. No aparece en sociedades ni en módulos.
- La ficha pide una elección explícita para los pendientes. Guarda 0, un porcentaje parcial o 100. Editar desde un cliente que omite el campo conserva la revisión anterior. Cambiar solo la parte afecta respeta los cierres fiscales existentes.
- Los avisos indican que una declaración ya presentada requiere revisar su regularización con la gestoría. No se cambian marcas ni cantidades históricas presentadas, justificantes ni pagos automáticamente.

## Expediente ficticio y esperados independientes

`tests/fixtures/gastos-antiguos-irpf.json` contiene una empresa ficticia, una venta de 10.000 € y cuatro gastos. El test trabaja sobre copias y serializa las correcciones para comprobar que el 100 explícito sobrevive al guardado. No es una ejecución contra Redis.

Supuesto: estimación directa normal, régimen general de IVA, sin retenciones, pagos anteriores, prorrata ni otras deducciones del 130. Los porcentajes de uso son datos confirmados del ejemplo, no inferencias sobre facturas reales.

1. Turismo de uso mixto: base 1.000 €, IVA 210 €, deducible al 50 %. Antes computaba 1.105 €; tras confirmar IRPF 0 %, computa 0 €.
2. Suministro de vivienda con despacho: base 100 €, IVA 21 €, IVA deducible al 20 %. Antes computaba 116,80 €; con IRPF confirmado al 6 %, computa 6 €.
3. Gasto íntegramente profesional con IVA limitado: base 300 €, IVA 63 €, IVA deducible al 50 %. Antes y después computa 331,50 €. Confirmar IRPF 100 % elimina el aviso sin cambiar el importe.
4. Material: base 200 €, IVA íntegramente deducible. Computa 200 € y no se marca como pendiente.

Antes: gastos acumulados 1.753,30 €; rendimiento 8.246,70 €; 20 % = 1.649,34 €.
Después: gastos acumulados 537,50 €; rendimiento 9.462,50 €; 20 % = 1.892,50 €.

Se comprueba que resumen del 130, gasto deducible de los libros y resultado del fichero 130 recogen estos esperados; las casillas del 303 permanecen iguales en los cuatro trimestres.

## Verificaciones y límites

- Pasan 47 pruebas: `node --test tests/gastos-antiguos-irpf.test.mjs tests/revision-asesoria.test.mjs tests/iva-deducible.test.mjs tests/iva-autoliquidado.test.mjs tests/modelo130-auditoria.test.mjs`.
- Las siete pruebas nuevas cubren confirmación 100/0/parcial, vacíos e inválidos, detección sin escrituras, más de una página, ejercicios, bienes anteriores y agotados, abonos, exclusiones, enlaces, desaparición del aviso, normalización/serialización, edición repetida, libros y exportación numérica.
- Añadidas dos regresiones con persistencia real sobre simulador en `tests/gastos-duplicados.test.mjs`: aislamiento entre empresas con el mismo id y rechazo de una corrección que cambia un trimestre cerrado. No verificadas en este entorno: el simulador no puede abrir puerto local (`listen EPERM: operation not permitted 127.0.0.1`).
- Se ejecutó `npm test` tal cual. No terminó satisfactoriamente: faltan dependencias como `@upstash/redis` y varios simuladores no pueden abrir puertos. Se interrumpió tras observar los fallos y la espera de los simuladores. No se atribuye una batería general aprobada.
- `npm ci --ignore-scripts --no-audit --no-fund` falló por `ENOTFOUND registry.npmjs.org`. No se modificaron versiones ni el fichero de dependencias para ocultarlo.
- `npm run build` quedó bloqueado en su paso previo de pruebas y se interrumpió; la compilación no llegó a ejecutarse. No se verificaron navegación HTTP, persistencia de las dos regresiones, aspecto móvil/escritorio, temas ni app del iPhone. Esas comprobaciones quedan pendientes antes de publicar.
- `git diff --check` sin incidencias. No se han hecho commit, push, merge ni cambios en producción. No se han leído secretos.

Cobertura proporcional: aritmética y normalización correctas en los expedientes descritos; integración de servidor, navegador y dispositivo no comprobada. No es una auditoría fiscal completa ni una validación profesional de gastos de clientes.

El detector identifica IVA parcial sin afectación confirmada. No puede reconocer todos los posibles gastos personales si se guardaron con IVA al 100 % ni decidir si una afectación explícita es fiscalmente adecuada. Tampoco reemplaza una regularización de declaraciones anteriores.

## Fuentes del criterio de revisión

Consultadas el 5 de noviembre de 2026:

- [Ley 35/2006, arts. 29 y 30](https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764#a29): afectación y gastos de suministros de vivienda parcialmente afecta.
- [Reglamento del IRPF, art. 22](https://www.boe.es/buscar/act.php?id=BOE-A-2007-6820#a22): afectación exclusiva y excepciones para vehículos. Se mantiene la elección individual porque el porcentaje de IVA no acredita por sí solo el uso exigible en el IRPF.
- [AEAT: criterios de afectación](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c06-rendimientos-actividades-economicas-cuestiones-generales/elementos-patrimoniales-afectos-actividad-economica/criterios-afectacion-bienes-derechos-ejercicio.html), manual 2025: referencia explicativa; el soporte para el ejercicio 2026 se contrasta con los textos consolidados del BOE. No se ha recibido revisión profesional de estos expedientes.

## Segundo intento: diagnóstico del bloqueo de E06 (5 de noviembre de 2026)

Se conserva el arreglo aprobado. La reproducción de las cinco pruebas de `capacidad-totales.test.mjs` identifica `listen EPERM: operation not permitted 127.0.0.1` en el arranque compartido, antes de ejecutar las aserciones sobre totales. El aviso `MODULE_TYPELESS_PACKAGE_JSON` es informativo; no se cambia el tipo de módulos de toda la aplicación para ocultarlo.

Se corrige un defecto del soporte de pruebas: `arrancar` no rechazaba su promesa cuando el servidor emitía un error al abrir el puerto. Ahora propaga la causa original y permite que la batería termine. La limpieza de E06 también admite que el servidor no llegara a arrancar. No se sustituyen las pruebas de concurrencia ni se omiten sus aserciones.

Evidencia de este intento:

- Las nuevas regresiones de `upstash-arranque.test.mjs` reprodujeron dos esperas agotadas antes del arreglo. Después pasan las tres: permiso denegado, puerto ocupado y arranque/cierre correcto. Simulan únicamente el ciclo de arranque; no acreditan operaciones Redis.
- Vuelven a pasar las 47 pruebas dirigidas del expediente ficticio y sus cálculos, con el mismo conjunto indicado arriba. Pasan además las tres nuevas regresiones de arranque.
- Se ejecutó `npm test` tal cual después del arreglo y terminó con errores, sin necesidad de interrumpirlo. E06 sigue sin poder verificar sus aserciones porque el entorno prohíbe abrir el puerto local.
- Faltan dependencias, entre ellas `@upstash/redis` y `next`. `npm ci` sin red falla por `ENOTCACHED` y con red por `ENOTFOUND registry.npmjs.org`. No se han cambiado versiones ni el archivo de bloqueo de dependencias.
- `npm run build` termina con código 1 en su fase de pruebas: 1.906 pruebas, 1.349 aprobadas, 557 fallidas, ninguna cancelada u omitida. La compilación de Next no llega a ejecutarse. Estos resultados no acreditan persistencia, integración HTTP ni revisión visual.
- `git diff --check` sin incidencias. Sin datos reales, secretos, commit, push, merge ni publicación.

**Estado: bloqueado para publicar.** Hace falta ejecutar la validación en un entorno con las dependencias del proyecto instaladas y permiso para abrir el simulador local. Deben pasar `npm test` y `npm run build`, incluidas E06 y las dos pruebas de persistencia de gastos antiguos, y comprobarse la navegación de la lista y el guardado antes de dar el trabajo por cerrado. Este intento resuelve la espera indefinida y aporta el diagnóstico, pero no acredita que las pruebas de integración pasen.
