# Seguimiento de la auditoría de facturación (octubre de 2026)

Punto de partida: informe «Análisis de Netto: preparación como software de facturación» (13-10-2026, commit `109f4cf`) y
sus evidencias. Cada hallazgo se ha vuelto a comprobar contra `main` (`89fbabc`, con #46–#52 ya integrados).

**Responsables:** Claude (dirige, diseña e integra) · Codex (encargos acotados, revisados por Claude) · Usuario (decisiones
de negocio, accesos a producción) · Asesoría fiscal (puntos marcados ⚖).

**Estados:** ✅ hecho y probado · 🟡 en curso / parcial · ⏳ pendiente · ⚖ necesita revisión fiscal · 🔑 necesita acción del usuario.

## Entrega 1 — Integridad (P0) · rama `claude/integridad`

| Id | Problema (reproducido antes de corregir) | Corrección | Evidencia | Resp. | Estado |
|---|---|---|---|---|---|
| F01 | 20 emisiones simultáneas → 9 ids distintos (prueba propia; la auditoría vio 5) | Emisión serializada por empresa (`lib/cerrojo.js`, cerrojo con propietario y liberación segura con `EVAL`) y escrita en una transacción `MULTI/EXEC`: factura, contador de serie y año, registro, cabeza de cadena y clave de idempotencia. `HSETNX`-equivalente: nunca se pisa un id que ya existe | `tests/integridad.test.mjs`: 20 y 100 emisiones simultáneas (dos series), sin huecos ni repetidos; `tests/e2e/integridad.mjs`: 20 por HTTP | Claude | ✅ |
| F01b | Doble clic, reintento tras respuesta perdida, cron repetido | Clave de idempotencia (40 días): formulario (`idem` por formulario), albaranes (hash de los ids), presupuestos (`pres:<id>:<tipo>`), caja, importación (`imp:<formato>:<día>`), recurrentes (`rec:<id>:<mes>`) | Pruebas «misma clave → misma factura» unitaria y HTTP | Claude | ✅ |
| F02 | 10 emisiones simultáneas con Verifactu → una sola factura y cadena bifurcada | Igual que F01: la cabeza se lee y avanza dentro del cerrojo y se escribe en la misma transacción que factura y registro | Prueba de 10 simultáneas (1 primer registro, sin bifurcaciones, cabeza = último); prueba de corte a mitad (transacción fallida) sin huérfanos; `lib/integridad.js` sin incidencias tras 10 por HTTP | Claude | ✅ |
| F03 | Borrar la última factura liberaba su número | Contador por serie y año que nunca baja (`numeracion`); al borrar, copia en `facturasBorradas` con quién y cuándo. El siguiente número es el máximo de contador, emitidas y borradas | Prueba unitaria y HTTP (`2026-21` borrada → siguiente `2026-22`) | Claude | ✅ |
| F03b | Borrar una factura emitida deja un hueco en la numeración | Se conserva constancia (`facturasBorradas`). Sustituir el borrado por borradores + anulación/rectificación | — | Claude ⚖ | ⏳ Fase 3 |
| F04 | Un aviso de 0,01 USD saldaba una factura de 121 € | Pagos como lista (`f.pagos`) con importe, moneda y referencia; solo EUR, de esa factura y empresa; parcial → sigue pendiente con saldo; evento repetido no duplica (cerrojo por factura + referencia); el enlace de pago cobra solo el saldo; cobro de más se audita | Prueba unitaria (USD, parcial, duplicado concurrente, otra factura, resto) y HTTP con webhook firmado con secreto local | Claude | ✅ |
| F04b | Devoluciones, disputas, comisiones de Stripe | Registrar `charge.refunded` y `charge.dispute.*` como movimientos negativos | — | Claude | ⏳ Fase 3 |
| F05 | Las facturas antiguas se regeneraban con los datos actuales del emisor | Instantánea en cada emisión: emisor, marca (logo por versión en `logos`, por huella) y `vence`. Todos los documentos usan `identidadDoc`/`emisorDe`: PDF, vista A4, portal, email, Drive, recordatorios, Facturae/UBL, XML Verifactu | Prueba unitaria; HTTP: cambiar la razón social no cambia el PDF de una factura emitida | Claude | ✅ |
| F05b | Facturas de antes de la instantánea | Se congela su instantánea antes de cualquier cambio de emisor, marca o plazo (`congelarInstantaneas`, idempotente). Además, `scripts/migrar-integridad.mjs` (simula · copia · aplica · comprueba · restaura) | Prueba unitaria; migración ensayada con la demo en base simulada: simular, aplicar, repetir (idempotente) y restaurar | Claude · 🔑 Usuario | 🟡 código listo; ejecutar en producción requiere tu permiso |
| F06 | Fecha 2026-02-31, IVA 99 %, base negativa ordinaria aceptadas | `lib/validacion.js`: fechas reales, NIF/NIE/CIF con control, NIF-IVA UE, IVA ∈ {0,2,4,5,10,21}, IRPF ∈ {0,1,2,7,15,19}, 1–100 líneas sin recortes, importes acotados, negativos solo en rectificativas; errores por campo (`errores`) | `tests/validacion.test.mjs` (Codex) + HTTP 400 con errores por campo | Codex (lib) · Claude (integración) | ✅ (tipos ⚖) |
| F07 | Con bloqueo activo, la API daba datos sin desbloqueo | `usuarioApi` exige el mismo desbloqueo que las páginas: 423 `{ bloqueada }`; el cliente (`llamar`) lleva a `/bloqueo`. Desbloquear va por `/api/login` y `/api/passkey` | HTTP con `BLOQUEO_SERVIDOR=activo`: 423 sin `d`, 200 con `d`, páginas → `/bloqueo` | Claude | ✅ |
| F08 | Una recurrente fallida quedaba marcada como hecha | `lib/recurrentesServidor.js`: el mes se apunta solo con la factura emitida; el fallo queda en `r.fallo` (periodo, error, intentos) y se reintenta; emisión idempotente por plantilla y mes; dos pasadas a la vez → una (cerrojo); el email va aparte (`r.envio`, hasta 5 intentos) sin emitir otra | Pruebas: fallo + reintento, dos pasadas simultáneas, corte entre emitir y apuntar, email que falla y se reintenta | Claude | ✅ |

**Validación transversal de la entrega**
- `npm test`: todas en verde, también 32 ejecuciones seguidas de `tests/integridad.test.mjs` en 8 procesos a la vez. Una prueba intermitente (reintento del correo contado dos veces) se investigó hasta la causa; no afectaba a la integridad.
- `tests/e2e/integridad.mjs` (HTTP, app local, base simulada vacía): todo en verde.
- Suite integral previa `tests/e2e/verificar.mjs`: 315 ✓. Las 6 que fallan dependen del entorno, no de este cambio: dos «modo registrar» (se ejecutó con bloqueo `activo`), dos del cron (sin `CRON_SECRET`), una de email (sin simulador de Resend) y la página 404 pública solo en desarrollo, que el informe ya señalaba. Sus NIF ficticios se cambiaron por NIF válidos, que ahora se exigen.
- Entorno aislado: `tests/apoyo/upstash-mem.mjs` (Upstash en memoria, admite `MULTI/EXEC` atómico y cortes simulados). Ningún dato real, ningún envío real a AEAT, Stripe, bancos ni correo.

**Efectos a tener en cuenta al desplegar**
- Una factura antigua con un NIF mal escrito no se podrá editar sin corregir el NIF; la validación lo indica por campo.
- La API responde 423 sin desbloqueo solo si `BLOQUEO_SERVIDOR=activo`; con el valor por defecto (`registrar`) solo lo anota.
- Las empresas dadas de baja ya no emiten recurrentes.
- No hace falta migración para numerar bien: el contador se pone al día solo con lo ya emitido. La migración solo congela las instantáneas antiguas por adelantado.

## Fase 2 — Validación fiscal y VERI\*FACTU · rama `claude/fase2-redondeo`

| Id | Problema | Corrección | Evidencia | Resp. | Estado |
|---|---|---|---|---|---|
| F09 | `r2(1.005)` = 1, `r2(-0.004)` = −0; 0,5 × 19,99 daba 9,99 | `lib/redondeo.js`: mitad lejos del cero, simétrico, sin ruido binario (`toPrecision(15)`), una sola implementación para toda la app (incluido el XML de Verifactu). Política: línea al céntimo; IVA por tipo sobre la suma de bases; retención sobre la base; total = base + IVA − retención | `tests/redondeo.test.mjs` (Codex): medias unidades, 30 facturas con su rectificativa espejo exacta, 100 líneas de 0,01 €, y coherencia con Verifactu, Facturae y UBL | Claude · Codex (tests) | ✅ |
| F11b | El estado de envío se sobrescribía: solo el último | Historial de cada intento (`envios`, hasta 30) con estado, código, descripción y CSV; la factura solo toma el estado de su registro vigente | `tests/verifactu-envio.test.mjs` | Claude | ✅ |
| F11b′ | **Encontrado al revisar:** los pendientes no se filtraban por modo; al pasar de pruebas a real, los registros de pruebas pendientes se habrían enviado a la AEAT real | Cada registro guarda su modo (los antiguos, el de su factura o, si no se sabe, pruebas) y solo se envía el del modo actual | Prueba con registros de pruebas antiguos sin modo + paso a real: solo sale el real | Claude | ✅ |
| F11c | El XML usaba el régimen de IVA y el emisor actuales | Instantánea `regimenIva` en la emisión; XML con el emisor y el régimen de cuando se emitió | Prueba: emitida en recargo (ClaveRegimen 18) y enviada después de pasar a general | Claude | ✅ |
| F11d | Rechazos o atascos sin aviso | `lib/verifactuEstado.js`; incidencias en Ajustes › Verifactu (con enlace a cada factura) y notificación diaria | Pruebas de estado y aviso | Claude | ✅ (caducidad del certificado: ⏳, necesita leer el .p12) |
| F11a | Solo F1 y R4; sin subsanación ni anulación | R1–R4 según el motivo de la rectificativa (R4 por defecto ⚖); subsanación corrigiendo el cliente (`Subsanacion` S y `RechazoPrevio` X/N); anulación de facturas expedidas por error (`RegistroAnulacion` encadenado; la factura pasa a `facturasBorradas`, su número no se reutiliza) | XML validado contra los XSD oficiales de la AEAT (también lo que va detrás de una anulación); flujo completo con la AEAT simulada; `lib/integridad.js` sin incidencias | Claude ⚖ | ✅ (combinaciones a confirmar en el entorno oficial: F11f) |
| F10 | El 349 incluía facturas con IVA español por llevar un NIF `DE…` | `lib/operaciones.js`: la factura indica por qué va sin IVA (exenta E1, intracomunitaria E5, servicios UE N2, exportación E2, servicios fuera N2, inversión del sujeto pasivo S2); si no, se deduce del cliente como antes. 303 con las casillas de 2026 (59, 60, 120, 122); 349 solo la parte sin IVA intracomunitaria, clave E o S; libros y Verifactu con la misma clasificación; validación cliente/líneas; selector en la factura | `tests/operaciones.test.mjs` (incluido el caso de la auditoría) + XSD de la AEAT; `verificar` sin regresiones (315 ✓) | Claude ⚖ | ✅ (matriz completa: asesoría) |
| F11e | Declaración responsable frente al comportamiento (emitir sin Verifactu, borrar y editar) | — | — | 🔑 Usuario ⚖ | ⏳ |
| F11f | Flujo completo en el entorno oficial de pruebas de la AEAT, con representación | — | — | 🔑 Usuario (certificado) | ⏳ |
| F06b | Datos obligatorios del destinatario en factura completa y simplificada (RD 1619/2012, arts. 6–7) | — | — | ⚖ | ⏳ |

Casillas del 303 contrastadas con las [instrucciones de 2026 de la AEAT](https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/iva/modelo-303-iva-autoliquidacion_/instrucciones-2026.html): 59 entregas y servicios intracomunitarios, 60 exportaciones, 120 no sujetas por localización (salvo 123), 122 inversión del sujeto pasivo, 123 y 124 ventanilla única (no implementadas).

## Fase 3 — Copias y recuperación · rama `claude/fase3-copias`

**Objetivos acordados con el usuario (14-10-2026):** RPO 24 h (copia nocturna) · RTO 1 h (restaurar y comprobar).

| Id | Tarea | Resp. | Estado |
|---|---|---|---|
| F14a | Copia v2: consistente por empresa (firma antes y después, reintento), cifrada AES-256-GCM (`COPIA_CLAVE`), con huella y resumen sin datos personales; no falla sin facturas | Codex (encargo 1, sol high) · Claude revisa | 🟡 en curso |
| F14b | Restauración por empresa, con sobrescritura opcional y copia previa de lo sustituido; verificación de integridad tras restaurar; acepta copias v1 | Codex (encargo 1) · Claude revisa | 🟡 en curso |
| F14c | Workflow nocturno cifrado con aviso (issue) si falla; simulacro semanal de restauración en base simulada, con tiempos | Codex (encargo 3) · Claude revisa | ⏳ tras el encargo 1 |
| F14d | Secreto `COPIA_CLAVE` en GitHub | Usuario | ✅ añadido (comprobado el nombre, no el valor) |
| C3 | Lectura de tickets: desglose de varios IVA, cuadre base + IVA − retención = total, fecha dudosa visible | Codex (encargo 2, en paralelo) · Claude revisa | 🟡 en curso |

## Fase 4 — Borradores y pagos parciales

| Id | Tarea | Resp. | Estado |
|---|---|---|---|
| D1 | Borradores con autoguardado; número solo al emitir; sustituye al borrado de emitidas (F03b) | Claude | ⏳ |
| D2 | Estado documental separado del de pago; saldo, varios pagos y varias facturas por ingreso; conciliación por importe | Claude | 🟡 (lista de pagos lista) |
| D3 | Vencimientos múltiples y condiciones por cliente | Codex (lib) · Claude | ⏳ |
| F13 | Versionado y actualización atómica en ediciones (cobrada mientras se envía, etc.) | Claude | ⏳ |

## Fase 5 — Clientes y adjuntos

| Id | Tarea | Resp. | Estado |
|---|---|---|---|
| C1 | Clientes con id estable (hoy el nombre en mayúsculas), contactos y direcciones | Claude | ⏳ |
| C2 | Adjunto original de cada gasto con huella y control de acceso | Claude | ⏳ |
| C3 | OCR: varios tipos de IVA, comprobación base + IVA − retención = total, fecha desconocida visible | Codex | ⏳ |
| C4 | Duplicados de gastos por proveedor, número, fecha e importe | Codex (`lib/duplicados.js`, con pruebas) · Claude (avisar al guardar) | 🟡 librería lista; falta el aviso en el formulario |

## Fase 6 — Seguridad (F12)
Recuperación de contraseña · reautenticación para IBAN, llaves, borrados y exportaciones · sesiones por dispositivo ·
alta inicial atómica · ids completos · límites por empresa · permisos separados (contabilizar ≠ ver resumen) ·
activar `CSP`, `LIMITES`, `VERIFICAR_EMAIL`, `BLOQUEO_SERVIDOR` en producción. **Estado:** ⏳ (activación: 🔑).

## Fase 7 — Accesibilidad
Etiquetas en campos de cliente · errores por campo con foco (la API ya devuelve `errores`) · sustituir `alert`/`confirm` ·
teclado, contraste, zoom 200 % y lectores de pantalla · empresa activa visible al emitir. **Estado:** ⏳.

## Fase 8 — Rendimiento
Paginación e índices por año, cliente y estado (hoy `HGETALL` de todo) · cron por lotes · pruebas con 1.000, 10.000 y 100.000
documentos. **Estado:** ⏳.

## Fase 9 — Operación y comercialización
Lockfile y versión de Node · CI con `npm test`, build y e2e (incluido `tests/e2e/integridad.mjs`) · staging · logs
estructurados y alertas · auditoría completa e inmutable · ciclo SaaS y Stripe Connect (quién cobra) · contrato de
encargado del tratamiento. **Estado:** ⏳.

## Esencial vs. ampliaciones (mercado: autónomos y pymes de servicios en España)

| Esencial (antes de vender) | Ampliación según mercado |
|---|---|
| Entrega 1 completa · F09 · F10 (casos del público objetivo) · F11 · copias ensayadas · borradores y saldo de cobro · seguridad de cuentas · CI | Facturae B2G/FACe con firma XAdES · factura electrónica B2B por plataforma privada o solución pública (ver abajo) · divisas · TicketBAI/Batuz/SII/IGIC · albaranes, inventario y caja · API pública · nóminas completas |

## Normativa vigente contrastada (13-10-2026)

| Norma | Qué dice | Fuente | Consecuencia para Netto |
|---|---|---|---|
| VERI\*FACTU (RD 1007/2023, modificado por RD-ley 15/2025) | Obligatorio desde el **1-1-2027** (contribuyentes del Impuesto sobre Sociedades) y el **1-7-2027** (resto). Los productores siguen con su plazo de 9 meses desde la Orden HAC/1177/2024 | [BOE-A-2025-24446](https://www.boe.es/buscar/doc.php?id=BOE-A-2025-24446) · [nota AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html) | La integridad de la cadena (F02) y F11 deben estar cerradas antes del 1-1-2027 para las sociedades usuarias |
| Factura electrónica B2B (Ley 18/2022, RD 238/2026, Orden HAC/1028/2026) | RD en vigor desde el 20-4-2026; plazos desde el **6-10-2026**: 12 meses para quien facture más de 8 M€ y 24 meses para el resto. Vías: plataformas privadas o solución pública de la AEAT. El destinatario comunica a la solución pública el **pago completo o el rechazo** | [RD 238/2026](https://www.boe.es/buscar/act.php?id=BOE-A-2026-7295) · [Orden HAC/1028/2026](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20587) · [calendario AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/factura-electronica/calendario-implantacion.html) | Para el público de Netto (menos de 8 M€) es obligatorio hacia **octubre de 2028**. Facturae/UBL (#50) es la base; falta el intercambio con la solución pública y la comunicación del estado de pago. Fechas calculadas a partir de la Orden: ⚖ confirmar |

## Decisiones que necesitan revisión fiscal (⚖)
1. Tipos de IVA (2 % y 5 % temporales) e IRPF admitidos y a qué operaciones; si se admiten por fecha de devengo.
2. Datos obligatorios del destinatario en factura completa y simplificada (RD 1619/2012 arts. 6–7) y cuándo exigir NIF.
3. Si se permite borrar una factura emitida sin Verifactu o solo anularla con rectificativa (huecos de numeración).
4. Tratamiento del cierre de caja como asiento resumen (F4) frente a factura simplificada (F2) registrada.
5. Matriz de clasificación de operaciones internacionales (F10) para 303/349/390/347 y claves Verifactu.
6. Retención en UBL (`PayableAmount` neto, incumple BR-CO-16 de Peppol).
7. Motivo por defecto de las rectificativas (hoy R4; muchas devoluciones y descuentos son R1).
8. Inversión del sujeto pasivo en Verifactu: S2 con tipo 0 y cuota 0 (válido por esquema; confirmar en el entorno de pruebas).
9. Subsanación: combinaciones de `Subsanacion`/`RechazoPrevio` (S/X para rechazados, S/N para aceptados con errores).
