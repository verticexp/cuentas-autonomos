# Auditoría de los cálculos de los modelos · 2 de noviembre de 2026

Revisión de **todos** los modelos que calcula la app, no solo de los que ya cubría
`tests/auditoria-fuzz.test.mjs` (303, 347, 349, 390, 115, renta, Sociedades, contabilidad,
amortizaciones y nóminas). La auditoría es una simulación con semilla fija:
`tests/auditoria-calculos.test.mjs` genera 250 empresas completas —facturas, gastos, nóminas,
dividendos e intereses, alquileres con inmueble, pagos a no residentes, vinculadas, paraísos
fiscales, ventanilla única, IGIC y módulos— y de cada una comprueba cinco cosas:

| Grupo | Qué comprueba |
|---|---|
| A | La aritmética interna de cada casilla: cada total es la suma de sus parciales y cada cuota, el porcentaje de su base, recalculado por otro camino en céntimos enteros. |
| B | Que cada resumen anual cuadra con la suma de sus autoliquidaciones: 193 = Σ123, 296 = Σ216, 180 = Σ115, 190 = Σ111 + profesionales, 425 = Σ420 y 415 = el 347 canario sin trimestres. |
| C | La higiene numérica de todo lo que sale de cada modelo, recorriendo el resultado entero: nada infinito, nada NaN y todo importe en céntimos exactos. |
| D | Que el fichero de ancho fijo de la Sede dice lo mismo que el cálculo, leyéndolo campo a campo, y que cuando falta un dato el generador se niega con un mensaje para la persona, nunca con un error de programación. |
| E | Que el cálculo es determinista y que con datos vacíos o en los bordes del año (incluido el 29 de febrero) no se rompe. |

Modelos auditados: **111, 115, 123, 131, 180, 190, 193, 202, 216, 232, 296, 309, 369, 415,
420, 425 y 840**, más los ficheros de la Sede del 111, 115, 123, 180, 190, 193, 216, 232 y 347.

Resultado de la última ejecución: **391.877 comprobaciones, 0 fallos**, con 3.085 ficheros leídos
campo a campo.

## Fallos encontrados y corregidos

Cada uno tiene una prueba que falla con el código anterior y pasa con el nuevo.

| Id | Dónde | Fallo reproducido | Corrección |
|---|---|---|---|
| M01 | `lib/ficherosInformativas.js`, 193 | El porcentaje de retención (posiciones 165-168) se escribía como la **media** de la retención sobre la base. Con dos pagos al mismo perceptor a tipos distintos (19 % y 24 %) salía un porcentaje que no existe y que no reproduce la retención declarada | El diseño dice: «Si se hubiera aplicado más de un porcentaje a lo largo del año, se indicará exclusivamente **el último** de ellos», y que las retenciones son «el importe total». `modelo193` guarda ahora el último porcentaje aplicado (recorriendo los pagos por fecha) y el fichero escribe ese |
| M02 | `lib/capitalMobiliario.js`, `limpiarPago` | Las naturalezas de la clave C con tipo propio se proponían al 19 % general: la 01 (propiedad intelectual cuando el perceptor no es el autor) y la 15 (anticipos de derechos de autor), que van al 15 % y al 7 % (art. 101.9 LIRPF), y la 08 (derechos de imagen de un perceptor del IS), que va al 24 % (art. 101.2 RIRPF) | Tabla `RET_NATURALEZA_C` con el tipo de cada una; el fichero, además, se niega y dice qué porcentaje exige el diseño si el pago lleva otro, en vez de escribir uno que contradiga la retención |
| M03 | `lib/ficheroVinculadas.js`, 232 | Un importe de operación negativo (cuando los abonos de un tipo superan las facturas del año) rompía la descarga con «Importe negativo en un campo sin signo: -3040.46» | El campo «Importe Operación» es `Num`, numérico **sin signo** en el diseño: no cabe un negativo. Se avisa diciendo de quién es, de qué tipo de operación y que hay que revisar los abonos |
| M04 | `lib/ficherosInformativas.js`, 180 y 190 | El reintegro de un alquiler con su ejercicio de devengo relleno seguía rompiendo la descarga con el mismo error técnico | Las retenciones del 180 (97-109) y del 190 (95-107) son numéricas sin signo: la base lleva su signo y la retención no. Se avisa de que hay que regularizar el reintegro con la gestoría |
| M05 | `lib/ficheroVinculadas.js` | La constante exportada `CUADRO_II` apuntaba a la posición 824; el cuadro II empieza en la 749 (justo detrás de la quinta vinculada del cuadro I) | Corregida contra `dr232e17v14`. No cambiaba ningún fichero: el cuadro II va siempre vacío |

## Lo que la auditoría confirma que está bien

- **Aritmética de casillas.** 123 (03 = 01 + 02, 06 = 04 + 05, 09 = 07 + 08, 12 = 09, 14 = 12),
  216 (07 = 05 + 06, 10 = 08 + 09, 13 = 11 + 12, 16 = 14 + 15, 19 = 17 + 18, 21 = 13 − 20),
  309 (cada cuota es su tipo por su base, 22 las suma, 24 = 22 − 23), 131 (07 = 02 + 04 + 06,
  10 = 07 − 08 − 09, 13 = 10 − 11 − 12, 15 = 13) y 420 (40 suma las seis deducciones, 41 = 25 − 40,
  45 = 41).
- **Retenciones calculadas pago a pago, no sobre el total.** El 115 y el 180 redondean el 19 % de
  cada alquiler; el 123 y el 193, el porcentaje de cada pago. La suma de los redondeos no es el
  redondeo de la suma, y los modelos declaran la primera, que es la que se ingresa.
- **Resúmenes anuales.** El 193 es exactamente la suma de los cuatro 123; el 296, de los cuatro
  216; el 180, de los cuatro 115; el 190 contiene las percepciones y retenciones de los cuatro 111
  más las de los profesionales; el 425 suma los cuatro 420; el 415 es el 347 canario sin columnas
  trimestrales.
- **Reparto de un pago en varias claves.** Los intereses del préstamo de un socio vinculado se
  reparten entre la clave B y la D (art. 46.a LIRPF); las partes suman siempre el bruto y la
  retención exactos, sin crear ni perder un céntimo.
- **Límites del 232.** Los 250.000 € por entidad miran solo las operaciones que no son específicas
  (art. 2.1.a de la Orden HFP/816/2017); los 100.000 € de específicas y el 50 % de la cifra de
  negocios se miran por tipo de operación y por el conjunto del ejercicio, no por entidad.
- **Rentas exentas del 216.** Una declaración con solo rentas exentas por la ley o por un convenio
  sale negativa (casilla 13 a cero) y se presenta igual; ninguna renta exenta arrastra retención.
- **Compensaciones del 420.** Nunca se ingresa negativo ni se compensa más saldo del que había.
- **Bordes del año.** Los nueve días frontera de 2024 (año bisiesto, con el 29 de febrero) caen en
  el trimestre que les toca; el año anterior y el siguiente no entran. El 30 de febrero se rechaza.
- **Determinismo.** El mismo dato da el mismo modelo, campo a campo.

## Lo que sigue fuera, a propósito

- **Modelo 296.** El diseño exige el domicilio en el país de residencia del perceptor y, en las
  personas físicas, su lugar y fecha de nacimiento. Fisquo no los guarda, y un fichero a medias lo
  rechaza la Sede. El cálculo sí está y se enseña en pantalla.
- **Modelo 309.** El diseño pide los datos del transmitente de cada operación, y `modelo309` las
  agrega por tipo. Solo afecta a quien no presenta el 303 (actividad exenta, recargo de
  equivalencia o régimen de la agricultura).
- **Modelo 200.** 77 páginas y más de 7.000 campos. Se entregan las casillas calculadas en CSV para
  teclearlas en Sociedades WEB, que es lo que ya hacía la app.
- **Cuadro II y tenencia de valores del 232.** La app no aplica la reducción de rentas de
  intangibles (art. 23 LIS) ni lleva la cartera de participaciones.

## Cómo se repite

```
node --test tests/auditoria-calculos.test.mjs
```

Cada fallo dice la semilla de la empresa que lo provoca, para reproducirlo solo.
