# Capturas comparadas (`scripts/capturas.mjs`)

Sirve para ver, antes de fusionar, qué pantallas cambian y cuánto cuando se toca CSS, textos o componentes comunes.
Fotografía 13 pantallas (entrar, Resumen, Facturas, una factura, Nueva factura, Gastos, un gasto, Impuestos, Banco,
Clientes, Más, Ajustes y Datos de la empresa) a 375 y 1280 px, en claro y en oscuro, con «reducir movimiento» (nada a
medio animar): 52 capturas. Con `--base` compara cada una con la de otra carpeta y da el porcentaje de píxeles distintos.

**Solo contra una app y un Redis simulados locales.** Nunca contra producción ni las previews de Vercel (usan la base de
datos de producción). El script se niega a usar otro host que no sea `localhost`.

## Uso

```bash
# 1. App compilada y base vacía
node tests/apoyo/upstash-mem.mjs 8091 &
KV_REST_API_URL=http://127.0.0.1:8091 KV_REST_API_TOKEN=x HIBP=off npx next start -p 3071 &

export BASE=http://localhost:3071 UPSTASH=http://127.0.0.1:8091
export PLAYWRIGHT_MODULE=~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# 2. Referencia: la versión de antes de los cambios (carpeta fuera de git)
node scripts/capturas.mjs --out .local/capturas/antes

# 3. Compilar con los cambios, base vacía otra vez, capturar y comparar
node scripts/capturas.mjs --base .local/capturas/antes          # guarda en .local/capturas/actual
```

La base tiene que estar **vacía en cada pasada**: así la cuenta de prueba es siempre la misma (email, datos, facturas) y
dos pasadas sin cambios dan imágenes idénticas (salvo ruido de 0,00 %). Reinicia el Redis simulado entre una y otra.

Salida: la lista de capturas que cambian, de más a menos, con su porcentaje y, si cambia, el tamaño de la página; las
imágenes de diferencias (rojo = píxel distinto, el resto atenuado) quedan en `<carpeta>/diferencias/`.

## Opciones

| Opción | Qué hace |
|---|---|
| `--out <carpeta>` | Dónde guardar las capturas (por defecto `.local/capturas/actual`). |
| `--base <carpeta>` | Compara con las capturas de esa carpeta. |
| `--solo <texto,texto>` | Solo las pantallas o archivos cuyo nombre lo contenga (`--solo resumen,gastos`). |
| `--sin-capturar` | No abre la app: compara `--out` con `--base` ya existentes. |
| `--tolerancia <0-255>` | Diferencia por canal que se ignora (12 por defecto: el suavizado de los bordes). |
| `--umbral <%>` | Termina con error si alguna captura cambia más de ese porcentaje o falta una. |

Las pantallas están en la lista `PANTALLAS` del script; para añadir una, basta una línea (`{ nombre, ruta }`, con
`cuenta: false` si es de las que se ven sin sesión).
