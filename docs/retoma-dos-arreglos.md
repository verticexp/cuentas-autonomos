# Retoma de gastos antiguos y lecturas compartidas

Fecha: 7 de noviembre de 2026. **Estado: recuperados y adaptados; bloqueados para publicar.**

## Base y alcance

Se han trasladado a este espacio de trabajo los cambios específicos de `ce88dcf8` y `8b036941` (gastos) y `e9938354` (consumo). Se han aplicado como cambios sin confirmar sobre `4adf21b03478219a7521dffc96ac087e671f6438`, evitando arrastrar otras diferencias de las ramas antiguas. Las dos ramas originales y sus espacios de trabajo siguen intactos.

La referencia local llamada `main` estaba desactualizada. La base usada coincide con `origin/main` y con el `main` remoto consultado en GitHub mediante su conector el 7 de noviembre. La consulta Git directa fallaba por DNS (`Could not resolve host: github.com`); no se ha confundido ese fallo con una actualización remota realizada.

No se han hecho commit, push, merge ni publicación. No se han leído archivos de entorno ni secretos, y las pruebas trabajan con empresas y documentos ficticios. No hay cambios de datos reales.

## Dependencias

Se ha copiado exclusivamente la caché de paquetes a una carpeta temporal con permiso de escritura. `npm ci --offline --cache /tmp/fisquo-npm-cache --no-audit --no-fund` ha instalado correctamente 167 paquetes, incluidos sus scripts de instalación. Node 26.13.0 y npm 11.20.0. `package.json` y `package-lock.json` permanecen intactos. Las primeras ejecuciones utilizaron la misma instalación con `--ignore-scripts`; antes de la última batería se repitió la instalación sin esa restricción.

## Validación separada y conjunta

Se ha ejecutado `npm test` tal cual, desde la carpeta asignada, capturando la salida completa. Ninguna de estas tres baterías finales tiene pruebas canceladas u omitidas:

- Solo gastos sobre la base actual: 2.307 pruebas; 1.926 aprobadas y 381 fallidas. Registro: `/tmp/fisquo-gastos-npm-test.log`.
- Solo lecturas sobre la base actual: 2.297 pruebas; 1.917 aprobadas y 380 fallidas. Registro: `/tmp/fisquo-lecturas-npm-test.log`.
- Ambos arreglos, después del ajuste de integración: 2.308 pruebas; 1.927 aprobadas y 381 fallidas. Registro: `/tmp/fisquo-final-npm-test.log`.

Los detalles y las huellas de los registros están en `retoma-dos-arreglos-evidencia.json`. En estas ejecuciones no aparecen fallos de aserciones: las causas principales son `listen EPERM: operation not permitted 127.0.0.1`, errores de limpieza de simuladores que no llegaron a arrancar y el mismo fallo de puerto en el proceso de cuenta simulada. Los errores derivados no son una comprobación de su lógica de negocio. El número de mensajes de error puede superar el número de pruebas fallidas porque incluye la causa anidada del proceso hijo.

Un intento adicional de referencia sin ninguno de los arreglos reprodujo la espera del soporte antiguo: se interrumpió. No se da por ejecutada ni aprobada una batería completa de esa referencia.

En la primera batería conjunta apareció además un `ReferenceError` exclusivo del medidor: al extraer el bloque actual de Gastos, faltaba aportar `gastosSinAfectacion` a su contexto. Se ha añadido su módulo real a ese contexto, sin sustituir la lógica de la pantalla. La ejecución conjunta final ya no presenta ese error. Se conserva la versión más completa del arreglo de arranque del simulador de gastos, que retira el listener de error tras arrancar correctamente.

## Gastos e IRPF

Se conserva la revisión asistida completa por ejercicio, incluidos bienes anteriores aún amortizables, la confirmación persistida de 100/0/parcial, la conservación del dato al editar desde clientes antiguos y la comprobación del cierre si cambia la afectación. No se deduce automáticamente el IRPF a partir del IVA ni se modifica el histórico de declaraciones presentadas.

Pasan las 50 pruebas dirigidas de `gastos-antiguos-irpf`, `revision-asesoria`, `iva-deducible`, `iva-autoliquidado`, `modelo130-auditoria` y `upstash-arranque`. Registro: `/tmp/fisquo-gastos-dirigidas.log`. Incluyen los esperados independientes de gastos y del 130, libros, fichero, conservación del 303 y el diagnóstico del arranque. Los tres casos de arranque simulan su ciclo de vida; no acreditan que el sistema permita abrir puertos.

Las dos regresiones de persistencia y aislamiento entre empresas y de rechazo del trimestre cerrado siguen presentes en `gastos-duplicados.test.mjs`. No han podido ejecutar sus aserciones porque su preparación necesita el puerto local. Tampoco E06 ha podido validar sus totales ni la concurrencia sobre ese transporte.

Se ha validado la transformación JSX de la página de Gastos, el formulario y el nuevo componente de revisión con el compilador SWC instalado de Next. Esto comprueba la sintaxis; no equivale a compilar toda la aplicación ni a revisar su navegación o aspecto.

## Lecturas compartidas

El ensayo completo pasa tanto con el arreglo de lecturas aislado como con ambos arreglos juntos. Usa el SDK real instalado de Upstash, con `fetch` interceptado y ejecución de comandos en memoria; rechaza cualquier red externa. Las comparaciones conservan documentos, orden e importes; cubren años, rectificativas posteriores, límites de lote, histórico de inventario e IGIC, separación de empresas e invalidación del panel tras escribir. Las 200 lecturas paralelas de un panel calculado siguen dando 2.200 comandos y cero errores en este entorno simulado.

El informe `consumo-enero-medicion.json` se ha regenerado sobre el estado conjunto; identifica la fecha real de ejecución, el transporte y las huellas de las fuentes. La fecha simulada de actividad sigue siendo 15 de enero de 2027. Se mantienen los perfiles diarios:

- 0 documentos: 167 → 131 comandos.
- 40 documentos: 203 → 156 comandos (47 menos; aproximadamente un 23 %).
- 5.000 documentos: 259 → 192 comandos.
- 20.000 documentos: 466 → 330 comandos.

Son comandos de los bloques de preparación descritos en el informe, no peticiones HTTP completas ni facturación medida del proveedor. El ahorro sigue confirmado; la capacidad real de enero no se certifica con este ensayo.

## Pendiente antes de publicar

1. Ejecutar `npm test` con permiso para escuchar en `127.0.0.1`; deben pasar toda la batería, E06 y las dos regresiones de persistencia de gastos. No hacen falta credenciales de producción para estas pruebas.
2. Ejecutar `npm run build`. Aquí no se ha lanzado una compilación completa: su paso previo obligatorio ejecuta la misma batería que ya está fallando. La transformación JSX descrita arriba no la reemplaza.
3. Comprobar la navegación del aviso a la lista por ejercicio y el guardado de 100/0/parcial en una empresa ficticia, en escritorio, móvil y app del iPhone. No se ha abierto el simulador de iOS; el simulador bloqueado en las pruebas es el servidor HTTP local de datos, no CoreSimulator.
4. Para afirmar además que la capacidad de enero es suficiente, faltan la medición de recorridos HTTP completos con sesión y escrituras, la cuota/límites vigentes y una prueba de carga en un alojamiento de pruebas. Estos requisitos operativos son distintos de demostrar el ahorro local.

No se han omitido pruebas, cambiado versiones ni relajado aserciones para convertir la restricción del entorno en una aprobación.
