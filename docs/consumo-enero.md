### Preparación de enero: medición y límites

> Actualización del 7 de noviembre: ensayo repetido con dependencias instaladas y el SDK real con transporte local interceptado, sobre el main actual y con ambos arreglos juntos. Se mantienen 203 → 156 comandos en el perfil de 40 documentos; el JSON adjunto se ha regenerado. La batería completa del arreglo aislado termina con 1.917 aprobadas y 380 fallidas por el bloqueo de puertos y sus errores derivados. Véanse [la retoma y los pendientes](retoma-dos-arreglos.md). El resto de este documento describe la medición histórica del 5 de noviembre y sus límites.

Medición ejecutada el 5 de noviembre de 2026, con reloj fijado al 15 de enero de 2027 y datos ficticios. El ahorro local está comprobado; **la capacidad de enero en producción todavía no está certificada**.

### Qué cambia

La preparación fiscal deja de pedir los gastos indexados que luego descartaba. Las facturas de los años necesarios reúnen primero sus identificadores y después se descargan en lotes de 500, compartidos entre años. Se comprueba el índice una vez por lectura agrupada y se lee el histórico de gastos una sola vez. Resumen comparte esta preparación para el año consultado, el actual y el anterior.

Esto corrige también el riesgo del primer intento: descargar cada año con su propio lote puede gastar más lotes incompletos y repetir comprobaciones del índice en paralelo. El nuevo recorrido reúne los documentos antes de descargarlos. No añade una caché entre visitas: las altas y cambios se ven en la siguiente lectura. Inventario e IGIC conservan sus históricos completos.

### Cómo se ha medido

Se ejecuta el código real de índices, acceso a Redis, preparación fiscal y cálculo de Resumen. Para las pantallas se extraen y ejecutan sus bloques actuales de preparación de datos antes del JSX, en vez de confundir una llamada a pagina() con una pantalla entera. En Gastos se incluyen los candidatos a conciliación y el cupo de escaneos. La bandeja y el banco están vacíos; no hay tareas pendientes ni conexión con gestoría.

Cada operación ejecutada queda contada en el transporte del simulador. La unidad es **comando Redis exterior**, no petición HTTP. Cuando el SDK esté instalado, el mismo ensayo usa el SDK real e intercepta fetch, desagrupando los pipelines. En esta ejecución no está instalado: se utilizó el adaptador de pruebas en proceso, que implementa únicamente las operaciones utilizadas. Por tanto, son cifras ejecutadas sobre la lógica de aplicación, pendientes de contraste con el SDK y el proveedor; no son una lectura de su contador facturado.

La referencia anterior son las copias íntegras de datosImpuestos.js y panelCache.js del estado base 82d664a6de33560fa71a5d6b01870b4032b4d753, congeladas en tests/apoyo/enero-antes. Sus hashes se comprueban al arrancar. Ambas versiones usan exactamente la misma empresa, documentos e índices. Antes de cada lado se reinicia la memoria de validación de índices y se borra el panel calculado. Los casos fríos usan índices válidos pero sin validación en memoria; **no incluyen una reconstrucción de índices**. La salida JSON también identifica las fuentes actuales por SHA-256.

Los tamaños son 0, 40, 5.000 y 20.000 documentos totales: mitad facturas y mitad gastos, repartidos entre 2022 y enero de 2027. No se han utilizado datos reales. Los tamaños grandes comprueban los lotes; el simulador no representa la latencia, el ancho de banda ni los límites del alojamiento real.

### Consumo por preparación de pantalla

Cifras con los índices ya comprobados y, en Resumen, sin panel calculado. Modelos consulta 2026, el ejercicio que se presenta en enero. Facturas y Gastos abren la primera página sin búsqueda, con permiso de administrador. Los dos listados mantienen el mismo consumo antes y después porque este cambio afecta a la preparación fiscal.

- 0 documentos: Resumen 52 → 32; Modelos 22 → 14; Facturas 7 → 7; Gastos 12 → 12.
- 40 documentos: Resumen 60 → 35; Modelos 26 → 15; Facturas 10 → 10; Gastos 19 → 19.
- 5.000 documentos: Resumen 84 → 47; Modelos 34 → 19; Facturas 13 → 13; Gastos 24 → 24.
- 20.000 documentos: Resumen 165 → 89; Modelos 64 → 34; Facturas 23 → 23; Gastos 47 → 47.

Resumen repetido consume 11 → 11 en los cuatro tamaños, sin releer facturas ni gastos. Con validación de índices en frío, Resumen consume 0 documentos: 58 → 38; 40 documentos: 66 → 41; 5.000 documentos: 90 → 53; 20.000 documentos: 171 → 95.

No se cuentan autenticación, permisos de acceso, disposición común, componentes posteriores al bloque extraído, carga inicial del navegador, precarga de enlaces, verificaciones de sesión, tareas tras responder, escrituras ni procesos programados. Tampoco se cuentan lecturas adicionales con banco importado, bandeja con trabajos, caja, gestoría, inventario o sociedades. **Estas cifras no son el coste total de visitar la página por HTTP ni el total facturable de Upstash.**

### Cada año por separado

Se compara el resultado completo, incluido el orden de los documentos, y se exige que el consumo actual sea menor o igual que el anterior. Se prueban 2022 a 2028, para los cuatro tamaños, tanto con índice comprobado como en frío: 56 comparaciones de año aislado, todas correctas.

Con 40 documentos e índice comprobado, el núcleo fiscal consume:

- 2022: 25 → 11.
- 2023: 25 → 11.
- 2024: 23 → 10.
- 2025: 21 → 9.
- 2026: 19 → 8.
- 2027: 14 → 7.
- 2028: 14 → 7.

Con 20.000 documentos, el mismo núcleo consume:

- 2022: 57 → 27.
- 2023: 63 → 30.
- 2024: 61 → 29.
- 2025: 59 → 28.
- 2026: 57 → 27.
- 2027: 46 → 23.
- 2028: 40 → 20.

El JSON incluye todos los años, tamaños y casos fríos. Además, se prueban 499, 500, 501 y 1.001 facturas concentradas en un año y se comprueba que solo se descargan los lotes necesarios, sin duplicar documentos al repetir años.

La comparación conserva rectificativas posteriores, excluye facturas ordinarias posteriores, conserva inversiones antiguas y gastos con retención pagada en otro año, y verifica los casos de inventario e IGIC. Se comprueba una sola lectura de gastos al pedir varios años, ausencia de cruces entre empresas y actualización inmediata del panel tras cambiar facturas y gastos. Las 89 comparaciones antes/después del ensayo terminaron sin discrepancias ni aumento de comandos.

### Día de navegación y enero

Perfil explícito por usuario activo y día: una apertura de Resumen que calcula el panel, tres aperturas que lo reutilizan, dos visitas a Modelos del ejercicio cerrado, dos aperturas de Facturas y dos de Gastos. Es una hipótesis de uso reproducible, **no un día de producción observado**. Si una escritura invalida Resumen antes de otra visita, esa visita cuesta el cálculo, no la reutilización.

Consumo diario de los bloques medidos:

- 0 documentos: 167 → 131 comandos por usuario y día.
- 40 documentos: 203 → 156 comandos por usuario y día.
- 5.000 documentos: 259 → 192 comandos por usuario y día.
- 20.000 documentos: 466 → 330 comandos por usuario y día.

La proyección usa 31 días y añade un 50 % de margen sobre ese perfil. Supone una empresa por usuario y día. Si varios usuarios trabajan en la misma empresa, pueden compartir el panel ya calculado; el perfil conserva una primera apertura calculada por usuario como hipótesis prudente.

Para 100 usuarios activos todos los días:

- 0 documentos por empresa: 776.550 → 609.150 comandos en enero, con margen.
- 40 documentos por empresa: 943.950 → 725.400 comandos en enero, con margen.
- 5.000 documentos por empresa: 1.204.350 → 892.800 comandos en enero, con margen.
- 20.000 documentos por empresa: 2.166.900 → 1.534.500 comandos en enero, con margen.

Para 500 usuarios activos todos los días:

- 0 documentos por empresa: 3.882.750 → 3.045.750 comandos en enero, con margen.
- 40 documentos por empresa: 4.719.750 → 3.627.000 comandos en enero, con margen.
- 5.000 documentos por empresa: 6.021.750 → 4.464.000 comandos en enero, con margen.
- 20.000 documentos por empresa: 10.834.500 → 7.672.500 comandos en enero, con margen.

Para 1.000 usuarios activos todos los días:

- 0 documentos por empresa: 7.765.500 → 6.091.500 comandos en enero, con margen.
- 40 documentos por empresa: 9.439.500 → 7.254.000 comandos en enero, con margen.
- 5.000 documentos por empresa: 12.043.500 → 8.928.000 comandos en enero, con margen.
- 20.000 documentos por empresa: 21.669.000 → 15.345.000 comandos en enero, con margen.

Sensibilidad a cambios frecuentes: si las cuatro aperturas de Resumen tienen que recalcularse porque entre medias cambian los datos, la empresa de 40 documentos pasa a 228 comandos diarios después de la mejora, frente a 350 antes. Con 1.000 activos y el mismo 50 % de margen, enero sería 10.602.000 comandos de los bloques estudiados, antes de añadir las escrituras. Para 5.000 documentos serían 13.950.000; para 20.000, 26.226.000. Reutilizar el panel cambia mucho la previsión y no se puede dar por hecho en horas de trabajo intenso.

La fórmula completa debe ser 1,5 × 31 × (A × (D + H) + B), donde A son activos diarios, D es el perfil medido, H son las lecturas de cada usuario que quedan fuera del ensayo y B es el consumo diario de escrituras, tareas y otras aplicaciones de la base compartida. Las cifras anteriores solo contienen D: el margen del 50 % no sustituye a H ni B.

Para una ráfaga ilustrativa de 200 personas haciendo una acción cada 10 segundos, son 20 acciones/s. Con la empresa de 40 documentos, serían 220 comandos/s si todas reutilizan Resumen, 700 si todas lo recalculan, o 300 preparando Modelos, antes de sumar lo excluido. Es una multiplicación de costes medidos, no un ensayo de RPS. La regresión de 200 lecturas paralelas de un mismo Resumen ya calculado sí se ejecutó: 2.200 comandos, cero errores y resultados coherentes, exclusivamente en proceso.

No se conocen la cuota vigente, el consumo de otras aplicaciones ni los activos previstos. No se ha consultado la cuenta del proveedor ni se han cambiado alertas. Sin esos datos no se puede dar una cifra de usuarios seguros.

### Reproducción y resultado de las pruebas

- Medición y regeneración del JSON: INFORME_ENERO=1 node --test tests/enero-consumo.test.mjs.
- Resultado específico: 1 prueba aprobada, cero fallos; contiene toda la matriz anterior. Node v26.13.0. No precisa red ni puertos; requiere una versión de Node con registerHooks.
- Suite solicitada: npm test, ejecutada tal cual. Resultado: 1.896 pruebas, 1.340 aprobadas y 556 fallidas. No se da por aprobada. En los fallos aparecen dependencias ausentes (@upstash/redis, Next, React y otras) y el bloqueo de puertos locales (listen EPERM 127.0.0.1).
- npm ci se intentó con caché y con descarga: la caché no contiene las versiones necesarias y la descarga falla con ENOTFOUND registry.npmjs.org. No se ha modificado el bloqueo de versiones ni se han inventado paquetes de producción para hacer pasar la suite.
- Revisión adicional de cálculo, panel e IGIC: 32 pruebas, 30 aprobadas y 2 fallidas por dependencias ausentes; tampoco se da por aprobada esa selección.
- El simulador HTTP ahora rechaza su promesa al no poder escuchar, para que esa limitación termine como error visible en vez de quedar esperando.
- No hay prueba de compilación ni navegación HTTP completa: faltan las dependencias y los permisos de escucha. Tampoco se ha ejecutado carga sobre servicios reales.

### Qué falta para afirmar que aguanta enero

Ejecutar la suite y el mismo ensayo con las dependencias instaladas; medir las visitas completas con sesión, distintos permisos, búsquedas, escrituras y procesos de fondo en un entorno de pruebas independiente; observar H y B; contrastar cuota, ancho de banda y límites por segundo vigentes con el proveedor. Después ejecutar la ráfaga sobre ese alojamiento y revisar errores, tiempos, duplicados y coherencia. La mejora local queda medida y los cálculos de enero quedan disponibles, pero esa aceptación operativa sigue pendiente.
