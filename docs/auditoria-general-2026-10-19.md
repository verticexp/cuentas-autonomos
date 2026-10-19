# Auditoría general · 19 de octubre de 2026

Revisión de la app completa sobre `main` (`12df6b5`): cálculos fiscales contra la normativa, importación de Excel con
usuarios nuevos y duplicados, banco, remesas, albaranes, recurrentes y plazos. Todo en local (Redis simulado, Stripe y
correo simulados); ningún dato ni servicio de producción.

## Fallos encontrados y corregidos

Cada uno tiene una prueba que falla con el código anterior y pasa con el nuevo.

| Id | Dónde | Fallo reproducido | Corrección |
|---|---|---|---|
| G01 | Importar facturas | `001/2026`, `002/2026`… (y `07-2026`, como numera la propia app) se leían todas como «factura 2026»: la segunda y siguientes salían como duplicadas y **no se importaban** | Si el último grupo de cifras es el año de la factura, el número es el anterior (`lib/importar.js`, `numeroDe`) |
| G02 | Importar facturas y gastos | «Impagada», «No cobrada», «No pagado», «Vencida» o «Parcialmente cobrada» entraban como **cobradas** | Estados en negativo reconocidos; «en parte» sin columna Pendiente se rechaza pidiéndola |
| G03 | Importar facturas y gastos | Un Excel sin ninguna columna de IVA entraba con **IVA 0 %** sin avisar (el 303 salía de menos) | Con base y total se deduce el tipo; con solo el total se pide la columna «% IVA» |
| G04 | Remesas SEPA de pagos | La retención del alquiler se restaba **dos veces**: 1.000 € + IVA − 19 % se pagaba por 830 € en vez de 1.020 € | `lib/remesas.js` usa el total de `importes()`, que ya la resta |
| G05 | Banco · deshacer | Deshacer un cobro parcial del banco borraba también lo cobrado a mano después (121 €: 20 banco + 101 a mano → quedaba 0 cobrado) | El cobro a mano se apunta como pago antes de quitar el del banco (`lib/bancoServidor.js`) |
| G06 | Banco · extractos | En un extracto de un solo día ordenado de nuevo a antiguo, el saldo tomado era el del movimiento más antiguo | El orden se deduce de los saldos encadenados (`lib/banco.js`) |
| G07 | Albaranes | El país del cliente se perdía: un cliente de EE. UU. con su identificador fiscal no se podía facturar después | `limpiarDoc` conserva `pais` (Codex) |
| G08 | Albaranes | Más de 100 líneas se recortaban en silencio (perdía importe) | Se rechaza con un mensaje (Codex) |
| G09 | Recurrentes | La plantilla perdía la operación (inversión del sujeto pasivo, intracomunitaria…): dejaba de ir a la casilla 122 del 303 | `plantillaDe` copia `operacion` (Codex) |
| G10 | Impuestos y avisos | Los plazos del 111, 115 y 349 y los avisos al móvil no pasaban al lunes cuando el último día cae en fin de semana (los del 303/130 sí). Ej.: 4T de 2026 → 1-2-2027 | `limiteTrimestre(t, anio, diaEnero)` y `habil()` también ahí; los del Registro Mercantil se avisan en su fecha |
| G11 | Importar | El mensaje de total que no cuadra decía «999.00» | «999,00» |

## Pruebas desfasadas (la app estaba bien)

- E2E: las contraseñas de prueba incumplían la política nueva (PR #151: sin el nombre, 10 caracteres). Sustituidas por `Clave-Local-NN-2026`.
- E2E: el 111 se comprobaba con nóminas sin pagar; la retención se declara al pagar (art. 78 RIRPF), como hace la app.
- E2E: el plazo del 4T esperaba «30 de enero de 2027», que es sábado; la app dice bien «1 de febrero».
- E2E: el login ya pinta el formulario en el HTML inicial (cambio intencionado del 18-10) y los límites están activos por defecto.
- E2E integridad: el bloqueo de pantalla es opcional desde el 17-10; la prueba lo activa antes de comprobarlo.

## Pendiente (no corregido aquí)

- **Varias cuentas por CSV/Excel**: todos los extractos subidos van a una sola cuenta «Extracto subido». Con dos bancos, un
  movimiento idéntico en ambos se toma por repetido y el saldo de uno pisa al del otro. Necesita elegir la cuenta al subir.
- **Stripe + banco parcial**: si una factura tiene un cobro parcial del banco y otro de Stripe, la liquidación de Stripe
  que llega al banco se sugiere como un cobro nuevo en vez de solo enlazarse. Necesita enlazar cada cobro externo por separado.
- Limitaciones conocidas, ya documentadas: IVA parcialmente deducible (vehículos), recargo de equivalencia repercutido,
  entidades de nueva creación en el IS, festivos en los plazos.

## Evidencia

- `npm test`: 782/782. `next build` correcto.
- `tests/e2e/verificar.mjs`: 370 ✓ («Todo cuadra»). `integridad.mjs`: 10 ✓. `regresiones.mjs`: 22 ✓.
- `tests/e2e/numeros-aurora.mjs` (empresa simulada con dos años de histórico): 2.063/2.063 cifras. `numeros-circuitos.mjs`: 5/5.
- En el navegador: alta de una cuenta nueva (registro en 5 pasos y cuestionario), importación de un Excel de facturas con
  repetida, impagada, no cobrada, total que no cuadra y cobrada en parte (4 nuevas, 1 repetida, 2 errores), segunda subida
  del mismo archivo (0 nuevas), gastos con uno repetido, y 303/130/cartera contrastados a mano: 303 1T 283,50 €, 2T 458,00 €;
  130 1T 106,50 €, acumulado al 3T 300,50 €; pendiente de cobro 1.485,00 €.
- Normativa contrastada: casillas 303 y 130, minoración de la casilla 13, 5 % de difícil justificación (máx. 2.000 €),
  tipos del IS 2025–2028 (Ley 7/2024), 202 al 18 %, 347 desde 3.005,06 €, dietas y 0,26 €/km (RIRPF art. 9).
