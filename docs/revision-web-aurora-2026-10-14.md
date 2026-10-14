# Revisión de los cambios posteriores a la auditoría de Aurora

Base revisada: `452959c` (PRs hasta #97), comparada con `3dbe769`. La revisión independiente del auxiliar detectó seis regresiones. El principal reprodujo los errores, implementó las correcciones y verificó su integración.

| Caso | Antes | Después |
|---|---|---|
| WEB01 | Abono −121 € y albarán 121 € producían riesgo exacto 121 €, aunque el listado daba cero. | Compensación antes de limitar el saldo a cero: riesgo 0 €. |
| WEB02 | Editar solo el nombre, conservando NIF, duplicaba una factura pendiente de 121 € y bloqueaba el límite de 150 €. | La identidad fiscal coincide; no se vuelve a sumar la deuda anterior. Aplica también a los albaranes. |
| WEB03 | El Excel de cartera omitía la forma de cobro heredada de la ficha. | Exporta Cheque y su recepción pendiente, igual que la cartera. |
| WEB04 | Cambiar Cheque por Pagaré en la ficha reutilizaba la recepción antigua. | Si el tipo registrado no coincide, el nuevo efecto queda por recibir. Se conservan las recepciones históricas sin tipo registrado. |
| WEB05 | Una factura de 1.210 € y un abono de −1.089 € daban 36,5 días de cobro para 121 € pendientes durante un año. | El denominador es la venta neta: 365 días. Lo mismo para las compras y el plazo de pago. |
| WEB06 | Un importe «abc» en otros gastos de personal desaparecía sin error. | Se rechaza el asiento y se pide corregir el importe. |

Verificación:
- Suite inicial actual: 565/565 correctas.
- Cinco regresiones unitarias nuevas: 0/5 antes; todas correctas después.
- Dos circuitos HTTP (WEB02 y WEB03): 0/2 antes, 2/2 después, también sobre la compilación de producción.
- Suite de las correcciones: 570/570 y `npm run build` correctos.
- Aurora: 2.052/2.052 comprobaciones independientes sobre la compilación final.
- Cinco circuitos originales de cuentas, Excel, PDF y pago de nómina: 5/5 sobre la compilación final.

El primer intento de pruebas dentro del sandbox no podía abrir los puertos de Redis simulado. Se repitió con permisos de localhost y pasó. El auxiliar no completó la suite por limitaciones de su entorno; el principal sí la ejecutó íntegra.

La revisión numérica se realizó con datos ficticios y Redis aislado. La creación de Aurora en producción requiere un acceso autorizado al servidor o una sesión de administrador en la web. No debe ejecutarse `scripts/demo.mjs` contra producción: ese script puede rehacer una cuenta existente. La contraseña de la simulación local es pública y no debe reutilizarse para el acceso web.

Se mantienen los límites fiscales documentados en `auditoria-numerica-2026-10-14.md`: las pruebas no sustituyen datos fiscales personales, ajustes extracontables ni la configuración laboral de cada empresa.

## Alta de Aurora en la web

Se añade un formulario exclusivo del administrador global en `/ajustes/aurora` y `POST /api/aurora`. Carga el fixture ficticio auditado, crea una identidad independiente y genera una contraseña nueva que se muestra una sola vez. No utiliza credenciales del simulador. No admite archivos ni empresas de destino; una cuenta Aurora existente produce 409 sin cambios. El cerrojo serializa las altas simultáneas y la transacción guarda datos e índices. Presupuestos reciben tokens aleatorios nuevos. Se desactivan recordatorios, recurrencias, Drive, ControlaT y VeriFactu.

Verificación adicional: 571/571 pruebas y compilación correctas. La regresión del alta comprueba concurrencia, contraseña, datos de otras empresas, índices y enlaces. Cuatro circuitos HTTP correctos: sin sesión, administrador de empresa, origen externo y duplicado. La fixture contiene 214 facturas, 370 gastos, 96 nóminas, nueve clientes y 16 presupuestos, sin usuarios ni contraseñas.

## Comprobación con Redis de producción

El primer alta web devolvió 500 en `TX_INDICES`: `op[7]` era nulo al procesar un índice. El simulador no detectaba la diferencia de transporte. Se eliminan los argumentos `null` de las operaciones de presupuestos y se valida la estructura de toda la transacción antes de escribir. Redis ejecuta Lua sin intercalación, pero no revierte lo ya escrito ante un error a mitad; no debe confundirse con una transacción con rollback.

El alta puede retomar una carga interrumpida solamente si no existen usuario ni empresa y coinciden exactamente las 214 facturas de la fixture. Reutiliza los enlaces de esa carga y no borra datos. La prueba añade una empresa publicada con la misma fixture para comprobar que se excluye de la recuperación. También verifica que un lote estructuralmente inválido no aplica su primera escritura.

El flujo del alta se verificó además en Chrome. La navegación directa al JSON de la API era bloqueada por el navegador; el formulario usa ahora el mismo patrón de petición asíncrona que el login y conserva el resultado en la página. Se comprobó el alta local completa desde Chrome, con sus cantidades y acceso visibles, antes de publicar el cambio.
