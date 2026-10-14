# Cuenta simulada de Aurora

Empresa ficticia independiente para pruebas locales. El generador crea su propio Redis en memoria en `127.0.0.1:8089`, sin utilizar credenciales de producción. No envía correos ni activa Verifactu.

```sh
node --import ./tests/apoyo/cargador.mjs scripts/cuenta-simulada.mjs
```

En otro terminal, arrancar la aplicación:

```sh
KV_REST_API_URL=http://127.0.0.1:8089 KV_REST_API_TOKEN=simulada-local UPSTASH_REDIS_REST_URL=http://127.0.0.1:8089 UPSTASH_REDIS_REST_TOKEN=simulada-local BLOQUEO_SERVIDOR=off RESEND_API_KEY= STRIPE_SECRET_KEY= CRON_SECRET=simulada-local npm run dev -- --webpack -p 3002
```

Acceso: `http://localhost:3002/login`, email `direccion@aurora-eventos.example`, contraseña de pruebas `Aurora-Simulada-2026!`. Estas credenciales son públicas, exclusivas de la simulación local.

La cuenta contiene cuatro actividades, dos años de histórico, cobros vencidos, pagos pendientes, stock y mínimos, pedidos y recepciones, caja, domiciliaciones, remesas, contabilidad, 16 presupuestos de distintos estados, cuatro empleados con nóminas y cuatro recurrencias sin envío automático. El volumen depende de la fecha de ejecución. A 14/10/2026: 210 facturas, 368 gastos, 96 nóminas, 8 clientes, 6 productos, 8 albaranes, 2 pedidos a proveedor, 33 movimientos bancarios y 3 remesas.

Las nóminas sustituyen los gastos salariales agregados de la demo. Se recalculan el Impuesto sobre Sociedades histórico, sus pagos a cuenta y el saldo bancario; los índices de facturas, gastos y presupuestos se comprueban contra sus colecciones.

El proceso debe permanecer abierto: sus cambios viven en memoria. Al crear la cuenta se guarda una copia inicial en `/private/tmp/netto-cuenta-simulada.json`; esa copia no incorpora las ediciones posteriores. Reiniciar el generador crea una simulación nueva.

## Hallazgos

- El script demo almacenaba emails sin normalizar: mayúsculas y espacios impedían acceder mediante el login normalizado. Corregido con prueba de regresión.
- El script demo escribía usuario y empresa antes de sus comprobaciones de integridad. Ahora esas escrituras ocurren después de validar los datos. Esto no convierte toda la carga en atómica ante cortes de red.
- El script histórico escribe directamente en Upstash y no construye los índices actuales. La cuenta simulada reconstruye y verifica sus índices antes de entregarse.
- Revisión del auxiliar: `nuevaEmpresa` lee el usuario y guarda membresías sin cerrojo ni transacción; altas concurrentes pueden superar el límite o sobrescribir membresías. Pendiente de reproducción HTTP y corrección; no se modificó el flujo de altas de producción.

Verificación: 490 tests y compilación de producción correctos. Acceso y panel de la cuenta comprobados en navegador. El auxiliar realizó revisión de solo lectura; la implementación y la verificación final las realizó el agente principal.
