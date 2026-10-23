# Auditoría completa · 23 de octubre de 2026

Revisión de Fisquo de arriba abajo: código línea a línea por áreas, todas las pantallas (ordenador y móvil, claro y oscuro,
con cinco cuentas simuladas), cálculos fiscales contra las fuentes oficiales, mercado y competencia, y pruebas de uso con
ocho clientes ficticios. Corrige y amplía la del 21 de octubre, a la que se le escaparon fallos de diseño y de números de
casillas. Lo corregido está en `main` (PR #275, desplegado) y en el segundo PR de la misma fecha.

## Resumen

- **Nota global: 6,3 → 7,4 sobre 10** (antes: media de las revisiones; después: estimación tras los arreglos de hoy, sin
  una segunda revisión independiente).
- **Unos 500 hallazgos** entre 13 revisiones; ninguno crítico abierto. Se han corregido los de prioridad alta de cálculo,
  números de casillas, seguridad y primer uso, y la mayoría de los de diseño de las pantallas principales.
- **Números de modelos**: el 303 ya enseña las casillas y el orden del formulario de 2026 (el recargo del 0,5 % iba como
  16-18 y es la 168-170); 111, 115 y 123 con sus casillas reales; el 130 cobraba de más en el trimestre siguiente a uno
  presentado sin pagar; el IVA autoliquidado iba siempre al 21 %.
- **Lo que más frena hoy**: botones de Google y Apple que no funcionan, pie de la web sin identidad legal ni aviso legal,
  Verifactu sin declaración responsable publicada, y la falta de prueba social (opiniones, casos, equipo).
- **Satisfacción (8 personas ficticias, antes de los arreglos)**: SUS 65 (la media del sector es 68), NPS −12,5, 54 % de
  satisfechos. De sus 23 fricciones, 10 quedan resueltas, 6 en parte y 7 pendientes.

## Cómo se ha revisado

| Revisión | Qué | Hallazgos |
|---|---|---|
| P | Pantallas y lógica de `app/` y `components/` | 40 |
| F1 | IVA: casillas, 303/390/349/347/369, IGIC, forales, Verifactu, factura | 32 |
| F2 | IRPF, retenciones, Sociedades, cotización y nóminas | 28 |
| C1 (Codex) | Datos y contabilidad: libros, banco, cobros, copias, carreras | 26 |
| S (Codex) | Seguridad: permisos, validación, límites, carreras | 12 |
| D1 | Web comercial (10 páginas) | 44 |
| D3–D8 | Diseño de cada pantalla con las cuentas simuladas (autónoma, sociedad, nueva, vacía, admin) | 290 |
| U | 8 personas ficticias recorriendo 9 tareas | 23 fricciones |
| M | Mercado español y 15 competidores, con fuentes | — |
| CL | Textos y claridad | — |

Las cifras fiscales se han comprobado con los diseños de registro de la AEAT (DR303e26v101, DR130e15v12, DR111, DR115), el
BOE (Orden HAC/56/2024, Orden PJC/297/2026, RD 1619/2012, LIVA, LIRPF, RIRPF) y la Sede.

## Puntuaciones por área (0–10)

| Área | Antes | Después | Por qué |
|---|---|---|---|
| Números de casillas y modelos | 7,5 | 9 | Casillas del 303 de 2026, 111, 115 y 123 reales; informativos que no parecen pagos; el mismo nombre en todas las pantallas. |
| Cálculo fiscal (303, 130, 111, 115, IS, renta) | 6,5 | 8 | 130 sin cobrar de más, 19 con signo, IVA autoliquidado a su tipo, saldo a compensar inicial y caducidad, renta de nuevos autónomos, 111 negativo. Faltan fecha de operación, importaciones y prorrata especial. |
| Plazos y calendario | 9 | 9,5 | Todos en día hábil, también los anuales; plazos forales y 4T. |
| Nóminas y cotización | 7 | 8 | Retención con los meses de alta, base mínima por hora, recibo desglosado. |
| Requisitos de factura | 5 | 7,5 | Menciones de exención e inversión del sujeto pasivo, IBAN opcional, domicilio del emisor, motivo sin IVA obligatorio, NIF del cliente desde 3.000 € (aviso desde 400 €). |
| Verifactu | 6 | 6,5 | Leyenda y QR solo en modo real. Faltan las claves de régimen antes de activarlo. |
| Contabilidad y libros registro | 5 | 6,5 | Criterio de caja, saldo de apertura, pagos en su fecha, libro IRPF, R1-R4, 700/705. Faltan cobros RECC por separado y el REAGP en recibidas. |
| Banco, cobros e integridad de datos | 5 | 7,5 | Permisos, cerrojos, importes reales, paréntesis en extractos; importaciones que no pisan conciliaciones, un solo pago abierto por factura, copias que no tocan la identidad. |
| Seguridad | 6,3 | 8 | Los 12 hallazgos corregidos (Codex) y revisados. |
| Claridad de textos | 6,5 | 7,5 | Jerga explicada, «hasta hoy», «Lo próximo», Proyectos con el resultado real. |
| Coherencia entre pantallas | 5,3 | 6,3 | Nombres de casillas y colores unificados; siguen dos sistemas de formularios y varios formatos de fecha. |
| Primer uso | 5,5 | 7,5 | Retención elegida, botones que explican, salida, regímenes plegados, primeros pasos con botón, menú más corto. |
| Estados vacíos | 7 | 8,5 | Sin pantallas de ceros. |
| Diseño visual | 7,1 | 7,8 | Campos con borde, flechas, tablas de verdad, botones desactivados visibles. |
| Móvil | 6,8 | 7,3 | Tablas apiladas, textos sin cortar donde importan. |
| Web comercial | 5,3 | 6,5 | Portada clara, CTA al registro, /seguridad, /business y /verificado al día. Sin prueba social ni pie legal. |
| Accesibilidad visual | 6 | 7 | Bordes 3:1 y contraste del botón principal. |
| **Global** | **6,3** | **7,4** | |

## Pruebas de uso y satisfacción (ficticias)

Ocho personas sintéticas (fontanero, diseñadora con clientes UE, boutique en recargo, S.L. de reformas, gestoría,
fotógrafo nuevo, bar con empleados, consultor que exporta) sobre las capturas reales, antes de los arreglos:

- **SUS 65** (55–77,5; media del sector 68) · **SEQ 4,7/7** · éxito sin ayuda en el **56 %** de las tareas.
- **CSAT**: web 50 % · alta 25 % · facturas 75 % · gastos 75 % · impuestos 63 % · banco 38 % · contabilidad 50 % ·
  ajustes 38 % · móvil 75 %.
- **NPS −12,5** (1 promotora, 5 pasivos, 2 detractores).
- Fricciones resueltas hoy: retención del 15 % por defecto, portada genérica, «para apartar» incompleto, «Hecho» frente a
  «Faltan datos», ejemplos de DJ, ficha de factura sin «Enviar» principal, informativos con importe, Tesorería en rojo sin
  porqué, inversión del sujeto pasivo por defecto, plazos con fechas distintas.
- Pendientes: Google y Apple, Banco con lo pendiente bajo el pliegue, modo gestoría, varios IVA en «Varios tickets»,
  ajustes difíciles de encontrar, planes del alta, listas con bases mezcladas, recargo en gastos, idioma y moneda por
  cliente.
- Estimación si se repitiera la prueba con lo corregido: SUS 70–72 (no medido).

## Mercado y competencia

- 3.483.645 autónomos (septiembre de 2026) y 2,99 millones de empresas (1,13 millones de S.L.). Solo la mitad de los
  autónomos usa software de facturación y el 70-79 % tiene gestoría, que es quien recomienda el programa.
- Precios (€/mes sin IVA): Fisquo 9/12/20 (autónomos) y 25/32/55 (pymes); Holded 15–199 (inventario, nóminas, usuarios y
  SII aparte); Quipu 17–59; Billin 8–28; Contasimple 0–19,95; Anfix 5,99–99,99; FacturaDirecta 0–120; Cuéntica 9–129;
  Declarando y TaxDown 29,90+ (con presentación); app de la AEAT gratis.
- **Fisquo es el más ancho y de los más baratos**: contabilidad de S.L., cuentas anuales, IS, nóminas, inventario, IGIC y
  forales en el mismo precio. Su problema no es de producto: es de mensaje, confianza y fricciones de entrada.
- Huecos: S.L. por menos de 32 €/mes con contabilidad completa; Canarias y forales (TaxDown y Sage los excluyen); app móvil
  de calidad (los rivales rondan 3–3,5 estrellas); «una sola adaptación» Verifactu + factura electrónica; transparencia de
  cálculo (/verificado); gestoría dentro y gratis.
- Amenazas: suelo gratis (AEAT, Qonto, Contasimple), consolidadores con distribución (TeamSystem, Visma/Holded, Cegid),
  paquetes de gestoría + software que presentan los modelos, la IA ya no diferencia, aplazamientos de Verifactu.

## Qué se ha corregido

### PR #275 (fusionado y en producción)

- **Impuestos**: 303 en el orden y con los números del formulario de 2026; 111 (28/30), 115 (03/05), 123 de 2024;
  informativos «No se paga»; plazos en día hábil; 130 (casilla 05, 19 con signo y tipo B, nombre y apellidos); 111
  negativo; IVA autoliquidado a 4/10/21 %; saldo a compensar inicial y caducidad; Irlanda del Norte; OSS 2026; 390, 415 y
  Álava; renta (edad 65/75 y reducción del 20 % por inicio); 200 con la pérdida; retenciones del 1 y 2 % (clave H).
- **Nóminas** (Codex): retención con los meses de alta, base mínima por hora con el registro de jornada, recibo desglosado,
  SS de la empresa 32,15 %.
- **Facturas**: menciones legales sin IVA, retención según el cliente, motivo sin IVA obligatorio, IBAN opcional, domicilio
  obligatorio, libros con R1-R4 y exportación 02, paquete de la gestoría completo, «Enviar al cliente» principal.
- **Seguridad y datos** (Codex): S-01 a S-12, C1-07, C1-15, C1-16, C1-19, C1-21, C1-24; revisado, con tres correcciones de
  Claude (negativos en el CSV, duplicados de gastos que dejaban pasar lo ya apuntado, «EUR» en extractos).
- **Primer uso y diseño**: bienvenida (retención elegida, «Siguiente» que explica, salida, regímenes plegados), Resumen
  nuevo con el siguiente paso, «Equipo» solo con trabajadores, estados vacíos sin ceros (Codex), «Lo próximo» y «hasta
  hoy» en Impuestos, tablas del 347/180/190, Proyectos con el resultado real, campos con borde, flechas en los
  desplegables, colores y contraste.
- **Web**: portada en cinco segundos, CTA al registro, /seguridad en lenguaje llano, /business para varias sociedades,
  /verificado sin promesas engañosas.

### Segundo PR (23-10-2026)

- **Contabilidad y libros** (Claude): criterio de caja hasta el 31-12 del año siguiente, IVA a compensar de la apertura,
  pagos a Hacienda en la fecha marcada (y las retenciones de las sociedades, que nunca se pagaban), libro IRPF con la parte
  afecta, retención prevista en el trimestre del pago, % de Excel como fracción, ventas a la 700.
- **Facturas** (Claude): una factura a un cliente español sin NIF no puede pasar de 3.000 € (factura simplificada,
  art. 4 RD 1619/2012) y desde 400 € el formulario avisa; presupuestos y rectificativas quedan fuera.
- **Banco, cobros y copias** (Codex, revisado y retocado por Claude): importar un extracto ya no puede pisar un movimiento
  conciliado (HSETNX en una transacción por tanda); emparejar, deshacer, editar y borrar gastos bajo cerrojos que caducan
  sin escribir a destiempo; los gastos de nómina solo con permiso de sueldos; una sola página de pago de Stripe abierta por
  factura, con clave de idempotencia, que se cierra si cambia lo pendiente y no deja abrir otra mientras se confirma un
  pago (el cliente ve ese motivo en vez de «paga por transferencia»); la fecha del cobro es la de Madrid; restaurar una
  copia de una empresa no cambia el correo, la contraseña ni las otras empresas de un usuario; la cadena Verifactu se
  comprueba aunque falten todos sus registros.

## Pendiente

### Decisiones tuyas (no se han tocado a propósito)

1. **Verifactu real**: publicar la declaración responsable y corregir antes las claves de régimen del XML (F1-12: REBU 03,
   REAV 05, caja 07, OSS 17, REAGP 19, simplificado 20; la parte «fuera de base» del REBU no va como exenta).
2. **Botones de Google y Apple**: hoy dicen «llegará pronto» en el primer paso del alta. Recomiendo ocultarlos hasta que
   funcionen: es la tercera fricción de las pruebas.
3. **Pie y textos legales**: titular, NIF, domicilio, aviso legal, cookies y declaración responsable, en cuanto exista la
   sociedad.

### Alta prioridad

- Fecha de operación distinta de la de expedición y devengo por ella (F1-01).
- Importaciones de bienes (casillas 32-35) separadas de la inversión del sujeto pasivo (F1-03).
- Libros: cada cobro del criterio de caja en su línea y periodo (C1-13) y recibos del REAGP en recibidas (C1-14).
- Banco centrado en lo pendiente y guía por banco para descargar el extracto (fricción 4).

### Media

- Prorrata: bases deducibles sin prorratear (F1-04) y prorrata especial (F1-31); 349 mensual y rectificaciones (F1-06).
- 390 con la 38, el recargo y las exclusiones del art. 121 (F1-22); 347 con ISP, caja y metálico (F1-28).
- Factura simplificada según el sector: hoy se bloquea desde 3.000 € y solo se avisa entre 400 y 3.000 € (F1-10).
- Nombre y apellidos por separado en Ajustes (hoy se parten con una regla que acierta con los nombres compuestos).
- Administradores (35/19 %, clave E) y subclaves del 190 (F2-08, F2-18).
- Coherencia: un solo sistema de formularios, un formato de fecha por contexto, bases con o sin IVA en las listas (D3).
- Menú progresivo completo: Caja solo para quien vende en mostrador; «Más herramientas» (D8-28).
- Alta en 3 pasos sin «Revisar y crear» (D8-10); etiqueta del plan en las pantallas de pago durante la prueba (D8-32).
- Modo oscuro en la web comercial o el registro en claro (D1-02).
- Transiciones que faltan en unos 40 enlaces y fechas en cinco formatos (P).

### Baja

- El resto de F1 (F1-18, F1-23, F1-26 a F1-30), F2 (F2-13 a F2-28), D4, D5 y D7 sin corregir, recogidos en los informes de
  cada revisión.

## Recomendaciones (producto y negocio)

1. **Confianza antes que captación**: pie legal, declaración responsable, nota del fundador con nombre y cara, y las tres
   primeras opiniones reales (Fundador) en la portada.
2. **Quitar lo que no funciona** del primer minuto (Google y Apple) y medir el embudo de activación (alta → primera
   factura → primer gasto → banco) en el panel de administración.
3. **La gestoría como canal**: panel de clientes para gestorías, exportación a A3/ContaPlus/Contasol a la vista y una
   página /gestorias con lo que verán dentro.
4. **Mensaje**: «Tu gestión completa al precio de una herramienta de facturación, con tu gestoría dentro». Enseñar
   Canarias, Navarra y País Vasco, y la comprobación de cálculos (/verificado) como diferencial.
5. **Banco**: conexión directa (PSD2) para todos cuando sea posible; mientras, guía de cada banco para el extracto.
6. **App móvil** publicada y cuidada (valoraciones): es donde los rivales flojean.
7. **Revisión fiscal externa** de los borradores (IS y renta) por un asesor antes de anunciarlos más.
8. **Volver a pasar las pruebas con personas reales** (5 por segmento) sobre la versión de hoy.

## Cómo se ha verificado

- `npm test`: 1.543 pruebas en verde (1.519 en el PR #275); `next build` correcto.
- Batería e2e completa (verificar, regresiones e integridad): 514 comprobaciones en verde en los dos PR, actualizada a los
  cambios intencionados (etiquetas, domicilio obligatorio, retención por meses, menú sin «Equipo»); el simulador de Stripe
  devuelve ya el estado y la caducidad de la sesión, como el real.
- Revisado en el navegador con las cuentas simuladas (ordenador y móvil).
- PR #275: CI en verde (pruebas, e2e y vista previa), fusionado y desplegado; producción sirve la versión nueva y no
  registra errores en la hora siguiente.

## Quién hizo qué

- **Claude** (dirección): plan, revisiones P, F1, F2, D1, D3–D8, U, M y CL con agentes; diseño y arreglos fiscales,
  contables, de primer uso y de diseño; revisión de todo lo de Codex; pruebas, e2e, fusiones y despliegue.
- **Codex**: revisiones C1 y S y segunda opinión fiscal; implementación de seguridad y datos, nóminas, IVA autoliquidado,
  estados vacíos y el segundo lote de banco, cobros y copias, siempre en su propio worktree y revisado antes de integrar.
