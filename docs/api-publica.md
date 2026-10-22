# API pública de Fisquo, v1

La gestión está en Ajustes → API y webhooks. Las rutas `/api/v1/` usan exclusivamente `Authorization: Bearer <clave>`; no admiten autenticación por cookie. No hay CORS para llamadas de navegador desde otras webs. Las integraciones deben llamar desde su servidor.

Cada clave tiene los alcances elegidos entre `facturas:leer`, `facturas:escribir`, `gastos:leer` y `clientes:leer`. Se comprueban también los permisos actuales del creador, su empresa y el plan actual. El secreto completo solo aparece al crear la clave; Redis conserva su SHA-256 y los metadatos. `apiclaves-indice:<empresa>` relaciona ids con hashes para revocar sin recorrer claves de otras empresas.

Hay dos ventanas por clave, de 120 peticiones en 60 segundos y 5.000 en 24 horas desde su primera petición. Se aplican aunque `LIMITES` esté desactivado para la app. Un 429 incluye `Retry-After` en segundos. Las escrituras con plan en solo lectura responden 402.

## Rutas

| Método y ruta | Alcance | Respuesta |
| --- | --- | --- |
| GET `/api/v1/facturas` | `facturas:leer` | `{ datos, siguiente }` |
| GET `/api/v1/facturas/[id]` | `facturas:leer` | Factura pública |
| POST `/api/v1/facturas` | `facturas:escribir` | Factura pública, 201 |
| GET `/api/v1/gastos` | `gastos:leer` | `{ datos, siguiente }` |
| GET `/api/v1/gastos/[id]` | `gastos:leer` | Gasto público |
| GET `/api/v1/clientes` | `clientes:leer` | `{ datos, siguiente }` |

Los listados aceptan `limite` entre 1 y 100 (50 por defecto) y `cursor`: hay que reenviar el valor opaco de `siguiente`, conservando los filtros. Un `siguiente: null` termina el recorrido. Facturas y gastos aceptan `desde` y `hasta` inclusivos, en formato AAAA-MM-DD. Los cursores dependen de la ruta y, en gastos, de los permisos de nóminas del usuario.

Los importes y los precios públicos se expresan en EUR, también cuando el documento original se imprime en otra divisa. `numero` es el número visible de la factura, `pendiente` es su saldo y `cobrada` indica su estado de cobro. En gastos, `pendiente` es un booleano. No se exponen tokens, enlaces de pago, adjuntos, datos del emisor ni registros crudos de Verifactu.

El POST recibe los mismos campos de factura que el formulario: fecha, actividad, cliente, concepto/base/ivaPct o líneas, irpfPct y las opciones que valida `limpiar`. El cuerpo debe ser JSON y no superar 128 KiB. No admite rectificativas ni permite saltarse el control del orden de fechas o del riesgo del cliente. Estos conflictos devuelven 409 con `{ error }`.

Se recomienda enviar `Idempotency-Key` en cada alta: de 6 a 80 caracteres, letras ASCII, números, `_`, `:`, `.` o `-`. Reintentar con la misma clave de API y el mismo valor devuelve la factura ya creada. Usa siempre el mismo cuerpo para ese reintento. Otras claves de API tienen espacios de idempotencia separados.

Sin permiso de nóminas, los gastos salariales se agrupan por fecha y actividad **antes** de paginar. Los ids individuales no permiten acceder a un sueldo. Esta variante y el listado de clientes leen su colección completa antes de generar la página; conviene añadir índices específicos si crece su volumen.

## Webhooks

Hasta cinco por empresa. Solo destinos HTTPS públicos, puerto 443 y sin credenciales. Cada entrega vuelve a resolver todas las direcciones y fija las direcciones verificadas a la conexión, manteniendo la validación TLS del hostname. No sigue redirecciones. El límite de cinco segundos incluye DNS y HTTP. El envío usa `node:https` con un `lookup` que solo devuelve esas direcciones ([DNS de Node](https://nodejs.org/api/dns.html#dnslookuphostname-options-callback)).

El secreto `whsec_…` solo se entrega al crear el webhook. Se conserva en Redis porque es necesario para firmar. Los eventos disponibles son `factura.creada`, `factura.cobrada` y `gasto.creado`. Crear una suscripción exige poder leer sus datos; para gastos también exige `nominas`, pues un evento podría contener un gasto salarial individual.

El cuerpo es `{ id, tipo, creado, datos }`. `Fisquo-Firma` tiene esta forma:

```text
t=<segundos Unix>,v1=<HMAC-SHA256 hexadecimal>
```

La entrada del HMAC es `<t>.<cuerpo JSON exacto>` y la clave es el secreto completo. `firmar` y `verificarFirma` se exportan desde `lib/webhooks.js`. El receptor debe verificar el **cuerpo original**, aceptar un desfase máximo de 300 segundos y guardar el id del evento para no procesarlo dos veces. Un reintento conserva el evento y genera una firma con un timestamp nuevo.

2xx confirma la entrega; 4xx, excepto 408 y 429, es definitivo. El resto usa los reintentos y la bandeja de errores de la cola existente, hasta seis intentos. Los trabajos solo almacenan el id del webhook y el evento, nunca su secreto. Borrar un webhook cancela las entregas que aún no hayan empezado.

`emitirEvento(u, tipo, datos)` crea el evento y encola sus destinos. Admite un cuarto argumento `{ id, creado }` para reencolar un evento conocido conservando su identidad. La entrega es al menos una vez: el receptor tiene que deduplicar.

Los eventos salen de `lib/eventos.js`: `factura.creada` al emitir una factura (y `factura.cobrada` si nace cobrada), `factura.cobrada` cuando una factura pasa a cobrada por cualquier camino (a mano, banco, remesa o Stripe: todos pasan por `actualizarFactura`) y `gasto.creado` al apuntar un gasto. Llevan solo la factura o el gasto públicos, con un id fijo por documento y evento, y se encolan después de guardar: si el encolado falla, la operación sigue hecha (se registra en el log).

La gestión de estas conexiones sigue las restricciones de `usuarioApi`, incluido el bloqueo de escrituras por plan caducado. Los webhooks son configuración de empresa; no se desactivan al retirar permisos a quien configuró su destino. Revisa y elimina los destinos si cambia la autorización de esa integración.
