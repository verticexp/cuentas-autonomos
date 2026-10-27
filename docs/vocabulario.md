# Vocabulario de Fisquo: un nombre para cada cosa

**Regla:** manda la navegación (`components/TabBar.js`, `components/secciones.js` —menú «Más» y barra lateral— y
`components/ListaAjustes.js`). El título de cada pantalla, el botón «‹ Volver», la pestaña del navegador, la página «no existe»,
los avisos, los correos y los textos de ayuda llaman a cada cosa **como la llama la navegación**. Si una pantalla necesita otro
nombre, se cambia primero en la navegación y los demás sitios lo repiten.

`tests/vocabulario.test.mjs` vigila lo que se puede vigilar: que `Volver.js`, `not-found.js`, los títulos de pestaña y las filas
de Ajustes coincidan con la navegación y que no vuelvan las palabras descartadas de la tabla de abajo. Al añadir una pantalla,
da de alta su nombre en `secciones.js` (o en Ajustes) y en `components/Volver.js` (`NOMBRES`).

## Pantallas

| Dónde | Nombres |
|---|---|
| Barra de pestañas | Resumen · Facturas · Gastos · Ajustes · Más |
| Más › Vender | Clientes · Presupuestos · Facturas recurrentes · Caja · Catálogo · Inventario · Pedidos y albaranes |
| Más › Cobrar y pagar | Banco · Cartera de cobros · Tesorería · Proveedores |
| Más › Hacienda y números | **Impuestos** · Contabilidad (para un autónomo, «Libros registro») · Análisis · Proyectos |
| Más › Equipo | **Equipo y nóminas** · Registro de jornada |
| Más | Pregunta a Fisquo |
| Ajustes | Datos de la empresa · Actividades e impuestos · Usuarios y permisos · Tu gestoría · Tu plan · Recomienda Fisquo · Diseño de factura · Series y numeración · Cobros · Email de envío · Verifactu · Bancos · Google Drive · Controla'T · API y webhooks · Seguridad · Avisos · Actividad · Apariencia · Importar datos · Descargar todos los datos · Ayuda y contacto · Dar de baja la empresa · Eliminar mi cuenta |
| Panel de la gestoría | Mi despacho (Hoy · Plazos · Mensajes · Facturación · Equipo · Ajustes) |
| Solo el administrador de Fisquo | Panel de Fisquo · Correos de Fisquo |

## Conceptos: qué decimos y qué no

| Concepto | Decimos | No decimos (y dónde sí vale) |
|---|---|---|
| La pantalla de los modelos fiscales | **Impuestos** («Impuestos por trimestre») | «Modelos» o «Hacienda» para nombrar la pantalla. «Modelo 303» es **un formulario** (se sigue diciendo: «Modelo 130», «Tus modelos» en el Resumen es la lista de formularios). «Hacienda» es la Agencia Tributaria como entidad («plazos de Hacienda», «Hacienda Foral»). «AEAT» solo con su sede, sus ficheros y Verifactu. |
| Lo que se apunta al pagar a alguien | **Gasto** (pantalla «Gastos») | «Compras» como pantalla. «Compra» solo como concepto legal o de stock: «compras a la UE», «bien de inversión: compra que se amortiza», el movimiento «Compra» del inventario. |
| Donde se cambia lo de la empresa | **Ajustes** | «Configuración» (queda solo en «Configuración › Correo › Reglas» de la guía para Outlook, que es el programa de correo de la persona, no Fisquo). |
| La pantalla del equipo | **Equipo y nóminas**; la persona es **empleado**/**empleada**; el documento es **nómina** | «Nóminas» ni «Empleados» como nombre de la pantalla (en el botón «‹ Volver», en «Ir a…», en la página «no existe»). Dentro de la pantalla, el apartado se llama «Empleados» y el historial «Historial de nóminas». |
| Cuándo está cobrada una factura | Factura que **emites**: **Cobrada** · Pendiente · Vencida («Marcar como cobrada», «Cobrada con tarjeta o Bizum») | «Pagada» en tus facturas. Quien **paga** lo ve con su verbo: el cliente en el enlace de pago y en el portal ve «Pagada»; en gastos y nóminas es «Pagado»/«Por pagar». |
| La factura que corrige otra | **Factura rectificativa** («Rectificativas de proveedores», «Rectificar») | «Abono» o «nota de crédito». «Abono» solo en el banco: cargo/abono de un extracto. |
| La profesional que lleva las cuentas | **Tu gestoría** (la empresa), **gestor**/**gestora** (la persona) | «Asesoría» y «asesor» (solo en las condiciones legales: «gestor o asesor fiscal»). |
| El panel de la gestoría | **Mi despacho** (nombre propio: se queda). «Despacho» solo en lo que ve la gestoría | «Despacho» en lo que ve el cliente: él ve «Tu gestoría». |
| La fecha en que se hizo el servicio o la entrega | **Fecha de la operación** (art. 6.1.f del Reglamento de facturación) | «Fecha del evento», «fecha del servicio o del evento», «fecha de operación», «evento el…». El campo interno sigue llamándose `evento`. |
| Cifra con lo apuntado hasta ahora | **apuntado hasta hoy** («Con lo apuntado hasta hoy…»). Solo significa «hasta donde llegan tus facturas y gastos» | «Hasta hoy» para un plazo. |
| Cifra de lo que saldrá al cerrar el trimestre | **previsión del trimestre** (Tesorería y «Lo próximo» de Impuestos: «Previsión del trimestre, con lo apuntado hasta hoy») | «Estimado», «previsión del trimestre entero». |
| El último día de presentación | «**hoy es el último día**», «hasta mañana», «hasta el 20 de octubre» | «hasta hoy» (se confundía con «apuntado hasta hoy»). |
| Pantalla de inicio | **Resumen** («Ir al Resumen») | «Inicio», «Dashboard». |
| Quitar algo | **Borrar** un documento o un registro; **Quitar** de una lista o desvincular (del catálogo, una cuenta bancaria); **Eliminar mi cuenta** (nombre de la pantalla de Ajustes) | «Eliminar» para un webhook (ahora «Borrar webhook»). |
| Terminar la sesión | **Cerrar sesión** | «Salir» (queda «Salir sin guardar», que es otra cosa). |
| Lo que facturas y lo que es tuyo | **empresa** en la app («Datos de la empresa», «Tus empresas», «Dar de baja la empresa») | «Negocio» solo al darse de alta y en el cuestionario inicial («¿Qué tipo de negocio tienes?», «Tu negocio, en orden»). «Cifra de negocios» es un término contable. |
| Facturas que has hecho | **emitida** («Emitida el…») | «Expedida», salvo el nombre oficial del libro registro («Facturas expedidas»). |
| Cómo se llama un trimestre | **1T**, **2T**… con su año («4T 2026») | «Trimestre 4», «T4». |

## Formatos (lib/formato.js)

| Qué | Cómo |
|---|---|
| Fecha | `fechaCorta` → 15/10/2026 (listas, tablas, documentos); `fechaTexto` → 15 de octubre (frases) |
| Fecha y hora de un momento | `fechaHora` → 15/10/2026 10:30, **siempre en hora de Madrid** (servidor y navegador dan lo mismo); `hora` → 10:30; `diaDe` → 2026-10-15 (para comparar con `hoy()`) |
| Importes | `eur` → 1.234,50 € (con espacio duro); `eurSin` sin el símbolo, para columnas de asientos; `eurPrecio` → 29 € o 23,20 € (tarifas de los planes) |
| Porcentajes | `pct` → 21,00 %; `pctCorto` → 21 % o 12,5 % |
| Con día de la semana | `fechaConDia` → lunes 26 de octubre (separadores del chat) |

No se usan `toLocaleDateString`, `toLocaleString` ni `Intl.DateTimeFormat` para lo que ve el usuario en `app/` y `components/`.
Quedan, a propósito: las cantidades de unidades del inventario (`ud`, hasta 3 decimales), los ejes de las gráficas
(`components/Grafica.js`: «1,5 k»), la hora del reloj de fichar y el cálculo de la hora del día en `app/despacho/hoy`, que no se enseñan.

## Lo que cambió en la pasada del 26-10-2026

- **Impuestos:** la tarjeta «Hacienda» del Resumen pasa a «Impuestos»; «Hacienda por trimestre» → «Impuestos por trimestre»;
  la página «no existe» llamaba «Modelos» a Impuestos.
- **Equipo y nóminas:** `‹ Volver` (empleado, nómina, jornada), «Ir a Nóminas», `Volver.js` y la página «no existe» decían
  «Nóminas», «Cartera», «Jornada», «Recurrentes», «Albaranes» o «Fisquo» (para Pregunta a Fisquo): ahora el nombre completo de la
  navegación. Títulos de pestaña: «Pedidos y albaranes», «Remesas SEPA», «Panel de Fisquo», «Correos de Fisquo».
- **Ajustes:** el panel de administración decía «Configuración»; el cuestionario de «Actividades e impuestos» decía «Configuración
  del negocio»; la sección «Avisos» se titulaba «Avisos en el móvil» en su pantalla.
- **Cobrada/pagada:** «Pagada con tarjeta o Bizum» en la factura del que cobra → «Cobrada con tarjeta o Bizum».
- **Rectificativas:** «Abonos de proveedores» (casillas 40 y 41 del 303 y paquete para la gestoría) y «los abonos de…» (349) →
  «rectificativas».
- **Fecha de la operación:** «por su fecha de operación» → «por su fecha de la operación»; en presupuestos, «evento el…» y
  «Fecha del servicio o del evento» → «Fecha de la operación»; en el enlace público del presupuesto, «después del evento».
- **Hasta hoy / previsión:** la tarjeta de Impuestos del Resumen dice «Apuntado hasta hoy» y «con lo apuntado hasta hoy»; el
  trimestre en curso, «En curso · apuntado hasta hoy»; Tesorería, «Previsión del trimestre, con lo apuntado hasta hoy»;
  «Lo próximo» de Impuestos, «previsión del trimestre»; el plazo del último día, «hoy es el último día».
- **Otros:** «Ir al inicio» → «Ir al Resumen»; «Salir» → «Cerrar sesión» (Bienvenida y confirmar email); «Eliminar webhook» →
  «Borrar webhook».
- **Formatos:** fechas y horas de actividad, envíos, mensajes y accesos con `fechaHora` (hora de Madrid); listas de facturas y
  gastos con `fechaCorta` en vez de «12 oct»; importes sueltos con `eur`, `eurSin` o `eurPrecio`; porcentajes con `pct`/`pctCorto`.

## Pendiente

- Los correos y las plantillas de `lib/` (avisos, correo de bienvenida, paquete para la gestoría) comparten estas palabras pero
  no están cubiertos por la prueba: revisarlos al tocarlos.
- `app/contabilidad` y `components/CuentasAnuales.js` están en manos de otra tarea: allí siguen «Facturas expedidas» (nombre
  oficial del libro) y las navegaciones `anios` sin nombre propio.
