# Auditoría numérica de Fisquo · 14 de octubre de 2026

## Resultado y alcance

La creación inicial de Aurora comprobaba acceso e integridad, pero no demostraba la exactitud de todos los cálculos. Esta revisión contrasta las fórmulas y los datos guardados con aritmética independiente en céntimos y cocientes enteros, y comprueba las páginas y exportaciones mediante HTTP.

Se han reproducido **28 casos de fallo de cálculo** contra el código anterior: 20 pruebas principales y ocho del auxiliar. Todos tienen una corrección y una regresión. Además, se ha corregido el saldo incorrecto del generador y la omisión de albaranes en los circuitos contables. Son casos de regresión, pueden compartir una misma causa raíz.

La demo se ha ampliado a **214 facturas, 370 gastos, 96 nóminas, nueve clientes, cuatro actividades, 16 presupuestos y cuatro recurrencias**. Incluye ahora retenciones explícitas de alquiler y profesionales, IVA mixto, pagos parciales, reembolso pendiente, ventas de servicios a la UE y compras de servicios de la UE y de fuera. Todos los datos son ficticios y locales.

## Cifras de Aurora contrastadas independientemente

| Año | Facturado sin IVA | Gastos con amortización | Beneficio antes de impuestos | Amortización | Base IS con existencias | Cuota IS |
|---|---:|---:|---:|---:|---:|---:|
| 2024, desde octubre | 35.534,00 € | 43.300,88 € | −7.766,88 € | 546,28 € | 0,00 € | 0,00 € |
| 2025 | 207.610,00 € | 184.062,50 € | 23.547,50 € | 8.800,06 € | 24.280,37 € | 5.098,88 € |
| 2026, hasta 14/10 | 127.945,82 € | 145.110,34 € | −17.164,52 € | 9.391,78 € | 0,00 € | 0,00 € |

La variación de existencias de 2025 añade 732,87 € al resultado fiscal: 23.547,50 + 732,87 = 24.280,37 €. El panel muestra ingresos menos gastos registrados y amortización; el cierre contable y el IS incorporan además la variación de existencias. No son magnitudes intercambiables.

- Banco, reconstruido desde apertura, cobros, pagos, nóminas, seguros e impuestos: **−27.685,68 €**. Coincide con el saldo guardado y el mayor 572.
- Balance: **74.000,81 € de activo = 74.000,81 € de patrimonio neto y pasivo**.
- Inventario actual: **1.020,79 €**, con unidades y valoración contrastadas por producto.
- **1.301 asientos**, todos cuadrados al céntimo.

El saldo inicial de la demo anterior, con 210 facturas y 368 gastos, era 242.365,82 €. Su propio mayor, incluyendo las nóminas omitidas por el generador, daba −28.361,78 €. Antes de ampliar los datos, las correcciones de cierre fiscal situaron ese saldo en −28.515,68 €. El saldo final anterior no se debe comparar directamente con el de la demo ampliada: también cambiaron los datos de prueba.

## Regresiones principales

| Caso | Error reproducido antes | Comportamiento corregido |
|---|---|---|
| N01 | Tres retenciones de alquiler de 0,01 € daban 0,02 € en 115/180. | Se suman las cuotas de cada pago: 0,03 €. |
| N02 | El alquiler y los profesionales pendientes generaban retención; un pago de abril se declaraba en marzo. | Se declara al pagar y en el periodo del pago, también si cambia de año. |
| N03 | El IS no descontaba retenciones soportadas. | Cuota 190 − retención 150 − pago a cuenta 20 = 20 €. |
| N04 | Un ordenador de 3.650 € cargaba 912,50 € de amortización anual en enero; Contabilidad cargaba cero hasta fin de trimestre. | A 31/01, ambas cuentan 77,50 €: 3.650 × 25 % × 31/365. |
| N05 | El total anual incluía IVA no deducible y el gráfico mensual lo omitía. | Un gasto de 100 € al 21 % suma 121 € en ambos. |
| N06 | Marcar presentado un trimestre pagaba retenciones de facturas aún pendientes. | Las facturas no pagadas mantienen su deuda y no producen esa salida bancaria. |
| N07 | El IS restaba la compra de mercancía que seguía en el almacén. | Se incluye la variación de existencias. |
| N08 | La casilla 07 del 130 perdía su signo cuando era negativa. | Casilla 04 cero si hay pérdidas; con retención 15, casilla 07 = −15, sin ingreso negativo. |
| N09 | El 390 incluía la cuota deducible UE y omitía su base. | Base 100 € y cuota 21 € aparecen conjuntamente. |
| N10 | Una venta con IVA español a un cliente UE desaparecía del 347. | Se distingue la operación nacional de la intracomunitaria sin IVA. |
| N11 | Resumen y Tesorería exigían pagar IVA cubierto por cuotas negativas anteriores. | −210 € en 1T y +210 € en 2T dejan cero a ingresar. |
| N12 | El cuadre del banco mezclaba 570 Caja y 572 Banco. | El saldo bancario se compara con 572. |
| N13 | Una nómina pendiente se contabilizaba como pagada y generaba retenciones satisfechas. | Se devenga el coste; pago y retención siguen el estado y la fecha efectiva. |
| N14 | Las deudas a proveedores y sus índices incluían la retención que se paga a Hacienda. | Base 1.000 + IVA 210 − IRPF 150 = 1.060; en alquiler, 1.020. Índices versionados y reconstruidos. |
| N15 | El paquete de gestoría volvía al bruto y al IVA sin compensar. | CSV, Excel, PDF y modelos usan los importes netos y muestran las retenciones. |
| N16 | Meses futuros sin nómina generada no incluían el salario del equipo activo. | Se estima desde la ficha del empleado, sin duplicar una nómina existente. |
| N17 | Los gastos habituales previstos descontaban la retención al proveedor, pero no preveían ingresarla después. | Se añade el pago futuro de 111/115 en su trimestre. |
| N18 | Los intereses e ingresos registrados mediante asientos manuales no entraban en el IS. | Se integran las cuentas de ingresos/gastos, excluyendo el propio impuesto. |
| N19 | El 130 arrastraba negativos de trimestres no presentados y consumía créditos al ver una previsión. | Solo las declaraciones presentadas generan y consumen esos negativos. |
| N20 | El libro de amortizaciones de un año abierto descargaba la cuota anual completa aunque los resultados ya usaban el corte del día. | Libro y resultados coinciden en cuota, acumulada y pendiente a la fecha del informe. |

## Revisión independiente del auxiliar

| Caso | Error reproducido antes | Comportamiento corregido |
|---|---|---|
| AUX01 | Una nómina con coste 2.633 € solo preveía 240 € de retención. | Neto 1.630 + seguros 763 + retención 240 = 2.633 €. |
| AUX02 | Un reembolso pendiente de −100 €, con −25 ya devueltos, no producía movimiento. | Se prevé la devolución restante de −75 €. |
| AUX03 | Una factura de profesional de 1.000 + 210 − 150 se preveía pagar por 1.210 €. | Se pagan 1.060 €, también en la media habitual. |
| AUX04 | Devolver una venta después de cambiar el coste medio creaba 25 € de margen ficticio. | La devolución referenciada repone el coste de la venta original. |
| AUX05 | Anular una compra a proveedor dejaba sobrevalorado el stock. | Una compra y su devolución restauran el coste previo. |
| AUX06 | Diez unidades gratuitas duplicaban el valor del stock. | Cuentan en el denominador del coste medio: valor conservado, coste medio reducido. |
| AUX07 | La lectura de compras perdía un descuento del 10 %. | Coste unitario de 20 € pasa a 18 €, conservando 180 € de compra. |
| AUX08 | Inventario y el cierre contable redondeaban el total en niveles diferentes. | Ambas valoraciones coinciden al redondear el total. |

El auxiliar fue responsable de la revisión de nóminas, inventario y tesorería y escribió las reproducciones. El agente principal revisó sus resultados, implementó todas las correcciones e integró las pruebas. El auxiliar no modificó los módulos de producción.

## Pruebas y evidencia

- Suite completa: **526/526 pruebas correctas** y `npm run build` correcto.
- `tests/auditoria-numerica.test.mjs`: 20 fallos con la versión anterior; correctos con la nueva.
- `tests/auditoria-numeros-aux.test.mjs`: ocho fallos con la versión anterior y cinco controles correctos; todos correctos después.
- `tests/oraculo-importes.test.mjs`: 2.000 facturas con cantidades fraccionarias, descuentos, varios IVA, signos y rectificativas, usando cocientes BigInt ajenos a `lib/`.
- `tests/simulada-saldo.test.mjs`: generador completo contra Redis efímero; el saldo incorpora las nóminas y conserva índices.
- `tests/e2e/numeros-aurora.mjs`: **2.052 comprobaciones correctas**, incluidos 214 documentos de venta, 370 gastos, 96 nóminas, 12 trimestres, casillas de IVA e inversión del sujeto pasivo, modelos 111/115/180/190/202/349/390/200, cuentas, stock, siete páginas, CSV y Excel.
- `tests/e2e/numeros-circuitos.mjs`: **0/5 antes → 5/5 después**. Cinco cables entregados mediante albarán dejan 50 € de existencias en página, Excel y PDF; la base del IS es 50 € y su cuota 10,50 €. El quinto circuito comprueba el pago de una nómina por la API.
- PDF de cuentas anuales contrastado con extracción de texto y renderizado A4. Paquete de gestoría renderizado para revisar cifras y legibilidad.

Los dos fallos de temporización del asistente IA observados en una ejecución con carga no se reprodujeron al aislar sus 12 pruebas ni en la siguiente suite completa; no se cambiaron sus expectativas.

Los comandos y resultados de esta auditoría operan exclusivamente contra Redis simulado y servidores localhost. La demo permanece en memoria mientras esté activo su proceso; se conserva una copia inicial y una copia de la simulación anterior en `/private/tmp`.

## Contraste fiscal y límites

Se contrastaron con fuentes primarias los [tipos del IS de 2025/2026](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/manual-sociedades-2025/principales-novedades-impuesto-sobre-sociedades-2025/tipos-gravamen.html), las [casillas 04, 05, 07, 12 y 15 del modelo 130](https://sede.agenciatributaria.gob.es/Sede/impuestos-tasas/impuesto-sobre-renta-personas-fisicas/modelo-130-irpf______esionales-estimacion-directa-fraccionado_/instrucciones.html) y el [momento de practicar la retención](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/folleto-actividades-economicas/7-otras-obligaciones-fiscales-retenciones.html).

La [Seguridad Social publica los tipos de 2026](https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/CotizacionRecaudacionTrabajadores/10721/10957/9932/4315). El 31,65 % empresarial por defecto supone una prima AT/EP del 1 %; esa prima es configurable y no universal. Las pruebas matemáticas validan los porcentajes guardados en cada nómina. No certifican la base legal de cotización, prorratas, topes, convenios o contratos especiales de una persona concreta.

La auditoría demuestra los casos y datos descritos. La renta sigue usando una escala orientativa, sin situación personal/autonómica completa. El borrador de Sociedades sigue sin resolver automáticamente tipos especiales, pérdidas fiscales anteriores, reservas y ajustes extracontables. La compensación de IVA supone que el saldo negativo registrado sigue disponible: no registra una devolución previa de Hacienda ni saldos externos que no estén en el histórico. Esas decisiones necesitan datos que el perfil actual no recoge; no se presentan aquí como una liquidación fiscal definitiva.
