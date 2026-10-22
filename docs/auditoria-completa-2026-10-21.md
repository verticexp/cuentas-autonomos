# Auditoría completa · 21 de octubre de 2026

Revisión de toda la app y la web sobre `main` (`8f26cc9`): seguridad, código, lógica, visual, contenido y errores en
producción. Todo en local (Redis, Stripe, correo e IA simulados) salvo la lectura de los registros de Vercel y dos
comprobaciones sin efectos en producción tras desplegar. Arreglos en los PR #245 y #246.

## Cómo se ha revisado

| Qué | Cómo | Resultado |
|---|---|---|
| Pruebas unitarias | `npm test` (también con `VERCEL_ENV=production` y `preview`) | 1.076 → **1.117** en verde |
| Baterías de punta a punta | `verificar.mjs`, `regresiones.mjs`, `integridad.mjs` | Estaban **rotas** (ver E01); ahora las tres en verde y en la CI, también cobro, IA y avisos push (E02) |
| Pantallas | Chrome sin cabeza (CDP) por 145 rutas: web pública (34 × 4 vistas), app de una S.L. (83 × 4) y de una autónoma (28 × 3). Vistas: ordenador y móvil, claro y oscuro | 552 páginas: 1 error de JavaScript (arreglado), 0 peticiones fallidas, 0 desbordes horizontales |
| Recorridos a mano | Alta completa de una autónoma (4 pasos + cuestionario), factura de principio a fin con su PDF, hoja del «+», diálogos | Funcionan; detalles abajo |
| Seguridad de la API | Revisión de solo lectura de los 88 endpoints (Codex) + endpoints públicos a mano (Claude) | 11 hallazgos, todos comprobados en el código; 9 arreglados |
| Lógica no fiscal | Revisión de solo lectura (Codex): recurrentes, jornada, inventario, tesorería, incobrables, dietas, duplicados, avisos | 17 hallazgos comprobados: 14 arreglados, 3 decisiones |
| Producción | Errores y avisos de Vercel de 7 días, cabeceras, variables (solo nombres) | 12 errores 500 en `/api/login` (arreglado); resto limpio |
| Cifras | Año completo de una autónoma calculado a mano | 303 de los cuatro trimestres, 130 acumulado, 115 y 390: **cuadran al céntimo** |
| Normativa | Verifactu, registro horario digital, factura electrónica | Ver «Plazos» |

## Fallos encontrados y corregidos

| Id | Gravedad | Dónde | Fallo | Corrección | PR |
|---|---|---|---|---|---|
| S01 | Alta | Paquete de la gestoría | Mandarlo (POST) solo pedía «Datos de la empresa», que también fija el email de la gestoría: con ese permiso alguien podía mandarse todas las facturas, gastos, nóminas y justificantes (y el envío automático del día 5) | Mandar el paquete y elegir adónde van los datos (gestoría, Google Drive) exige además ver resumen, facturas y gastos | #245 |
| S02 | Media | Presupuestos | Dos creados a la vez tomaban el mismo número: 3 simultáneos → 1 guardado | Numerar y guardar bajo cerrojo de la empresa | #245 |
| S03 | Media | Presupuestos | Facturar señal y resto a la vez: 30 + 100 € de un presupuesto de 100 € | Todo bajo el cerrojo del presupuesto (también borrar) | #245 |
| S04 | Media | Nóminas | Dos «Generar» a la vez duplicaban nóminas y gastos | Cerrojo de la empresa | #245 |
| S05 | Media | Empleados, nóminas, cuota, productos, inventario | Sueldo negativo, `1e309` (llegaba como `Infinity`) o cifras absurdas se guardaban | Importes finitos, con signo y con tope; admiten «1 800 €» | #245 |
| S06 | Baja | API | Cuerpos inesperados (`null`, arrays, formularios ilegibles) daban 500 (12 en producción el 20-10 en `/api/login`) | 400 con mensaje | #245 |
| S07 | Baja | API | Sin tope: líneas de un asiento, documentos de una remesa, dispositivos con avisos; sin límite: reenviar invitaciones, avisos de prueba, PDF | 200 líneas, 1.000 documentos, 10 dispositivos; límites por persona o empresa | #245 |
| U01 | Alta | «Varios tickets» | `Permissions-Policy: camera=()` bloqueaba la cámara en vivo en Chrome y Android (salía «denegada») | `camera=(self)`; comprobado en un Chrome real y en producción | #245 |
| U02 | Media | Correos | Una dirección mal escrita decía «inténtalo de nuevo en unos minutos» | El motivo dice qué hacer (dirección, configuración o reintentar) | #245 |
| U03 | Media | PDF y adjuntos | Según desde dónde, «FUNDACIÓ MÚSICA VIVA» salía «FUNDACI MSICA VIVA» y «PEÑA», «PEA» | Un solo ayudante para todos los nombres de archivo | #245 |
| U04 | Media | Ajustes › Recomienda | Error de hidratación de React (#418) en las 4 vistas: el servidor no pintaba «Compartir» y el navegador sí | Se decide tras montar | #245 |
| U05 | Baja | Varias | Título «No existe · Fisquo · Fisquo»; 3 campos sin etiqueta; Ayuda prometía el pago con tarjeta (desactivado) | Corregido | #245 |
| C01 | Media | Categorías de gasto | «Material de oficina» iba a alquileres (621) y «Licencias de software de diseño» a profesionales (623) | Reglas corregidas; solo afecta a gastos sin categoría guardada | #246 |
| C02 | Baja | Títulos | Pestaña distinta de la pantalla: Libros registro (autónomo), Usuarios, Caja, Equipo y nóminas, Nuevo pedido | Iguales; Nóminas vuelve a «Más» | #246 |
| C03 | Baja | Pedidos | Fecha de cierre o cancelación en UTC (entre las 00:00 y las 02:00, la de ayer) | Hora de Madrid | #246 |
| S08 | Media | Cuentas con id solo de cifras (≈2 %) | Upstash devuelve «52361640» como número y `===` fallaba: reenviar una invitación no anulaba la anterior, cambiar el NIF no liberaba el antiguo (y volver a él daba «Ya hay otra cuenta con ese NIF»), quitar Face ID dejaba la llave apuntada. La marca «nada pendiente» de Verifactu («0») tampoco se veía: cada pasada leía todos los registros | Ids leídos de Redis comparados como texto (`mismoId`) | #246 |
| S09 | Media | Personas en varias empresas | Cambiar los permisos de alguien en una empresa a la vez que otra le quitaba el acceso le devolvía ese acceso (Codex H7); un reenvío de invitación a la vez que la aceptaba dejaba un código válido para una cuenta activa | Su ficha se relee y se guarda bajo un cerrojo por persona (`cambiarUsuario`), en permisos, bajas, invitaciones, contraseñas y email; una invitación no cambia la contraseña de una cuenta activa | #246 |
| L01 | Alta | Facturas recurrentes | Si la emisión fallaba hasta acabar el mes (o el cron no pasaba su día), ese mes se perdía sin aviso; el email pendiente de un mes lo pisaba el del siguiente | Se recupera el mes anterior si es el único que falta; un email pendiente por factura; la lista enseña lo que no salió | #246 |
| L02 | Alta | Inventario | La devolución de una venta hecha con albarán volvía al coste de hoy: margen y valor del stock ficticios | Vuelve a su coste de entonces | #246 |
| L03 | Media | Inventario | Emparejar compras por código con «contiene»: «Producto 1234» iba al producto «12» | Palabras enteras y el nombre más concreto | #246 |
| L04 | Media | Registro de jornada | Con el cambio de hora, de 01:30 a 03:30 contaba 120 min (eran 60 en marzo y 180 en octubre) | Desfase real de Madrid | #246 |
| L05 | Media | Registro de jornada | Los festivos nacionales contaban como jornada y se comían las horas extra (enero de 2026: 176 h teóricas en vez de 160) | Fuera los festivos nacionales | #246 |
| L06 | Media | Registro de jornada | A mano se aceptaban fechas que no existen (30 de febrero) y se tiraban sin avisar las pausas a partir de la 11.ª | Rechazadas con mensaje | #246 |
| L07 | Media | Incobrables (art. 80.Cuatro LIVA) | Una pyme que opta por esperar un año no podía emitir la rectificativa a partir del mes 12 | Para pymes, de los 6 a los 18 meses | #246 |
| L08 | Media | Tesorería | Plazos de Hacienda en sábado o domingo (2T de 2025: domingo 20 de julio) y el 111/115 del 4T al 30 de enero | Día hábil, como en Impuestos; retenciones del 4T, el 20 de enero | #246 |
| L09 | Media | Dietas | Kilometraje exento mayor que lo pagado (100 km con 10 € pagados: 26 € exentos) | Exento: lo pagado hasta el límite | #246 |
| L10 | Baja | «Qué hacer hoy» | «Te quedarías sin saldo el 25» daba la fecha del punto más bajo como si fuera la de entrar en negativo | «El 25 te quedarías en −150 €», el saldo más bajo previsto | #246 |
| L11 | Baja | Duplicados | «1-23» y «12-3» del mismo proveedor salían como «misma factura» segura | Se comparan los tramos; si solo se parecen, «probable» | #246 |
| E01 | Media | Pruebas | `verificar.mjs` se cortaba en «Banco» desde el 20-10 (NIF repetido tras el NIF único #221): ~40 % sin ejecutarse. `regresiones` e `integridad` rotas por el bloqueo de forma jurídica (#218). Nadie lo vio porque la CI no las pasaba | Puestas al día y **nuevo workflow E2E** con las tres | #245 y #246 |
| E02 | Baja | Pruebas | En la CI no se probaban el cobro con Stripe, la IA (asistente y tickets) ni los avisos push; el simulador de IA no tenía el conteo de tokens (la lectura de tickets daba 503 y se saltaba como si no hubiera clave) | Las tres partes en la CI; mientras el cobro con tarjeta esté desactivado se comprueba que no sale el enlace | #246 |

## Lo que está bien (comprobado)

- **Núcleo fiscal**: además de la batería de 1.000 empresas, un año de autónoma calculado a mano cuadra: 303 (100,25 /
  591,11 / 774,90 / 430,50 €), 130 con el 5 % de difícil justificación, retenciones y pagos anteriores, 115 (342 €) y
  390 (1.896,76 €). Plazos de 2026 y 2027 con fines de semana bien movidos.
- **Seguridad**: CSP con nonce aplicada, HSTS, `frame-ancestors 'none'`, cookies `httpOnly`/`secure`, anti-CSRF por
  origen, contraseñas con scrypt y comprobación de filtradas, llaves de acceso, bloqueo de servidor y verificación de
  email activos en producción, límites por IP/email, webhooks y crons con firma o secreto en tiempo constante,
  aislamiento entre empresas (revisado endpoint por endpoint).
- **Asistente de IA**: solo lee, con herramientas según los permisos de cada persona, comprueba que cada cifra salga de
  los datos y tiene límites por minuto, día y empresa.
- **Diseño**: 552 páginas sin desbordes ni roturas en ordenador y móvil, claro y oscuro; estados vacíos, diálogos con el
  foco en «Cancelar», etiquetas asociadas en los formularios.
- **Producción**: sin errores de ejecución en 7 días (aparte de S06); copias nocturnas en verde; dependencias al día y
  `npm audit` sin vulnerabilidades.

## Decisiones que necesitan al usuario

1. **Sueldos visibles sin el permiso de nóminas** (Codex H2). Cada nómina crea un gasto «Nómina Ana · octubre» con su
   coste: lo ve quien tiene «Ver gastos» (lista, detalle, Excel, asistente), y el diario, los libros y el paquete
   muestran nombre, bruto, IRPF y neto a quien tiene resumen + facturas + gastos. Propuesta: a quien no tenga
   «Nóminas», un solo gasto «Nóminas de octubre (3 personas)» por mes y la contabilidad agregada. ¿Lo hacemos?
2. **Permiso para contabilizar** (Codex H3). Con resumen + facturas + gastos (pensado para ver) se pueden crear y borrar
   asientos; con «Resumen», cambiar la memoria de las cuentas anuales y marcar modelos presentados. Propuesta: un permiso
   «Contabilidad» (incluido en Administrador y Gestoría).
3. **Textos legales** (en espera por decisión tuya, no tocados): la política de privacidad (5-10-2026) no menciona la IA
   para emparejar columnas al importar, el envío a la AEAT con Verifactu, la comprobación del NIF en el censo, Stripe para
   la suscripción, Google Drive ni los avisos push; las cookies listadas son solo dos de seis. **No hay aviso legal**
   (LSSI art. 10: titular, NIF, domicilio, contacto).
4. **Botones «Continuar con Google / Apple»** del alta y del login: solo dicen «llegará pronto». Mejor ocultarlos hasta que
   funcionen.
5. **Domicilio del destinatario**: se puede emitir una factura completa a una empresa sin su domicilio (art. 6.1.e del RD
   1619/2012 lo pide). Ya estaba en la lista para la asesoría (F06b).
6. **Configuración**: `APP_URL` no está en producción (los enlaces de algunos correos salen del dominio de la petición);
   las alertas de Dependabot están desactivadas en GitHub (solo hay actualizaciones de versión); el nuevo check «E2E»
   puede marcarse como obligatorio para fusionar. La lectura de tickets y la importación usan Claude Haiku 4.5 si
   `ANTHROPIC_MODEL` no dice otro: vale la pena probar uno más reciente (calidad y coste) y añadir su tarifa en
   `lib/cuotasIA.js`.
7. **Tesorería cuando pasa el plazo** (Codex). Si llega el día 20 sin marcar el modelo como presentado, su salida
   desaparece de la previsión. Dejarla como «vencida, prevista hoy» haría ver pagos fantasma a quien presenta con su
   gestoría y no lo marca en Fisquo. Propuesta: al vencer, preguntar «¿Ya lo has presentado?».
8. **111 y 115 por separado** (Codex). Se dan por presentados cuando lo está el 303 o el 130 del trimestre (se suelen
   presentar juntos). Propuesta: poder marcarlos aparte en Impuestos.
9. **Aviso «Sube el extracto»** (Codex). Sale el día 3 si el último movimiento del banco es anterior al 25 del mes
   anterior, aunque el extracto esté completo (un mes tranquilo). Propuesta: guardar qué periodo cubre cada extracto
   importado y avisar solo si falta.

## Aplicado el 22 de octubre de 2026

Todo lo propuesto, salvo lo que el usuario dejó aparte (Verifactu, «Continuar con Google / Apple» y los textos legales,
que esperan a la sociedad). Cada punto, con su PR fusionado en `main` y desplegado.

| Qué | PR | Notas |
|---|---|---|
| Permiso «Contabilidad» y sueldos solo para quien lleva las nóminas (decisiones 1 y 2) | #247 | También `APP_URL`, Dependabot y e2e obligatorio (decisión 6) |
| Tesorería que pregunta si ya se presentó, 111/115 aparte, periodo de cada extracto y domicilio del cliente (decisiones 5, 7, 8 y 9) | #248 | |
| IA de tickets, extractos e importación con Claude Haiku 5.5 (decisión 6) | #249 | `ANTHROPIC_MODEL` vuelve al anterior sin desplegar |
| Factura en otro idioma y en otra moneda (tipo del BCE) | #250 | |
| Criterio de caja (RECC), ventanilla única (369) y dividendos e intereses (123 y 193) | #251 | |
| Módulos (131), IVA simplificado, REBU, REAV y REAGP | #252 | |
| API pública v1 con claves, webhooks firmados y eventos | #253 | |
| Nóminas completas: cotización 2026, IRPF con el 145 y datos para RED | #254 | RED/SILTRA: Excel con bases y conceptos (el fichero XML necesita la autorización RED) |
| Recibo de salarios en PDF | #256 | |
| Cobro de facturas con tarjeta en la cuenta de Stripe de cada empresa (Connect) y banco directo para todas | #255 | Falta activar Connect y su webhook en Stripe, y `BANCO_DIRECTO=todos` cuando Enable Banking lo permita |
| Arreglo del despliegue: desde la #250 producción no se actualizaba | #257 | Las pruebas de la compilación ya no ven el Redis de producción |
| Integraciones: Zapier, Make y n8n con los webhooks y la API | #259 | Una app propia en sus directorios necesita cuenta de desarrollador de la empresa |
| IGIC (Canarias): 420, 425, tipos y documentos | #258, #260 | |
| Pulido de lo nuevo: ejemplo de la guía de integraciones y cobro con tarjeta junto a Cobros | #261 | |
| Navarra y País Vasco: modelos, plazos, pago fraccionado del IRPF e Impuesto sobre Sociedades de cada Hacienda foral; aviso de TicketBAI | #262 | Reglas y fuentes en `docs/territorios-forales.md` |

**Quién hizo qué en esta fase.** Codex: el cálculo de la cotización de 2026 y de la retención del IRPF con el 145, la
primera versión del recibo de nómina, `lib/igic.js` y la integración del IGIC (con su extensión a recepciones,
importación, dietas, caja, catálogo e inventario) y los plazos forales en tesorería, avisos y Resumen (se quedó sin cuota
antes de terminarlos). Claude: el resto, la investigación de las normas, la revisión de todo lo de Codex, los arreglos,
las pruebas e2e y la integración.

**Queda pendiente (no depende del código):**
- Lo que espera a la sociedad: Verifactu (certificado y prueba en la AEAT), «Continuar con Google / Apple», textos legales y aviso legal, el alta de Fisquo en el registro de software TicketBAI y la cuenta de Apple Developer para la App Store.
- Activar en Stripe el cobro de facturas (Connect con cuentas de panel completo y el destino de webhook de las cuentas conectadas, con `STRIPE_WEBHOOK_SECRET_CONNECT`); las claves de Stripe de Producción siguen pendientes.
- `BANCO_DIRECTO=todos` en Vercel cuando Enable Banking permita el uso sin restricciones.
- En territorio foral, Fisquo da los importes por concepto, no las casillas exactas de cada modelo, ni la renta foral (109/F-90) ni los módulos forales.

## Plazos que vienen

| Cuándo | Qué | Estado en Fisquo |
|---|---|---|
| **1-1-2027** | Verifactu obligatorio para sociedades (RD-ley 15/2025) | Código listo y validado con los XSD; **falta el certificado en producción** (`VERIFACTU_P12…`) y la prueba en el entorno de pruebas de la AEAT |
| 1-7-2027 | Verifactu para autónomos | Igual |
| Sin fecha | Registro horario digital (el real decreto sigue sin publicarse en el BOE en octubre de 2026) | El registro de jornada actual cumple el art. 34.9 ET |
| ~10-2028 | Factura electrónica B2B para empresas de menos de 8 M€ (RD 238/2026) | Facturae/UBL listos; falta el intercambio con la solución pública de la AEAT |

## Funciones y modelos que faltan (por prioridad)

| Prioridad | Qué | Para quién |
|---|---|---|
| Alta | Verifactu en real (certificado + prueba en preproducción) | Todas las sociedades desde el 1-1-2027 |
| Alta | Cobro de facturas con tarjeta (Stripe Connect: cada empresa su cuenta) | Todos; hoy desactivado |
| Media | Modelos 123 y 193 (retenciones de dividendos e intereses a socios) | S.L. que reparten dividendos o pagan intereses a socios |
| Media | Criterio de caja (RECC) | Autónomos y pymes acogidos |
| Media | Nóminas completas: bases de cotización, modelo 145, ficheros RED/SILTRA | Quien tiene empleados (hoy las nóminas son simplificadas) |
| Media | Conexión bancaria directa para todos (hoy solo el administrador de Fisquo) | Todos |
| Media | IGIC (Canarias), TicketBAI/Batuz (País Vasco) y Navarra | Empresas de esos territorios: hoy no pueden usar Fisquo bien |
| Baja | Modelo 131 (estimación objetiva / módulos) | Autónomos en módulos |
| Baja | OSS (modelo 369) | Venta a distancia B2C en la UE |
| Baja | REBU, agencias de viajes, agricultura (regímenes especiales de IVA) | Sectores concretos |
| Baja | Factura en otro idioma y en otra moneda | Clientes extranjeros |
| Baja | Entrar con Google/Apple, app de iPhone en la App Store, API o integraciones (tiendas, Zapier) | Crecimiento |

## Quién hizo qué

- **Claude**: plan, recorridos y capturas, revisión de seguridad de lo público, verificación de cada hallazgo de Codex,
  arreglos de permisos, carreras (también H7), cámara, correos, PDF, interfaz, categorías, lógica (L01–L11), ids
  numéricos (S08), e2e y CI, cálculo a mano, informe.
- **Codex**: revisión de solo lectura de los 88 endpoints y de la lógica no fiscal (17 hallazgos); endurecimiento
  mecánico de la API (17 archivos y 16 pruebas), revisado y ajustado por Claude.
