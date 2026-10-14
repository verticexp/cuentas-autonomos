# Capacidad: 1.000 empresas y 200 usuarios simultáneos

Seguimiento del informe del 14/10/2026 (commit revisado `6b813e2`). **No se declara soportado el objetivo**: falta
medirlo en un entorno aislado y representativo (sección «Prueba de aceptación»).

## Hecho (PR «capacidad E01–E05, E09»)

| | Qué cambia | Dónde |
|---|---|---|
| E01 | Índices por empresa (orden por fecha, pendientes, bienes de inversión, fichas compactas, cliente) escritos en la **misma transacción** que cada factura, gasto o presupuesto. Se construyen solos la primera vez y tras una restauración. | `lib/fichas.js`, `lib/redis.js`, `lib/indices.js` |
| E01 | Facturas y Gastos por páginas de 50 con cursor estable; «Por cobrar», vencidas y lo que debes salen de los pendientes, y el total de cada mes, del mes entero. Resumen lee solo los años que enseña + pendientes + bienes. Portal: solo los documentos de ese cliente. Controla'T: solo el mes. | `app/facturas`, `app/gastos`, `app/page.js`, `lib/portal.js`, `lib/controlat.js` |
| E02 | Conciliación con índice por céntimos (Codex) y alimentada solo con lo que puede casar (facturas sin cobrar, gastos sin pagar y ±61 días de los cargos). | `lib/banco.js`, `lib/bancoServidor.js` |
| E03 | Cola duradera de trabajos: Drive y Controla'T se encolan en la transacción de la emisión o del cobro de Stripe y se procesan después de responder. Ninguna llamada externa dentro de un cerrojo. Reintentos con espera creciente; bandeja de errores con reintento. | `lib/trabajos.js`, `lib/trabajosTareas.js` |
| E04 | Los crons planifican un trabajo por empresa y tarea (recordatorios, recurrentes, avisos push, Verifactu) y los procesan en tandas de ~45 s encadenadas (`/api/trabajos`); un corte solo deja pendientes que la siguiente tanda retoma. Tareas idempotentes. | `app/api/recordatorios`, `app/api/recurrentes/cron`, `app/api/trabajos` |
| E05 | Numeración: el contador se verifica una vez por empresa contra el histórico (marca `_verificado`) y después basta leerlo. Las facturas importadas suben el contador en su misma transacción. Igual para albaranes y pedidos. | `lib/facturas.js`, `lib/albaranesServidor.js`, `app/api/importar` |
| E07 (parte) | Contador de intentos de login con caducidad atómica. | `lib/auth.js` |
| E09 | `scrypt` asíncrono con 2 cálculos a la vez por instancia; mismo formato guardado. | `lib/auth.js` |

Medición local (simulador en memoria, 5.000 facturas; misma metodología que el informe, no es una certificación):

| | Antes | Ahora |
|---|---:|---:|
| Datos leídos al abrir Facturas | 2,4 MB | 153 KB (50 facturas + fichas de las sin cobrar) |
| Buscar «Cliente 1», primera página | 2,4 MB | 80 KB |
| Emitir una factura (tras la primera) | todo el histórico | contador, sin leer el histórico |
| Conciliación 2.000 × 2.000 | 15,06 s | 16 ms |

## Revisión del 14/10 tras #73–#74 (S01–S06): corregido

Reproducciones en `tests/revision-s01-s06.test.mjs` (fallaban las seis antes del arreglo).

- **S01** la reconstrucción del índice ya no borra ni escribe a ciegas: cada ficha se aplica con un script atómico solo si el documento sigue igual que cuando se leyó (`lib/scripts.js` INDICE_SI_IGUAL). Nunca se lee un índice a medias.
- **S02** cerrar un trabajo (con éxito o con error) compara su versión en la misma operación atómica (CERRAR_TRABAJO): una versión nueva encolada a la vez se conserva y se ejecuta.
- **S05** cada trabajo guarda su fecha (`cuando`); al restaurar una copia los pendientes vuelven a la cola con sus intentos, y los fallidos siguen en su bandeja.
- **S03** los trabajos ocupados por otra instancia no tapan a los libres ni hacen dar la cola por vacía; si solo quedan ocupados, la siguiente tanda espera 15 s.
- **S04** el orden es un conjunto lexicográfico por (orden, id): el cursor recorre cualquier número de empates, también con altas y bajas entre páginas.
- **S06** el texto de búsqueda va en un índice aparte (`ixt`), completo y por campos, igual que la búsqueda de antes.
- Prueba de la cola con tres instancias a la vez, fallos pasajeros y una instancia caída a mitad.

Medición con la distribución de la revisión (5.000 facturas en un mes, dos tercios sin cobrar): página de 50, 18 KB; búsqueda, 38 KB; pero **«Por cobrar» lee 578 KB (fichas de 3.333 pendientes) y el total del mes 878 KB (fichas de 5.000)**. Lo resuelve E06 (totales precalculados), pendiente.

## E06, E10, E11 (14/10, tercera tanda)

- **E06 totales precalculados**: cada escritura de facturas, gastos o presupuestos va en una única ejecución atómica (`lib/scripts.js` TX_INDICES) que lee la ficha anterior dentro de Redis y aplica la diferencia: por cobrar, lo que se debe, gastos sin pagar y totales por mes (todo y pendiente, por actividad), en céntimos enteros. Vencidas por un índice de vencimientos. `comprobarTotales` los recalcula desde las fichas y lista descuadres. El Resumen se guarda calculado por versión de los datos (`lib/panelCache.js`): mientras no cambie nada, no lee documentos.
  Con 5.000 facturas en un mes y dos tercios sin cobrar, abrir Facturas lee **19 KB** (antes 2,25 MB); el Resumen sin cambios, solo los totales y la caché.
- **E10**: la copia hace un SCAN al principio y otro al final (con 1.000 empresas, 2 recorridos en vez de ~3.001) con las mismas garantías; la exportación completa lee las colecciones de una en una. Pendiente de decisión: guardar las exportaciones en un almacenamiento de objetos (Vercel Blob) y dar un enlace caducable, en vez de construir el ZIP en memoria (es infraestructura nueva).
- **E11**: líneas JSON `{"metrica": …}` en los registros: errores de petición (`instrumentation.js`), esperas de cerrojo de más de 0,5 s, reconstrucciones de índice, cada tanda de trabajos con el estado de la cola (total, vencidos y espera máxima) y trabajos fallidos. Sin datos fiscales, nombres ni emails. La latencia por ruta (p50/p95/p99) y la memoria las da Vercel (Observability). Las alertas (tasa de errores, cola atrasada) se configuran en Vercel o con un drain: es configuración de la cuenta.

## E12: lo verificado y lo que hay que confirmar en los paneles

Verificado: proyecto `cuentas` del equipo `verticexpcom`, región de funciones `fra1` (`vercel.json`), Node 24, crons diarios a las 06:00 y 07:00 UTC, funciones de cron y trabajos con `maxDuration` 60 s, protección SSO en `*.vercel.app` (por eso las tandas se encadenan al dominio propio). El cliente de Upstash agrupa peticiones automáticamente (auto-pipelining).

No se puede ver desde la API ni el código (hay que mirarlo en los paneles):
- **Vercel**: plan (Hobby/Pro), límite de duración y memoria de funciones, ejecuciones concurrentes, frecuencia mínima de crons, presupuesto de uso.
- **Upstash**: plan, región (debería ser Fráncfort, junto a `fra1`), límite de comandos por segundo y de ancho de banda, tamaño máximo de petición/respuesta, persistencia y copias. **La base se comparte con Controla'T**: recomendable una base propia para que una app no consuma el margen de la otra.
- **Correo, IA y Stripe**: cuotas y límites de envío de cada proveedor.

## Pendiente

- **E01 resto**: hecho en la segunda tanda (Impuestos, mes, Tesorería, libros, paquete, estado de pagos, caja e importación de ventas, nueva factura, proyectos por año, exportar CSV, ajustes de Verifactu, cuestionario, proveedores, remesas y duplicados). Siguen leyendo todo, a propósito: **Contabilidad y cuentas anuales** (el balance acumula desde el principio: necesitan agregados, E06), el **inventario** (valora con todo el histórico de movimientos), la **exportación completa**, la **baja**, **Proyectos «desde el principio»** y el **asistente** (carga colecciones según la pregunta). Los movimientos del banco (`banco:<emp>`) aún no tienen índice. La búsqueda recorre fichas compactas (no documentos); para texto libre a escala, un índice de búsqueda o PostgreSQL.
- **E06** agregados por empresa/mes con invalidación; **E07** límites de ráfaga y concurrencia (y confirmar `LIMITES=activo` en producción); **E08** presupuestos de tiempo por proveedor; **E10** exportación y copias como trabajos por lotes; **E11** métricas y alertas.
- **E12**: el plan de Vercel no aparece en la API (equipo «verticexpcom», proyecto `cuentas`, región `fra1`). Si es Hobby, los crons son diarios; por eso las tandas se encadenan solas. Falta inventariar región, plan y límites de Upstash (la base se comparte con Controla'T) y valorar una base dedicada o PostgreSQL.
- Bandeja de trabajos fallidos en la interfaz (las funciones `fallidos` y `reintentar` ya existen).

## Prueba de aceptación (por hacer, en un entorno aislado)

Datos ficticios: 1.000 empresas (la mayoría pequeñas, algunas con 5.000 y 20.000–50.000 documentos, varios años, pagos parciales). Mezcla de navegación, búsqueda, emisión, cobros, gastos, portales, importaciones y exportaciones, con los crons a la vez.

- Rampa 20 → 50 → 100 → 200 usuarios virtuales con pausas realistas, y un pico aparte de 200 inicios de sesión.
- Tráfico repartido entre muchas empresas y concentrado en una (cerrojos de emisión).
- 30 min sostenidos; ensayo de varias horas; pico por encima del objetivo.
- Proveedor lento (Drive 25 s), 429, caída de Redis, respuesta perdida, trabajador reiniciado.
- Objetivos propuestos: p95 ≤ 1 s y p99 ≤ 2 s en páginas y guardados; < 0,1 % de 5xx/timeouts; cero cobros o facturas perdidos o duplicados, numeración única y cadena Verifactu coherente; cola diaria vacía antes de su plazo.
- Nunca contra producción ni servicios de pago reales.
